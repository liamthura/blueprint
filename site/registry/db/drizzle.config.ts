import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/*schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
