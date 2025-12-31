import { db } from "../db";
import { drivers, loads, stops } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const GRACE_MINUTES = 15;

export async function recomputeDriverStatsForBroker(brokerId: string): Promise<void> {
  const brokerDrivers = await db.query.drivers.findMany({
    where: eq(drivers.brokerId, brokerId),
  });

  for (const driver of brokerDrivers) {
    await recomputeDriverStats(driver.id);
  }
}

export async function recomputeDriverStats(driverId: string): Promise<void> {
  const driverLoads = await db.query.loads.findMany({
    where: eq(loads.driverId, driverId),
    with: {
      stops: true,
    },
  });

  let totalLoads = 0;
  let onTimeLoads = 0;
  let lateLoads = 0;

  for (const load of driverLoads) {
    if (load.status === "DELIVERED" && load.deliveredAt) {
      totalLoads++;
      
      const deliveryStop = load.stops.find((s) => s.type === "DELIVERY");
      const plannedDelivery = deliveryStop?.windowTo;

      if (plannedDelivery) {
        const gracePeriod = GRACE_MINUTES * 60 * 1000;
        const plannedTime = new Date(plannedDelivery).getTime() + gracePeriod;
        const actualTime = new Date(load.deliveredAt).getTime();

        if (actualTime <= plannedTime) {
          onTimeLoads++;
        } else {
          lateLoads++;
        }
      }
    }
  }

  await db
    .update(drivers)
    .set({
      statsTotalLoads: totalLoads,
      statsOnTimeLoads: onTimeLoads,
      statsLateLoads: lateLoads,
      updatedAt: new Date(),
    })
    .where(eq(drivers.id, driverId));
}

export async function updateDriverStatsForLoad(loadId: string): Promise<void> {
  const load = await db.query.loads.findFirst({
    where: eq(loads.id, loadId),
  });

  if (load?.driverId) {
    try {
      await recomputeDriverStats(load.driverId);
    } catch (error) {
      console.error(`Failed to update driver stats for driver ${load.driverId}:`, error);
    }
  }
}
