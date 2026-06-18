/**
 * local-api-interceptor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Monkey-patches the global fetch() to intercept ALL /api/* calls to
 * EXPO_PUBLIC_DOMAIN and serve them from local AsyncStorage.
 *
 * This makes the entire app work offline with NO backend required.
 * Import this ONCE at the top of app/_layout.tsx:
 *
 *   import "@/lib/local-api-interceptor";
 *
 * IMPORTANT: Import BEFORE any other imports in _layout.tsx.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { analyzeFood }  from "@/lib/kimi-direct";
import { coachAnalyze, coachAdvise } from "@/lib/kimi-direct";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const K = {
  meals:    "@lapi/meals_v1",
  profiles: "@lapi/profiles_v1",
  weight:   "@lapi/weight_v1",
  exercise: "@lapi/exercise_v1",
};

// ─── Tiny AsyncStorage helpers ────────────────────────────────────────────────
async function load<T>(key: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; }
  catch { return fallback; }
}
async function save(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* */ }
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Meal {
  id: string; userId: string; mealName: string; mealType: string;
  totalCalories: number; totalProteinG: number; totalCarbsG: number; totalFatG: number;
  photoUrl?: string | null; localDate: string; createdAt: string;
  ingredients?: unknown[];
}

interface Profile {
  userId: string; name?: string; gender: string; birthday: string;
  heightCm: number; weightKg: number; targetWeightKg: number;
  goal: string; activityLevel: string;
  dailyCalorieTarget: number; dailyProteinTarget: number;
  dailyCarbsTarget: number; dailyFatTarget: number;
  healthFlags?: Record<string, unknown>;
}

interface WeightLog { id: string; userId: string; date: string; weightKg: number; }
interface ExerciseLog { id: string; userId: string; date: string; name: string; calories: number; durationMinutes?: number; }

// ─── Meal helpers ─────────────────────────────────────────────────────────────
async function getMeals(): Promise<Meal[]> { return load<Meal[]>(K.meals, []); }
async function setMeals(m: Meal[]): Promise<void> { await save(K.meals, m.slice(-500)); }

async function getMealsForDate(userId: string, date: string): Promise<Meal[]> {
  return (await getMeals()).filter(m => m.userId === userId && m.localDate === date);
}
async function getMealsLastNDays(userId: string, n: number): Promise<Meal[]> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - n);
  const cutoffStr = cutoff.toLocaleDateString("sv");
  return (await getMeals()).filter(m => m.userId === userId && m.localDate >= cutoffStr);
}

// ─── Profile helpers ──────────────────────────────────────────────────────────
async function getProfiles(): Promise<Profile[]> { return load<Profile[]>(K.profiles, []); }
async function getProfile(userId: string): Promise<Profile | null> {
  return (await getProfiles()).find(p => p.userId === userId) ?? null;
}
async function upsertProfile(p: Profile): Promise<void> {
  const all = (await getProfiles()).filter(x => x.userId !== p.userId);
  await save(K.profiles, [...all, p]);
}

// ─── Weight helpers ───────────────────────────────────────────────────────────
async function getWeightLogs(userId: string, days = 365): Promise<WeightLog[]> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toLocaleDateString("sv");
  const all = await load<WeightLog[]>(K.weight, []);
  return all.filter(w => w.userId === userId && w.date >= cutoffStr)
            .sort((a, b) => a.date.localeCompare(b.date));
}
async function upsertWeight(log: WeightLog): Promise<void> {
  const all = await load<WeightLog[]>(K.weight, []);
  const filtered = all.filter(w => !(w.userId === log.userId && w.date === log.date));
  await save(K.weight, [...filtered, log].slice(-1000));
}

