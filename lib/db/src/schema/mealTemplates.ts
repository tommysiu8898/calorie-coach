import { pgTable, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface MealTemplateItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingLabel: string;
}

export const mealTemplatesTable = pgTable("meal_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  totalCalories: integer("total_calories").notNull(),
  totalProteinG: real("total_protein_g").notNull(),
  totalCarbsG: real("total_carbs_g").notNull(),
  totalFatG: real("total_fat_g").notNull(),
  items: jsonb("items").$type<MealTemplateItem[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMealTemplateSchema = createInsertSchema(mealTemplatesTable).omit({ createdAt: true });
export const selectMealTemplateSchema = createSelectSchema(mealTemplatesTable);
export type InsertMealTemplate = z.infer<typeof insertMealTemplateSchema>;
export type MealTemplate = typeof mealTemplatesTable.$inferSelect;
