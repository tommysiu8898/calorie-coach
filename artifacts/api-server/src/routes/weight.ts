import { Router, type Request } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { weightLogsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

function serverUTCDate(): string {
  return new Date().toISOString().split("T")[0];
}

const LogWeightSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
  weightKg: z.number().positive().max(600),
  date: z.string().regex(LOCAL_DATE_REGEX, "date must be YYYY-MM-DD").optional(),
});

// POST /api/weight — log or update today's weight
router.post("/weight", async (req, res) => {
  const parsed = LogWeightSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const { userId, weightKg, date } = parsed.data;
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const dateKey = date ?? serverUTCDate();

  try {
    const existing = await db
      .select()
      .from(weightLogsTable)
      .where(and(eq(weightLogsTable.userId, userId), eq(weightLogsTable.date, dateKey)))
      .limit(1);

    let entry;
    if (existing.length > 0) {
      const [updated] = await db
        .update(weightLogsTable)
        .set({ weightKg })
        .where(and(eq(weightLogsTable.userId, userId), eq(weightLogsTable.date, dateKey)))
        .returning();
      entry = updated;
    } else {
      const [inserted] = await db
        .insert(weightLogsTable)
        .values({ id: crypto.randomUUID(), userId, date: dateKey, weightKg })
        .returning();
      entry = inserted;
    }

    if (!entry) return res.status(500).json({ error: "Failed to save weight entry" });

    return res.status(existing.length > 0 ? 200 : 201).json({
      ...entry,
      date: typeof entry.date === "string" ? entry.date : (entry.date as Date).toISOString().split("T")[0],
      createdAt: entry.createdAt.toISOString(),
    });
  } catch {
    return res.status(500).json({ error: "Failed to save weight entry" });
  }
});

// GET /api/weight — fetch weight log history
// Query params: userId (required), days (optional, default 90, max 365),
//               localDate (optional, YYYY-MM-DD) — client's today in local timezone.
//               When provided, the date range is anchored to the client's calendar day
//               rather than the server's UTC date, preventing off-by-one at day boundaries.
router.get("/weight", async (req, res) => {
  const { userId, days = "90", localDate } = req.query;

  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  if (!isAuthorized(req, userId as string)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (localDate !== undefined && (typeof localDate !== "string" || !LOCAL_DATE_REGEX.test(localDate))) {
    return res.status(400).json({ error: "localDate must be YYYY-MM-DD" });
  }

  const daysNum = Math.min(365, Math.max(1, parseInt(days as string, 10) || 90));
  // Anchor to client's local "today" when provided; fall back to server UTC date.
  const toDate = (localDate as string | undefined) ?? serverUTCDate();
  const [ty, tm, td] = toDate.split("-").map(Number) as [number, number, number];
  const fromDate = new Date(Date.UTC(ty, tm - 1, td - daysNum + 1)).toISOString().split("T")[0];

  try {
    const logs = await db
      .select()
      .from(weightLogsTable)
      .where(
        and(
          eq(weightLogsTable.userId, userId),
          sql`${weightLogsTable.date} >= ${fromDate}`,
          sql`${weightLogsTable.date} <= ${toDate}`,
        ),
      )
      .orderBy(desc(weightLogsTable.date));

    return res.json(
      logs.map((l) => ({
        ...l,
        date: typeof l.date === "string" ? l.date : (l.date as Date).toISOString().split("T")[0],
        createdAt: l.createdAt.toISOString(),
      })),
    );
  } catch {
    return res.status(500).json({ error: "Failed to fetch weight logs" });
  }
});

export default router;
