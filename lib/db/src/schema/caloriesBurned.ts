import { pgTable, text, integer, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const caloriesBurnedTable = pgTable(
  "calories_burned",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    date: text("date").notNull(),
    activeEnergy: integer("active_energy").notNull().default(0),
    basalEnergy: integer("basal_energy").notNull().default(0),
    totalEnergy: integer("total_energy").notNull().default(0),
    steps: integer("steps").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique().on(t.userId, t.date)],
);

export const insertCaloriesBurnedSchema = createInsertSchema(caloriesBurnedTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectCaloriesBurnedSchema = createSelectSchema(caloriesBurnedTable);
export type InsertCaloriesBurned = z.infer<typeof insertCaloriesBurnedSchema>;
export type CaloriesBurned = typeof caloriesBurnedTable.$inferSelect;
