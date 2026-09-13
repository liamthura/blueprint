import "./src/env";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces the exact node_modules files the server needs, so the Docker runtime
  // stage can copy a self-contained bundle instead of the whole dependency tree.
  output: "standalone",
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
});
