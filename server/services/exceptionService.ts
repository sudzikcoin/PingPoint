import { storage } from "../storage";

const LATE_GRACE_MINUTES = 15;
const NO_SIGNAL_THRESHOLD_MINUTES = 20;
const LONG_DWELL_THRESHOLD_MINUTES = 60;

let scanningInterval: NodeJS.Timeout | null = null;

export async function scanAndUpdateExceptions(): Promise<void> {
  console.log("[Exception] Starting exception scan...");
  
  try {
    const allBrokers = await storage.getAllBrokers(1000, 0);
    
    for (const broker of allBrokers.brokers) {
      await scanBrokerLoads(broker.id);
      await cleanupStaleExceptions(broker.id);
    }
    
    console.log("[Exception] Scan completed successfully");
  } catch (error) {
    console.error("[Exception] Error during exception scan:", error);
  }
}

async function scanBrokerLoads(brokerId: string): Promise<void> {
  const loadsWithDetails = await storage.getActiveLoadsWithDetails(brokerId);
  const now = new Date();
  
  for (const { load, stops, lastPing } of loadsWithDetails) {
    await checkLateDelivery(brokerId, load, stops, now);
    await checkNoSignal(brokerId, load, lastPing, now);
    await checkLongDwell(brokerId, load, stops, now);
  }
}

async function checkLateDelivery(
  brokerId: string,
  load: { id: string; deliveryEta: Date | null; status: string },
  stops: { type: string; windowTo: Date | null; departedAt: Date | null; arrivedAt: Date | null }[],
  now: Date
): Promise<void> {
  const deliveryStop = stops.find(s => s.type === 'DELIVERY');
  const deliveryTime = load.deliveryEta || deliveryStop?.windowTo;
  
  const existing = await storage.getUnresolvedExceptionByLoadAndType(load.id, 'LATE');
  
  if (load.status === 'DELIVERED' || deliveryStop?.departedAt) {
    if (existing) {
      await storage.resolveExceptions(brokerId, load.id, 'LATE');
      console.log(`[Exception] LATE auto-resolved for load ${load.id} (delivered)`);
    }
    return;
  }
  
  if (!deliveryTime) return;
  
  const graceTime = new Date(deliveryTime.getTime() + LATE_GRACE_MINUTES * 60 * 1000);
  const isLate = now > graceTime;
  
  if (isLate && !existing) {
    const delayMinutes = Math.round((now.getTime() - deliveryTime.getTime()) / (60 * 1000));
    await storage.createExceptionEvent({
      loadId: load.id,
      brokerId,
      type: 'LATE',
      details: JSON.stringify({ delayMinutes }),
    });
    console.log(`[Exception] LATE detected for load ${load.id}`);
  }
}

async function checkNoSignal(
  brokerId: string,
  load: { id: string; driverId: string | null },
  lastPing: { createdAt: Date } | null,
  now: Date
): Promise<void> {
  if (!load.driverId) return;
  
  const existing = await storage.getUnresolvedExceptionByLoadAndType(load.id, 'NO_SIGNAL');
  
  if (!lastPing) {
    if (!existing) {
      await storage.createExceptionEvent({
        loadId: load.id,
        brokerId,
        type: 'NO_SIGNAL',
        details: JSON.stringify({ lastPingAt: null }),
      });
      console.log(`[Exception] NO_SIGNAL detected for load ${load.id} (no pings ever)`);
    }
    return;
  }
  
  const timeSinceLastPing = (now.getTime() - lastPing.createdAt.getTime()) / (60 * 1000);
  const hasNoSignal = timeSinceLastPing > NO_SIGNAL_THRESHOLD_MINUTES;
  
  if (hasNoSignal && !existing) {
    await storage.createExceptionEvent({
      loadId: load.id,
      brokerId,
      type: 'NO_SIGNAL',
      details: JSON.stringify({ lastPingAt: lastPing.createdAt.toISOString(), minutesSinceLastPing: Math.round(timeSinceLastPing) }),
    });
    console.log(`[Exception] NO_SIGNAL detected for load ${load.id} (${Math.round(timeSinceLastPing)} min ago)`);
  } else if (!hasNoSignal && existing) {
    await storage.resolveExceptions(brokerId, load.id, 'NO_SIGNAL');
    console.log(`[Exception] NO_SIGNAL auto-resolved for load ${load.id} (signal restored)`);
  }
}

