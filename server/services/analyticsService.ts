import { db } from "../db";
import { loads, stops, brokers, drivers, brokerEntitlements } from "@shared/schema";
import { eq, and, gte, lte, sql, isNotNull, desc } from "drizzle-orm";

const GRACE_MINUTES = 15;

interface DriverStats {
  driverId: string | null;
  driverName: string | null;
  totalLoads: number;
  deliveredLoads: number;
  onTimeLoads: number;
  lateLoads: number;
  onTimePercent: number;
}

interface ShipperStats {
  shipperId: string | null;
  shipperName: string | null;
  totalLoads: number;
  deliveredLoads: number;
  onTimeLoads: number;
  lateLoads: number;
  onTimePercent: number;
}

export interface AnalyticsOverview {
  totalLoads: number;
  deliveredLoads: number;
  onTimeLoads: number;
  lateLoads: number;
  onTimePercent: number;
  avgDelayMinutes: number | null;
  avgPickupDwellMinutes: number | null;
  avgDeliveryDwellMinutes: number | null;
  co2TotalKg: number | null;
  byDrivers: DriverStats[];
  byShippers: ShipperStats[];
}

export interface AnalyticsLoad {
  loadId: string;
  loadNumber: string;
  pickupCity?: string;
  deliveryCity?: string;
  plannedDeliveryAt?: string;
  actualDeliveryAt?: string;
  status: string;
  onTime: boolean | null;
  delayMinutes: number | null;
  distanceMiles: number | null;
  co2Kg: number | null;
}

export interface AnalyticsLoadsResult {
  items: AnalyticsLoad[];
  page: number;
  limit: number;
  total: number;
}

function getDefaultDateRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export async function getAnalyticsOverview(
  brokerId: string,
  from?: Date,
  to?: Date
): Promise<AnalyticsOverview> {
  const dateRange = from && to ? { from, to } : getDefaultDateRange();

  const broker = await db.query.brokers.findFirst({
    where: eq(brokers.id, brokerId),
  });
  const co2Factor = broker?.co2FactorGramPerMile ? parseFloat(broker.co2FactorGramPerMile) : 1610;

  const loadsData = await db.query.loads.findMany({
    where: and(
      eq(loads.brokerId, brokerId),
      gte(loads.createdAt, dateRange.from),
      lte(loads.createdAt, dateRange.to)
    ),
    with: {
      stops: true,
      driver: true,
    },
  });

  const totalLoads = loadsData.length;
  const deliveredLoads = loadsData.filter((l) => l.status === "DELIVERED").length;

  let onTimeLoads = 0;
  let lateLoads = 0;
  let totalDelayMinutes = 0;
  let scheduledDeliveredCount = 0;
  let pickupDwellSum = 0;
  let pickupDwellCount = 0;
  let deliveryDwellSum = 0;
  let deliveryDwellCount = 0;
  let co2TotalKg = 0;
  let hasDistance = false;

  for (const load of loadsData) {
    if (load.distanceMiles) {
      const miles = parseFloat(load.distanceMiles);
      co2TotalKg += (miles * co2Factor) / 1000;
      hasDistance = true;
    }

    if (load.status === "DELIVERED" && load.deliveredAt) {
      const deliveryStop = load.stops.find((s) => s.type === "DELIVERY");
      const plannedDelivery = deliveryStop?.windowTo;

      if (plannedDelivery) {
        scheduledDeliveredCount++;
        const gracePeriod = GRACE_MINUTES * 60 * 1000;
        const plannedTime = new Date(plannedDelivery).getTime() + gracePeriod;
        const actualTime = new Date(load.deliveredAt).getTime();

        if (actualTime <= plannedTime) {
          onTimeLoads++;
        } else {
          lateLoads++;
          const delayMs = actualTime - (new Date(plannedDelivery).getTime());
          totalDelayMinutes += delayMs / 60000;
        }
      }
    }

    const pickupStop = load.stops.find((s) => s.type === "PICKUP");
    if (pickupStop?.arrivedAt && pickupStop?.departedAt) {
      const dwellMs = new Date(pickupStop.departedAt).getTime() - new Date(pickupStop.arrivedAt).getTime();
      pickupDwellSum += dwellMs / 60000;
      pickupDwellCount++;
    }

    const deliveryStop = load.stops.find((s) => s.type === "DELIVERY");
    if (deliveryStop?.arrivedAt && deliveryStop?.departedAt) {
      const dwellMs = new Date(deliveryStop.departedAt).getTime() - new Date(deliveryStop.arrivedAt).getTime();
      deliveryDwellSum += dwellMs / 60000;
      deliveryDwellCount++;
    }
  }

  const onTimePercent = scheduledDeliveredCount > 0 ? Math.round((onTimeLoads / scheduledDeliveredCount) * 100) : 0;
  const avgDelayMinutes = lateLoads > 0 ? Math.round(totalDelayMinutes / lateLoads) : null;
  const avgPickupDwellMinutes = pickupDwellCount > 0 ? Math.round(pickupDwellSum / pickupDwellCount) : null;
  const avgDeliveryDwellMinutes = deliveryDwellCount > 0 ? Math.round(deliveryDwellSum / deliveryDwellCount) : null;

  const driverMap = new Map<string, { driver: any; loads: typeof loadsData }>();
  for (const load of loadsData) {
    const key = load.driverId || "unassigned";
    if (!driverMap.has(key)) {
      driverMap.set(key, { driver: load.driver, loads: [] });
    }
    driverMap.get(key)!.loads.push(load);
  }

  const byDrivers: DriverStats[] = [];
  for (const [driverId, { driver, loads: driverLoads }] of Array.from(driverMap.entries())) {
    const driverDelivered = driverLoads.filter((l: typeof loadsData[0]) => l.status === "DELIVERED");
    let driverOnTime = 0;
    let driverLate = 0;
    let driverScheduledCount = 0;

    for (const load of driverDelivered) {
      if (load.deliveredAt) {
        const deliveryStop = load.stops.find((s: typeof load.stops[0]) => s.type === "DELIVERY");
        const plannedDelivery = deliveryStop?.windowTo;
        if (plannedDelivery) {
          driverScheduledCount++;
          const gracePeriod = GRACE_MINUTES * 60 * 1000;
          const plannedTime = new Date(plannedDelivery).getTime() + gracePeriod;
          const actualTime = new Date(load.deliveredAt).getTime();
          if (actualTime <= plannedTime) {
            driverOnTime++;
          } else {
            driverLate++;
          }
        }
      }
    }

    byDrivers.push({
      driverId: driverId === "unassigned" ? null : driverId,
      driverName: driver?.phone || null,
      totalLoads: driverLoads.length,
      deliveredLoads: driverDelivered.length,
      onTimeLoads: driverOnTime,
      lateLoads: driverLate,
      onTimePercent: driverScheduledCount > 0 ? Math.round((driverOnTime / driverScheduledCount) * 100) : 0,
    });
  }

  const shipperMap = new Map<string, typeof loadsData>();
  for (const load of loadsData) {
    const key = load.shipperName || "Unknown";
    if (!shipperMap.has(key)) {
      shipperMap.set(key, []);
    }
    shipperMap.get(key)!.push(load);
  }

  const byShippers: ShipperStats[] = [];
  for (const [shipperName, shipperLoads] of Array.from(shipperMap.entries())) {
    const shipperDelivered = shipperLoads.filter((l: typeof loadsData[0]) => l.status === "DELIVERED");
    let shipperOnTime = 0;
    let shipperLate = 0;
    let shipperScheduledCount = 0;

    for (const load of shipperDelivered) {
      if (load.deliveredAt) {
        const deliveryStop = load.stops.find((s: typeof load.stops[0]) => s.type === "DELIVERY");
        const plannedDelivery = deliveryStop?.windowTo;
        if (plannedDelivery) {
          shipperScheduledCount++;
          const gracePeriod = GRACE_MINUTES * 60 * 1000;
          const plannedTime = new Date(plannedDelivery).getTime() + gracePeriod;
          const actualTime = new Date(load.deliveredAt).getTime();
          if (actualTime <= plannedTime) {
            shipperOnTime++;
          } else {
            shipperLate++;
          }
        }
      }
    }

    byShippers.push({
      shipperId: null,
      shipperName,
      totalLoads: shipperLoads.length,
      deliveredLoads: shipperDelivered.length,
      onTimeLoads: shipperOnTime,
      lateLoads: shipperLate,
      onTimePercent: shipperScheduledCount > 0 ? Math.round((shipperOnTime / shipperScheduledCount) * 100) : 0,
    });
  }

  return {
    totalLoads,
    deliveredLoads,
    onTimeLoads,
    lateLoads,
    onTimePercent,
    avgDelayMinutes,
    avgPickupDwellMinutes,
    avgDeliveryDwellMinutes,
    co2TotalKg: hasDistance ? Math.round(co2TotalKg * 10) / 10 : null,
    byDrivers,
    byShippers,
  };
}

