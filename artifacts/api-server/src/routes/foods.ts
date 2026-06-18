import { Router } from "express";
import { randomUUID } from "crypto";
import { FOOD_DATABASE } from "../constants/foodDatabase";
import { db, customFoodsTable } from "@workspace/db";
import { ilike, or, desc, eq, and } from "drizzle-orm";

const router = Router();

const KIMI_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_TEXT_MODEL = "moonshot-v1-8k";
const KIMI_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  try { JSON.parse(trimmed); return trimmed; } catch { /* */ }
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { JSON.parse(fenced); return fenced; } catch { /* */ }
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start !== -1) return raw.slice(start, i + 1); }
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// GET /api/foods — search static DB + custom foods table
// Query params: q (search), locale (en|zh-TW|zh-CN), limit (max 100),
//               source=user&userId=xxx (filter for user-created foods only)
// ---------------------------------------------------------------------------
router.get("/foods", async (req, res) => {
  const { q, locale = "en", limit = "30", source, userId } = req.query as Record<string, string>;
  const maxItems = Math.min(Math.abs(parseInt(limit) || 30), 100);
  const locKey = locale === "zh-TW" ? "zh-TW" : locale === "zh-CN" ? "zh-CN" : "en";
  const query = q?.trim().toLowerCase() ?? "";

  // 1. Filter static food database
  let staticResults = FOOD_DATABASE;
  if (query) {
    staticResults = FOOD_DATABASE.filter(
      (f) =>
        f.name.en.toLowerCase().includes(query) ||
        f.name["zh-TW"].toLowerCase().includes(query) ||
        f.name["zh-CN"].toLowerCase().includes(query),
    );
  }

  // 2. Query custom foods from DB (most recent first)
  // When source=user, filter by userId to show only that user's personal foods
  const userFoodsOnly = source === "user" && !!userId;
  let customResults: typeof customFoodsTable.$inferSelect[] = [];
  try {
    const baseWhere = userFoodsOnly
      ? and(eq(customFoodsTable.source, "user"), eq(customFoodsTable.userId, userId))
      : undefined;

    if (query) {
      const searchWhere = or(
        ilike(customFoodsTable.name, `%${query}%`),
        ilike(customFoodsTable.nameEn, `%${query}%`),
      );
      customResults = await db
        .select()
        .from(customFoodsTable)
        .where(baseWhere ? and(baseWhere, searchWhere) : searchWhere)
        .orderBy(desc(customFoodsTable.createdAt))
        .limit(maxItems);
    } else {
      customResults = await db
        .select()
        .from(customFoodsTable)
        .where(baseWhere)
        .orderBy(desc(customFoodsTable.createdAt))
        .limit(maxItems);
    }
  } catch (err) {
    console.warn("[foods] DB query for custom foods failed:", err);
  }

  // 3. Merge: custom foods first (they are user-added), then static
  // For user-only mode, skip static results entirely
  const staticMapped = userFoodsOnly ? [] : staticResults.slice(0, maxItems).map((f) => ({
    id: f.id,
    name: f.name[locKey],
    nameEn: f.name.en,
    calories: f.calories,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    servingGrams: f.servingGrams,
    servingLabel: f.servingLabel[locKey],
    isCustom: false,
  }));

  const customMapped = customResults.map((f) => ({
    id: f.id,
    name: f.name,
    nameEn: f.nameEn ?? f.name,
    calories: f.calories,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    servingGrams: f.servingGrams,
    servingLabel: f.servingLabel,
    isCustom: true,
  }));

  // De-duplicate by id (shouldn't overlap, but be safe)
  const seen = new Set<string>();
  const merged = [...customMapped, ...staticMapped].filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  return res.json({
    foods: merged.slice(0, maxItems),
    total: merged.length,
  });
});

