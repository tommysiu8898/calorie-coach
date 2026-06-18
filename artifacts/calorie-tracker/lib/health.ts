import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HEALTH_CONNECTED_KEY = "@calorie_tracker/healthConnected";

export interface HealthActivity {
  steps: number;
  activeCalories: number;
  basalCalories: number;
  workouts: Workout[];
  isAvailable: boolean;
  isAuthorized: boolean;
}

export interface Workout {
  id: string;
  name: string;
  durationMinutes: number;
  calories: number;
  startDate: string;
}

export interface SleepSample {
  startDate: string;
  endDate: string;
  value: string;
}

export function isHealthKitAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  // Also require the native module — on Expo Go / web-based iOS simulators
  // the module is absent, so the integration cannot function.
  return getNativeHealth() !== null;
}

/**
 * Returns true when running on iOS but the native HealthKit module is absent —
 * i.e. the app is running inside Expo Go rather than an EAS / production build.
 * Use this to show a "requires device build" notice instead of the broken connect flow.
 */
export function isHealthKitOnIOSWithoutModule(): boolean {
  return Platform.OS === "ios" && getNativeHealth() === null;
}

function getNativeHealth(): unknown {
  try {
    // react-native-health is only available in native (EAS) builds.
    // Dynamic require() avoids TypeScript failing on missing module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = (require as (id: string) => { default?: unknown } & Record<string, unknown>)("react-native-health");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Attempt a step-count read to verify actual HealthKit read access.
 * HealthKit's initHealthKit can resolve without error even when the user denies
 * all permissions, so we probe with a real read to confirm authorization.
 */
async function probeStepAccess(native: unknown): Promise<boolean> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return await new Promise<boolean>((resolve) => {
      (native as {
        getStepCount: (opts: unknown, cb: (err: unknown, res: unknown) => void) => void;
      }).getStepCount(
        { startDate: start.toISOString() },
        (err: unknown) => resolve(err == null),
      );
    });
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;

  const native = getNativeHealth();
  if (!native) {
    // Native module unavailable (Expo Go / web build) — cannot grant real permissions.
    return false;
  }

  try {
    const permissions = {
      permissions: {
        // Identifiers match react-native-health Permissions constants
        read: [
          "StepCount",
          "ActiveEnergyBurned",
          "BasalEnergyBurned",
          "Workout",
          "HeartRate",
          "SleepAnalysis",
        ],
        write: [] as string[],
      },
    };
    await new Promise<void>((resolve, reject) => {
      (native as { initHealthKit: (perms: unknown, cb: (err: unknown) => void) => void }).initHealthKit(
        permissions,
        (err: unknown) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    // initHealthKit resolves even when the user denies permissions (HealthKit privacy design).
    // Probe an actual data read to confirm real read access was granted.
    const hasAccess = await probeStepAccess(native);
    if (hasAccess) {
      await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, "true");
      return true;
    } else {
      await AsyncStorage.removeItem(HEALTH_CONNECTED_KEY);
      return false;
    }
  } catch {
    await AsyncStorage.removeItem(HEALTH_CONNECTED_KEY);
    return false;
  }
}

/**
 * Fast check: reads the persisted connected flag from AsyncStorage.
 * Use refreshHealthConnection() on screen focus to revalidate against
 * actual HealthKit authorization (e.g., after user revokes in Settings).
 */
export async function isHealthConnected(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  const native = getNativeHealth();
  if (!native) return false;
  const val = await AsyncStorage.getItem(HEALTH_CONNECTED_KEY);
  return val === "true";
}

/**
 * Validates live HealthKit read access and updates the persisted flag.
 * Always probes HealthKit directly so the UI reflects reality even when
 * the user has authorised via the Health app without going through the
 * in-app Connect flow (which would set the AsyncStorage flag).
 * Call this on screen focus and after returning from the permission flow.
 */
export async function refreshHealthConnection(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  const native = getNativeHealth();
  if (!native) return false;

  const hasAccess = await probeStepAccess(native);
  if (hasAccess) {
    await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, "true");
    return true;
  } else {
    await AsyncStorage.removeItem(HEALTH_CONNECTED_KEY);
    return false;
  }
}

export async function disconnectHealth(): Promise<void> {
  await AsyncStorage.removeItem(HEALTH_CONNECTED_KEY);
}

export async function getTodaySteps(): Promise<number> {
  const native = getNativeHealth();
  if (!native) return 0;

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return await new Promise<number>((resolve) => {
      (native as {
        getStepCount: (opts: unknown, cb: (err: unknown, res: { value: number }) => void) => void;
      }).getStepCount(
        { startDate: start.toISOString() },
        (err: unknown, res: { value: number }) => {
          if (err) resolve(0);
          else resolve(Math.round(res?.value ?? 0));
        },
      );
    });
  } catch {
    return 0;
  }
}

export async function getTodayActiveCalories(): Promise<number> {
  const native = getNativeHealth();
  if (!native) return 0;

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    return await new Promise<number>((resolve) => {
      (native as {
        getActiveEnergyBurned: (opts: unknown, cb: (err: unknown, res: { value: number }[]) => void) => void;
      }).getActiveEnergyBurned(
        { startDate: start.toISOString(), endDate: end.toISOString() },
        (err: unknown, res: { value: number }[]) => {
          if (err || !Array.isArray(res)) resolve(0);
          else {
            const total = res.reduce((s, r) => s + (r.value ?? 0), 0);
            resolve(Math.round(total));
          }
        },
      );
    });
  } catch {
    return 0;
  }
}

