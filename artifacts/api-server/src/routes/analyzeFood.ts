import { Router, type Request } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import type { openrouter as OpenrouterType } from "@workspace/integrations-openrouter-ai";

const router = Router();
const MAX_IMAGE_SIDE = 512;
const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

// ---------------------------------------------------------------------------
// Primary: Direct Kimi API — cheaper, stable, vision-capable.
// Uses KIMI_API_KEY secret + moonshot-v1-8k-vision-preview (vision model).
// ---------------------------------------------------------------------------
const KIMI_DIRECT_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_DIRECT_MODEL = "moonshot-v1-8k-vision-preview";
const KIMI_TIMEOUT_MS = 20_000;

async function callKimiDirect(imageBase64: string, apiKey: string, systemPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KIMI_TIMEOUT_MS);
  try {
    const response = await fetch(KIMI_DIRECT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: KIMI_DIRECT_MODEL,
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: "text", text: "Analyze this food image and return nutrition data as JSON." },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Kimi API error ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Kimi API returned empty response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Fallback: OpenRouter via Replit AI Integrations — qwen/qwen2.5-vl-72b-instruct.
// Used when KIMI_API_KEY is absent or Kimi API call fails.
// Lazy import so the server stays up if integration env vars are momentarily unset.
// ---------------------------------------------------------------------------
const OPENROUTER_FALLBACK_MODEL = "qwen/qwen2.5-vl-72b-instruct";
let _openrouter: typeof OpenrouterType | null = null;

async function getOpenrouterClient(): Promise<typeof OpenrouterType | null> {
  if (_openrouter) return _openrouter;
  if (!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || !process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
    return null;
  }
  try {
    const mod = await import("@workspace/integrations-openrouter-ai");
    _openrouter = mod.openrouter;
    return _openrouter;
  } catch {
    return null;
  }
}

async function callViaOpenRouter(imageBase64: string, client: typeof OpenrouterType, systemPrompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: OPENROUTER_FALLBACK_MODEL,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: "text", text: "Analyze this food image and return nutrition data as JSON." },
        ],
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty response");
  return content;
}

// ---------------------------------------------------------------------------
// Schemas and system prompt
// ---------------------------------------------------------------------------
const IngredientSchema = z.object({
  name: z.string().min(1),
  portion_grams: z.number().nonnegative(),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
});

const AiResponseSchema = z.object({
  meal_name: z.string().min(1),
  ingredients: z.array(IngredientSchema).min(1),
  total_calories: z.number().nonnegative(),
  total_protein_g: z.number().nonnegative(),
  total_carbs_g: z.number().nonnegative(),
  total_fat_g: z.number().nonnegative(),
  confidence_score: z.number().min(0).max(1),
});

function buildSystemPrompt(languageCode?: string): string {
  let langInstruction: string;
  if (languageCode === "zh-TW") {
    langInstruction = `Use Traditional Chinese (繁體中文) for meal_name and all ingredient names. Use authentic Chinese dish names (e.g., 麻婆豆腐, 叉燒, 蝦餃, 炒飯, 牛肉麵). For non-Chinese foods use their common Traditional Chinese name.`;
  } else if (languageCode === "zh-CN") {
    langInstruction = `Use Simplified Chinese (简体中文) for meal_name and all ingredient names. Use authentic Chinese dish names (e.g., 麻婆豆腐, 叉烧, 虾饺, 炒饭, 牛肉面). For non-Chinese foods use their common Simplified Chinese name.`;
  } else {
    langInstruction = `Use English for meal_name and all ingredient names. Identify specific dishes (e.g., "Mapo Tofu", "Char Siu", "Har Gow").`;
  }

  return `You are a world-class nutritionist and food recognition specialist with expertise in global cuisines including Chinese, Japanese, Korean, Thai, Vietnamese, Indian, Mediterranean, and Western foods.

Analyze the provided food image. Output ONLY valid JSON — no markdown, no code blocks, no extra text.

${langInstruction}

JSON structure:
{
  "meal_name": "...",
  "ingredients": [
    { "name": "...", "portion_grams": 150, "calories": 180, "protein_g": 6, "carbs_g": 36, "fat_g": 1 }
  ],
  "total_calories": 600,
  "total_protein_g": 20,
  "total_carbs_g": 70,
  "total_fat_g": 15,
  "confidence_score": 0.92
}

Rules:
1. Estimate portions from reference objects (plates, utensils, hands)
2. Only include ingredients visible in the image
3. If the image is ambiguous, list each plausible interpretation as a separate ingredient entry prefixed with "Possibly:" — document alternatives rather than guessing
4. confidence_score <= 0.5 for ambiguous images; <= 0.7 for partially clear
5. Output ONLY the JSON object`;
}

