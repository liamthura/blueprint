import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

export async function register() {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    enableLogs: true,
  });
}

export const onRequestError = Sentry.captureRequestError;
