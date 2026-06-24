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
import { analyzeFood, generateFoodFromText } from "@/lib/kimi-direct";
import { coachAnalyze, coachAdvise } from "@/lib/kimi-direct";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const K = {
  meals:      "@lapi/meals_v1",
  profiles:   "@lapi/profiles_v1",
  weight:     "@lapi/weight_v1",
  exercise:   "@lapi/exercise_v1",
  userFoods:  "@lapi/user_foods_v1",
  savedFoods: "@lapi/saved_foods_v1",
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

interface ApiFood {
  id: string; name: string; nameEn: string;
  calories: number; proteinG: number; carbsG: number; fatG: number;
  servingGrams: number; servingLabel: string; source?: string; userId?: string;
}
interface SavedFoodRecord {
  id: string; userId: string; foodId: string; foodName: string;
  calories: number; proteinG: number; carbsG: number; fatG: number;
  servingLabel: string; servingGrams: number;
}

// ─── Built-in food library ────────────────────────────────────────────────────
const BUILTIN_FOODS: ApiFood[] = [
  { id: "bf_rice_white",    name: "White Rice",           nameEn: "White Rice",           calories: 130,  proteinG: 2.7,  carbsG: 28.2, fatG: 0.3,  servingGrams: 100,  servingLabel: "100g (cooked)" },
  { id: "bf_rice_brown",    name: "Brown Rice",           nameEn: "Brown Rice",           calories: 123,  proteinG: 2.6,  carbsG: 25.6, fatG: 0.9,  servingGrams: 100,  servingLabel: "100g (cooked)" },
  { id: "bf_bread_white",   name: "White Bread",          nameEn: "White Bread",          calories: 265,  proteinG: 9.0,  carbsG: 49.2, fatG: 3.2,  servingGrams: 30,   servingLabel: "1 slice (30g)" },
  { id: "bf_bread_whole",   name: "Whole Wheat Bread",    nameEn: "Whole Wheat Bread",    calories: 247,  proteinG: 13.0, carbsG: 41.3, fatG: 3.4,  servingGrams: 30,   servingLabel: "1 slice (30g)" },
  { id: "bf_egg",           name: "Egg (Boiled)",         nameEn: "Egg (Boiled)",         calories: 68,   proteinG: 5.5,  carbsG: 0.5,  fatG: 4.8,  servingGrams: 50,   servingLabel: "1 large egg" },
  { id: "bf_chicken_breast",name: "Chicken Breast",       nameEn: "Chicken Breast",       calories: 165,  proteinG: 31.0, carbsG: 0.0,  fatG: 3.6,  servingGrams: 100,  servingLabel: "100g (cooked)" },
  { id: "bf_salmon",        name: "Salmon",               nameEn: "Salmon",               calories: 208,  proteinG: 20.0, carbsG: 0.0,  fatG: 13.4, servingGrams: 100,  servingLabel: "100g" },
  { id: "bf_tuna_can",      name: "Canned Tuna",          nameEn: "Canned Tuna",          calories: 109,  proteinG: 25.5, carbsG: 0.0,  fatG: 0.5,  servingGrams: 100,  servingLabel: "100g (drained)" },
  { id: "bf_beef_lean",     name: "Lean Beef",            nameEn: "Lean Beef",            calories: 218,  proteinG: 26.1, carbsG: 0.0,  fatG: 11.8, servingGrams: 100,  servingLabel: "100g (cooked)" },
  { id: "bf_tofu",          name: "Firm Tofu",            nameEn: "Firm Tofu",            calories: 76,   proteinG: 8.1,  carbsG: 1.9,  fatG: 4.2,  servingGrams: 100,  servingLabel: "100g" },
  { id: "bf_milk_whole",    name: "Whole Milk",           nameEn: "Whole Milk",           calories: 149,  proteinG: 8.0,  carbsG: 11.7, fatG: 8.0,  servingGrams: 244,  servingLabel: "1 cup (244ml)" },
  { id: "bf_milk_skim",     name: "Skim Milk",            nameEn: "Skim Milk",            calories: 83,   proteinG: 8.3,  carbsG: 12.2, fatG: 0.2,  servingGrams: 244,  servingLabel: "1 cup (244ml)" },
  { id: "bf_greek_yogurt",  name: "Greek Yogurt (Plain)", nameEn: "Greek Yogurt (Plain)", calories: 100,  proteinG: 17.0, carbsG: 6.0,  fatG: 0.7,  servingGrams: 170,  servingLabel: "1 container (170g)" },
  { id: "bf_banana",        name: "Banana",               nameEn: "Banana",               calories: 89,   proteinG: 1.1,  carbsG: 23.0, fatG: 0.3,  servingGrams: 118,  servingLabel: "1 medium (118g)" },
  { id: "bf_apple",         name: "Apple",                nameEn: "Apple",                calories: 81,   proteinG: 0.4,  carbsG: 21.3, fatG: 0.5,  servingGrams: 182,  servingLabel: "1 medium (182g)" },
  { id: "bf_orange",        name: "Orange",               nameEn: "Orange",               calories: 62,   proteinG: 1.2,  carbsG: 15.4, fatG: 0.2,  servingGrams: 131,  servingLabel: "1 medium (131g)" },
  { id: "bf_avocado",       name: "Avocado",              nameEn: "Avocado",              calories: 240,  proteinG: 3.0,  carbsG: 12.8, fatG: 22.0, servingGrams: 150,  servingLabel: "1 medium (150g)" },
  { id: "bf_broccoli",      name: "Broccoli",             nameEn: "Broccoli",             calories: 34,   proteinG: 2.8,  carbsG: 6.6,  fatG: 0.4,  servingGrams: 100,  servingLabel: "100g" },
  { id: "bf_spinach",       name: "Spinach",              nameEn: "Spinach",              calories: 23,   proteinG: 2.9,  carbsG: 3.6,  fatG: 0.4,  servingGrams: 100,  servingLabel: "100g" },
  { id: "bf_sweet_potato",  name: "Sweet Potato",         nameEn: "Sweet Potato",         calories: 86,   proteinG: 1.6,  carbsG: 20.1, fatG: 0.1,  servingGrams: 100,  servingLabel: "100g (baked)" },
  { id: "bf_oats",          name: "Oatmeal",              nameEn: "Oatmeal",              calories: 150,  proteinG: 5.3,  carbsG: 27.4, fatG: 2.5,  servingGrams: 234,  servingLabel: "1 cup cooked (234g)" },
  { id: "bf_pasta",         name: "Pasta (Cooked)",       nameEn: "Pasta (Cooked)",       calories: 131,  proteinG: 5.0,  carbsG: 25.1, fatG: 1.1,  servingGrams: 100,  servingLabel: "100g" },
  { id: "bf_almonds",       name: "Almonds",              nameEn: "Almonds",              calories: 164,  proteinG: 6.0,  carbsG: 6.1,  fatG: 14.2, servingGrams: 28,   servingLabel: "1 oz (28g, ~23 nuts)" },
  { id: "bf_peanut_butter", name: "Peanut Butter",        nameEn: "Peanut Butter",        calories: 190,  proteinG: 7.0,  carbsG: 7.0,  fatG: 16.0, servingGrams: 32,   servingLabel: "2 tbsp (32g)" },
  { id: "bf_olive_oil",     name: "Olive Oil",            nameEn: "Olive Oil",            calories: 119,  proteinG: 0.0,  carbsG: 0.0,  fatG: 13.5, servingGrams: 14,   servingLabel: "1 tbsp (14g)" },
  { id: "bf_coffee_black",  name: "Black Coffee",         nameEn: "Black Coffee",         calories: 2,    proteinG: 0.3,  carbsG: 0.0,  fatG: 0.0,  servingGrams: 240,  servingLabel: "1 cup (240ml)" },
  { id: "bf_orange_juice",  name: "Orange Juice",         nameEn: "Orange Juice",         calories: 112,  proteinG: 1.7,  carbsG: 25.8, fatG: 0.5,  servingGrams: 248,  servingLabel: "1 cup (248ml)" },
  { id: "bf_pizza_cheese",  name: "Cheese Pizza",         nameEn: "Cheese Pizza",         calories: 266,  proteinG: 11.4, carbsG: 33.6, fatG: 9.8,  servingGrams: 107,  servingLabel: "1 slice (107g)" },
  { id: "bf_burger",        name: "Hamburger",            nameEn: "Hamburger",            calories: 295,  proteinG: 17.0, carbsG: 24.0, fatG: 14.0, servingGrams: 130,  servingLabel: "1 burger (130g)" },
  { id: "bf_fries",         name: "French Fries",         nameEn: "French Fries",         calories: 312,  proteinG: 3.6,  carbsG: 41.1, fatG: 15.0, servingGrams: 117,  servingLabel: "medium serving (117g)" },
  { id: "bf_rice_noodle",   name: "Rice Noodles",         nameEn: "Rice Noodles",         calories: 109,  proteinG: 1.8,  carbsG: 24.7, fatG: 0.2,  servingGrams: 100,  servingLabel: "100g (cooked)" },
  { id: "bf_dumpling",      name: "Steamed Dumplings",    nameEn: "Steamed Dumplings",    calories: 222,  proteinG: 10.0, carbsG: 28.0, fatG: 7.0,  servingGrams: 120,  servingLabel: "6 pieces (~120g)" },
];

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

// ─── Daily target calculation (mirrors onboarding.tsx) ────────────────────────
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};

