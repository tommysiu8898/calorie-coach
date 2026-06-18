import { Router, type Request } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { pushTokensTable, dailyLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

const RegisterTokenSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
  token: z.string().min(1),
});

const StreakCheckSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
  localDate: z.string().regex(LOCAL_DATE_REGEX, "localDate must be YYYY-MM-DD"),
});

// POST /api/push-token
// Register or update an Expo push token for a user
router.post("/push-token", async (req, res) => {
  const parsed = RegisterTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const { userId, token } = parsed.data;

  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const existing = await db
      .select({ id: pushTokensTable.id })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(pushTokensTable)
        .set({ token, updatedAt: new Date() })
        .where(eq(pushTokensTable.userId, userId));
    } else {
      const id = crypto.randomUUID();
      await db.insert(pushTokensTable).values({ id, userId, token });
    }

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to register push token" });
  }
});

// POST /api/notifications/streak-check
// Check if the user has logged any meal today and whether a nudge should be sent.
// Tracks the last nudge date to avoid spamming.
router.post("/notifications/streak-check", async (req, res) => {
  const parsed = StreakCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const { userId, localDate } = parsed.data;

  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const todayLog = await db
      .select({
        mealsLogged: dailyLogsTable.mealsLogged,
        streakDay: dailyLogsTable.streakDay,
      })
      .from(dailyLogsTable)
      .where(
        and(
          eq(dailyLogsTable.userId, userId),
          eq(dailyLogsTable.date, localDate),
        ),
      )
      .limit(1);

    const mealsLogged = todayLog[0]?.mealsLogged ?? 0;
    const todayStreakDay = todayLog[0]?.streakDay ?? 0;

    const yesterdayDate = new Date(localDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = yesterdayDate.toISOString().split("T")[0];

    const yesterdayLog = await db
      .select({ streakDay: dailyLogsTable.streakDay })
      .from(dailyLogsTable)
      .where(
        and(
          eq(dailyLogsTable.userId, userId),
          eq(dailyLogsTable.date, yesterdayKey!),
        ),
      )
      .limit(1);

    const currentStreak = mealsLogged > 0
      ? todayStreakDay
      : (yesterdayLog[0]?.streakDay ?? 0);

    if (mealsLogged > 0 || currentStreak === 0) {
      return res.json({ shouldNudge: false, streakDays: currentStreak });
    }

    const tokenRow = await db
      .select({ id: pushTokensTable.id, token: pushTokensTable.token, lastNudgeDate: pushTokensTable.lastNudgeDate })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId))
      .limit(1);

    const alreadyNudgedToday = tokenRow[0]?.lastNudgeDate === localDate;

    if (alreadyNudgedToday) {
      return res.json({ shouldNudge: false, streakDays: currentStreak });
    }

    if (tokenRow.length > 0) {
      await db
        .update(pushTokensTable)
        .set({ lastNudgeDate: localDate, updatedAt: new Date() })
        .where(eq(pushTokensTable.userId, userId));

      const token = tokenRow[0]?.token;
      if (token && token.startsWith("ExponentPushToken")) {
        try {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              to: token,
              title: "Keep your streak alive! 🔥",
              body: `Don't break your ${currentStreak}-day streak! Log a meal to keep it going.`,
              data: { screen: "log" },
            }),
          });
        } catch {
        }
      }
    }

    return res.json({ shouldNudge: true, streakDays: currentStreak });
  } catch {
    return res.status(500).json({ error: "Failed to check streak" });
  }
});

export default router;
