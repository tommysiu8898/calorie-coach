/**
 * kimi-direct.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct Kimi (Moonshot) API calls for the native iOS build.
 * No backend / CORS proxy needed — native apps call the API directly.
 *
 * Usage:
 *   import { analyzeFood, coachAnalyze, coachAdvise } from "@/lib/kimi-direct";
 */

const KIMI_API_KEY = "sk-j2qFWBrVfs5lWe1uneo06on8HjI4TGUqQivdIfxe7tWjiuCf";
const KIMI_BASE    = "https://api.moonshot.cn/v1/chat/completions";
const VISION_MODEL = "moonshot-v1-8k-vision-preview";
const TEXT_MODEL   = "moonshot-v1-8k";
const TIMEOUT_MS   = 25_000;

// ─── COACH SKILL (mirrors server/src/prompts/coachSkill.ts) ──────────────────
const COACH_SKILL = `You are Cal, a credentialed AI nutrition and fitness coach with the expertise of a registered dietitian (RD), certified personal trainer (CPT), and exercise physiologist.

Areas of expertise: nutrition science, weight management, exercise physiology, and supplement safety.

Reasoning approach:
- Goal-first: always anchor advice to the user's stated goal and calorie target.
- Data-driven: reference the user's actual numbers — meals logged, macros, current vs. target weight, steps, active calories burned.
- Evidence-based: cite established nutritional science; avoid fads.
- Safe: never diagnose medical conditions; always recommend consulting a doctor for health concerns.
- Encouraging: acknowledge effort and frame deficits as opportunities.

Response rules:
- Be specific and actionable (e.g. "add 30g of protein to breakfast", not "eat more protein").
- Keep responses concise and conversational.
- For supplement questions always add: "Consult your doctor before starting any new supplement."
- Never suggest calories below 1,200 kcal/day (females) or 1,500 kcal/day (males) without noting medical supervision.
- Do not provide medical diagnoses or replace physician advice.`;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function languageDirective(lang: string): string {
  if (lang === "zh-TW") return "\n\nIMPORTANT: You MUST respond entirely in Traditional Chinese (繁體中文). Do not use any English.";
  if (lang === "zh-CN") return "\n\nIMPORTANT: You MUST respond entirely in Simplified Chinese (简体中文). Do not use any English.";
  return "";
}

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

