import { createApp, log } from "./app";
import { serveStatic } from "./static";
import { logEnvStatus } from "./config/env";
import { ensureDatabase } from "./migrate";

(async () => {
  logEnvStatus();
  
  try {
    await ensureDatabase();
  } catch (err) {
    console.error("[FATAL] Database initialization failed:", err);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    } else {
      console.warn("[DB] Continuing despite migration error in development...");
    }
  }
  
  const { app, httpServer } = await createApp();

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

export { log };