// ─── Exercise helpers ─────────────────────────────────────────────────────────
async function getExerciseLogs(userId: string, date: string): Promise<ExerciseLog[]> {
  const all = await load<ExerciseLog[]>(K.exercise, []);
  return all.filter(e => e.userId === userId && e.date === date);
}
async function getBurnedHistory(userId: string, days: number): Promise<Array<{ date: string; calories: number }>> {
  const all = await load<ExerciseLog[]>(K.exercise, []);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toLocaleDateString("sv");
  const byDate: Record<string, number> = {};
  for (const e of all) {
    if (e.userId === userId && e.date >= cutoffStr) {
      byDate[e.date] = (byDate[e.date] ?? 0) + e.calories;
    }
  }
  return Object.entries(byDate).map(([date, calories]) => ({ date, calories }));
}
async function addExercise(log: ExerciseLog): Promise<void> {
  const all = await load<ExerciseLog[]>(K.exercise, []);
  await save(K.exercise, [...all, log].slice(-2000));
}

// ─── Mock response builder ────────────────────────────────────────────────────
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────
async function handleApiCall(path: string, method: string, body: Record<string, unknown>): Promise<Response> {
  const seg = path.split("?")[0].replace(/^\/api\//, "");
  const params = new URLSearchParams(path.includes("?") ? path.split("?")[1] : "");

  // ── GET /api/profile ────────────────────────────────────────────────────────
  if (seg === "profile" && method === "GET") {
    const userId = params.get("userId") ?? "";
    const p = await getProfile(userId);
    if (!p) return new Response("Not found", { status: 404 });
    return jsonResponse(p);
  }

  // ── POST /api/profile ───────────────────────────────────────────────────────
  if (seg === "profile" && method === "POST") {
    const p = { ...body } as Profile;
    if (!p.userId) return jsonResponse({ error: "userId required" }, 400);
    await upsertProfile(p);
    return jsonResponse(p);
  }

  // ── GET /api/meals/today ────────────────────────────────────────────────────
  if (seg === "meals/today" && method === "GET") {
    const userId = params.get("userId") ?? "";
    const date   = params.get("localDate") ?? new Date().toLocaleDateString("sv");
    const meals  = await getMealsForDate(userId, date);
    const total = meals.reduce((acc, m) => ({
      calories: acc.calories + m.totalCalories,
      protein:  acc.protein  + m.totalProteinG,
      carbs:    acc.carbs    + m.totalCarbsG,
      fat:      acc.fat      + m.totalFatG,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const profile = await getProfile(userId);
    return jsonResponse({
      meals,
      totalCalories:  total.calories,
      totalProteinG:  total.protein,
      totalCarbsG:    total.carbs,
      totalFatG:      total.fat,
      streak:         1,
      calorieTarget:  profile?.dailyCalorieTarget ?? 2000,
      proteinTarget:  profile?.dailyProteinTarget ?? 150,
      carbsTarget:    profile?.dailyCarbsTarget   ?? 200,
      fatTarget:      profile?.dailyFatTarget     ?? 65,
    });
  }

  // ── POST /api/meals ─────────────────────────────────────────────────────────
  if (seg === "meals" && method === "POST") {
    const meal: Meal = {
      id: uid(),
      userId:         (body.userId as string) ?? "anon",
      mealName:       (body.mealName as string) ?? "Meal",
      mealType:       "lunch",
      totalCalories:  Number(body.totalCalories) || 0,
      totalProteinG:  Number(body.totalProteinG) || 0,
      totalCarbsG:    Number(body.totalCarbsG)   || 0,
      totalFatG:      Number(body.totalFatG)      || 0,
      photoUrl:       (body.photoUrl as string | null) ?? null,
      localDate:      (body.localDate as string)  ?? new Date().toLocaleDateString("sv"),
      createdAt:      new Date().toISOString(),
      ingredients:    (body.aiResponse as { ingredients?: unknown[] })?.ingredients,
    };
    const all = await getMeals();
    await setMeals([...all, meal]);
    return jsonResponse(meal);
  }

  // ── DELETE /api/meals/:id ──────────────────────────────────────────────────
  if (seg.startsWith("meals/") && method === "DELETE") {
    const mealId = seg.replace("meals/", "").split("?")[0];
    const all = await getMeals();
    await setMeals(all.filter(m => m.id !== mealId));
    return jsonResponse({ success: true });
  }

  // ── GET /api/meals/history ──────────────────────────────────────────────────
  if (seg.startsWith("meals/history") && method === "GET") {
    const userId = params.get("userId") ?? "";
    const date   = params.get("localDate");
    let meals: Meal[];
    if (date) {
      meals = await getMealsForDate(userId, date);
    } else {
      meals = await getMealsLastNDays(userId, 30);
    }
    return jsonResponse({ meals, total: meals.length, page: 1, totalPages: 1 });
  }

  // ── GET /api/weight ─────────────────────────────────────────────────────────
  if (seg === "weight" && method === "GET") {
    const userId = params.get("userId") ?? "";
    const days   = parseInt(params.get("days") ?? "365", 10);
    const logs   = await getWeightLogs(userId, days);
    return jsonResponse(logs);
  }

  // ── POST /api/weight ────────────────────────────────────────────────────────
  if (seg === "weight" && method === "POST") {
    const log: WeightLog = {
      id:       uid(),
      userId:   (body.userId as string) ?? "anon",
      date:     (body.date as string)   ?? new Date().toLocaleDateString("sv"),
      weightKg: Number(body.weightKg)   || 0,
    };
    await upsertWeight(log);
    return jsonResponse(log);
  }

  // ── GET /api/exercise-logs ──────────────────────────────────────────────────
  if (seg === "exercise-logs" && method === "GET") {
    const userId = params.get("user_id") ?? "";
    const date   = params.get("date")    ?? new Date().toLocaleDateString("sv");
    const logs   = await getExerciseLogs(userId, date);
    return jsonResponse(logs);
  }

  // ── POST /api/calories-burned ───────────────────────────────────────────────
  if (seg === "calories-burned" && method === "POST") {
    const log: ExerciseLog = {
      id:              uid(),
      userId:          (body.user_id as string)   ?? "anon",
      date:            (body.date as string)       ?? new Date().toLocaleDateString("sv"),
      name:            (body.exercise_name as string) ?? "Exercise",
      calories:        Number(body.calories_burned) || 0,
      durationMinutes: Number(body.duration_minutes) || 0,
    };
    await addExercise(log);
    return jsonResponse({ success: true, id: log.id });
  }

  // ── GET /api/calories-burned ────────────────────────────────────────────────
  if (seg === "calories-burned" && method === "GET") {
    const userId = params.get("user_id") ?? "";
    const days   = parseInt(params.get("days") ?? "90", 10);
    const history = await getBurnedHistory(userId, days);
    return jsonResponse(history);
  }

  // ── POST /api/analyze-food ──────────────────────────────────────────────────
  if (seg === "analyze-food" && method === "POST") {
    try {
      const result = await analyzeFood(
        body.imageBase64 as string,
        body.languageCode as string | undefined,
      );
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  // ── POST /api/agent/analyze ─────────────────────────────────────────────────
  if (seg === "agent/analyze" && method === "POST") {
    try {
      const userId   = (body.user_id as string) ?? "anon";
      const meals    = await getMealsLastNDays(userId, 7);
      const profile  = await getProfile(userId);
      const localProfile = profile ? {
        dailyCalorieTarget: profile.dailyCalorieTarget,
        dailyProteinTarget: profile.dailyProteinTarget,
        dailyCarbsTarget:   profile.dailyCarbsTarget,
        dailyFatTarget:     profile.dailyFatTarget,
        goal:               profile.goal,
        weightKg:           profile.weightKg,
        targetWeightKg:     profile.targetWeightKg,
        heightCm:           profile.heightCm,
        gender:             profile.gender,
        activityLevel:      profile.activityLevel,
      } : null;
      const result = await coachAnalyze({
        meals: meals.map(m => ({
          id: m.id, mealName: m.mealName,
          totalCalories: m.totalCalories, totalProteinG: m.totalProteinG,
          totalCarbsG: m.totalCarbsG, totalFatG: m.totalFatG, localDate: m.localDate,
        })),
        profile: localProfile,
        languageCode:   body.appLanguage as string | undefined,
        steps:          body.steps as number | undefined,
        activeCalories: body.activeCalories as number | undefined,
      });
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  // ── POST /api/agent/advise ──────────────────────────────────────────────────
  if (seg === "agent/advise" && method === "POST") {
    try {
      const userId   = (body.user_id as string) ?? "anon";
      const meals    = await getMealsLastNDays(userId, 3);
      const profile  = await getProfile(userId);
      const localProfile = profile ? {
        dailyCalorieTarget: profile.dailyCalorieTarget,
        dailyProteinTarget: profile.dailyProteinTarget,
        dailyCarbsTarget:   profile.dailyCarbsTarget,
        dailyFatTarget:     profile.dailyFatTarget,
        goal:               profile.goal,
        weightKg:           profile.weightKg,
        targetWeightKg:     profile.targetWeightKg,
        heightCm:           profile.heightCm,
        gender:             profile.gender,
        activityLevel:      profile.activityLevel,
      } : null;
      const response = await coachAdvise({
        query: (body.user_query as string) ?? "",
        meals: meals.map(m => ({
          id: m.id, mealName: m.mealName,
          totalCalories: m.totalCalories, totalProteinG: m.totalProteinG,
          totalCarbsG: m.totalCarbsG, totalFatG: m.totalFatG, localDate: m.localDate,
        })),
        profile:        localProfile,
        languageCode:   body.appLanguage as string | undefined,
        steps:          body.steps as number | undefined,
        activeCalories: body.activeCalories as number | undefined,
      });
      return jsonResponse({ response });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }

  // ── GET /api/user-stats ─────────────────────────────────────────────────────
  if (seg === "user-stats" && method === "GET") {
    const userId = params.get("userId") ?? "";
    const meals  = await getMealsLastNDays(userId, 30);
    return jsonResponse({ totalMealsLogged: meals.length, currentStreak: 1, longestStreak: 1 });
  }

  // ── POST /api/profile (onboarding) ─────────────────────────────────────────
  if (seg.startsWith("profile") && method === "POST") {
    await upsertProfile(body as unknown as Profile);
    return jsonResponse(body);
  }

  // ── GET /api/health ─────────────────────────────────────────────────────────
  if (seg === "health" && method === "GET") {
    return jsonResponse({ status: "ok" });
  }

  // ── Fallback: unsupported route ─────────────────────────────────────────────
  console.warn(`[LocalAPI] Unhandled route: ${method} /api/${seg}`);
  return jsonResponse({ error: `Local mock: /api/${seg} not implemented` }, 501);
}

// ─── Patch global fetch ───────────────────────────────────────────────────────
const _originalFetch = global.fetch;
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

global.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {

  const url = typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : (input as Request).url;

  // Only intercept calls to our backend domain
  if (DOMAIN && url.includes(DOMAIN) && url.includes("/api/")) {
    const path    = url.replace(/^https?:\/\/[^/]+/, "");
    const method  = (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? (input as Request).method : undefined) ?? "GET").toUpperCase();
    let body: Record<string, unknown> = {};
    try {
      if (init?.body && typeof init.body === "string") body = JSON.parse(init.body);
    } catch { /* */ }

    try {
      return await handleApiCall(path, method, body);
    } catch (err) {
      console.error("[LocalAPI] Error handling", method, path, err);
      return jsonResponse({ error: "Local API error" }, 500);
    }
  }

  // All other calls pass through normally
  return _originalFetch(input, init);
} as typeof fetch;

export {};
