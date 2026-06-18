import { pgTable, text, integer, timestamp, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const exerciseLogsTable = pgTable("exercise_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  exerciseName: text("exercise_name").notNull(),
  exerciseNameZh: text("exercise_name_zh"),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  calories: integer("calories").notNull().default(0),
  metUsed: doublePrecision("met_used"),
  intensity: text("intensity").notNull().default("moderate"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExerciseLogSchema = createInsertSchema(exerciseLogsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectExerciseLogSchema = createSelectSchema(exerciseLogsTable);
export type InsertExerciseLog = z.infer<typeof insertExerciseLogSchema>;
export type ExerciseLog = typeof exerciseLogsTable.$inferSelect;
