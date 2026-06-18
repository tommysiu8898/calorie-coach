/**
 * local-meals.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AsyncStorage-based meal store for the native testing build.
 * Replaces the backend DB so the app works without a running server.
 *
 * Usage:
 *   import { saveLocalMeal, getLocalMeals, getLocalMealsLast7Days } from "@/lib/local-meals";
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const MEALS_KEY   = "@calorie_tracker/local_meals_v2";
const PROFILE_KEY = "@calorie_tracker/local_profile_v1";

export interface LocalMeal {
  id: string;
  userId: string;
  mealName: string;
  mealType: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  photoUrl?: string | null;
  localDate: string;   // YYYY-MM-DD
  createdAt: string;   // ISO string
  ingredients?: Array<{
    name: string;
    portionGrams: number;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }>;
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

// ─── Meals ────────────────────────────────────────────────────────────────────

async function loadAllMeals(): Promise<LocalMeal[]> {
  try {
    const raw = await AsyncStorage.getItem(MEALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalMeal[];
  } catch {
    return [];
  }
}

async function saveAllMeals(meals: LocalMeal[]): Promise<void> {
  // Keep a maximum of 500 meals to avoid unbounded storage growth
  const trimmed = meals.slice(-500);
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(trimmed));
}

/** Save a new meal entry. Returns the saved meal. */
export async function saveLocalMeal(meal: Omit<LocalMeal, "id" | "createdAt">): Promise<LocalMeal> {
  const all = await loadAllMeals();
  const saved: LocalMeal = {
    ...meal,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: new Date().toISOString(),
  };
  all.push(saved);
  await saveAllMeals(all);
  return saved;
}

/** Get all meals for a specific YYYY-MM-DD date. */
export async function getMealsForDate(userId: string, date: string): Promise<LocalMeal[]> {
  const all = await loadAllMeals();
  return all.filter((m) => m.userId === userId && m.localDate === date);
}

/** Get meals from the last N days (for coach analysis). */
export async function getLocalMealsLastNDays(userId: string, days: number): Promise<LocalMeal[]> {
  const all  = await loadAllMeals();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toLocaleDateString("sv"); // YYYY-MM-DD
  return all.filter((m) => m.userId === userId && m.localDate >= cutoffStr);
}

/** Delete a meal by id. */
export async function deleteLocalMeal(mealId: string): Promise<void> {
  const all = await loadAllMeals();
  await saveAllMeals(all.filter((m) => m.id !== mealId));
}

// ─── Profile ─────────────────────────────────────────────────────────────────

/** Save/update local profile (used by coach for context). */
export async function saveLocalProfile(profile: LocalProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/** Load local profile. Returns null if not yet saved. */
export async function loadLocalProfile(): Promise<LocalProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch {
    return null;
  }
}
