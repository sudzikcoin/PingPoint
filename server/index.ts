import { createApp, log } from "./app";
import { serveStatic } from "./static";
import { logEnvStatus, logAdminStatus } from "./config/env";
import { getBootConfig, validateBootConfig, logBootConfig, handlePortError } from "./config/boot";
import { ensureDatabase } from "./migrate";
import { startExceptionScanning } from "./services/exceptionService";

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
    },
  );
})();

export { log };
