import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "crypto";
import { db, communityProfilesTable, groupMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

// Static group definitions
const GROUPS = [
  {
    id: "fitness-workouts",
    name: "Fitness & Workouts",
    description: "Share workouts, progress and tips with fellow fitness enthusiasts.",
    emoji: "💪",
    topic: "Fitness",
    memberCount: 1240,
  },
  {
    id: "healthy-eating",
    name: "Healthy Eating",
    description: "Discover nutritious recipes, meal-prep ideas and clean eating habits.",
    emoji: "🥗",
    topic: "Nutrition",
    memberCount: 987,
  },
  {
    id: "weight-loss",
    name: "Weight Loss Journey",
    description: "Support and accountability for members working toward their weight goal.",
    emoji: "🎯",
    topic: "Weight",
    memberCount: 2150,
  },
  {
    id: "mindful-eating",
    name: "Mindful Eating",
    description: "Build a healthier relationship with food through mindfulness and intuitive eating.",
    emoji: "🧘",
    topic: "Wellness",
    memberCount: 543,
  },
  {
    id: "runners-club",
    name: "Runners Club",
    description: "For runners of all levels — share routes, times and motivation.",
    emoji: "🏃",
    topic: "Running",
    memberCount: 764,
  },
];

// In-memory message store per group
type GroupMessage = {
  id: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  initials: string;
  text: string;
  timestamp: string;
  replyCount: number;
};

const groupMessages: Record<string, GroupMessage[]> = {
  "fitness-workouts": [
    {
      id: "1",
      userId: "seed-user-1",
      displayName: "Alex M.",
      avatarColor: "#6366f1",
      initials: "AM",
      text: "Just finished a 5K run! New personal best 🎉",
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      replyCount: 3,
    },
    {
      id: "2",
      userId: "seed-user-2",
      displayName: "Sara K.",
      avatarColor: "#ec4899",
      initials: "SK",
      text: "Anyone doing strength training today? Looking for a workout partner!",
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      replyCount: 1,
    },
  ],
  "healthy-eating": [
    {
      id: "1",
      userId: "seed-user-3",
      displayName: "Jamie L.",
      avatarColor: "#22c55e",
      initials: "JL",
      text: "Made overnight oats with chia seeds — so filling and under 400 cal!",
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      replyCount: 5,
    },
  ],
  "weight-loss": [
    {
      id: "1",
      userId: "seed-user-4",
      displayName: "Chris B.",
      avatarColor: "#f59e0b",
      initials: "CB",
      text: "Down 2 kg this week! Staying consistent with my calorie deficit.",
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      replyCount: 8,
    },
  ],
  "mindful-eating": [],
  "runners-club": [
    {
      id: "1",
      userId: "seed-user-5",
      displayName: "Maya R.",
      avatarColor: "#06b6d4",
      initials: "MR",
      text: "Morning 10K done! The weather is perfect for running right now 🌤️",
      timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      replyCount: 2,
    },
  ],
};

// Seeded leaderboard per group
const GROUP_LEADERBOARD: Record<string, Array<{ rank: number; userId: string; displayName: string; initials: string; vitalityScore: number; streakDays: number }>> = {};

function getGroupLeaderboard(groupId: string) {
  if (!GROUP_LEADERBOARD[groupId]) {
    GROUP_LEADERBOARD[groupId] = [
      { rank: 1, userId: "seed-1", displayName: "Alex M.", initials: "AM", vitalityScore: 980, streakDays: 21 },
      { rank: 2, userId: "seed-2", displayName: "Sara K.", initials: "SK", vitalityScore: 870, streakDays: 14 },
      { rank: 3, userId: "seed-3", displayName: "Jamie L.", initials: "JL", vitalityScore: 750, streakDays: 10 },
      { rank: 4, userId: "seed-4", displayName: "Chris B.", initials: "CB", vitalityScore: 640, streakDays: 7 },
      { rank: 5, userId: "seed-5", displayName: "Maya R.", initials: "MR", vitalityScore: 520, streakDays: 5 },
    ];
  }
  return GROUP_LEADERBOARD[groupId];
}

// GET /api/community/profile
router.get("/community/profile", async (req, res) => {
  const { userId } = req.query;
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const profiles = await db
      .select()
      .from(communityProfilesTable)
      .where(eq(communityProfilesTable.userId, userId))
      .limit(1);
    if (profiles.length === 0) {
      return res.status(404).json({ error: "Community profile not found" });
    }
    return res.json(profiles[0]);
  } catch (err) {
    console.error("[community/profile GET]", err);
    return res.status(500).json({ error: "Failed to fetch community profile" });
  }
});

