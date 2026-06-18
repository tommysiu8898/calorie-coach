import { pgTable, text, real, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weightLogsTable = pgTable(
  "weight_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("weight_logs_user_date_unique").on(table.userId, table.date)],
);

export const insertWeightLogSchema = createInsertSchema(weightLogsTable).omit({ createdAt: true });
export const selectWeightLogSchema = createSelectSchema(weightLogsTable);
export type InsertWeightLog = z.infer<typeof insertWeightLogSchema>;
export type WeightLog = typeof weightLogsTable.$inferSelect;
