import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customFoodsTable = pgTable("custom_foods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  calories: integer("calories").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  servingGrams: real("serving_grams").notNull(),
  servingLabel: text("serving_label").notNull(),
  userId: text("user_id"),
  locale: text("locale").default("en"),
  source: text("source").default("ai"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCustomFoodSchema = createInsertSchema(customFoodsTable).omit({ createdAt: true });
export const selectCustomFoodSchema = createSelectSchema(customFoodsTable);
export type InsertCustomFood = z.infer<typeof insertCustomFoodSchema>;
export type CustomFood = typeof customFoodsTable.$inferSelect;