// ---------------------------------------------------------------------------
// Image compression
// ---------------------------------------------------------------------------
async function compressToMaxSide(base64: string): Promise<string> {
  try {
    const { Jimp } = await import("jimp");
    const buffer = Buffer.from(base64, "base64");
    const img = await Jimp.fromBuffer(buffer);
    const { width: w, height: h } = img;
    if (w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE) {
      const scale = Math.min(MAX_IMAGE_SIDE / w, MAX_IMAGE_SIDE / h);
      img.resize({ w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) });
    }
    const compressed = await img.getBuffer("image/jpeg", { quality: 85 });
    return compressed.toString("base64");
  } catch {
    return base64;
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  // Try direct parse first (model returned clean JSON)
  try { JSON.parse(trimmed); return trimmed; } catch { /* fall through */ }
  // Strip outermost markdown fences (```json ... ``` or ``` ... ```)
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { JSON.parse(fenced); return fenced; } catch { /* fall through */ }
  // Brace-balanced scan: find the first syntactically complete JSON object.
  // Correctly handles strings with braces, escaped quotes, and trailing prose.
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return trimmed;
}

function parseAndValidate(raw: string) {
  const v = AiResponseSchema.parse(JSON.parse(extractJson(raw)));
  return {
    mealName: v.meal_name,
    ingredients: v.ingredients.map((ing) => ({
      name: ing.name,
      portionGrams: ing.portion_grams,
      calories: ing.calories,
      proteinG: ing.protein_g,
      carbsG: ing.carbs_g,
      fatG: ing.fat_g,
    })),
    totalCalories: Math.round(v.total_calories),
    totalProteinG: v.total_protein_g,
    totalCarbsG: v.total_carbs_g,
    totalFatG: v.total_fat_g,
    confidenceScore: v.confidence_score,
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
router.post("/analyze-food", async (req, res) => {
  const { imageBase64, userId, languageCode } = req.body as { imageBase64: unknown; userId: unknown; languageCode?: string };

  if (typeof userId !== "string" || !USER_ID_REGEX.test(userId)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (typeof imageBase64 !== "string" || imageBase64.length < 100) {
    return res.status(400).json({ error: "Invalid or missing imageBase64" });
  }
  if (imageBase64.length > 6_000_000) {
    return res.status(413).json({ error: "Image too large. Resize to ≤512×512 before uploading." });
  }

  try {
    const compressed = await compressToMaxSide(imageBase64);
    const systemPrompt = buildSystemPrompt(typeof languageCode === "string" ? languageCode : undefined);

    // Primary: direct Kimi API
    const kimiKey = process.env.KIMI_API_KEY;
    let kimiError: Error | null = null;
    if (kimiKey) {
      try {
        const raw = await callKimiDirect(compressed, kimiKey, systemPrompt);
        return res.json(parseAndValidate(raw));
      } catch (err) {
        kimiError = err instanceof Error ? err : new Error(String(err));
        console.warn("[analyzeFood] Kimi direct API failed, trying OpenRouter fallback:", kimiError.message);
      }
    }

    // Fallback: OpenRouter via Replit AI Integrations
    const openrouterClient = await getOpenrouterClient();
    if (openrouterClient) {
      console.log(`[analyzeFood] Using OpenRouter fallback: ${OPENROUTER_FALLBACK_MODEL}`);
      const raw = await callViaOpenRouter(compressed, openrouterClient, systemPrompt);
      return res.json(parseAndValidate(raw));
    }

    // No fallback available — surface the Kimi error if we have one, otherwise generic 503
    if (kimiError) {
      if (kimiError.name === "AbortError") {
        return res.status(504).json({ error: "The analysis took too long. Check your connection and try again.", code: "TIMEOUT" });
      }
      const msg = kimiError.message.toLowerCase();
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("econnrefused")) {
        return res.status(502).json({ error: "Couldn't reach the AI service. Check your connection and try again.", code: "NETWORK_ERROR" });
      }
      return res.status(503).json({ error: "Food analysis failed. Please try again.", code: "UNKNOWN" });
    }
    return res.status(503).json({
      error: "AI vision service unavailable. No API key or fallback integration is configured.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      return res.status(422).json({
        error: "Couldn't read the food from that photo. Try a clearer, well-lit image and make sure the food fills most of the frame.",
        code: "PARSE_ERROR",
      });
    }
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({
        error: "The analysis took too long. Check your connection and try again.",
        code: "TIMEOUT",
      });
    }
    if (message.includes("fetch") || message.includes("network") || message.includes("ECONNREFUSED")) {
      return res.status(502).json({
        error: "Couldn't reach the AI service. Check your connection and try again.",
        code: "NETWORK_ERROR",
      });
    }
    return res.status(500).json({ error: "Food analysis failed. Please try again.", code: "UNKNOWN" });
  }
});

export default router;
