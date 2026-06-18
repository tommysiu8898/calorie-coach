import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { mealEntriesTable, partnersTable, profilesTable, weightLogsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { COACH_SKILL } from "../prompts/coachSkill";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

const KIMI_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_TEXT_MODEL = "moonshot-v1-8k";
const KIMI_TIMEOUT_MS = 20_000;

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

function languageDirective(lang: string): string {
  if (lang === "zh-TW") return "\n\nIMPORTANT: You MUST respond entirely in Traditional Chinese (繁體中文). Do not use any English.";
  if (lang === "zh-CN") return "\n\nIMPORTANT: You MUST respond entirely in Simplified Chinese (简体中文). Do not use any English.";
  return "";
}

export async function callKimi(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024,
): Promise<string> {
  const kimiKey = process.env.KIMI_API_KEY;
  if (!kimiKey) throw new Error("KIMI_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KIMI_TIMEOUT_MS);
  try {
    const response = await fetch(KIMI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${kimiKey}` },
      body: JSON.stringify({
        model: KIMI_TEXT_MODEL,
        max_tokens: maxTokens,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function formatMealSummary(meals: typeof mealEntriesTable.$inferSelect[]): string {
  if (meals.length === 0) return "No meals logged in this period.";
  const grouped: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
  for (const meal of meals) {
    const date = meal.localDate ?? meal.createdAt.toISOString().slice(0, 10);
    if (!grouped[date]) grouped[date] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
    grouped[date].calories += meal.totalCalories ?? 0;
    grouped[date].protein += meal.totalProteinG ?? 0;
    grouped[date].carbs += meal.totalCarbsG ?? 0;
    grouped[date].fat += meal.totalFatG ?? 0;
    grouped[date].count += 1;
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) =>
      `${date}: ${d.calories} kcal, protein ${d.protein.toFixed(1)}g, carbs ${d.carbs.toFixed(1)}g, fat ${d.fat.toFixed(1)}g (${d.count} meals)`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// User context helpers — profile + latest weight log
// ---------------------------------------------------------------------------

type UserProfile = typeof profilesTable.$inferSelect;

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const rows = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchLatestWeightKg(userId: string): Promise<number | null> {
  try {
    const rows = await db
      .select({ weightKg: weightLogsTable.weightKg })
      .from(weightLogsTable)
      .where(eq(weightLogsTable.userId, userId))
      .orderBy(desc(weightLogsTable.date))
      .limit(1);
    return rows[0]?.weightKg ?? null;
  } catch {
    return null;
  }
}

const GOAL_LABELS: Record<string, string> = {
  lose: "Lose weight (calorie deficit)",
  maintain: "Maintain weight (calorie balance)",
  gain: "Gain muscle (calorie surplus)",
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "Sedentary (little or no exercise)",
  light: "Lightly active (1-3 days/week)",
  moderate: "Moderately active (3-5 days/week)",
  active: "Very active (6-7 days/week)",
  very_active: "Super active (twice/day or physical job)",
};

function buildHealthFlagsContext(flags: Record<string, unknown>): string {
  if (!flags || Object.keys(flags).length === 0) return "";
  const boolStr = (v: unknown) => v === true ? "YES" : v === false ? "NO" : "UNKNOWN";
  const medLine =
    flags["medications"] === undefined ? "UNKNOWN"
    : flags["medications"] === false || flags["medications"] === "none" ? "None"
    : flags["medications"] === true ? "Yes (unspecified)"
    : String(flags["medications"]);
  return [
    "Health flags:",
    `  High blood pressure: ${boolStr(flags["hypertension"])}`,
    `  High cholesterol: ${boolStr(flags["high_cholesterol"])}`,
    `  Diabetes: ${boolStr(flags["diabetes"])}`,
    `  Pregnant: ${boolStr(flags["pregnant"])}`,
    `  Medications: ${medLine}`,
    `  Supplement allergies: ${boolStr(flags["supplement_allergies"])}`,
    "  (UNKNOWN = not yet collected — be conservative)",
  ].join("\n");
}

function buildProfileContext(profile: UserProfile, latestWeightKg: number | null): string {
  const now = new Date();
  const born = new Date(profile.birthday);
  const age = Math.floor((now.getTime() - born.getTime()) / (365.25 * 24 * 3600 * 1000));
  const currentWeight = latestWeightKg ?? profile.weightKg;
  const weightSource = latestWeightKg != null ? "(recent log)" : "(profile)";
  const diff = currentWeight - profile.targetWeightKg;
  const weightStatus = Math.abs(diff) < 0.1
    ? "at target weight"
    : diff > 0
      ? `${Math.abs(diff).toFixed(1)} kg above target`
      : `${Math.abs(diff).toFixed(1)} kg below target`;

  const healthFlags = profile.healthFlags as Record<string, unknown> | null | undefined;
  const flagsBlock = buildHealthFlagsContext(healthFlags ?? {});

  return [
    "=== User Profile ===",
    `Age: ${age} | Gender: ${profile.gender} | Height: ${profile.heightCm} cm`,
    `Current weight: ${currentWeight} kg ${weightSource} | Target: ${profile.targetWeightKg} kg (${weightStatus})`,
    `Goal: ${GOAL_LABELS[profile.goal] ?? profile.goal}`,
    `Activity level: ${ACTIVITY_LABELS[profile.activityLevel] ?? profile.activityLevel}`,
    `Daily targets — Calories: ${profile.dailyCalorieTarget} kcal | Protein: ${profile.dailyProteinTarget}g | Carbs: ${profile.dailyCarbsTarget}g | Fat: ${profile.dailyFatTarget}g`,
    ...(flagsBlock ? [flagsBlock] : []),
    "====================",
  ].join("\n");
}

function buildActivityContext(steps?: number, activeCalories?: number): string {
  const parts: string[] = [];
  if (steps != null && steps > 0) parts.push(`Steps today: ${steps.toLocaleString()}`);
  if (activeCalories != null && activeCalories > 0) parts.push(`Active calories burned today: ${activeCalories} kcal`);
  if (parts.length === 0) return "";
  return `\nToday's activity (Apple Health):\n${parts.join("\n")}`;
}

// ---------------------------------------------------------------------------
// POST /api/agent/analyze
// Analyzer agent: weekly nutrition summary, deficiencies, recommendation
// Body: { user_id: string, steps?: number, activeCalories?: number }
// Returns: { summary, deficiencies, recommendation_text }
// ---------------------------------------------------------------------------
router.post("/agent/analyze", async (req, res) => {
  const {
    user_id,
    appLanguage = "en",
    steps,
    activeCalories,
  } = req.body as {
    user_id?: string;
    appLanguage?: string;
    steps?: number;
    activeCalories?: number;
  };
  if (!validateUserId(user_id)) return res.status(400).json({ error: "user_id is required and must be valid" });
  if (!isAuthorized(req, user_id)) return res.status(403).json({ error: "Forbidden" });

  try {
    const [recentMeals, profile, latestWeightKg] = await Promise.all([
      db.select()
        .from(mealEntriesTable)
        .where(
          and(
            eq(mealEntriesTable.userId, user_id),
            sql`(
              ${mealEntriesTable.localDate} >= to_char(now() - interval '7 days', 'YYYY-MM-DD')
              OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt} >= now() - interval '7 days')
            )`,
          ),
        )
        .orderBy(desc(mealEntriesTable.createdAt)),
      fetchUserProfile(user_id),
      fetchLatestWeightKg(user_id),
    ]);

    const mealSummary = formatMealSummary(recentMeals);
    const profileContext = profile ? `\n${buildProfileContext(profile, latestWeightKg)}\n` : "";
    const activityContext = buildActivityContext(steps, activeCalories);

    const systemPrompt = `${COACH_SKILL}

Analyze the user's weekly meal data and return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "summary": "A 2-3 sentence summary referencing the user's stated goal, calorie target, and actual intake patterns",
  "deficiencies": ["deficiency1", "deficiency2"],
  "recommendation_text": "A specific, actionable recommendation referencing the user's goal and recent data"
}

Rules:
- deficiencies is an array of short strings (e.g. "Low protein vs. ${'{'}target{'}'}g target", "Insufficient fiber")
- Reference the user's actual targets and logged numbers where available
- If nutrition is on track, deficiencies can be an empty array or ["None identified"]
- Be warm, encouraging, and specific${languageDirective(appLanguage)}`;

    const userPrompt = `${profileContext}${activityContext}

My meal data for the past 7 days:
${mealSummary}

Please analyze my nutrition and provide feedback.`;

    const content = await callKimi(systemPrompt, userPrompt, 900);
    const parsed = JSON.parse(extractJson(content)) as Record<string, unknown>;

    return res.json({
      summary: String(parsed["summary"] ?? "No summary available."),
      deficiencies: Array.isArray(parsed["deficiencies"]) ? parsed["deficiencies"].map(String) : [],
      recommendation_text: String(parsed["recommendation_text"] ?? "Keep tracking your meals for personalized advice."),
    });
  } catch (err) {
    console.error("[agent/analyze] error:", err);
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }
    return res.status(500).json({ error: "Could not generate analysis. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agent/advise
// Advisor agent: free-form Q&A with meal context + profile
// Body: { user_id: string, user_query: string, steps?: number, activeCalories?: number }
// Returns: { response: string }
// ---------------------------------------------------------------------------
router.post("/agent/advise", async (req, res) => {
  const {
    user_id,
    user_query,
    appLanguage = "en",
    steps,
    activeCalories,
  } = req.body as {
    user_id?: string;
    user_query?: string;
    appLanguage?: string;
    steps?: number;
    activeCalories?: number;
  };
  if (!validateUserId(user_id)) return res.status(400).json({ error: "user_id is required and must be valid" });
  if (!isAuthorized(req, user_id)) return res.status(403).json({ error: "Forbidden" });
  if (!user_query?.trim()) return res.status(400).json({ error: "user_query is required" });
  if (user_query.trim().length > 1000) return res.status(400).json({ error: "user_query too long (max 1000 chars)" });

  try {
    const [recentMeals, profile, latestWeightKg] = await Promise.all([
      db.select()
        .from(mealEntriesTable)
        .where(
          and(
            eq(mealEntriesTable.userId, user_id),
            sql`(
              ${mealEntriesTable.localDate} >= to_char(now() - interval '3 days', 'YYYY-MM-DD')
              OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt} >= now() - interval '3 days')
            )`,
          ),
        )
        .orderBy(desc(mealEntriesTable.createdAt)),
      fetchUserProfile(user_id),
      fetchLatestWeightKg(user_id),
    ]);

    const mealContext = formatMealSummary(recentMeals);
    const profileContext = profile ? `\n${buildProfileContext(profile, latestWeightKg)}\n` : "";
    const activityContext = buildActivityContext(steps, activeCalories);

    const lowerQuery = user_query.toLowerCase();
    let extraContext = "";
    if (lowerQuery.includes("supplement") || lowerQuery.includes("vitamin")) {
      extraContext =
        "\n\nSupplement knowledge: Common useful supplements include protein powder (muscle building), omega-3 (heart health), vitamin D (bone health and immunity), magnesium (sleep and muscle function), and B vitamins (energy). Always recommend consulting a doctor before starting supplements.";
    }
    if (lowerQuery.includes("gym") || lowerQuery.includes("workout") || lowerQuery.includes("exercise")) {
      extraContext +=
        "\n\nNote: There are partner gym referral offers available in the app. Suggest the user check the 'Find a gym' option in the AI Coach section for local gym deals.";
    }

    const systemPrompt = `${COACH_SKILL}

Answer the user's question in a warm, conversational tone. Always reference their profile (goal, calorie target, current vs. target weight) and recent meal data when relevant. Be specific and actionable — cite actual targets and logged numbers. Keep your response concise (2-4 sentences for simple questions, up to a short paragraph for complex ones).${extraContext}${languageDirective(appLanguage)}`;

    const userPrompt = `${profileContext}${activityContext}

My recent meals (last 3 days):
${mealContext}

My question: ${user_query.trim()}`;

    const content = await callKimi(systemPrompt, userPrompt, 700);

    return res.json({ response: content.trim() });
  } catch (err) {
    console.error("[agent/advise] error:", err);
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }
    return res.status(500).json({ error: "Could not get advice right now. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agent/connect
// Connector agent: partner/gym recommendations
// Body: { user_id: string, service_type: "gym" | string }
// Returns: { partners: GymPartner[], reasoning: string }
// ---------------------------------------------------------------------------

interface GymPartner {
  id: string;
  name: string;
  address: string;
  promo_code: string;
  discount: string;
  description: string;
}

const MOCK_GYMS: GymPartner[] = [
  {
    id: "gym-001",
    name: "FitLife Gym",
    address: "123 Main Street, Downtown",
    promo_code: "COACH20",
    discount: "20% off first month",
    description: "Full-service gym with nutrition coaching and cardio equipment",
  },
  {
    id: "gym-002",
    name: "Iron & Sweat",
    address: "456 Park Avenue, Midtown",
    promo_code: "IRON15",
    discount: "15% off membership",
    description: "Strength-focused gym with free weights and powerlifting platforms",
  },
  {
    id: "gym-003",
    name: "Zen Fitness Studio",
    address: "789 Wellness Blvd, Eastside",
    promo_code: "ZEN30",
    discount: "30% off first month",
    description: "Yoga, pilates, and HIIT classes with a holistic wellness approach",
  },
  {
    id: "gym-004",
    name: "Peak Performance Center",
    address: "321 Sports Complex, Westside",
    promo_code: "PEAK10",
    discount: "10% off + free personal training session",
    description: "Sports performance training with certified coaches and recovery suites",
  },
  {
    id: "gym-005",
    name: "City Cycle & Fitness",
    address: "654 Urban Way, Northside",
    promo_code: "CYCLE25",
    discount: "25% off first 3 months",
    description: "Cycling studio and full fitness floor with group classes daily",
  },
];

router.post("/agent/connect", async (req, res) => {
  const { user_id, service_type } = req.body as { user_id?: string; service_type?: string };
  if (!validateUserId(user_id)) return res.status(400).json({ error: "user_id is required and must be valid" });
  if (!isAuthorized(req, user_id)) return res.status(403).json({ error: "Forbidden" });
  if (!service_type) return res.status(400).json({ error: "service_type is required" });

  if (service_type !== "gym") {
    return res.status(400).json({ error: `service_type '${service_type}' is not supported yet` });
  }

  try {
    const [recentMeals, profile, latestWeightKg] = await Promise.all([
      db.select()
        .from(mealEntriesTable)
        .where(
          and(
            eq(mealEntriesTable.userId, user_id),
            sql`(
              ${mealEntriesTable.localDate} >= to_char(now() - interval '7 days', 'YYYY-MM-DD')
              OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt} >= now() - interval '7 days')
            )`,
          ),
        )
        .orderBy(desc(mealEntriesTable.createdAt)),
      fetchUserProfile(user_id),
      fetchLatestWeightKg(user_id),
    ]);

    const mealContext = formatMealSummary(recentMeals);
    const profileContext = profile ? `\n${buildProfileContext(profile, latestWeightKg)}\n` : "";

    const systemPrompt = `${COACH_SKILL}

Based on the user's profile and recent nutrition data, write ONE short sentence (under 60 words) explaining why joining a gym would complement their current habits and help with their specific goal. Be specific and encouraging.`;

    const userPrompt = `${profileContext}\nRecent nutrition:\n${mealContext || "No meals logged yet."}\n\nWhy would joining a gym help this user reach their goal?`;

    let reasoning = "Based on your nutrition tracking, pairing your healthy eating habits with regular exercise at a gym would accelerate your progress toward your fitness goals.";
    try {
      const content = await callKimi(systemPrompt, userPrompt, 200);
      reasoning = content.trim();
    } catch (kimiErr) {
      console.warn("[agent/connect] Kimi call failed for reasoning, using fallback:", kimiErr);
    }

    // Query real partners table (gyms + wellness categories), fall back to mock if empty
    let partners: GymPartner[] = MOCK_GYMS;
    try {
      const dbPartners = await db
        .select()
        .from(partnersTable)
        .where(
          and(
            eq(partnersTable.isActive, true),
            sql`${partnersTable.category} IN ('gym', 'wellness', 'supplement', 'nutrition')`,
          ),
        );

      if (dbPartners.length > 0) {
        partners = dbPartners.map((p) => ({
          id: p.id,
          name: p.name,
          address: "",
          promo_code: "",
          discount: `${p.commissionRate}% off via our partner`,
          description: `${p.name} — ${p.category}`,
        }));
      }
    } catch (dbErr) {
      console.warn("[agent/connect] DB partners query failed, using mock:", dbErr);
    }

    return res.json({
      partners,
      reasoning,
    });
  } catch (err) {
    console.error("[agent/connect] error:", err);
    return res.status(500).json({ error: "Could not load partner recommendations. Please try again." });
  }
});

export default router;
