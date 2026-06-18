import { pgTable, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface HealthFlags {
  hypertension?: boolean;
  high_cholesterol?: boolean;
  diabetes?: boolean;
  pregnant?: boolean;
  medications?: string | boolean;
  supplement_allergies?: boolean;
}

export const profilesTable = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  gender: text("gender").notNull(), // 'male' | 'female' | 'other'
  birthday: text("birthday").notNull(), // ISO date string YYYY-MM-DD
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  targetWeightKg: real("target_weight_kg").notNull(),
  goal: text("goal").notNull(), // 'lose' | 'maintain' | 'gain'
  activityLevel: text("activity_level").notNull(), // 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  dailyCalorieTarget: integer("daily_calorie_target").notNull(),
  dailyProteinTarget: real("daily_protein_target").notNull(),
  dailyCarbsTarget: real("daily_carbs_target").notNull(),
  dailyFatTarget: real("daily_fat_target").notNull(),
  healthFlags: jsonb("health_flags").$type<HealthFlags>().default({}).notNull(),
  // Weight goal plan fields (nullable — optional, set during onboarding or profile edit)
  goalStartDate: text("goal_start_date"),         // YYYY-MM-DD when the goal was set
  goalStartWeightKg: real("goal_start_weight_kg"), // weight at goal start
  goalDurationWeeks: integer("goal_duration_weeks"), // how many weeks to reach targetWeightKg
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const selectProfileSchema = createSelectSchema(profilesTable);
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
