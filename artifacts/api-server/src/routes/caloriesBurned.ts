import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { db, caloriesBurnedTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

// POST /calories-burned
router.post("/calories-burned", async (req, res) => {
  try {
    const { user_id, date, active_energy, basal_energy, steps } = req.body as {
      user_id?: string;
      date?: string;
      active_energy?: number;
      basal_energy?: number;
      steps?: number;
    };

    if (!validateUserId(user_id)) {
      return res.status(400).json({ success: false, error: "Invalid or missing user_id" });
    }
    if (!date || !DATE_REGEX.test(date)) {
      return res.status(400).json({ success: false, error: "Invalid or missing date (expected YYYY-MM-DD)" });
    }
    if (!isAuthorized(req, user_id)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const activeEnergy = Math.round(Number(active_energy) || 0);
    const basalEnergy = Math.round(Number(basal_energy) || 0);
    const totalEnergy = activeEnergy + basalEnergy;
    const stepCount = Math.round(Number(steps) || 0);

    await db
      .insert(caloriesBurnedTable)
      .values({ userId: user_id, date, activeEnergy, basalEnergy, totalEnergy, steps: stepCount })
      .onConflictDoUpdate({
        target: [caloriesBurnedTable.userId, caloriesBurnedTable.date],
        set: {
          activeEnergy,
          basalEnergy,
          totalEnergy,
          steps: stepCount,
          updatedAt: new Date(),
        },
      });

    return res.json({ success: true });
  } catch (err) {
    console.error("[calories-burned POST]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET /calories-burned?user_id=&days=7
router.get("/calories-burned", async (req, res) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const rawDays = Number(req.query.days ?? 7);
    const daysParam = Number.isFinite(rawDays) && rawDays >= 1 ? Math.min(Math.floor(rawDays), 90) : 7;

    if (!validateUserId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid or missing user_id" });
    }
    if (!isAuthorized(req, userId)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (daysParam - 1));
    cutoff.setHours(0, 0, 0, 0);
    const cutoffStr = cutoff.toLocaleDateString("sv");

    const rows = await db
      .select()
      .from(caloriesBurnedTable)
      .where(
        and(
          eq(caloriesBurnedTable.userId, userId),
          gte(caloriesBurnedTable.date, cutoffStr),
        ),
      )
      .orderBy(desc(caloriesBurnedTable.date));

    return res.json({
      success: true,
      rows: rows.map((r) => ({
        date: r.date,
        active_energy: r.activeEnergy,
        basal_energy: r.basalEnergy,
        total_energy: r.totalEnergy,
        steps: r.steps,
      })),
    });
  } catch (err) {
    console.error("[calories-burned GET]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
