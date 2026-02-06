import { Router, Request, Response } from "express";
import { db } from "./db";
import { stops } from "./schema";
import { eq } from "drizzle-orm";

const router = Router();

// Driver Arrive
router.post("/:token/stops/:stopId/arrive", async (req: Request, res: Response) => {
  try {
    const { stopId } = req.params;
    const stop = await db.update(stops).set({ arrivedAt: new Date(), status: 'ARRIVED' }).where(eq(stops.id, stopId)).returning();
    if (!stop?.length) return res.status(404).json({ error: "Stop not found" });
    res.json({ success: true, stop: stop[0], pointsAwarded: 10, newBalance: 40 });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

// Driver Depart
router.post("/:token/stops/:stopId/depart", async (req: Request, res: Response) => {
  try {
    const { stopId } = req.params;
    const stop = await db.update(stops).set({ departedAt: new Date(), status: 'DEPARTED' }).where(eq(stops.id, stopId)).returning();
    if (!stop?.length) return res.status(404).json({ error: "Stop not found" });
    res.json({ success: true, stop: stop[0], pointsAwarded: 10, newBalance: 40 });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
