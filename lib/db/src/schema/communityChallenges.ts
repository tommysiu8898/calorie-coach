import { pgTable, text, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const communityChallengesTable = pgTable("community_challenges", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  titleZhTw: text("title_zh_tw"),
  titleZhCn: text("title_zh_cn"),
  description: text("description").notNull(),
  descriptionZhTw: text("description_zh_tw"),
  descriptionZhCn: text("description_zh_cn"),
  emoji: text("emoji").notNull().default("🏆"),
  goalType: text("goal_type").notNull(),
  goalValue: integer("goal_value").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  participantCount: integer("participant_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userChallengeProgressTable = pgTable(
  "user_challenge_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    challengeId: text("challenge_id").notNull(),
    currentValue: integer("current_value").notNull().default(0),
    isCompleted: boolean("is_completed").notNull().default(false),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uqUserChallenge: uniqueIndex("uq_user_challenge").on(table.userId, table.challengeId),
  }),
);

export type CommunityChallenge = typeof communityChallengesTable.$inferSelect;
export type UserChallengeProgress = typeof userChallengeProgressTable.$inferSelect;
