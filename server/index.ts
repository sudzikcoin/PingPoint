import { createApp, log } from "./app";
import { serveStatic } from "./static";
import { logEnvStatus, logAdminStatus } from "./config/env";
import { getBootConfig, validateBootConfig, logBootConfig, handlePortError } from "./config/boot";
import { ensureDatabase } from "./migrate";
import { startExceptionScanning } from "./services/exceptionService";
import { startGeofenceMonitoring, stopGeofenceMonitoring } from "./jobs/geofenceMonitor";

(async () => {
  const bootConfig = getBootConfig();
  validateBootConfig(bootConfig);
  logBootConfig(bootConfig);
  
  logEnvStatus();
  logAdminStatus();
  
  try {
    await ensureDatabase();
  } catch (err) {
    console.error("[FATAL] Database initialization failed:", err);
    if (bootConfig.isProduction) {
      process.exit(1);
    } else {
      console.warn("[DB] Continuing despite migration error in development...");
    }
  }
  
  const { app, httpServer } = await createApp();
  
  startExceptionScanning(5);

  if (bootConfig.isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    handlePortError(err, bootConfig.port);
  });

  httpServer.listen(
    {
      port: bootConfig.port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${bootConfig.port}`);
      
      // Start cron jobs after server is listening
      try {
        if (process.env.ENABLE_CRON_JOBS !== 'false') {
          console.log('[Cron] Starting background jobs...');
          startGeofenceMonitoring();
          console.log('[Cron] Geofence monitoring started - running every minute');
        } else {
          console.log('[Cron] Cron jobs disabled via ENABLE_CRON_JOBS env var');
        }
      } catch (error) {
        console.error('[Cron] Failed to start cron jobs:', error);
        console.log('[Cron] Server will continue without background jobs');
      }
    },
  );

  // Graceful shutdown handling
  let isShuttingDown = false;

  function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    
    // Stop cron jobs first
    try {
      stopGeofenceMonitoring();
    } catch (err) {
      console.error('[Server] Error stopping geofence monitor:', err);
    }
    
    httpServer.close(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

export { log };
