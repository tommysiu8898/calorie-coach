import { pgTable, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mealEntriesTable = pgTable("meal_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  photoUrl: text("photo_url"),
  aiResponse: jsonb("ai_response"),
  userCorrections: jsonb("user_corrections"),
  totalCalories: integer("total_calories").notNull(),
  totalProteinG: real("total_protein_g").notNull(),
  totalCarbsG: real("total_carbs_g").notNull(),
  totalFatG: real("total_fat_g").notNull(),
  mealName: text("meal_name").notNull(),
  mealType: text("meal_type").notNull(), // 'breakfast' | 'lunch' | 'dinner' | 'snack'
  localDate: text("local_date"), // YYYY-MM-DD in the user's local timezone; null for legacy rows
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMealEntrySchema = createInsertSchema(mealEntriesTable).omit({
  createdAt: true,
});
export const selectMealEntrySchema = createSelectSchema(mealEntriesTable);
export type InsertMealEntry = z.infer<typeof insertMealEntrySchema>;
export type MealEntry = typeof mealEntriesTable.$inferSelect;
