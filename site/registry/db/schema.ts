import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** An example table. Delete it once you have one of your own. */
export const post = pgTable("post", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