// POST /api/community/profile
router.post("/community/profile", async (req, res) => {
  const { userId, displayName, username, avatarColor, guidelinesAccepted } = req.body as {
    userId?: unknown;
    displayName?: unknown;
    username?: unknown;
    avatarColor?: unknown;
    guidelinesAccepted?: unknown;
  };

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (typeof displayName !== "string" || displayName.trim().length < 1) {
    return res.status(400).json({ error: "displayName is required" });
  }
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "username must be 3-20 alphanumeric characters or underscores" });
  }

  try {
    const existing = await db
      .select()
      .from(communityProfilesTable)
      .where(eq(communityProfilesTable.userId, userId))
      .limit(1);

    const profileData = {
      userId,
      displayName: displayName.trim(),
      username: username.toLowerCase(),
      avatarColor: typeof avatarColor === "string" ? avatarColor : "#6366f1",
      guidelinesAccepted: guidelinesAccepted === true,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      const [updated] = await db
        .update(communityProfilesTable)
        .set(profileData)
        .where(eq(communityProfilesTable.userId, userId))
        .returning();
      return res.json(updated);
    } else {
      const [created] = await db
        .insert(communityProfilesTable)
        .values({ ...profileData, createdAt: new Date() })
        .returning();
      return res.json(created);
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return res.status(409).json({ error: "Username already taken" });
    }
    console.error("[community/profile POST]", err);
    return res.status(500).json({ error: "Failed to save community profile" });
  }
});

// GET /api/community/username-check?username=xxx&userId=yyy
router.get("/community/username-check", async (req, res) => {
  const { username, userId } = req.query as { username?: string; userId?: string };
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.json({ available: false, error: "Invalid username format" });
  }
  try {
    const existing = await db
      .select({ userId: communityProfilesTable.userId })
      .from(communityProfilesTable)
      .where(eq(communityProfilesTable.username, username.toLowerCase()))
      .limit(1);
    const taken = existing.length > 0 && existing[0]?.userId !== userId;
    return res.json({ available: !taken });
  } catch {
    return res.json({ available: false, error: "Check failed" });
  }
});

// GET /api/groups
router.get("/groups", async (req, res) => {
  const { userId } = req.query;
  if (!validateUserId(userId)) {
    return res.json({ groups: GROUPS.map((g) => ({ ...g, joined: false })) });
  }
  try {
    const memberships = await db
      .select()
      .from(groupMembershipsTable)
      .where(eq(groupMembershipsTable.userId, userId));
    const joinedIds = new Set(memberships.map((m) => m.groupId));
    return res.json({
      groups: GROUPS.map((g) => ({ ...g, joined: joinedIds.has(g.id) })),
    });
  } catch (err) {
    console.error("[groups GET]", err);
    return res.json({ groups: GROUPS.map((g) => ({ ...g, joined: false })) });
  }
});

// POST /api/groups/:id/join
router.post("/groups/:id/join", async (req, res) => {
  const { id: groupId } = req.params;
  const { userId } = req.body as { userId?: unknown };

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: "Group not found" });
  }
  try {
    const existing = await db
      .select()
      .from(groupMembershipsTable)
      .where(and(eq(groupMembershipsTable.userId, userId), eq(groupMembershipsTable.groupId, groupId)))
      .limit(1);
    if (existing.length > 0) {
      return res.json({ joined: true, alreadyJoined: true });
    }
    await db.insert(groupMembershipsTable).values({
      id: randomUUID(),
      userId,
      groupId,
      joinedAt: new Date(),
    });
    return res.json({ joined: true, alreadyJoined: false });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return res.json({ joined: true, alreadyJoined: true });
    }
    console.error("[groups/:id/join]", err);
    return res.status(500).json({ error: "Failed to join group" });
  }
});