export async function getAnalyticsLoadsTable(
  brokerId: string,
  from?: Date,
  to?: Date,
  page: number = 1,
  limit: number = 50
): Promise<AnalyticsLoadsResult> {
  const dateRange = from && to ? { from, to } : getDefaultDateRange();

  const broker = await db.query.brokers.findFirst({
    where: eq(brokers.id, brokerId),
  });
  const co2Factor = broker?.co2FactorGramPerMile ? parseFloat(broker.co2FactorGramPerMile) : 1610;

  const offset = (page - 1) * limit;

  const [loadsData, countResult] = await Promise.all([
    db.query.loads.findMany({
      where: and(
        eq(loads.brokerId, brokerId),
        gte(loads.createdAt, dateRange.from),
        lte(loads.createdAt, dateRange.to)
      ),
      with: {
        stops: true,
      },
      orderBy: [desc(loads.createdAt)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(loads)
      .where(
        and(
          eq(loads.brokerId, brokerId),
          gte(loads.createdAt, dateRange.from),
          lte(loads.createdAt, dateRange.to)
        )
      ),
  ]);

  const items: AnalyticsLoad[] = loadsData.map((load) => {
    const pickupStop = load.stops.find((s) => s.type === "PICKUP");
    const deliveryStop = load.stops.find((s) => s.type === "DELIVERY");
    const plannedDelivery = deliveryStop?.windowTo;

    let onTime: boolean | null = null;
    let delayMinutes: number | null = null;

    if (load.status === "DELIVERED" && load.deliveredAt && plannedDelivery) {
      const gracePeriod = GRACE_MINUTES * 60 * 1000;
      const plannedTime = new Date(plannedDelivery).getTime() + gracePeriod;
      const actualTime = new Date(load.deliveredAt).getTime();
      onTime = actualTime <= plannedTime;
      if (!onTime) {
        delayMinutes = Math.round((actualTime - new Date(plannedDelivery).getTime()) / 60000);
      }
    }

    const distanceMiles = load.distanceMiles ? parseFloat(load.distanceMiles) : null;
    const co2Kg = distanceMiles ? Math.round((distanceMiles * co2Factor) / 1000 * 10) / 10 : null;

    return {
      loadId: load.id,
      loadNumber: load.loadNumber,
      pickupCity: pickupStop?.city,
      deliveryCity: deliveryStop?.city,
      plannedDeliveryAt: plannedDelivery?.toISOString(),
      actualDeliveryAt: load.deliveredAt?.toISOString(),
      status: load.status,
      onTime,
      delayMinutes,
      distanceMiles,
      co2Kg,
    };
  });

  return {
    items,
    page,
    limit,
    total: countResult[0]?.count ?? 0,
  };
}

export function generateLoadsCsv(items: AnalyticsLoad[]): string {
  const headers = [
    "Load Number",
    "Pickup City",
    "Delivery City",
    "Planned Delivery",
    "Actual Delivery",
    "On-Time",
    "Delay (min)",
    "Distance (mi)",
    "CO2 (kg)",
  ];

  const rows = items.map((item) => [
    item.loadNumber,
    item.pickupCity || "",
    item.deliveryCity || "",
    item.plannedDeliveryAt || "",
    item.actualDeliveryAt || "",
    item.onTime === null ? "" : item.onTime ? "Yes" : "No",
    item.delayMinutes?.toString() || "",
    item.distanceMiles?.toString() || "",
    item.co2Kg?.toString() || "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export async function getBrokerPlan(brokerId: string): Promise<string> {
  const entitlement = await db.query.brokerEntitlements.findFirst({
    where: eq(brokerEntitlements.brokerId, brokerId),
  });
  return entitlement?.plan || "FREE";
}