export async function getTodayWorkouts(): Promise<Workout[]> {
  const native = getNativeHealth();
  if (!native) return [];

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    return await new Promise<Workout[]>((resolve) => {
      (native as {
        getSamples: (opts: unknown, cb: (err: unknown, res: Array<{ id: string; activityName: string; duration: number; totalEnergyBurned: number; startDate: string }>) => void) => void;
      }).getSamples(
        {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          type: "Workout",
        },
        (err: unknown, res: Array<{ id: string; activityName: string; duration: number; totalEnergyBurned: number; startDate: string }>) => {
          if (err || !Array.isArray(res)) resolve([]);
          else {
            resolve(
              res.map((w) => ({
                id: w.id ?? String(Math.random()),
                name: w.activityName ?? "Workout",
                durationMinutes: Math.round((w.duration ?? 0) / 60),
                calories: Math.round(w.totalEnergyBurned ?? 0),
                startDate: w.startDate ?? new Date().toISOString(),
              })),
            );
          }
        },
      );
    });
  } catch {
    return [];
  }
}

export async function getTodayBasalCalories(): Promise<number> {
  const native = getNativeHealth();
  if (!native) return 0;

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    return await new Promise<number>((resolve) => {
      (native as {
        getBasalEnergyBurned: (opts: unknown, cb: (err: unknown, res: { value: number }[]) => void) => void;
      }).getBasalEnergyBurned(
        { startDate: start.toISOString(), endDate: end.toISOString() },
        (err: unknown, res: { value: number }[]) => {
          if (err || !Array.isArray(res)) resolve(0);
          else {
            const total = res.reduce((s, r) => s + (r.value ?? 0), 0);
            resolve(Math.round(total));
          }
        },
      );
    });
  } catch {
    return 0;
  }
}

export async function getWeeklyActiveCalories(): Promise<Array<{ date: string; value: number }>> {
  const native = getNativeHealth();
  if (!native) return [];

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const samples = await new Promise<Array<{ startDate: string; value: number }>>((resolve) => {
      (native as {
        getActiveEnergyBurned: (opts: unknown, cb: (err: unknown, res: Array<{ startDate: string; value: number }>) => void) => void;
      }).getActiveEnergyBurned(
        { startDate: start.toISOString(), endDate: end.toISOString() },
        (err: unknown, res: Array<{ startDate: string; value: number }>) => {
          if (err || !Array.isArray(res)) resolve([]);
          else resolve(res);
        },
      );
    });

    // Group by date (YYYY-MM-DD)
    const byDate: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toLocaleDateString("sv"); // YYYY-MM-DD
      byDate[key] = 0;
    }
    for (const s of samples) {
      const key = new Date(s.startDate).toLocaleDateString("sv");
      if (key in byDate) byDate[key] += s.value ?? 0;
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value: Math.round(value) }));
  } catch {
    return [];
  }
}

export async function getTodaySleepHours(): Promise<number> {
  const samples = await getRecentSleep();
  if (!samples.length) return 0;
  const totalMs = samples.reduce((sum, s) => {
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    return sum + Math.max(0, end - start);
  }, 0);
  const hours = totalMs / (1000 * 60 * 60);
  return Math.round(hours * 10) / 10;
}

export async function getTodayHeartRate(): Promise<number> {
  const native = getNativeHealth();
  if (!native) return 0;

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();

    const samples = await new Promise<Array<{ value: number }>>((resolve) => {
      (native as {
        getHeartRateSamples: (opts: unknown, cb: (err: unknown, res: Array<{ value: number }>) => void) => void;
      }).getHeartRateSamples(
        { startDate: start.toISOString(), endDate: end.toISOString(), limit: 50 },
        (err: unknown, res: Array<{ value: number }>) => {
          if (err || !Array.isArray(res) || !res.length) resolve([]);
          else resolve(res);
        },
      );
    });

    if (!samples.length) return 0;
    const avg = Math.round(samples.reduce((s, r) => s + (r.value ?? 0), 0) / samples.length);
    return avg;
  } catch {
    return 0;
  }
}

export async function getRecentSleep(): Promise<SleepSample[]> {
  const native = getNativeHealth();
  if (!native) return [];

  try {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(18, 0, 0, 0);
    const end = new Date();
    return await new Promise<SleepSample[]>((resolve) => {
      (native as {
        getSleepSamples: (opts: unknown, cb: (err: unknown, res: SleepSample[]) => void) => void;
      }).getSleepSamples(
        { startDate: start.toISOString(), endDate: end.toISOString(), limit: 20 },
        (err: unknown, res: SleepSample[]) => {
          if (err || !Array.isArray(res)) resolve([]);
          else resolve(res);
        },
      );
    });
  } catch {
    return [];
  }
}

export async function getTodayHealthActivity(): Promise<HealthActivity> {
  const available = isHealthKitAvailable();
  if (!available) {
    return { steps: 0, activeCalories: 0, basalCalories: 0, workouts: [], isAvailable: false, isAuthorized: false };
  }

  const connected = await isHealthConnected();
  if (!connected) {
    return { steps: 0, activeCalories: 0, basalCalories: 0, workouts: [], isAvailable: true, isAuthorized: false };
  }

  const [steps, activeCalories, basalCalories, workouts] = await Promise.all([
    getTodaySteps(),
    getTodayActiveCalories(),
    getTodayBasalCalories(),
    getTodayWorkouts(),
  ]);

  return { steps, activeCalories, basalCalories, workouts, isAvailable: true, isAuthorized: true };
}
