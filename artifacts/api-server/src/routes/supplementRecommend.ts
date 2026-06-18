// POST /api/supplement-recommend
// Uses Kimi LLM as a personalised nutritionist/health coach.
// Fetches the user's recent meal data (if user_id provided) and selects 3 products
// from the curated iHerb catalogue with AI-generated, personalised explanations.
// Returns { needs_questionnaire: true, next_question } if health flags are incomplete.
// Optional: IHERB_AFFILIATE_ID secret — appends affiliate rcode to product links.

import { Router } from "express";
import { db } from "@workspace/db";
import { mealEntriesTable, profilesTable } from "@workspace/db";
import type { HealthFlags } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { callKimi } from "./agent";
import { COACH_SKILL } from "../prompts/coachSkill";

const router = Router();

interface CatalogueEntry {
  name: string;
  description: string;
  iherbCode: string;
}

const CATALOGUE: CatalogueEntry[] = [
  { name: "Optimum Nutrition Gold Standard 100% Whey", description: "24g protein per serving. Ideal for muscle building and post-workout recovery.", iherbCode: "OPT-02091" },
  { name: "Nordic Naturals Ultimate Omega", description: "High-potency omega-3 fish oil for heart health and reducing inflammation.", iherbCode: "NOR-01720" },
  { name: "Garden of Life Vitamin Code Multivitamin", description: "Whole-food multivitamin with probiotics and enzymes for comprehensive daily nutrition.", iherbCode: "GOL-11444" },
  { name: "Doctor's Best High Absorption Magnesium", description: "Chelated magnesium glycinate for better sleep, muscle function, and stress relief.", iherbCode: "DRB-00524" },
  { name: "NatureWise Vitamin D3 5000 IU", description: "Supports bone health, immune function, and mood regulation.", iherbCode: "NTW-00181" },
  { name: "Vital Proteins Collagen Peptides", description: "Unflavoured collagen powder for skin, hair, nails, and joint support.", iherbCode: "VTP-00802" },
  { name: "Cellucor C4 Original Pre-Workout", description: "Energy, focus, and pump formula to power through your workouts.", iherbCode: "CLU-07420" },
  { name: "Optimum Nutrition Micronized Creatine", description: "Clinically proven to increase strength, power output, and lean muscle mass.", iherbCode: "OPT-02083" },
  { name: "NOW Foods Psyllium Husk Powder", description: "Soluble dietary fibre to support digestive health and cholesterol management.", iherbCode: "NOW-05984" },
  { name: "Garden of Life Dr. Formulated Probiotics", description: "50 billion CFU, 16 strains for gut health, immunity, and digestion.", iherbCode: "GOL-11476" },
  { name: "Garden of Life mykind Plant Iron", description: "Gentle plant-based iron with vitamin C for absorption. Supports energy and blood health.", iherbCode: "GOL-11520" },
  { name: "Thorne Research Zinc Picolinate", description: "Highly bioavailable zinc for immune support, skin health, and hormone balance.", iherbCode: "THR-00320" },
];

const CATALOGUE_TEXT = CATALOGUE.map(
  (p, i) => `${i + 1}. iherbCode: "${p.iherbCode}" | name: "${p.name}" | description: "${p.description}"`
).join("\n");

function buildAffiliateLink(iherbCode: string): string {
  const affiliateId = process.env.IHERB_AFFILIATE_ID;
  const base = `https://www.iherb.com/pr/${iherbCode}`;
  return affiliateId ? `${base}?rcode=${affiliateId}` : base;
}

const PRICE_NOTE: Record<string, string> = {
  "en": "Price as shown on iHerb",
  "zh-TW": "價格以 iHerb 網站顯示為準",
  "zh-CN": "价格以 iHerb 网站显示为准",
};

