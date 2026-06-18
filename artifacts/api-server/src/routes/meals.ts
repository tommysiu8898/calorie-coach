import { Router, type Request } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { mealEntriesTable, dailyLogsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { computeAndUpsertVitality } from "./vitality";

const router = Router();

const USER_ID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|user_[a-zA-Z0-9]+)$/i;
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_REGEX.test(userId);
}

function isAuthorized(req: Request, userId: string): boolean {
  const { userId: clerkUserId } = getAuth(req);
  return !clerkUserId || clerkUserId === userId;
}

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function inferMealType(localHour: number): MealType {
  if (localHour < 11) return "breakfast";
  if (localHour < 15) return "lunch";
  if (localHour < 21) return "dinner";
  return "snack";
}

function serverUTCDate(): string {
  return new Date().toISOString().split("T")[0];
}

const CreateMealSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid userId format"),
  photoUrl: z.string().nullable().optional(),
  aiResponse: z.record(z.unknown()).nullable().optional(),
  userCorrections: z.array(z.unknown()).nullable().optional(),
  totalCalories: z.number().int().nonnegative(),
  totalProteinG: z.number().nonnegative(),
  totalCarbsG: z.number().nonnegative(),
  totalFatG: z.number().nonnegative(),
  mealName: z.string().min(1).max(255),
  localHour: z.number().int().min(0).max(23).optional(),
  localDate: z.string().regex(LOCAL_DATE_REGEX, "localDate must be YYYY-MM-DD").optional(),
});

// POST /api/meals
router.post("/meals", async (req, res) => {
  const parsed = CreateMealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const {
    userId,
    photoUrl,
    aiResponse,
    userCorrections,
    totalCalories,
    totalProteinG,
    totalCarbsG,
    totalFatG,
    mealName,
    localHour,
    localDate,
  } = parsed.data;

  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const effectiveHour = localHour ?? new Date().getUTCHours();
  const mealType = inferMealType(effectiveHour);
  const dateKey = localDate ?? serverUTCDate();
  const id = crypto.randomUUID();

  try {
    const [entry] = await db
      .insert(mealEntriesTable)
      .values({
        id,
        userId,
        photoUrl: photoUrl ?? null,
        aiResponse: aiResponse ?? null,
        userCorrections: userCorrections ?? null,
        totalCalories,
        totalProteinG,
        totalCarbsG,
        totalFatG,
        mealName,
        mealType,
        localDate: dateKey,
      })
      .returning();

    if (!entry) return res.status(500).json({ error: "Failed to insert meal entry" });

    const existing = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, dateKey)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(dailyLogsTable)
        .set({
          totalCalories: sql`${dailyLogsTable.totalCalories} + ${totalCalories}`,
          totalProteinG: sql`${dailyLogsTable.totalProteinG} + ${totalProteinG}`,
          totalCarbsG: sql`${dailyLogsTable.totalCarbsG} + ${totalCarbsG}`,
          totalFatG: sql`${dailyLogsTable.totalFatG} + ${totalFatG}`,
          mealsLogged: sql`${dailyLogsTable.mealsLogged} + 1`,
        })
        .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, dateKey)));
    } else {
      const [y, mo, d] = dateKey.split("-").map(Number) as [number, number, number];
      const dayBefore = new Date(Date.UTC(y, mo - 1, d - 1));
      const yesterdayKey = dayBefore.toISOString().split("T")[0];

      const prevLog = await db
        .select({ streakDay: dailyLogsTable.streakDay })
        .from(dailyLogsTable)
        .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, yesterdayKey)))
        .limit(1);

      await db.insert(dailyLogsTable).values({
        id: crypto.randomUUID(),
        userId,
        date: dateKey,
        totalCalories,
        totalProteinG,
        totalCarbsG,
        totalFatG,
        streakDay: prevLog.length > 0 ? prevLog[0].streakDay + 1 : 1,
        mealsLogged: 1,
      });
    }

    computeAndUpsertVitality(userId).catch((err) =>
      console.warn("[meals/post] vitality update failed:", err)
    );

    return res.status(201).json({ ...entry, createdAt: entry.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: "Failed to save meal entry" });
  }
});

