// GET    /api/meal-templates?userId=xxx  — list meal templates
// POST   /api/meal-templates              — create meal template
// DELETE /api/meal-templates/:id         — delete (body: { userId })

import { Router } from "express";
import { randomUUID } from "crypto";
import { db, mealTemplatesTable, type MealTemplateItem } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

router.get("/meal-templates", async (req, res) => {
  const { userId } = req.query as Record<string, string>;
  if (!userId || !USER_ID_REGEX.test(userId)) {
    return res.status(400).json({ success: false, error: "Invalid userId" });
  }
  try {
    const rows = await db
      .select()
      .from(mealTemplatesTable)
      .where(eq(mealTemplatesTable.userId, userId))
      .orderBy(mealTemplatesTable.createdAt);
    return res.json({ success: true, templates: rows });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/meal-templates", async (req, res) => {
  const { userId, name, items } = req.body as {
    userId?: string;
    name?: string;
    items?: MealTemplateItem[];
  };
  if (!userId || !USER_ID_REGEX.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });
  if (!name?.trim()) return res.status(400).json({ success: false, error: "name required" });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: "items required" });

  const totalCalories = Math.round(items.reduce((s, i) => s + (i.calories ?? 0), 0));
  const totalProteinG = items.reduce((s, i) => s + (i.proteinG ?? 0), 0);
  const totalCarbsG   = items.reduce((s, i) => s + (i.carbsG   ?? 0), 0);
  const totalFatG     = items.reduce((s, i) => s + (i.fatG     ?? 0), 0);

  try {
    const id = randomUUID();
    await db.insert(mealTemplatesTable).values({
      id,
      userId,
      name: name.trim(),
      totalCalories,
      totalProteinG,
      totalCarbsG,
      totalFatG,
      items,
    });
    return res.json({ success: true, id, totalCalories, totalProteinG, totalCarbsG, totalFatG });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.delete("/meal-templates/:id", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body as { userId?: string };
  if (!userId || !USER_ID_REGEX.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });
  try {
    await db
      .delete(mealTemplatesTable)
      .where(and(eq(mealTemplatesTable.id, id), eq(mealTemplatesTable.userId, userId)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
