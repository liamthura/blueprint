import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