function computeDailyTargets(p: Profile): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  const birthYear = parseInt(String(p.birthday ?? "").slice(0, 4), 10) || 1990;
  const age = Math.max(1, new Date().getFullYear() - birthYear);
  const h = Number(p.heightCm) || 170;
  const w = Number(p.weightKg) || 70;
  const bmr = p.gender === "male"
    ? 10 * w + 6.25 * h - 5 * age + 5
    : 10 * w + 6.25 * h - 5 * age - 161;
  const tdee = bmr * (ACTIVITY_MULTIPLIERS[p.activityLevel] ?? 1.55);
  let calories = tdee;
  if (p.goal === "lose") calories = tdee - 500;
  else if (p.goal === "gain") calories = tdee + 300;
  calories = Math.round(Math.max(1200, calories));
  const proteinG = Math.round(w * 1.8);
  const fatG = Math.round((calories * 0.28) / 9);
  const carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  return { calories, proteinG: Math.max(0, proteinG), carbsG: Math.max(0, carbsG), fatG: Math.max(0, fatG) };
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

  // ── POST/PUT /api/profile ─────────────────────────────────────────────────
  // Handles BOTH onboarding (PUT) and profile edits (POST). Auto-calculates
  // daily calorie/macro targets from the profile (same formula as onboarding).
  if (seg === "profile" && (method === "POST" || method === "PUT")) {
    const p = { ...body } as Profile;
    if (!p.userId) return jsonResponse({ error: "userId required" }, 400);

    // Compute daily targets if not already supplied
    const targets = computeDailyTargets(p);
    p.dailyCalorieTarget = p.dailyCalorieTarget || targets.calories;
    p.dailyProteinTarget = p.dailyProteinTarget || targets.proteinG;
    p.dailyCarbsTarget   = p.dailyCarbsTarget   || targets.carbsG;
    p.dailyFatTarget     = p.dailyFatTarget     || targets.fatG;

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

  // ── GET /api/foods ───────────────────────────────────────────────────────────
  // source=user → user-created foods only; otherwise built-in + user foods
  if (seg === "foods" && method === "GET") {
    const q      = params.get("q")?.toLowerCase().trim() ?? "";
    const source = params.get("source");
    const userId = params.get("userId") ?? "";
    const limit  = parseInt(params.get("limit") ?? "50", 10);

    const userFoods = await load<ApiFood[]>(K.userFoods, []);

    let results: ApiFood[];
    if (source === "user") {
      results = userFoods.filter(f => f.userId === userId);
    } else {
      const allFoods = [...BUILTIN_FOODS, ...userFoods];
      results = allFoods;
    }

    if (q) {
      results = results.filter(f =>
        f.name.toLowerCase().includes(q) || f.nameEn.toLowerCase().includes(q)
      );
    }

    results = results.slice(0, limit);
    return jsonResponse({ foods: results, total: results.length });
  }

  // ── POST /api/foods/user ─────────────────────────────────────────────────────
  if (seg === "foods/user" && method === "POST") {
    const food: ApiFood = {
      id:           `uf_${uid()}`,
      userId:       (body.userId as string) ?? "anon",
      name:         (body.name as string) ?? "Custom Food",
      nameEn:       (body.name as string) ?? "Custom Food",
      calories:     Number(body.calories) || 0,
      proteinG:     Number(body.proteinG) || 0,
      carbsG:       Number(body.carbsG)   || 0,
      fatG:         Number(body.fatG)     || 0,
      servingGrams: Number(body.servingGrams) || 100,
      servingLabel: (body.servingLabel as string) ?? "100g",
      source:       "user",
    };
    const all = await load<ApiFood[]>(K.userFoods, []);
    await save(K.userFoods, [...all, food]);
    return jsonResponse(food);
  }

  // ── GET /api/saved-foods ─────────────────────────────────────────────────────
  if (seg === "saved-foods" && method === "GET") {
    const userId = params.get("userId") ?? "";
    const all = await load<SavedFoodRecord[]>(K.savedFoods, []);
    const foods = all.filter(f => f.userId === userId);
    return jsonResponse({ foods });
  }

  // ── POST /api/saved-foods ────────────────────────────────────────────────────
  if (seg === "saved-foods" && method === "POST") {
    const record: SavedFoodRecord = {
      id:           uid(),
      userId:       (body.userId as string) ?? "anon",
      foodId:       (body.foodId as string) ?? "",
      foodName:     (body.foodName as string) ?? "",
      calories:     Number(body.calories)     || 0,
      proteinG:     Number(body.proteinG)     || 0,
      carbsG:       Number(body.carbsG)       || 0,
      fatG:         Number(body.fatG)         || 0,
      servingLabel: (body.servingLabel as string) ?? "100g",
      servingGrams: Number(body.servingGrams) || 100,
    };
    const all = await load<SavedFoodRecord[]>(K.savedFoods, []);
    const deduped = all.filter(f => !(f.userId === record.userId && f.foodId === record.foodId));
    await save(K.savedFoods, [...deduped, record]);
    return jsonResponse(record);
  }

  // ── DELETE /api/saved-foods/:foodId ─────────────────────────────────────────
  if (seg.startsWith("saved-foods/") && method === "DELETE") {
    const foodId = decodeURIComponent(seg.replace("saved-foods/", ""));
    const userId = (body.userId as string) ?? "";
    const all = await load<SavedFoodRecord[]>(K.savedFoods, []);
    await save(K.savedFoods, all.filter(f => !(f.foodId === foodId && f.userId === userId)));
    return jsonResponse({ success: true });
  }

  // ── POST /api/foods/ai-generate ──────────────────────────────────────────────
  if (seg === "foods/ai-generate" && method === "POST") {
    try {
      const description = (body.description as string) ?? "";
      const locale      = (body.locale as string) ?? "en";
      const result = await generateFoodFromText(description, locale);
      return jsonResponse({ id: `ai_${uid()}`, nameEn: result.name, ...result });
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
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
// Use globalThis so this works in BOTH React Native (global) and web browsers (window).
const _g: any = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {});
const _originalFetch = _g.fetch ? _g.fetch.bind(_g) : fetch;

_g.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {

  const url = typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : (input as Request).url;

  // Intercept ANY call to our backend API — but NEVER the real Kimi/Moonshot API
  // and NEVER calls to the real deployed backend (EXPO_PUBLIC_DOMAIN).
  const isKimi = url.includes("moonshot.cn") || url.includes("api.moonshot");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const isRealBackend = domain && domain !== "undefined" && url.includes(domain);
  if (!isKimi && !isRealBackend && url.includes("/api/")) {
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
