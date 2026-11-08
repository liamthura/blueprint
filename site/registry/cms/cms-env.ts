import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const cmsEnv = createEnv({
  server: {
    PAYLOAD_SECRET: z.string().min(32, "Generate one with: openssl rand -base64 32"),
  },
  runtimeEnv: {
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
