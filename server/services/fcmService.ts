import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Lazily initialize the Firebase admin SDK.
// Service account JSON is gitignored — failure to load is treated as
// "FCM disabled" rather than a hard error, so dev environments without
// credentials still boot.

let initialized = false;
let initFailed = false;
let messagingInstance: admin.messaging.Messaging | null = null;

const SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  "firebase-service-account.json",
);

function init(): void {
  if (initialized || initFailed) return;
  try {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.warn(
        `[FCM] firebase-service-account.json not found at ${SERVICE_ACCOUNT_PATH} — FCM disabled`,
      );
      initFailed = true;
      return;
    }
    const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8");
    const serviceAccount = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
    }
    messagingInstance = admin.messaging();
    initialized = true;
    console.log(
      `[FCM] Firebase admin initialized for project ${serviceAccount.project_id}`,
    );
  } catch (err) {
    initFailed = true;
    console.error("[FCM] Failed to initialize Firebase admin:", err);
  }
}

export function isFcmEnabled(): boolean {
  init();
  return initialized;
}

export function getMessaging(): admin.messaging.Messaging | null {
  init();
  return messagingInstance;
}

export interface SendDataPushResult {
  ok: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  // True when the FCM token is no longer valid and the caller should null it
  // out in the database.
  invalidToken?: boolean;
}

const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

// Send a high-priority data-only push (no notification payload — silent).
// Caller is responsible for the data fields.
export async function sendDataPush(
  token: string,
  data: Record<string, string>,
): Promise<SendDataPushResult> {
  const messaging = getMessaging();
  if (!messaging) {
    return { ok: false, errorMessage: "FCM not initialized" };
  }
  try {
    const messageId = await messaging.send({
      token,
      data,
      android: {
        priority: "high",
        // Omit `notification` so this stays silent / data-only.
      },
      // iOS not used (drivers are on Android), but apns headers would go here.
    });
    return { ok: true, messageId };
  } catch (err: any) {
    const code: string | undefined = err?.errorInfo?.code ?? err?.code;
    const message: string = err?.message ?? String(err);
    const invalidToken = code ? INVALID_TOKEN_ERROR_CODES.has(code) : false;
    return {
      ok: false,
      errorCode: code,
      errorMessage: message,
      invalidToken,
    };
  }
}
