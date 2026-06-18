import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const userStatsTable = pgTable("user_stats", {
  userId: text("user_id").primaryKey(),
  vitalityScore: integer("vitality_score").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  isoWeek: text("iso_week").notNull().default(""),
  macroBalanceScore: real("macro_balance_score").notNull().default(0),
  calorieAdherenceScore: real("calorie_adherence_score").notNull().default(0),
  consistencyScore: real("consistency_score").notNull().default(0),
  displayName: text("display_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserStats = typeof userStatsTable.$inferSelect;