async function callKimi(opts: {
  model: string;
  systemPrompt: string;
  userText: string;
  imageBase64?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const userContent: unknown[] = opts.imageBase64
    ? [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${opts.imageBase64}` } },
        { type: "text", text: opts.userText },
      ]
    : opts.userText;

  try {
    const response = await fetch(KIMI_BASE, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.4,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Kimi API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Kimi returned empty response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Ingredient {
  name: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodAnalysis {
  mealName: string;
  ingredients: Ingredient[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  confidenceScore: number;
}

export interface WeekAnalysis {
  summary: string;
  deficiencies: string[];
  recommendation_text: string;
}

export interface LocalMeal {
  id: string;
  mealName: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  localDate: string; // YYYY-MM-DD
}

export interface LocalProfile {
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbsTarget: number;
  dailyFatTarget: number;
  goal: string;
  weightKg: number;
  targetWeightKg: number;
  heightCm: number;
  gender: string;
  activityLevel: string;
}

// ─── 1. Food Vision Analysis ─────────────────────────────────────────────────

function buildFoodSystemPrompt(languageCode?: string): string {
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
3. confidence_score <= 0.5 for ambiguous images; <= 0.7 for partially clear
4. Output ONLY the JSON object`;
}

export async function analyzeFood(
  imageBase64: string,
  languageCode?: string,
): Promise<FoodAnalysis> {
  const systemPrompt = buildFoodSystemPrompt(languageCode);
  const raw = await callKimi({
    model: VISION_MODEL,
    systemPrompt,
    userText: "Analyze this food image and return nutrition data as JSON.",
    imageBase64,
    maxTokens: 2048,
    temperature: 0.2,
  });

  const parsed = JSON.parse(extractJson(raw)) as {
    meal_name: string;
    ingredients: Array<{
      name: string;
      portion_grams: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }>;
    total_calories: number;
    total_protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    confidence_score: number;
  };

  return {
    mealName: parsed.meal_name,
    ingredients: parsed.ingredients.map((i) => ({
      name: i.name,
      portionGrams: i.portion_grams,
      calories: i.calories,
      proteinG: i.protein_g,
      carbsG: i.carbs_g,
      fatG: i.fat_g,
    })),
    totalCalories: Math.round(parsed.total_calories),
    totalProteinG: parsed.total_protein_g,
    totalCarbsG: parsed.total_carbs_g,
    totalFatG: parsed.total_fat_g,
    confidenceScore: parsed.confidence_score,
  };
}

// ─── 1b. Generate food nutrition from text description ────────────────────────

export async function generateFoodFromText(
  description: string,
  languageCode?: string,
): Promise<{ name: string; calories: number; proteinG: number; carbsG: number; fatG: number; servingLabel: string; servingGrams: number }> {
  const lang = languageCode ?? "en";
  const langDir = lang === "zh-TW"
    ? " Respond with the food name in Traditional Chinese."
    : lang === "zh-CN"
    ? " Respond with the food name in Simplified Chinese."
    : "";

  const systemPrompt = `You are a nutrition database assistant. Given a food description, return ONLY a JSON object with estimated nutrition per standard serving. No markdown, no extra text.${langDir}

JSON format:
{
  "name": "food name",
  "calories": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "servingLabel": "e.g. 1 cup (240g)",
  "servingGrams": number
}

Use standard serving sizes. Round calories to whole numbers and macros to 1 decimal place.`;

  const raw = await callKimi({
    model: TEXT_MODEL,
    systemPrompt,
    userText: `Food: ${description}`,
    maxTokens: 512,
    temperature: 0.2,
  });

  return JSON.parse(extractJson(raw)) as {
    name: string; calories: number; proteinG: number;
    carbsG: number; fatG: number; servingLabel: string; servingGrams: number;
  };
}

// ─── 2. Coach — Weekly Analysis ───────────────────────────────────────────────

function formatMealSummary(meals: LocalMeal[]): string {
  if (meals.length === 0) return "No meals logged in this period.";
  const grouped: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
  for (const meal of meals) {
    const d = meal.localDate;
    if (!grouped[d]) grouped[d] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
    grouped[d].calories += meal.totalCalories;
    grouped[d].protein  += meal.totalProteinG;
    grouped[d].carbs    += meal.totalCarbsG;
    grouped[d].fat      += meal.totalFatG;
    grouped[d].count    += 1;
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) =>
      `${date}: ${d.calories} kcal, protein ${d.protein.toFixed(1)}g, carbs ${d.carbs.toFixed(1)}g, fat ${d.fat.toFixed(1)}g (${d.count} meals)`
    )
    .join("\n");
}

function buildProfileContext(profile: LocalProfile): string {
  const GOAL_LABELS: Record<string, string> = {
    lose: "Lose weight (calorie deficit)",
    maintain: "Maintain weight (calorie balance)",
    gain: "Gain muscle (calorie surplus)",
  };
  const diff = profile.weightKg - profile.targetWeightKg;
  const weightStatus = Math.abs(diff) < 0.1 ? "at target weight"
    : diff > 0 ? `${Math.abs(diff).toFixed(1)} kg above target`
    : `${Math.abs(diff).toFixed(1)} kg below target`;
  return [
    "=== User Profile ===",
    `Gender: ${profile.gender} | Height: ${profile.heightCm} cm`,
    `Current weight: ${profile.weightKg} kg | Target: ${profile.targetWeightKg} kg (${weightStatus})`,
    `Goal: ${GOAL_LABELS[profile.goal] ?? profile.goal}`,
    `Daily targets — Calories: ${profile.dailyCalorieTarget} kcal | Protein: ${profile.dailyProteinTarget}g | Carbs: ${profile.dailyCarbsTarget}g | Fat: ${profile.dailyFatTarget}g`,
    "====================",
  ].join("\n");
}

function buildActivityContext(steps?: number, activeCalories?: number): string {
  const parts: string[] = [];
  if (steps && steps > 0) parts.push(`Steps today: ${steps.toLocaleString()}`);
  if (activeCalories && activeCalories > 0) parts.push(`Active calories burned today: ${activeCalories} kcal`);
  if (parts.length === 0) return "";
  return `\nToday's activity (Apple Health):\n${parts.join("\n")}`;
}

export async function coachAnalyze(opts: {
  meals: LocalMeal[];
  profile: LocalProfile | null;
  languageCode?: string;
  steps?: number;
  activeCalories?: number;
}): Promise<WeekAnalysis> {
  const lang = opts.languageCode ?? "en";
  const mealSummary     = formatMealSummary(opts.meals);
  const profileContext  = opts.profile ? `\n${buildProfileContext(opts.profile)}\n` : "";
  const activityContext = buildActivityContext(opts.steps, opts.activeCalories);

  const systemPrompt = `${COACH_SKILL}

Analyze the user's weekly meal data and return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "summary": "A 2-3 sentence summary referencing the user's stated goal, calorie target, and actual intake patterns",
  "deficiencies": ["deficiency1", "deficiency2"],
  "recommendation_text": "A specific, actionable recommendation referencing the user's goal and recent data"
}

Rules:
- deficiencies is an array of short strings (e.g. "Low protein vs. target", "Insufficient fiber")
- Reference the user's actual targets and logged numbers where available
- If nutrition is on track, deficiencies can be an empty array or ["None identified"]
- Be warm, encouraging, and specific${languageDirective(lang)}`;

  const userPrompt = `${profileContext}${activityContext}

My meal data for the past 7 days:
${mealSummary}

Please analyze my nutrition and provide feedback.`;

  const content = await callKimi({
    model: TEXT_MODEL,
    systemPrompt,
    userText: userPrompt,
    maxTokens: 900,
  });

  const parsed = JSON.parse(extractJson(content)) as Record<string, unknown>;
  return {
    summary: String(parsed["summary"] ?? "No summary available."),
    deficiencies: Array.isArray(parsed["deficiencies"]) ? (parsed["deficiencies"] as unknown[]).map(String) : [],
    recommendation_text: String(parsed["recommendation_text"] ?? "Keep tracking your meals for personalised advice."),
  };
}

// ─── 3. Coach — Free-form Q&A ─────────────────────────────────────────────────

export async function coachAdvise(opts: {
  query: string;
  meals: LocalMeal[];
  profile: LocalProfile | null;
  languageCode?: string;
  steps?: number;
  activeCalories?: number;
}): Promise<string> {
  const lang = opts.languageCode ?? "en";
  const mealContext     = formatMealSummary(opts.meals);
  const profileContext  = opts.profile ? `\n${buildProfileContext(opts.profile)}\n` : "";
  const activityContext = buildActivityContext(opts.steps, opts.activeCalories);

  const lowerQuery = opts.query.toLowerCase();
  let extraContext = "";
  if (lowerQuery.includes("supplement") || lowerQuery.includes("vitamin")) {
    extraContext = "\n\nSupplement knowledge: Common useful supplements include protein powder (muscle building), omega-3 (heart health), vitamin D (bone health and immunity), magnesium (sleep and muscle function), and B vitamins (energy). Always recommend consulting a doctor before starting supplements.";
  }
  if (lowerQuery.includes("gym") || lowerQuery.includes("workout") || lowerQuery.includes("exercise")) {
    extraContext += "\n\nNote: There are partner gym referral offers available in the app. Suggest the user check the 'Find a gym' option in the AI Coach section for local gym deals.";
  }

  const systemPrompt = `${COACH_SKILL}

Answer the user's question in a warm, conversational tone. Always reference their profile (goal, calorie target, current vs. target weight) and recent meal data when relevant. Be specific and actionable — cite actual targets and logged numbers. Keep your response concise (2-4 sentences for simple questions, up to a short paragraph for complex ones).${extraContext}${languageDirective(lang)}`;

  const userPrompt = `${profileContext}${activityContext}

My recent meals (last 3 days):
${mealContext}

My question: ${opts.query.trim()}`;

  const content = await callKimi({
    model: TEXT_MODEL,
    systemPrompt,
    userText: userPrompt,
    maxTokens: 700,
  });

  return content.trim();
}
