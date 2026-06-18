import { Router, type Request } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

const UpdateProfileSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
  gender: z.enum(["male", "female", "other"]),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Birthday must be YYYY-MM-DD"),
  heightCm: z.number().positive().max(300),
  weightKg: z.number().positive().max(600),
  targetWeightKg: z.number().positive().max(600),
  goal: z.enum(["lose", "maintain", "gain"]),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  // Optional weight-goal plan fields
  goalStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  goalStartWeightKg: z.number().positive().max(600).optional(),
  goalDurationWeeks: z.number().int().positive().max(520).optional(),
});

function calculateAge(birthday: string): number {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

function calculateBMR(gender: string, weightKg: number, heightCm: number, age: number): number {
  // Mifflin-St Jeor Equation
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === "male" ? base + 5 : base - 161;
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calculateMacroTargets(
  dailyCalories: number,
  goal: string,
  weightKg: number,
): { protein: number; carbs: number; fat: number } {
  // Body-weight protein targets (g/kg): higher protein on a cut to preserve muscle
  const proteinMultiplier = goal === "lose" ? 2.0 : goal === "gain" ? 1.8 : 1.6;
  const protein = Math.round(weightKg * proteinMultiplier);

  // Fat: minimum 20% for hormones; 25% for lose/maintain (more satiating)
  const fatPct = goal === "gain" ? 0.22 : 0.25;
  const fat = Math.round((dailyCalories * fatPct) / 9);

  // Carbs fill remaining calories; never below 50 g/day
  const carbs = Math.round(Math.max(50, (dailyCalories - protein * 4 - fat * 9) / 4));

  return { protein, carbs, fat };
}

const GOAL_ADJUSTMENTS: Record<string, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

// GET /api/profile
router.get("/profile", async (req, res) => {
  const { userId } = req.query;
  if (typeof userId !== "string" || !USER_ID_REGEX.test(userId)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId))
      .limit(1);

    if (profiles.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }
    return res.json(profiles[0]);
  } catch {
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PUT /api/profile
router.put("/profile", async (req, res) => {
  const parseResult = UpdateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? "Invalid request" });
  }

  const {
    userId, gender, birthday, heightCm, weightKg, targetWeightKg, goal, activityLevel,
    goalStartDate, goalStartWeightKg, goalDurationWeeks,
  } = parseResult.data;

  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const age = calculateAge(birthday);
  const bmr = calculateBMR(gender, weightKg, heightCm, age);
  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2));

  // Duration-based deficit/surplus when a goal plan is set; otherwise use fixed defaults
  let calorieAdjustment = GOAL_ADJUSTMENTS[goal] ?? 0;
  if (goal === "lose" && goalDurationWeeks && targetWeightKg < weightKg) {
    const kgToLose = weightKg - targetWeightKg;
    const dailyDeficit = Math.round((kgToLose * 7700) / (goalDurationWeeks * 7));
    calorieAdjustment = -Math.max(250, Math.min(1000, dailyDeficit));
  } else if (goal === "gain" && goalDurationWeeks && targetWeightKg > weightKg) {
    const kgToGain = targetWeightKg - weightKg;
    const dailySurplus = Math.round((kgToGain * 7700) / (goalDurationWeeks * 7));
    calorieAdjustment = Math.max(100, Math.min(500, dailySurplus));
  }
  const dailyCalorieTarget = Math.max(1200, Math.round(tdee + calorieAdjustment));
  const macros = calculateMacroTargets(dailyCalorieTarget, goal, weightKg);

  const profileData = {
    userId,
    gender,
    birthday,
    heightCm,
    weightKg,
    targetWeightKg,
    goal,
    activityLevel,
    dailyCalorieTarget,
    dailyProteinTarget: macros.protein,
    dailyCarbsTarget: macros.carbs,
    dailyFatTarget: macros.fat,
    updatedAt: new Date(),
    // Only update goal plan fields when explicitly provided
    ...(goalStartDate !== undefined && { goalStartDate }),
    ...(goalStartWeightKg !== undefined && { goalStartWeightKg }),
    ...(goalDurationWeeks !== undefined && { goalDurationWeeks }),
  };

  try {
    const existing = await db
      .select({ userId: profilesTable.userId })
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(profilesTable)
        .set(profileData)
        .where(eq(profilesTable.userId, userId))
        .returning();
      return res.json(updated);
    } else {
      const [created] = await db
        .insert(profilesTable)
        .values({ ...profileData, createdAt: new Date() })
        .returning();
      return res.json(created);
    }
  } catch {
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