// GET /api/meals/today
router.get("/meals/today", async (req, res) => {
  const { userId, localDate } = req.query;
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  if (!isAuthorized(req, userId as string)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (localDate !== undefined && (typeof localDate !== "string" || !LOCAL_DATE_REGEX.test(localDate))) {
    return res.status(400).json({ error: "localDate must be YYYY-MM-DD" });
  }

  const dateKey = (localDate as string | undefined) ?? serverUTCDate();

  try {
    const [meals, dailyLog] = await Promise.all([
      db
        .select()
        .from(mealEntriesTable)
        .where(
          and(
            eq(mealEntriesTable.userId, userId as string),
            sql`(${mealEntriesTable.localDate} = ${dateKey} OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt}::date = ${dateKey}::date))`,
          ),
        )
        .orderBy(desc(mealEntriesTable.createdAt)),
      db
        .select()
        .from(dailyLogsTable)
        .where(and(eq(dailyLogsTable.userId, userId as string), eq(dailyLogsTable.date, dateKey)))
        .limit(1),
    ]);

    const log = dailyLog[0];
    // Compute totals from actual meal entries (not daily_logs) to avoid drift
    const computedTotals = meals.reduce(
      (acc, m) => ({
        totalCalories: acc.totalCalories + m.totalCalories,
        totalProteinG: acc.totalProteinG + m.totalProteinG,
        totalCarbsG: acc.totalCarbsG + m.totalCarbsG,
        totalFatG: acc.totalFatG + m.totalFatG,
      }),
      { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0 },
    );
    return res.json({
      meals: meals.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      totalCalories: computedTotals.totalCalories,
      totalProteinG: computedTotals.totalProteinG,
      totalCarbsG: computedTotals.totalCarbsG,
      totalFatG: computedTotals.totalFatG,
      streak: log?.streakDay ?? 0,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch today's meals" });
  }
});

// GET /api/meals/history
router.get("/meals/history", async (req, res) => {
  const { userId, page = "1", limit = "20", localDate } = req.query;
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  if (!isAuthorized(req, userId as string)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (localDate !== undefined) {
    if (typeof localDate !== "string" || !LOCAL_DATE_REGEX.test(localDate)) {
      return res.status(400).json({ error: "localDate must be YYYY-MM-DD" });
    }
    try {
      const meals = await db
        .select()
        .from(mealEntriesTable)
        .where(
          and(
            eq(mealEntriesTable.userId, userId as string),
            sql`(${mealEntriesTable.localDate} = ${localDate} OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt}::date = ${localDate}::date))`,
          ),
        )
        .orderBy(desc(mealEntriesTable.createdAt));
      return res.json(meals.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
    } catch {
      return res.status(500).json({ error: "Failed to fetch meals for date" });
    }
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  try {
    const meals = await db
      .select()
      .from(mealEntriesTable)
      .where(eq(mealEntriesTable.userId, userId as string))
      .orderBy(desc(mealEntriesTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    return res.json(meals.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
  } catch {
    return res.status(500).json({ error: "Failed to fetch meal history" });
  }
});

// DELETE /api/meals/:id
router.delete('/meals/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing meal id' });
  }
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: 'Invalid userId format' });
  }
  if (!isAuthorized(req, userId as string)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const [meal] = await db
      .select()
      .from(mealEntriesTable)
      .where(and(eq(mealEntriesTable.id, id), eq(mealEntriesTable.userId, userId as string)))
      .limit(1);

    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    await db.delete(mealEntriesTable).where(eq(mealEntriesTable.id, id));

    const dateKey = meal.localDate ?? meal.createdAt.toISOString().split('T')[0];
    const remainingMeals = await db
      .select()
      .from(mealEntriesTable)
      .where(
        and(
          eq(mealEntriesTable.userId, userId as string),
          sql`(${mealEntriesTable.localDate} = ${dateKey} OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt}::date = ${dateKey}::date))`,
        ),
      );

    const newTotals = remainingMeals.reduce(
      (acc, m) => ({
        totalCalories: acc.totalCalories + m.totalCalories,
        totalProteinG: acc.totalProteinG + m.totalProteinG,
        totalCarbsG: acc.totalCarbsG + m.totalCarbsG,
        totalFatG: acc.totalFatG + m.totalFatG,
      }),
      { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0 },
    );

    const [existingLog] = await db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId as string), eq(dailyLogsTable.date, dateKey)))
      .limit(1);

    if (existingLog) {
      await db
        .update(dailyLogsTable)
        .set({ ...newTotals, mealsLogged: remainingMeals.length })
        .where(eq(dailyLogsTable.id, existingLog.id));
    } else {
      await db.insert(dailyLogsTable).values({
        id: crypto.randomUUID(),
        userId: userId as string,
        date: dateKey,
        ...newTotals,
        streakDay: 0,
        mealsLogged: remainingMeals.length,
      });
    }

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete meal' });
  }
});

