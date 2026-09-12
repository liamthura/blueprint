import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const aiEnv = createEnv({
  server: {
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  },
  runtimeEnv: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  },
  emptyStringAsUndefined: true,
});
