import { createApp, AppInstance } from "../../app";
import request from "supertest";

let appInstance: AppInstance | null = null;

export async function getTestApp(): Promise<AppInstance> {
  if (!appInstance) {
    appInstance = await createApp();
  }
  return appInstance;
}

export async function getTestRequest() {
  const { app } = await getTestApp();
  return request(app);
}

export async function closeTestApp() {
  if (appInstance?.httpServer) {
    await new Promise<void>((resolve) => {
      appInstance!.httpServer.close(() => resolve());
    });
    appInstance = null;
  }
}