// PATCH /api/meals/:id
router.patch('/meals/:id', async (req, res) => {
  const { id } = req.params;

  const PatchMealSchema = z.object({
    userId: z.string().regex(USER_ID_REGEX, 'Invalid userId format'),
    // Ingredient correction fields (all optional for backward compat)
    userCorrections: z.array(z.object({
      name: z.string().min(1),
      portionGrams: z.number().nonnegative(),
      calories: z.number().nonnegative(),
      proteinG: z.number().nonnegative(),
      carbsG: z.number().nonnegative(),
      fatG: z.number().nonnegative(),
    })).optional(),
    totalCalories: z.number().int().nonnegative().optional(),
    totalProteinG: z.number().nonnegative().optional(),
    totalCarbsG: z.number().nonnegative().optional(),
    totalFatG: z.number().nonnegative().optional(),
    // Timestamp update fields
    localHour: z.number().int().min(0).max(23).optional(),
    localMinute: z.number().int().min(0).max(59).optional(),
    utcOffsetMinutes: z.number().int().min(-720).max(840).optional(),
    localDate: z.string().regex(LOCAL_DATE_REGEX, "localDate must be YYYY-MM-DD").optional(),
  });

  const parsed = PatchMealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  }

  const { userId, userCorrections, totalCalories, totalProteinG, totalCarbsG, totalFatG, localHour, localMinute, utcOffsetMinutes, localDate: localDatePatch } = parsed.data;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing meal id' });
  }
  if (!isAuthorized(req, userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const hasCorrections = userCorrections !== undefined && totalCalories !== undefined;
  const hasTimeUpdate = localHour !== undefined || localDatePatch !== undefined;
  if (!hasCorrections && !hasTimeUpdate) {
    return res.status(400).json({ error: 'No update fields provided' });
  }

  let existing: typeof mealEntriesTable.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(mealEntriesTable)
      .where(and(eq(mealEntriesTable.id, id), eq(mealEntriesTable.userId, userId)))
      .limit(1);
    existing = rows[0];
  } catch {
    return res.status(500).json({ error: 'Failed to update meal' });
  }

  if (!existing) {
    return res.status(404).json({ error: 'Meal not found' });
  }

  const oldCalories = existing.totalCalories;
  const oldProtein = existing.totalProteinG;
  const oldCarbs = existing.totalCarbsG;
  const oldFat = existing.totalFatG;
  const dateKey = existing.localDate ?? existing.createdAt.toISOString().split('T')[0];

  try {
    const updated = await db.transaction(async (tx) => {
      // Build update payload
      const fields: Partial<{
        userCorrections: unknown;
        totalCalories: number;
        totalProteinG: number;
        totalCarbsG: number;
        totalFatG: number;
        mealType: string;
        createdAt: Date;
        localDate: string;
      }> = {};

      if (hasCorrections) {
        fields.userCorrections = userCorrections ?? null;
        fields.totalCalories = totalCalories!;
        fields.totalProteinG = totalProteinG ?? existing!.totalProteinG;
        fields.totalCarbsG = totalCarbsG ?? existing!.totalCarbsG;
        fields.totalFatG = totalFatG ?? existing!.totalFatG;
      }

      if (hasTimeUpdate) {
        const effectiveHour = localHour ?? existing!.createdAt.getUTCHours();
        fields.mealType = inferMealType(effectiveHour);
        const minute = localHour !== undefined ? (localMinute ?? 0) : existing!.createdAt.getUTCMinutes();
        const offsetMin = utcOffsetMinutes ?? 0;
        // Use the provided localDate if any, else stored localDate, else fall back to createdAt UTC date
        const dateStr = localDatePatch
          ?? existing!.localDate
          ?? existing!.createdAt.toISOString().split('T')[0];
        const [yr, mo, dy] = dateStr.split('-').map(Number);
        // local epoch = midnight of date + local hour/minute
        const localEpochMs = Date.UTC(yr, mo - 1, dy, effectiveHour, minute, 0, 0);
        // subtract offset to get true UTC
        fields.createdAt = new Date(localEpochMs - offsetMin * 60_000);
        if (localDatePatch) fields.localDate = localDatePatch;
      }

      const [meal] = await tx
        .update(mealEntriesTable)
        .set(fields)
        .where(eq(mealEntriesTable.id, id))
        .returning();

      if (!meal) throw new Error('Update returned no rows');

      // Re-aggregate daily log(s) from scratch whenever macros or date changed.
      // This avoids arithmetic drift and correctly handles date moves.
      const newDateKey = localDatePatch ?? dateKey;
      const dateChanged = newDateKey !== dateKey;

      const aggregateMeals = (rows: (typeof mealEntriesTable.$inferSelect)[]) =>
        rows.reduce(
          (acc, m) => ({
            totalCalories: acc.totalCalories + m.totalCalories,
            totalProteinG: acc.totalProteinG + m.totalProteinG,
            totalCarbsG: acc.totalCarbsG + m.totalCarbsG,
            totalFatG: acc.totalFatG + m.totalFatG,
          }),
          { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0 },
        );

      const upsertLog = async (dKey: string, totals: ReturnType<typeof aggregateMeals>, count: number) => {
        const [log] = await tx
          .select()
          .from(dailyLogsTable)
          .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, dKey)))
          .limit(1);
        if (log) {
          await tx
            .update(dailyLogsTable)
            .set({ ...totals, mealsLogged: count })
            .where(eq(dailyLogsTable.id, log.id));
        } else if (totals.totalCalories > 0) {
          await tx.insert(dailyLogsTable).values({
            id: crypto.randomUUID(),
            userId,
            date: dKey,
            ...totals,
            streakDay: 0,
            mealsLogged: count,
          });
        }
      };

      if (hasCorrections || dateChanged) {
        // Re-aggregate the old date (meal has already been moved/updated, so query is correct)
        const oldDateMeals = await tx
          .select()
          .from(mealEntriesTable)
          .where(
            and(
              eq(mealEntriesTable.userId, userId),
              sql`(${mealEntriesTable.localDate} = ${dateKey} OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt}::date = ${dateKey}::date))`,
            ),
          );
        await upsertLog(dateKey, aggregateMeals(oldDateMeals), oldDateMeals.length);

        if (dateChanged) {
          // Re-aggregate the new date (includes the moved meal)
          const newDateMeals = await tx
            .select()
            .from(mealEntriesTable)
            .where(
              and(
                eq(mealEntriesTable.userId, userId),
                sql`(${mealEntriesTable.localDate} = ${newDateKey} OR (${mealEntriesTable.localDate} IS NULL AND ${mealEntriesTable.createdAt}::date = ${newDateKey}::date))`,
              ),
            );
          await upsertLog(newDateKey, aggregateMeals(newDateMeals), newDateMeals.length);
        }
      }

      return meal;
    });

    return res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: 'Failed to update meal' });
  }
});

