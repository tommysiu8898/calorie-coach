import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const communityProfilesTable = pgTable("community_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  username: text("username").notNull().unique(),
  avatarColor: text("avatar_color").notNull().default("#6366f1"),
  guidelinesAccepted: boolean("guidelines_accepted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const groupMembershipsTable = pgTable("group_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export type CommunityProfile = typeof communityProfilesTable.$inferSelect;
export type GroupMembership = typeof groupMembershipsTable.$inferSelect;
