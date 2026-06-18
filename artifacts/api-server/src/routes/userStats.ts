import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { db, userStatsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

router.get("/user-stats", async (req, res) => {
  const { userId } = req.query as { userId?: string };

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const rows = await db
      .select()
      .from(userStatsTable)
      .where(eq(userStatsTable.userId, userId))
      .limit(1);

    if (rows.length === 0) {
      return res.json({ exists: false, stats: null });
    }
    return res.json({ exists: true, stats: rows[0] });
  } catch (err) {
    console.error("[user-stats] error:", err);
    return res.status(500).json({ error: "Failed to load user stats" });
  }
});

export default router;