// GET /api/daily-logs
router.get("/daily-logs", async (req, res) => {
  const { userId, days = "30", localDate } = req.query;
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  if (!isAuthorized(req, userId as string)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (localDate !== undefined && (typeof localDate !== "string" || !LOCAL_DATE_REGEX.test(localDate))) {
    return res.status(400).json({ error: "localDate must be YYYY-MM-DD" });
  }

  const daysNum = Math.min(90, Math.max(1, parseInt(days as string, 10) || 30));
  const toDate = (localDate as string | undefined) ?? serverUTCDate();
  const [ty, tm, td] = toDate.split("-").map(Number) as [number, number, number];
  const fromDate = new Date(Date.UTC(ty, tm - 1, td - daysNum + 1))
    .toISOString()
    .split("T")[0];

  try {
    const logs = await db
      .select()
      .from(dailyLogsTable)
      .where(
        and(
          eq(dailyLogsTable.userId, userId as string),
          sql`${dailyLogsTable.date} >= ${fromDate}`,
          sql`${dailyLogsTable.date} <= ${toDate}`,
        ),
      )
      .orderBy(dailyLogsTable.date);

    const bestStreakResult = await db
      .select({ maxStreak: sql<number>`max(${dailyLogsTable.streakDay})` })
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.userId, userId as string));

    const bestStreak = bestStreakResult[0]?.maxStreak ?? 0;

    return res.json({
      logs: logs.map((l) => ({ ...l, date: typeof l.date === "string" ? l.date : (l.date as Date).toISOString().split("T")[0] })),
      bestStreak,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch daily logs" });
  }
});

// GET /api/meals/:id
router.get('/meals/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing meal id' });
  }
  if (!validateUserId(userId)) {
    return res.status(400).json({ error: 'Invalid userId format' });
  }
  if (!isAuthorized(req, userId as string)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const [meal] = await db
      .select()
      .from(mealEntriesTable)
      .where(and(eq(mealEntriesTable.id, id), eq(mealEntriesTable.userId, userId as string)))
      .limit(1);

    if (!meal) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    return res.json({ ...meal, createdAt: meal.createdAt.toISOString() });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch meal' });
  }
});

export default router;
