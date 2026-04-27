import type { Express, Request, Response } from "express";
import { db } from "./db";
import { storage } from "./storage";
import {
  truckTokens,
  drivers as driversTable,
  loads as loadsTable,
  trackingPings,
  trackingDiagnostics,
  stops as stopsTable,
} from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { strictRateLimit } from "./middleware/rateLimit";
import {
  validateGpsAccuracy,
  validateGpsTimestamp,
} from "./utils/securityUtils";
import { evaluateGeofencesForActiveLoad } from "./geofence";

const ACTIVE_LOAD_STATUSES = [
  "PLANNED",
  "IN_TRANSIT",
  "AT_PICKUP",
  "AT_DELIVERY",
];

function generateTruckToken(): string {
  return `trk_${randomBytes(12).toString("hex")}`;
}

interface AgentOsTruckLookup {
  truck_id: string;
  identifier: string;
  driver_name: string | null;
  company_id: string;
}

async function fetchTruckFromAgentOs(
  companyId: string,
  identifier: string,
): Promise<AgentOsTruckLookup | null> {
  const baseUrl =
    process.env.AGENTOS_API_BASE_URL ?? "https://agentos.suverse.io";
  const key =
    process.env.PINGPOINT_INTERNAL_KEY ?? process.env.INTERNAL_API_KEY;
  if (!key) {
    console.error("[TruckRegister] PINGPOINT_INTERNAL_KEY not configured");
    return null;
  }
  try {
    const url = `${baseUrl}/api/internal/trucks/lookup?company_id=${encodeURIComponent(companyId)}&identifier=${encodeURIComponent(identifier)}`;
    const r = await fetch(url, { headers: { "x-internal-key": key } });
    if (!r.ok) {
      console.warn(
        `[TruckRegister] AgentOS lookup status=${r.status} company=${companyId} identifier=${identifier}`,
      );
      return null;
    }
    return (await r.json()) as AgentOsTruckLookup;
  } catch (e: any) {
    console.error("[TruckRegister] AgentOS lookup error:", e?.message ?? e);
    return null;
  }
}

async function resolveTruckToken(token: string) {
  const [row] = await db
    .select()
    .from(truckTokens)
    .where(eq(truckTokens.token, token))
    .limit(1);
  if (!row) return null;
  // Bump last_seen on any authenticated request — this is the heartbeat used
  // by the smart-push cron to decide whether the APK is still pinging.
  await db
    .update(truckTokens)
    .set({ lastSeen: new Date() })
    .where(eq(truckTokens.id, row.id));
  return row;
}

// Resolve a trk_* token to its driver's currently-active load. Used by
// non-truck-namespaced endpoints (e.g. /api/driver/:token/iosix-raw-log)
// to accept truck tokens for trucks that have already migrated off the
// per-load drv_* flow.
export async function resolveActiveLoadForTruckToken(token: string) {
  const tok = await resolveTruckToken(token);
  if (!tok || !tok.driverId) return undefined;
  const [load] = await db
    .select()
    .from(loadsTable)
    .where(
      and(
        eq(loadsTable.driverId, tok.driverId),
        inArray(loadsTable.status, ACTIVE_LOAD_STATUSES),
      ),
    )
    .orderBy(desc(loadsTable.createdAt))
    .limit(1);
  return load;
}