// ---------------------------------------------------------------------------
// POST /api/foods/user — create a user-owned custom food (source='user')
// Body: { userId, name, calories, proteinG, carbsG, fatG, servingGrams, servingLabel }
// ---------------------------------------------------------------------------
router.post("/foods/user", async (req, res) => {
  const { userId, name, calories, proteinG, carbsG, fatG, servingGrams, servingLabel } = req.body as {
    userId?: string;
    name?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    servingGrams?: number;
    servingLabel?: string;
  };
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  if (typeof calories !== "number" || calories < 0) return res.status(400).json({ error: "calories must be a non-negative number" });

  const foodId = `user-${randomUUID()}`;
  try {
    await db.insert(customFoodsTable).values({
      id: foodId,
      name: name.trim(),
      nameEn: name.trim(),
      calories: Math.round(calories),
      proteinG: Math.max(0, proteinG ?? 0),
      carbsG:   Math.max(0, carbsG   ?? 0),
      fatG:     Math.max(0, fatG     ?? 0),
      servingGrams: Math.max(1, servingGrams ?? 100),
      servingLabel: servingLabel ?? "1 serving",
      userId,
      source: "user",
    });
    return res.json({ success: true, id: foodId });
  } catch {
    return res.status(500).json({ error: "Failed to save food" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/foods/ai-generate
// Generates nutrition info from text description via Kimi AI,
// then auto-saves to custom_foods table for future library use.
// Body: { description: string, locale?: string }
// Returns: { id, name, calories, proteinG, carbsG, fatG, servingGrams, servingLabel, saved }
// ---------------------------------------------------------------------------
router.post("/foods/ai-generate", async (req, res) => {
  const { description, locale } = req.body as { description?: unknown; locale?: unknown };

  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }
  if (description.trim().length > 500) {
    return res.status(400).json({ error: "description too long (max 500 chars)" });
  }

  const kimiKey = process.env.KIMI_API_KEY;
  if (!kimiKey) {
    return res.status(503).json({ error: "AI service not configured" });
  }

  const localeStr = typeof locale === "string" ? locale : "en";
  const langHint =
    localeStr === "zh-TW"
      ? "Use Traditional Chinese (繁體中文) for the food name and serving_label."
      : localeStr === "zh-CN"
        ? "Use Simplified Chinese (简体中文) for the food name and serving_label."
        : "Use English for the food name and serving_label.";

  const systemPrompt = `You are a certified nutritionist. Given a food description from the user, return ONLY a valid JSON object with accurate nutritional estimates. ${langHint}

JSON structure (output ONLY this, no markdown, no extra text):
{
  "name": "Food name",
  "name_en": "English food name",
  "calories": 200,
  "protein_g": 10.5,
  "carbs_g": 25.0,
  "fat_g": 5.0,
  "serving_grams": 100,
  "serving_label": "1 serving (100g)"
}

Rules:
- calories, protein_g, carbs_g, fat_g must all be non-negative numbers
- serving_grams must be a positive number representing the serving weight in grams
- name_en must always be the English name regardless of the response language
- If the user specifies a weight (e.g. "200g"), use that as serving_grams
- Be accurate — use well-known nutritional databases as reference`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KIMI_TIMEOUT_MS);

  try {
    const response = await fetch(KIMI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${kimiKey}` },
      body: JSON.stringify({
        model: KIMI_TEXT_MODEL,
        max_tokens: 512,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Food: ${description.trim()}` },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Kimi API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from AI");

    const parsed = JSON.parse(extractJson(content)) as Record<string, unknown>;

    const foodName = String(parsed["name"] ?? description.trim());
    const foodNameEn = String(parsed["name_en"] ?? parsed["name"] ?? description.trim());
    const calories = Math.round(Math.max(0, Number(parsed["calories"]) || 0));
    const proteinG = Math.max(0, Number(parsed["protein_g"]) || 0);
    const carbsG = Math.max(0, Number(parsed["carbs_g"]) || 0);
    const fatG = Math.max(0, Number(parsed["fat_g"]) || 0);
    const servingGrams = Math.max(1, Number(parsed["serving_grams"]) || 100);
    const servingLabel = String(parsed["serving_label"] ?? "1 serving");

    // Auto-save to custom_foods table so it appears in future library searches
    const foodId = `ai-${randomUUID()}`;
    let saved = false;
    try {
      await db.insert(customFoodsTable).values({
        id: foodId,
        name: foodName,
        nameEn: foodNameEn,
        calories,
        proteinG,
        carbsG,
        fatG,
        servingGrams,
        servingLabel,
        locale: localeStr,
        source: "ai",
      });
      saved = true;
    } catch (dbErr) {
      console.warn("[foods/ai-generate] Could not save to custom_foods:", dbErr);
    }

    return res.json({
      id: foodId,
      name: foodName,
      nameEn: foodNameEn,
      calories,
      proteinG,
      carbsG,
      fatG,
      servingGrams,
      servingLabel,
      saved,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({ error: "Request timed out. Please try again.", code: "TIMEOUT" });
    }
    if (err instanceof SyntaxError) {
      return res.status(422).json({ error: "Could not parse AI response. Please try again.", code: "PARSE_ERROR" });
    }
    return res.status(500).json({ error: "AI generation failed. Please try again.", code: "UNKNOWN" });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