function languageDirective(lang: string): string {
  if (lang === "zh-TW") return "\n\nIMPORTANT: You MUST write the explanation fields entirely in Traditional Chinese (繁體中文). Do not use any English in the explanation fields. The iherbCode and name fields must remain unchanged.";
  if (lang === "zh-CN") return "\n\nIMPORTANT: You MUST write the explanation fields entirely in Simplified Chinese (简体中文). Do not use any English in the explanation fields. The iherbCode and name fields must remain unchanged.";
  return "";
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

type QuestionKey =
  | "q_hypertension"
  | "q_high_cholesterol"
  | "q_diabetes"
  | "q_pregnant"
  | "q_medications"
  | "q_supplement_allergies";

/**
 * Returns the next unanswered question key, or null when all 6 flags are set.
 * All 6 flags must be defined before recommendations are shown.
 */
function getNextQuestion(flags: HealthFlags): QuestionKey | null {
  if (flags.hypertension === undefined) return "q_hypertension";
  if (flags.high_cholesterol === undefined) return "q_high_cholesterol";
  if (flags.diabetes === undefined) return "q_diabetes";
  if (flags.pregnant === undefined) return "q_pregnant";
  if (flags.medications === undefined) return "q_medications";
  if (flags.supplement_allergies === undefined) return "q_supplement_allergies";
  return null;
}

function boolFlag(v: boolean | undefined): string {
  if (v === undefined) return "UNKNOWN";
  return v ? "YES" : "NO";
}

function buildHealthContext(flags: HealthFlags): string {
  const medLine =
    flags.medications === undefined
      ? "UNKNOWN"
      : flags.medications === false || flags.medications === "none"
        ? "None"
        : flags.medications === true
          ? "Yes (unspecified)"
          : String(flags.medications);

  const lines: string[] = [
    `- High blood pressure: ${boolFlag(flags.hypertension)}`,
    `- High cholesterol: ${boolFlag(flags.high_cholesterol)}`,
    `- Diabetes: ${boolFlag(flags.diabetes)}`,
    `- Pregnant: ${boolFlag(flags.pregnant)}`,
    `- Medications: ${medLine}`,
    `- Supplement allergies: ${boolFlag(flags.supplement_allergies)}`,
  ];
  return `\nUser health profile:\n${lines.join("\n")}\n\nIMPORTANT: UNKNOWN means we do not have that information — be conservative. Tailor recommendations to confirmed conditions. Avoid supplements that may worsen conditions or interact with medications. Add a brief caution where relevant but do NOT recommend specific dosages.`;
}

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

router.post("/supplement-recommend", async (req, res) => {
  const {
    user_id,
    deficiencies = [],
    appLanguage = "en",
    goal,
  } = req.body as {
    user_id?: string;
    deficiencies?: string[];
    appLanguage?: string;
    goal?: string;
  };

  if (!Array.isArray(deficiencies)) {
    return res.status(400).json({ success: false, error: "deficiencies must be an array" });
  }

  // ── Health flags questionnaire gate ────────────────────────────────────────
  let healthFlags: HealthFlags = {};
  if (user_id && USER_ID_REGEX.test(user_id)) {
    try {
      const rows = await db
        .select({ healthFlags: profilesTable.healthFlags })
        .from(profilesTable)
        .where(eq(profilesTable.userId, user_id))
        .limit(1);
      healthFlags = (rows[0]?.healthFlags as HealthFlags) ?? {};
    } catch {
      // If DB lookup fails, proceed without flags (non-fatal)
    }

    const nextQuestion = getNextQuestion(healthFlags);
    if (nextQuestion !== null) {
      return res.json({ success: true, needs_questionnaire: true, next_question: nextQuestion });
    }
  }

  const priceNote = PRICE_NOTE[appLanguage] ?? PRICE_NOTE["en"];

  let mealContext = "No meal data available.";
  if (user_id && USER_ID_REGEX.test(user_id)) {
    try {
      const meals = await db
        .select()
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
        .orderBy(desc(mealEntriesTable.createdAt));
      mealContext = formatMealSummary(meals);
    } catch {
    }
  }

  const deficiencyText = deficiencies.length > 0
    ? deficiencies.join(", ")
    : "None identified — give general health-optimisation advice";
  const goalText = goal ? `\nUser's goal: ${goal}` : "";
  const healthContext = Object.keys(healthFlags).length > 0 ? buildHealthContext(healthFlags) : "";

  const systemPrompt = `${COACH_SKILL}

You are consulting a client one-on-one. You have access to their recent meal data and known nutritional deficiencies. Based on this, recommend exactly 3 supplements from the catalogue below that will most benefit this specific person.

Return ONLY a valid JSON array of exactly 3 objects (no markdown, no extra text):
[
  {
    "iherbCode": "<exact iherbCode from catalogue>",
    "name": "<exact name from catalogue>",
    "explanation": "2-3 sentences explaining why THIS person specifically needs this supplement, referencing their actual meal patterns and deficiencies. Be warm, specific, and actionable."
  }
]

Available catalogue (pick only from these):
${CATALOGUE_TEXT}

Rules:
- You MUST select exactly 3 products using the exact iherbCode values from the catalogue
- explanation must be personalised — reference actual numbers from their meals when possible
- If no meal data exists, give general but thoughtful advice based on deficiencies/goal
- Do NOT invent iherbCodes — only use ones listed above${healthContext}${languageDirective(appLanguage)}`;

  const userPrompt = `My recent meals (last 7 days):\n${mealContext}\n\nIdentified deficiencies: ${deficiencyText}${goalText}\n\nPlease recommend the 3 best supplements for me from the catalogue.`;

  try {
    const content = await callKimi(systemPrompt, userPrompt, 900);
    const rawArray = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(rawArray) as Array<{ iherbCode: string; name: string; explanation: string }>;

    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid LLM response");

    const products = parsed.slice(0, 3).map((item) => {
      const catalogueEntry = CATALOGUE.find((c) => c.iherbCode === item.iherbCode);
      return {
        name: item.name || (catalogueEntry?.name ?? "Supplement"),
        description: item.explanation,
        affiliateLink: buildAffiliateLink(item.iherbCode || (catalogueEntry?.iherbCode ?? "")),
        priceNote,
      };
    });

    return res.json({ success: true, products });
  } catch (err) {
    console.error("[supplement-recommend] LLM error, falling back to keyword match:", err);

    const fallback = CATALOGUE.filter((p) =>
      ["GOL-11444", "NOR-01720", "GOL-11476"].includes(p.iherbCode)
    );
    const products = fallback.map((p) => ({
      name: p.name,
      description: p.description,
      affiliateLink: buildAffiliateLink(p.iherbCode),
      priceNote,
    }));
    return res.json({ success: true, products, fallback: true });
  }
});

export default router;
