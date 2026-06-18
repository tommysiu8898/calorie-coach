import { pgTable, text, real, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyLogsTable = pgTable("daily_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(), // YYYY-MM-DD
  totalCalories: integer("total_calories").notNull().default(0),
  totalProteinG: real("total_protein_g").notNull().default(0),
  totalCarbsG: real("total_carbs_g").notNull().default(0),
  totalFatG: real("total_fat_g").notNull().default(0),
  streakDay: integer("streak_day").notNull().default(0),
  mealsLogged: integer("meals_logged").notNull().default(0),
});

export const insertDailyLogSchema = createInsertSchema(dailyLogsTable);
export const selectDailyLogSchema = createSelectSchema(dailyLogsTable);
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogsTable.$inferSelect;
