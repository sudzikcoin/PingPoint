import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

const LOG_DIR = path.join(process.cwd(), "logs");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ENABLE_FILE_LOGGING = process.env.ENABLE_FILE_LOGGING !== "false";

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("[Logger] Failed to create logs directory:", err);
}

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (Object.keys(metadata).length > 0) {
      log += ` ${JSON.stringify(metadata)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      customFormat
    ),
    level: IS_PRODUCTION ? "info" : "debug",
  }),
];

if (ENABLE_FILE_LOGGING && IS_PRODUCTION) {
  try {
    transports.push(
      new DailyRotateFile({
        filename: path.join(LOG_DIR, "error-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        level: "error",
        format: jsonFormat,
        maxFiles: "14d",
        zippedArchive: true,
      })
    );
    transports.push(
      new DailyRotateFile({
        filename: path.join(LOG_DIR, "combined-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        level: "info",
        format: jsonFormat,
        maxFiles: "14d",
        zippedArchive: true,
      })
    );
  } catch (err) {
    console.warn("[Logger] Failed to set up file transports:", err);
  }
}

const winstonLogger = winston.createLogger({
  level: IS_PRODUCTION ? "info" : "debug",
  transports,
  exitOnError: false,
});

function safeLog(
  level: "error" | "warn" | "info" | "debug",
  message: string,
  metadata?: Record<string, unknown>
): void {
  try {
    if (metadata) {
      winstonLogger.log(level, message, metadata);
    } else {
      winstonLogger.log(level, message);
    }
  } catch (err) {
    const fallbackFn = level === "error" ? console.error : console.log;
    fallbackFn(`[${level.toUpperCase()}] ${message}`, metadata || "");
  }
}

export const logger = {
  error: (message: string, metadata?: Record<string, unknown>) =>
    safeLog("error", message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) =>
    safeLog("warn", message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) =>
    safeLog("info", message, metadata),
  debug: (message: string, metadata?: Record<string, unknown>) =>
    safeLog("debug", message, metadata),
};

export default logger;
