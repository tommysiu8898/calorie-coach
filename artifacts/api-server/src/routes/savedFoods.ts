// GET  /api/saved-foods?userId=xxx      — list saved foods
// POST /api/saved-foods                  — save a food
// DELETE /api/saved-foods/:foodId        — unsave (body: { userId })

import { Router } from "express";
import { randomUUID } from "crypto";
import { db, savedFoodsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

router.get("/saved-foods", async (req, res) => {
  const { userId } = req.query as Record<string, string>;
  if (!userId || !USER_ID_REGEX.test(userId)) {
    return res.status(400).json({ success: false, error: "Invalid userId" });
  }
  try {
    const rows = await db
      .select()
      .from(savedFoodsTable)
      .where(eq(savedFoodsTable.userId, userId))
      .orderBy(savedFoodsTable.createdAt);
    return res.json({ success: true, foods: rows });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/saved-foods", async (req, res) => {
  const { userId, foodId, foodName, calories, proteinG, carbsG, fatG, servingLabel, servingGrams } = req.body as {
    userId?: string;
    foodId?: string;
    foodName?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    servingLabel?: string;
    servingGrams?: number;
  };
  if (!userId || !USER_ID_REGEX.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });
  if (!foodId || !foodName) return res.status(400).json({ success: false, error: "foodId and foodName required" });
  try {
    const id = randomUUID();
    await db.insert(savedFoodsTable).values({
      id,
      userId,
      foodId,
      foodName,
      calories: Math.round(calories ?? 0),
      proteinG: proteinG ?? 0,
      carbsG: carbsG ?? 0,
      fatG: fatG ?? 0,
      servingLabel: servingLabel ?? "1 serving",
      servingGrams: servingGrams ?? 100,
    }).onConflictDoNothing();
    return res.json({ success: true, id });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.delete("/saved-foods/:foodId", async (req, res) => {
  const { foodId } = req.params;
  const { userId } = req.body as { userId?: string };
  if (!userId || !USER_ID_REGEX.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });
  try {
    await db
      .delete(savedFoodsTable)
      .where(and(eq(savedFoodsTable.userId, userId), eq(savedFoodsTable.foodId, foodId)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