// GET /api/groups/:id/messages
router.get("/groups/:id/messages", async (req, res) => {
  const { id: groupId } = req.params;
  if (!GROUPS.find((g) => g.id === groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }
  const messages = groupMessages[groupId] ?? [];
  return res.json({ messages });
});

// POST /api/groups/:id/messages
router.post("/groups/:id/messages", async (req, res) => {
  const { id: groupId } = req.params;
  const { userId, text } = req.body as { userId?: unknown; text?: unknown };

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Message text is required" });
  }
  if (!GROUPS.find((g) => g.id === groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }

  try {
    const communityProfile = await db
      .select()
      .from(communityProfilesTable)
      .where(eq(communityProfilesTable.userId, userId))
      .limit(1);

    const profile = communityProfile[0];
    const displayName = profile?.displayName ?? "Anonymous";
    const avatarColor = profile?.avatarColor ?? "#6366f1";
    const initials = displayName
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();

    const message: GroupMessage = {
      id: randomUUID(),
      userId,
      displayName,
      avatarColor,
      initials,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      replyCount: 0,
    };

    if (!groupMessages[groupId]) {
      groupMessages[groupId] = [];
    }
    groupMessages[groupId].push(message);

    return res.json({ message });
  } catch (err) {
    console.error("[groups/:id/messages POST]", err);
    return res.status(500).json({ error: "Failed to post message" });
  }
});

// GET /api/groups/:id/members
router.get("/groups/:id/members", async (req, res) => {
  const { id: groupId } = req.params;

  if (!GROUPS.find((g) => g.id === groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }

  try {
    const memberships = await db
      .select()
      .from(groupMembershipsTable)
      .where(eq(groupMembershipsTable.groupId, groupId));

    const members: Array<{
      userId: string;
      displayName: string;
      username: string;
      avatarColor: string;
      initials: string;
    }> = [];

    for (const membership of memberships) {
      const profile = await db
        .select()
        .from(communityProfilesTable)
        .where(eq(communityProfilesTable.userId, membership.userId))
        .limit(1);

      if (profile[0]) {
        const p = profile[0];
        members.push({
          userId: p.userId,
          displayName: p.displayName,
          username: p.username,
          avatarColor: p.avatarColor,
          initials: p.displayName
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0] ?? "")
            .join("")
            .toUpperCase(),
        });
      }
    }

    // Add seeded members so the list is never empty
    const seededMembers = [
      { userId: "seed-1", displayName: "Alex M.", username: "alexm", avatarColor: "#6366f1", initials: "AM" },
      { userId: "seed-2", displayName: "Sara K.", username: "sarak", avatarColor: "#ec4899", initials: "SK" },
      { userId: "seed-3", displayName: "Jamie L.", username: "jamiel", avatarColor: "#22c55e", initials: "JL" },
    ];

    const allMembers = [
      ...seededMembers,
      ...members.filter((m) => !seededMembers.find((s) => s.userId === m.userId)),
    ];

    return res.json({ members: allMembers, count: allMembers.length });
  } catch (err) {
    console.error("[groups/:id/members]", err);
    return res.status(500).json({ error: "Failed to fetch members" });
  }
});

// GET /api/groups/:id/leaderboard
router.get("/groups/:id/leaderboard", async (req, res) => {
  const { id: groupId } = req.params;
  const { userId } = req.query;

  if (!GROUPS.find((g) => g.id === groupId)) {
    return res.status(404).json({ error: "Group not found" });
  }

  const leaderboard = getGroupLeaderboard(groupId);

  // If user has a community profile, inject them into the leaderboard if not already present
  if (validateUserId(userId)) {
    try {
      const profile = await db
        .select()
        .from(communityProfilesTable)
        .where(eq(communityProfilesTable.userId, userId))
        .limit(1);
      if (profile[0] && !leaderboard.find((e) => e.userId === userId)) {
        leaderboard.push({
          rank: leaderboard.length + 1,
          userId,
          displayName: profile[0].displayName,
          initials: profile[0].displayName
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0] ?? "")
            .join("")
            .toUpperCase(),
          vitalityScore: 100,
          streakDays: 1,
        });
      }
    } catch {
      // ignore
    }
  }

  return res.json({ leaderboard });
});

export default router;
