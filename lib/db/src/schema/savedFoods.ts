import { pgTable, text, real, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedFoodsTable = pgTable(
  "saved_foods",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    foodId: text("food_id").notNull(),
    foodName: text("food_name").notNull(),
    calories: integer("calories").notNull(),
    proteinG: real("protein_g").notNull(),
    carbsG: real("carbs_g").notNull(),
    fatG: real("fat_g").notNull(),
    servingLabel: text("serving_label").notNull(),
    servingGrams: real("serving_grams").notNull().default(100),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("saved_foods_user_food_unique").on(table.userId, table.foodId),
  ],
);

export const insertSavedFoodSchema = createInsertSchema(savedFoodsTable).omit({ createdAt: true });
export const selectSavedFoodSchema = createSelectSchema(savedFoodsTable);
export type InsertSavedFood = z.infer<typeof insertSavedFoodSchema>;
export type SavedFood = typeof savedFoodsTable.$inferSelect;
