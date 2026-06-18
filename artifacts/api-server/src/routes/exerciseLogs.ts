import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { db, exerciseLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_INTENSITY = new Set(["light", "moderate", "intense"]);
const VALID_SOURCE = new Set(["manual", "ai"]);

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

// GET /exercise-logs?user_id=&date=YYYY-MM-DD
router.get("/exercise-logs", async (req, res) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const date = req.query.date as string | undefined;

    if (!validateUserId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid or missing user_id" });
    }
    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({ success: false, error: "Invalid or missing date (expected YYYY-MM-DD)" });
    }
    if (!isAuthorized(req, userId)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const rows = await db
      .select()
      .from(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.userId, userId), eq(exerciseLogsTable.date, date)))
      .orderBy(desc(exerciseLogsTable.createdAt));

    return res.json({
      success: true,
      logs: rows.map((r) => ({
        id: r.id,
        date: r.date,
        exerciseName: r.exerciseName,
        exerciseNameZh: r.exerciseNameZh,
        durationMinutes: r.durationMinutes,
        calories: r.calories,
        metUsed: r.metUsed,
        intensity: r.intensity,
        source: r.source,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("[exercise-logs GET]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /exercise-logs
router.post("/exercise-logs", async (req, res) => {
  try {
    const {
      user_id, date, exerciseName, exerciseNameZh,
      durationMinutes, calories, metUsed, intensity, source,
    } = req.body as {
      user_id?: string;
      date?: string;
      exerciseName?: string;
      exerciseNameZh?: string;
      durationMinutes?: number;
      calories?: number;
      metUsed?: number;
      intensity?: string;
      source?: string;
    };

    if (!validateUserId(user_id)) {
      return res.status(400).json({ success: false, error: "Invalid or missing user_id" });
    }
    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({ success: false, error: "Invalid or missing date (expected YYYY-MM-DD)" });
    }
    if (!exerciseName || typeof exerciseName !== "string" || !exerciseName.trim()) {
      return res.status(400).json({ success: false, error: "exerciseName is required" });
    }
    if (!isAuthorized(req, user_id)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const intensityVal = VALID_INTENSITY.has(intensity ?? "") ? intensity! : "moderate";
    const sourceVal = VALID_SOURCE.has(source ?? "") ? source! : "manual";
    const durationMins = Math.max(0, Math.round(Number(durationMinutes) || 0));
    const calsBurned = Math.max(0, Math.round(Number(calories) || 0));
    const met = metUsed != null && Number.isFinite(Number(metUsed)) ? Number(metUsed) : null;

    const [inserted] = await db
      .insert(exerciseLogsTable)
      .values({
        userId: user_id,
        date,
        exerciseName: exerciseName.trim(),
        exerciseNameZh: exerciseNameZh?.trim() || null,
        durationMinutes: durationMins,
        calories: calsBurned,
        metUsed: met,
        intensity: intensityVal,
        source: sourceVal,
      })
      .returning();

    return res.json({
      success: true,
      log: {
        id: inserted.id,
        date: inserted.date,
        exerciseName: inserted.exerciseName,
        exerciseNameZh: inserted.exerciseNameZh,
        durationMinutes: inserted.durationMinutes,
        calories: inserted.calories,
        metUsed: inserted.metUsed,
        intensity: inserted.intensity,
        source: inserted.source,
        createdAt: inserted.createdAt,
      },
    });
  } catch (err) {
    console.error("[exercise-logs POST]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// DELETE /exercise-logs/:id?user_id=
router.delete("/exercise-logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id as string | undefined;

    if (!validateUserId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid or missing user_id" });
    }
    if (!isAuthorized(req, userId)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const deleted = await db
      .delete(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.id, id), eq(exerciseLogsTable.userId, userId)))
      .returning({ id: exerciseLogsTable.id });

    if (!deleted.length) {
      return res.status(404).json({ success: false, error: "Log not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[exercise-logs DELETE]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /exercise-logs/:id/delete — proxy-safe alternative to DELETE
router.post("/exercise-logs/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req.body?.user_id ?? req.query.user_id) as string | undefined;

    if (!validateUserId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid or missing user_id" });
    }
    if (!isAuthorized(req, userId)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const deleted = await db
      .delete(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.id, id), eq(exerciseLogsTable.userId, userId)))
      .returning({ id: exerciseLogsTable.id });

    if (!deleted.length) {
      return res.status(404).json({ success: false, error: "Log not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[exercise-logs POST delete]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
