import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
import { Media } from "./collections/Media";
import { Pages } from "./collections/Pages";
import { Posts } from "./collections/Posts";
import { Users } from "./collections/Users";
import { cmsEnv } from "./lib/cms-env";
import { dbEnv } from "./lib/db/env";

const filename = fileURLToPath(import.meta.url);
const dirnamePath = dirname(filename);

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: resolve(dirnamePath),
    },
  },
  collections: [Users, Media, Posts, Pages],
  editor: lexicalEditor(),
  secret: cmsEnv.PAYLOAD_SECRET ?? "build-time-placeholder-secret-32-chars",
  typescript: {
    outputFile: resolve(dirnamePath, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: dbEnv.DATABASE_URL,
    },
    schemaName: "cms",
    migrationDir: resolve(dirnamePath, "migrations"),
  }),
  sharp,
});
