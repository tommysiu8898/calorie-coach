import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  mealEntriesTable,
  dailyLogsTable,
  userStatsTable,
  profilesTable,
  communityChallengesTable,
  userChallengeProgressTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const ADJECTIVES = ["Swift", "Bold", "Keen", "Wise", "Calm", "Bright", "Zesty", "Crisp"];
const NOUNS = ["Foodie", "Chef", "Eater", "Cook", "Biter", "Grazer", "Nommer", "Taster"];

function generateDisplayName(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  const adj = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
  const noun = NOUNS[Math.abs(hash >> 3) % NOUNS.length];
  const num = Math.abs(hash >> 6) % 100;
  return `${adj}${noun}${num}`;
}

async function computeDayStats(
  userId: string,
  startDateStr: string,
  endDateStr: string,
  calorieTarget: number,
  proteinTarget: number,
): Promise<{ proteinDaysHit: number; calorieBalanceDaysHit: number }> {
  const meals = await db
    .select()
    .from(mealEntriesTable)
    .where(
      and(
        eq(mealEntriesTable.userId, userId),
        gte(mealEntriesTable.localDate, startDateStr),
        lte(mealEntriesTable.localDate, endDateStr),
      ),
    );

  const grouped = new Map<string, { calories: number; protein: number }>();
  for (const meal of meals) {
    const day = meal.localDate ?? meal.createdAt.toISOString().split("T")[0];
    const prev = grouped.get(day) ?? { calories: 0, protein: 0 };
    grouped.set(day, {
      calories: prev.calories + meal.totalCalories,
      protein: prev.protein + meal.totalProteinG,
    });
  }

  let proteinDaysHit = 0;
  let calorieBalanceDaysHit = 0;
  for (const [, day] of grouped) {
    if (day.protein >= proteinTarget) proteinDaysHit++;
    if (calorieTarget > 0 && Math.abs(day.calories - calorieTarget) / calorieTarget <= 0.10) {
      calorieBalanceDaysHit++;
    }
  }
  return { proteinDaysHit, calorieBalanceDaysHit };
}

export async function computeAndUpsertVitality(userId: string): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [profile, recentMeals, recentLogs] = await Promise.all([
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
    db.select().from(mealEntriesTable)
      .where(and(eq(mealEntriesTable.userId, userId), gte(mealEntriesTable.localDate, sevenDaysAgoStr)))
      .orderBy(desc(mealEntriesTable.createdAt)),
    db.select().from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, sevenDaysAgoStr)))
      .orderBy(desc(dailyLogsTable.date)),
  ]);

  const calorieTarget = profile[0]?.dailyCalorieTarget ?? 2000;
  const proteinTarget = profile[0]?.dailyProteinTarget ?? 150;
  const carbsTarget = profile[0]?.dailyCarbsTarget ?? 250;
  const fatTarget = profile[0]?.dailyFatTarget ?? 65;

  // Group the 7-day vitality window by day
  const groupedByDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const meal of recentMeals) {
    const day = meal.localDate ?? meal.createdAt.toISOString().split("T")[0];
    const prev = groupedByDay.get(day) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    groupedByDay.set(day, {
      calories: prev.calories + meal.totalCalories,
      protein: prev.protein + meal.totalProteinG,
      carbs: prev.carbs + meal.totalCarbsG,
      fat: prev.fat + meal.totalFatG,
    });
  }

  const daysWithData = groupedByDay.size;
  const totalDaysWindow = 7;
  let totalMacroBalance = 0;
  let totalCalorieAdherence = 0;

  for (const [, day] of groupedByDay) {
    const protPct = proteinTarget > 0 ? Math.min(day.protein / proteinTarget, 1) : 0;
    const carbPct = carbsTarget > 0 ? Math.min(day.carbs / carbsTarget, 1) : 0;
    const fatPct = fatTarget > 0 ? Math.min(day.fat / fatTarget, 1) : 0;
    totalMacroBalance += (protPct + carbPct + fatPct) / 3;

    const calDiff = Math.abs(day.calories - calorieTarget);
    totalCalorieAdherence += calorieTarget > 0 ? Math.max(0, 1 - calDiff / calorieTarget) : 0;
  }

  const macroBalanceScore = daysWithData > 0 ? totalMacroBalance / daysWithData : 0;
  const calorieAdherenceScore = daysWithData > 0 ? totalCalorieAdherence / daysWithData : 0;
  const consistencyScore = Math.min(daysWithData / totalDaysWindow, 1);
  const streakDays = recentLogs[0]?.streakDay ?? 0;

  const vitalityScore = Math.round(
    macroBalanceScore * 400 +
    calorieAdherenceScore * 400 +
    consistencyScore * 200
  );

  const isoWeek = getISOWeek(now);
  const displayName = generateDisplayName(userId);

  await db.insert(userStatsTable).values({
    userId,
    vitalityScore,
    streakDays,
    isoWeek,
    macroBalanceScore,
    calorieAdherenceScore,
    consistencyScore,
    displayName,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userStatsTable.userId,
    set: {
      vitalityScore,
      streakDays,
      isoWeek,
      macroBalanceScore,
      calorieAdherenceScore,
      consistencyScore,
      displayName,
      updatedAt: now,
    },
  });

  // Update challenge progress using each challenge's own date window
  try {
    const enrolledChallenges = await db
      .select({
        progressId: userChallengeProgressTable.id,
        goalType: communityChallengesTable.goalType,
        goalValue: communityChallengesTable.goalValue,
        startDate: communityChallengesTable.startDate,
        endDate: communityChallengesTable.endDate,
      })
      .from(userChallengeProgressTable)
      .innerJoin(
        communityChallengesTable,
        and(
          eq(userChallengeProgressTable.challengeId, communityChallengesTable.id),
          eq(communityChallengesTable.isActive, true),
        ),
      )
      .where(eq(userChallengeProgressTable.userId, userId));

    await Promise.all(
      enrolledChallenges.map(async (enrollment) => {
        let currentValue = 0;

        if (enrollment.goalType === "streak_days") {
          currentValue = Math.min(streakDays, enrollment.goalValue);
        } else {
          // Fetch and compute stats within this challenge's date window
          const { proteinDaysHit, calorieBalanceDaysHit } = await computeDayStats(
            userId,
            enrollment.startDate,
            // clamp endDate to today so future days don't count
            enrollment.endDate > todayStr ? todayStr : enrollment.endDate,
            calorieTarget,
            proteinTarget,
          );

          if (enrollment.goalType === "protein_days") {
            currentValue = Math.min(proteinDaysHit, enrollment.goalValue);
          } else if (enrollment.goalType === "calorie_balance_days") {
            currentValue = Math.min(calorieBalanceDaysHit, enrollment.goalValue);
          }
        }

        const isCompleted = currentValue >= enrollment.goalValue;
        await db
          .update(userChallengeProgressTable)
          .set({ currentValue, isCompleted, updatedAt: now })
          .where(eq(userChallengeProgressTable.id, enrollment.progressId));
      }),
    );
  } catch (err) {
    console.warn("[vitality] challenge progress update failed:", err);
  }

  return vitalityScore;
}

router.post("/vitality/update", async (req, res) => {
  const { userId } = req.body as { userId?: unknown };
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const score = await computeAndUpsertVitality(userId);
    return res.json({ vitalityScore: score });
  } catch (err) {
    console.error("[vitality/update] error:", err);
    return res.status(500).json({ error: "Failed to compute vitality score" });
  }
});

export default router;