export function registerTruckRoutes(app: Express): void {
  // POST /api/truck/register — exchange { truck_number, company_id } for
  // a permanent per-truck token. Pulls driver_name from AgentOS as the
  // source of truth and (re)syncs PingPoint's drivers row.
  app.post("/api/truck/register", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        truck_number?: string;
        company_id?: string;
      };
      if (!body.truck_number || !body.company_id) {
        return res
          .status(400)
          .json({ error: "truck_number and company_id are required" });
      }
      const truckNumber = String(body.truck_number).trim();
      const companyId = String(body.company_id).trim();

      const lookup = await fetchTruckFromAgentOs(companyId, truckNumber);
      if (!lookup) {
        return res.status(404).json({ error: "Truck not found in AgentOS" });
      }
      const driverName =
        (lookup.driver_name ?? "").trim() || `Truck ${truckNumber}`;

      const [existingDriver] = await db
        .select()
        .from(driversTable)
        .where(eq(driversTable.truckNumber, truckNumber))
        .limit(1);
      let driverId: string;
      if (existingDriver) {
        driverId = existingDriver.id;
        if (existingDriver.name !== driverName) {
          await db
            .update(driversTable)
            .set({ name: driverName, updatedAt: new Date() })
            .where(eq(driversTable.id, driverId));
        }
      } else {
        const [created] = await db
          .insert(driversTable)
          .values({
            name: driverName,
            phone: "",
            truckNumber,
          })
          .returning();
        driverId = created.id;
      }

      const [existingToken] = await db
        .select()
        .from(truckTokens)
        .where(eq(truckTokens.truckId, lookup.truck_id))
        .limit(1);
      let token: string;
      if (existingToken) {
        token = existingToken.token;
        await db
          .update(truckTokens)
          .set({
            driverId,
            truckNumber,
            companyId,
            lastSeen: new Date(),
          })
          .where(eq(truckTokens.id, existingToken.id));
      } else {
        token = generateTruckToken();
        await db.insert(truckTokens).values({
          truckId: lookup.truck_id,
          truckNumber,
          companyId,
          driverId,
          token,
          lastSeen: new Date(),
        });
      }

      console.log(
        `[TruckRegister] truck=${truckNumber} company=${companyId} driver=${driverId} token=${token.substring(0, 12)}...`,
      );
      return res.json({
        token,
        driver_name: driverName,
        truck_number: truckNumber,
        truck_id: lookup.truck_id,
      });
    } catch (err) {
      console.error("[TruckRegister] error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get(
    "/api/truck/:token/active-load",
    async (req: Request, res: Response) => {
      try {
        const tok = await resolveTruckToken(req.params.token);
        if (!tok)
          return res.status(404).json({ error: "Invalid truck token" });
        if (!tok.driverId) return res.json({ load: null });
        const [load] = await db
          .select()
          .from(loadsTable)
          .where(
            and(
              eq(loadsTable.driverId, tok.driverId),
              inArray(loadsTable.status, ACTIVE_LOAD_STATUSES),
            ),
          )
          .orderBy(desc(loadsTable.createdAt))
          .limit(1);
        if (!load) return res.json({ load: null });
        // Return the same shape as the legacy /api/driver/:token endpoint so
        // the mobile app can reuse the existing transformAPIResponse mapper.
        const loadStops = await storage.getStopsByLoad(load.id);
        return res.json({
          load: {
            id: load.id,
            loadNumber: load.loadNumber,
            customerRef: load.customerRef,
            status: load.status,
            // Tokens for legacy paths (deeplinks, drv_xxx-based per-load auth)
            driverToken: load.driverToken,
            trackingToken: load.trackingToken,
            stops: loadStops.map((stop) => ({
              ...stop,
              status: stop.departedAt
                ? "DEPARTED"
                : stop.arrivedAt
                  ? "ARRIVED"
                  : "PLANNED",
            })),
          },
        });
      } catch (err) {
        console.error("[TruckActiveLoad] error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get("/api/truck/:token/loads", async (req: Request, res: Response) => {
    try {
      const tok = await resolveTruckToken(req.params.token);
      if (!tok) return res.status(404).json({ error: "Invalid truck token" });
      if (!tok.driverId) return res.json({ loads: [] });
      const rows = await db
        .select()
        .from(loadsTable)
        .where(eq(loadsTable.driverId, tok.driverId))
        .orderBy(desc(loadsTable.createdAt))
        .limit(50);
      return res.json({ loads: rows });
    } catch (err) {
      console.error("[TruckLoads] error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post(
    "/api/truck/:token/fcm-register",
    async (req: Request, res: Response) => {
      try {
        const { fcmToken } = req.body ?? {};
        if (typeof fcmToken !== "string" || fcmToken.length < 20) {
          return res
            .status(400)
            .json({ ok: false, error: "fcmToken required" });
        }
        const tok = await resolveTruckToken(req.params.token);
        if (!tok)
          return res
            .status(404)
            .json({ ok: false, error: "Invalid truck token" });
        const now = new Date();
        await db
          .update(truckTokens)
          .set({ fcmToken, fcmTokenUpdatedAt: now })
          .where(eq(truckTokens.id, tok.id));
        // Mirror to drivers row so legacy fcmPingTrigger paths and the
        // existing /api/driver/:token/fcm-register table both stay valid.
        if (tok.driverId) {
          await db
            .update(driversTable)
            .set({ fcmToken, fcmTokenUpdatedAt: now })
            .where(eq(driversTable.id, tok.driverId));
        }
        console.log(
          `[TruckFcmRegister] truck=${tok.truckNumber} driver=${tok.driverId} token=${fcmToken.substring(0, 16)}...`,
        );
        return res.json({ ok: true });
      } catch (err) {
        console.error("[TruckFcmRegister] error:", err);
        return res
          .status(500)
          .json({ ok: false, error: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/truck/:token/ping",
    strictRateLimit(60, 60000, [422]),
    async (req: Request, res: Response) => {
      try {
        const tok = await resolveTruckToken(req.params.token);
        if (!tok)
          return res
            .status(404)
            .json({ ok: false, error: "Invalid truck token" });

        // Body shape:
        //   legacy expo-location: { lat, lng, accuracy, speed, heading, timestamp }
        //   transistorsoft (httpRootProperty:"."): same flat fields plus
        //                          { recorded_at, source, truck_id }
        const body = req.body ?? {};
        const {
          lat,
          lng,
          accuracy,
          speed,
          heading,
          timestamp,
          recorded_at,
          source: bodySource,
        } = body;

        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          Math.abs(lat) > 90 ||
          Math.abs(lng) > 180
        ) {
          return res
            .status(400)
            .json({ ok: false, error: "invalid_coords" });
        }
        const accErr = validateGpsAccuracy(accuracy);
        if (accErr)
          return res.status(422).json({ ok: false, error: accErr });
        const tsCandidate = recorded_at ?? timestamp;
        if (tsCandidate != null) {
          const tsErr = validateGpsTimestamp(tsCandidate);
          if (tsErr)
            return res.status(422).json({ ok: false, error: tsErr });
        }

        if (!tok.driverId) {
          return res.json({
            ok: true,
            wrote_ping: false,
            reason: "no_driver",
          });
        }

        const [load] = await db
          .select({ id: loadsTable.id, status: loadsTable.status })
          .from(loadsTable)
          .where(
            and(
              eq(loadsTable.driverId, tok.driverId),
              inArray(loadsTable.status, ACTIVE_LOAD_STATUSES),
            ),
          )
          .orderBy(desc(loadsTable.createdAt))
          .limit(1);

        if (!load) {
          // last_seen was already bumped in resolveTruckToken — that is enough
          // for smart-push staleness detection.
          return res.json({
            ok: true,
            wrote_ping: false,
            reason: "no_active_load",
          });
        }

        const sourceLabel =
          bodySource === "transistorsoft" ? "TRANSISTORSOFT" : "DRIVER_APP";
        const recordedAtDate = recorded_at ? new Date(recorded_at) : null;

        // Dedup: transistorsoft replays its offline buffer on reconnect, so
        // (driver_id, recorded_at) collisions are expected and benign.
        await db
          .insert(trackingPings)
          .values({
            loadId: load.id,
            driverId: tok.driverId,
            lat: String(lat),
            lng: String(lng),
            accuracy: accuracy != null ? String(accuracy) : null,
            speed: speed != null ? String(speed) : null,
            heading: heading != null ? String(heading) : null,
            source: sourceLabel,
            recordedAt: recordedAtDate,
          })
          .onConflictDoNothing({
            target: [trackingPings.driverId, trackingPings.recordedAt],
          });

        console.log(
          `[TruckPing] truck=${tok.truckNumber} load=${load.id} driver=${tok.driverId} src=${sourceLabel}`,
        );

        // Mirror /api/driver/:token/ping — non-blocking auto-arrive/depart.
        const parsedAccuracy =
          typeof accuracy === "number" && Number.isFinite(accuracy)
            ? accuracy
            : null;
        evaluateGeofencesForActiveLoad(
          tok.driverId,
          load.id,
          lat,
          lng,
          parsedAccuracy,
        ).catch((err) =>
          console.error("[TruckPing] geofence eval error:", err),
        );

        return res.json({ ok: true, wrote_ping: true, load_id: load.id });
      } catch (err) {
        console.error("[TruckPing] error:", err);
        return res
          .status(500)
          .json({ ok: false, error: "Internal server error" });
      }
    },
  );

  // Non-location SDK events. Cheap append-only log used by the public
  // tracking page to render "Stationary" / "Provider disabled" banners
  // instead of inferring those states from ping gaps.
  app.post(
    "/api/truck/:token/diagnostics",
    strictRateLimit(120, 60000, [422]),
    async (req: Request, res: Response) => {
      try {
        const tok = await resolveTruckToken(req.params.token);
        if (!tok)
          return res
            .status(404)
            .json({ ok: false, error: "Invalid truck token" });

        const body = req.body ?? {};
        const eventType = typeof body.event_type === "string" ? body.event_type : null;
        if (!eventType) {
          return res
            .status(400)
            .json({ ok: false, error: "event_type required" });
        }

        await db.insert(trackingDiagnostics).values({
          truckToken: req.params.token,
          eventType,
          eventData: body.event_data ?? null,
        });

        return res.json({ ok: true });
      } catch (err) {
        console.error("[TruckDiag] error:", err);
        return res
          .status(500)
          .json({ ok: false, error: "Internal server error" });
      }
    },
  );
}
