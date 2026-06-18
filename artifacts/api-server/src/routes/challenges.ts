import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "crypto";
import { db, communityChallengesTable, userChallengeProgressTable } from "@workspace/db";
import { computeAndUpsertVitality } from "./vitality";
import { eq, and, sql, lte, gte } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

router.get("/challenges", async (_req, res) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const challenges = await db
      .select()
      .from(communityChallengesTable)
      .where(
        and(
          eq(communityChallengesTable.isActive, true),
          lte(communityChallengesTable.startDate, todayStr),
          gte(communityChallengesTable.endDate, todayStr),
        ),
      );
    return res.json({ challenges });
  } catch (err) {
    console.error("[challenges] GET error:", err);
    return res.status(500).json({ error: "Failed to load challenges" });
  }
});

router.post("/challenges/:id/join", async (req, res) => {
  const { id: challengeId } = req.params;
  const { userId } = req.body as { userId?: unknown };

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Verify challenge exists and is active
    const challenge = await db
      .select()
      .from(communityChallengesTable)
      .where(and(eq(communityChallengesTable.id, challengeId), eq(communityChallengesTable.isActive, true)))
      .limit(1);

    if (challenge.length === 0) {
      return res.status(404).json({ error: "Challenge not found or inactive" });
    }

    // Pre-check for existing enrollment (idempotent)
    const existing = await db
      .select()
      .from(userChallengeProgressTable)
      .where(
        and(
          eq(userChallengeProgressTable.userId, userId),
          eq(userChallengeProgressTable.challengeId, challengeId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return res.json({ joined: true, alreadyJoined: true, progress: existing[0] });
    }

    const [progress] = await db.insert(userChallengeProgressTable).values({
      id: randomUUID(),
      userId,
      challengeId,
      currentValue: 0,
      isCompleted: false,
      joinedAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await db
      .update(communityChallengesTable)
      .set({ participantCount: sql`${communityChallengesTable.participantCount} + 1` })
      .where(eq(communityChallengesTable.id, challengeId));

    // Compute initial challenge progress immediately after joining
    computeAndUpsertVitality(userId).catch((e) =>
      console.warn("[challenges/join] vitality update failed:", e),
    );

    return res.json({ joined: true, alreadyJoined: false, progress });
  } catch (err: unknown) {
    // Handle unique constraint violation (concurrent join race)
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      const existing = await db
        .select()
        .from(userChallengeProgressTable)
        .where(and(eq(userChallengeProgressTable.userId, userId), eq(userChallengeProgressTable.challengeId, challengeId)))
        .limit(1);
      return res.json({ joined: true, alreadyJoined: true, progress: existing[0] ?? null });
    }
    console.error("[challenges/:id/join] error:", err);
    return res.status(500).json({ error: "Failed to join challenge" });
  }
});

router.get("/challenges/:id/progress", async (req, res) => {
  const { id: challengeId } = req.params;
  const { userId } = req.query as { userId?: string };

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const progress = await db
      .select()
      .from(userChallengeProgressTable)
      .where(
        and(
          eq(userChallengeProgressTable.userId, userId),
          eq(userChallengeProgressTable.challengeId, challengeId),
        ),
      )
      .limit(1);

    if (progress.length === 0) {
      return res.json({ joined: false, progress: null });
    }
    return res.json({ joined: true, progress: progress[0] });
  } catch (err) {
    console.error("[challenges/:id/progress] error:", err);
    return res.status(500).json({ error: "Failed to load progress" });
  }
});

export default router;
