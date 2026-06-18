import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pushTokensTable = pgTable("push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  token: text("token").notNull(),
  lastNudgeDate: date("last_nudge_date"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokensTable);
export const selectPushTokenSchema = createSelectSchema(pushTokensTable);
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = typeof pushTokensTable.$inferSelect;
