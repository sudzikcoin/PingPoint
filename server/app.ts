import express, { type Express, type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer as createHttpServer, Server } from "http";
import { registerRoutes, registerHealthRoutes } from "./routes";
import { errorHandler, securityHeaders, corsHandler, generalLimiter, logRateLimitStatus, logCorsStatus } from "./middleware";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export interface AppInstance {
  app: Express;
  httpServer: Server;
}

export async function createApp(): Promise<AppInstance> {
  const app = express();
  const httpServer = createHttpServer(app);

  app.use(securityHeaders);
  app.use(corsHandler);
  app.use(cookieParser());
  
  logRateLimitStatus();
  logCorsStatus();
  app.use("/api", generalLimiter);
  app.use((req, res, next) => {
    // Skip JSON parsing for Stripe webhook - it needs raw body
    if (req.path === "/api/billing/stripe/webhook") {
      return next();
    }
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })(req, res, next);
  });

  app.use(express.urlencoded({ extended: false }));

  registerHealthRoutes(app);

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  app.use(errorHandler);

  return { app, httpServer };
}