async function checkLongDwell(
  brokerId: string,
  load: { id: string },
  stops: { id: string; type: string; arrivedAt: Date | null; departedAt: Date | null }[],
  now: Date
): Promise<void> {
  const existing = await storage.getUnresolvedExceptionByLoadAndType(load.id, 'LONG_DWELL');
  
  let hasDwellIssue = false;
  for (const stop of stops) {
    if (stop.arrivedAt && !stop.departedAt) {
      const dwellMinutes = (now.getTime() - stop.arrivedAt.getTime()) / (60 * 1000);
      
      if (dwellMinutes > LONG_DWELL_THRESHOLD_MINUTES) {
        hasDwellIssue = true;
        if (!existing) {
          await storage.createExceptionEvent({
            loadId: load.id,
            brokerId,
            type: 'LONG_DWELL',
            details: JSON.stringify({ stopId: stop.id, stopType: stop.type, dwellMinutes: Math.round(dwellMinutes) }),
          });
          console.log(`[Exception] LONG_DWELL detected for load ${load.id} at ${stop.type} stop (${Math.round(dwellMinutes)} min)`);
        }
        break;
      }
    }
  }
  
  if (!hasDwellIssue && existing) {
    await storage.resolveExceptions(brokerId, load.id, 'LONG_DWELL');
    console.log(`[Exception] LONG_DWELL auto-resolved for load ${load.id} (departed)`);
  }
}

async function cleanupStaleExceptions(brokerId: string): Promise<void> {
  const loadsWithExceptions = await storage.getLoadsWithUnresolvedExceptions(brokerId);
  const now = new Date();
  
  for (const { load, stops, lastPing } of loadsWithExceptions) {
    if (load.status === 'DELIVERED' || load.status === 'CANCELLED') {
      const resolved = await storage.resolveExceptions(brokerId, load.id);
      if (resolved > 0) {
        console.log(`[Exception] Auto-resolved ${resolved} exception(s) for ${load.status.toLowerCase()} load ${load.id}`);
      }
      continue;
    }
    
    if (lastPing) {
      const timeSinceLastPing = (now.getTime() - lastPing.createdAt.getTime()) / (60 * 1000);
      if (timeSinceLastPing <= NO_SIGNAL_THRESHOLD_MINUTES) {
        const existing = await storage.getUnresolvedExceptionByLoadAndType(load.id, 'NO_SIGNAL');
        if (existing) {
          await storage.resolveExceptions(brokerId, load.id, 'NO_SIGNAL');
          console.log(`[Exception] Auto-resolved NO_SIGNAL for load ${load.id} (signal restored)`);
        }
      }
    }
    
    let hasDwellIssue = false;
    for (const stop of stops) {
      if (stop.arrivedAt && !stop.departedAt) {
        const dwellMinutes = (now.getTime() - stop.arrivedAt.getTime()) / (60 * 1000);
        if (dwellMinutes > LONG_DWELL_THRESHOLD_MINUTES) {
          hasDwellIssue = true;
          break;
        }
      }
    }
    if (!hasDwellIssue) {
      const existing = await storage.getUnresolvedExceptionByLoadAndType(load.id, 'LONG_DWELL');
      if (existing) {
        await storage.resolveExceptions(brokerId, load.id, 'LONG_DWELL');
        console.log(`[Exception] Auto-resolved LONG_DWELL for load ${load.id} (departed)`);
      }
    }
  }
}

export function startExceptionScanning(intervalMinutes: number = 5): void {
  if (scanningInterval) {
    console.log("[Exception] Scanning already running");
    return;
  }
  
  console.log(`[Exception] Starting periodic exception scanning every ${intervalMinutes} minutes`);
  
  setTimeout(() => {
    scanAndUpdateExceptions().catch(console.error);
  }, 30000);
  
  scanningInterval = setInterval(() => {
    scanAndUpdateExceptions().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopExceptionScanning(): void {
  if (scanningInterval) {
    clearInterval(scanningInterval);
    scanningInterval = null;
    console.log("[Exception] Stopped exception scanning");
  }
}
