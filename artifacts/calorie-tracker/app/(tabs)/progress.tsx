import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
  TouchableOpacity,
  Alert,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useWeightTracking, WeightSection, type WeightEntry } from "@/components/WeightSection";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Rect, Text as SvgText, Line, Circle, Path } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStreakNotificationInit } from "@/hooks/useStreakNotification";
import { useRouter, useFocusEffect } from "expo-router";
import { getWeeklyActiveCalories, refreshHealthConnection, isHealthKitAvailable } from "@/lib/health";

const WEIGHT_UNIT_KEY = "@calorie_tracker/weightUnit";
type WeightUnit = "kg" | "lbs";

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

function toDisplay(kg: number, unit: WeightUnit): number {
  const val = unit === "lbs" ? kg * KG_TO_LBS : kg;
  return Math.round(val * 10) / 10;
}

function toKg(display: number, unit: WeightUnit): number {
  return unit === "lbs" ? display * LBS_TO_KG : display;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface GoalPlan {
  startDate: string;
  startWeightKg: number;
  targetWeightKg: number;
  durationWeeks: number;
}

interface Profile {
  weightKg: number;
  targetWeightKg: number;
  heightCm: number;
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbsTarget: number;
  dailyFatTarget: number;
  goal: string;
  goalStartDate?: string | null;
  goalStartWeightKg?: number | null;
  goalDurationWeeks?: number | null;
}

interface MealEntry {
  id: string;
  totalCalories: number;
  createdAt: string;
  localDate?: string;
}


interface TodayData {
  streak: number;
  meals: MealEntry[];
}

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function calcBMI(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

function bmiCategory(bmi: number): { labelKey: string; color: string } {
  if (bmi < 18.5) return { labelKey: "bmi_underweight", color: "#60a5fa" };
  if (bmi < 25) return { labelKey: "bmi_normal", color: "#00c46a" };
  if (bmi < 30) return { labelKey: "bmi_overweight", color: "#f59e0b" };
  return { labelKey: "bmi_obese", color: "#ef4444" };
}

// Weekly calorie bar chart using SVG
function WeeklyChart({
  data,
  target,
  tdee,
  burnedByDate,
  colors,
}: {
  data: { label: string; calories: number; date?: string }[];
  target: number;
  tdee: number;
  burnedByDate?: Record<string, number>;
  colors: AppColors;
}) {
  const { t } = useI18n();
  const chartW = SCREEN_WIDTH - 40 - 32;
  const chartH = 130;
  const barCount = data.length;
  const colW = Math.floor((chartW - (barCount - 1) * 8) / barCount);
  const pairGap = 2;
  const barW = Math.floor((colW - pairGap) / 2);
  // burnedByDate being non-null signals that we are connected and have fetched HealthKit data.
  // Use key existence (not value > 0) to decide per-day so that valid zeros aren't overwritten by estimates.
  const isUsingHealthData = burnedByDate !== null && burnedByDate !== undefined;
  const maxVal = Math.max(target * 1.15, tdee * 1.05, ...data.map((d) => d.calories), 100);

  return (
    <Svg width={chartW} height={chartH + 44}>
      {target > 0 && (
        <Line
          x1={0} y1={chartH - (target / maxVal) * chartH}
          x2={chartW} y2={chartH - (target / maxVal) * chartH}
          stroke={colors.border} strokeWidth={1} strokeDasharray="4,4"
        />
      )}
      {data.map((d, i) => {
        const colX = i * (colW + 8);
        const consumedH = Math.max(d.calories > 0 ? 4 : 0, (d.calories / maxVal) * chartH);
        // Per-day: when connected, use the HealthKit value by date-key (including 0).
        // Only fall back to TDEE estimate when not connected at all.
        const healthMap = burnedByDate ?? {};
        const hasHealthEntry = isUsingHealthData && d.date !== undefined && d.date in healthMap;
        const burnedVal = hasHealthEntry && d.date !== undefined
          ? (healthMap[d.date] ?? 0)
          : (d.calories > 0 ? tdee : 0);
        const burnedH = Math.max(burnedVal > 0 ? 4 : 0, (burnedVal / maxVal) * chartH);
        const consumedY = chartH - consumedH;
        const burnedY = chartH - burnedH;
        const isOver = target > 0 && d.calories > target;
        return (
          <React.Fragment key={i}>
            <Rect x={colX} y={consumedY} width={barW} height={consumedH} rx={4}
              fill={isOver ? colors.destructive : d.calories > 0 ? colors.foreground : colors.border}
              opacity={d.calories > 0 ? 1 : 0.3} />
            <Rect x={colX + barW + pairGap} y={burnedY} width={barW} height={burnedH} rx={4}
              fill={colors.accent} opacity={burnedVal > 0 ? 0.8 : 0.2} />
            <SvgText x={colX + colW / 2} y={chartH + 16} textAnchor="middle" fontSize={10}
              fill={colors.mutedForeground} fontFamily="Inter_500Medium">
              {d.label}
            </SvgText>
          </React.Fragment>
        );
      })}
      <Rect x={0} y={chartH + 26} width={10} height={10} rx={3} fill={colors.foreground} />
      <SvgText x={14} y={chartH + 36} fontSize={10} fill={colors.mutedForeground} fontFamily="Inter_400Regular">{t("consumed_label")}</SvgText>
      <Rect x={84} y={chartH + 26} width={10} height={10} rx={3} fill={colors.accent} />
      <SvgText x={98} y={chartH + 36} fontSize={10} fill={colors.mutedForeground} fontFamily="Inter_400Regular">
        {isUsingHealthData ? t("activity_active_cal") : t("burned_est_label")}
      </SvgText>
    </Svg>
  );
}

// BMI colored scale bar
function BMIScale({ bmi, colors }: { bmi: number; colors: AppColors }) {
  const { t } = useI18n();
  const scaleW = SCREEN_WIDTH - 40 - 32;
  const segments = [
    { labelKey: "bmi_under", color: "#60a5fa", range: [0, 18.5] as [number, number] },
    { labelKey: "bmi_normal", color: "#00c46a", range: [18.5, 25] as [number, number] },
    { labelKey: "bmi_over", color: "#f59e0b", range: [25, 30] as [number, number] },
    { labelKey: "bmi_obese", color: "#ef4444", range: [30, 40] as [number, number] },
  ];
  const totalRange = 40;
  const clampedBmi = Math.min(40, Math.max(0, bmi));
  const markerX = (clampedBmi / totalRange) * scaleW;

  return (
    <View style={{ marginTop: 10 }}>
      <Svg width={scaleW} height={36}>
        {segments.map((seg, i) => {
          const x = (seg.range[0] / totalRange) * scaleW;
          const segW = ((seg.range[1] - seg.range[0]) / totalRange) * scaleW;
          const radius = i === 0 || i === segments.length - 1 ? 6 : 0;
          return (
            <Rect key={i} x={x} y={0} width={segW} height={12} rx={radius}
              fill={seg.color} opacity={0.85} />
          );
        })}
        <Circle cx={markerX} cy={6} r={7} fill="#fff" stroke="#111827" strokeWidth={2} />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
        {segments.map((seg) => (
          <Text key={seg.labelKey} style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {t(seg.labelKey)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function StatCard({ label, value, unit, color, colors }: {
  label: string; value: string | number; unit: string; color: string; colors: AppColors;
}) {
  return (
    <View style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color }}>{value}</Text>
      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{unit}</Text>
      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const BADGE_DEFS = [
  { id: "first", labelKey: "badge_first_day", emoji: "🌱", requiredStreak: 1 },
  { id: "week1", labelKey: "badge_7day", emoji: "🔥", requiredStreak: 7 },
  { id: "week2", labelKey: "badge_2weeks", emoji: "⚡", requiredStreak: 14 },
  { id: "month1", labelKey: "badge_30days", emoji: "🏆", requiredStreak: 30 },
  { id: "month3", labelKey: "badge_90days", emoji: "💎", requiredStreak: 90 },
];

function BadgesCard({ streak, colors }: { streak: number; colors: AppColors }) {
  const { t } = useI18n();
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
      <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: 12 }]}>{t("badges_earned")}</Text>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        {BADGE_DEFS.map((badge) => {
          const earned = streak >= badge.requiredStreak;
          return (
            <View key={badge.id} style={{ alignItems: "center", width: 56, opacity: earned ? 1 : 0.3 }}>
              <View style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: earned ? colors.muted : colors.border,
                alignItems: "center", justifyContent: "center", marginBottom: 4,
                borderWidth: earned ? 1.5 : 0, borderColor: earned ? colors.foreground : "transparent",
              }}>
                <Text style={{ fontSize: 22 }}>{badge.emoji}</Text>
              </View>
              <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" }}>
                {t(badge.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Weight changes table — calculates from real logged entries
function WeightChangesTable({
  weightEntries,
  targetWeightKg,
  currentWeightKg,
  weightUnit,
  colors,
}: {
  weightEntries: WeightEntry[];
  targetWeightKg: number;
  currentWeightKg: number;
  weightUnit: WeightUnit;
  colors: AppColors;
}) {
  const { t } = useI18n();

  const PERIODS = [
    { labelKey: "period_3d", days: 3 },
    { labelKey: "period_7d", days: 7 },
    { labelKey: "period_14d", days: 14 },
    { labelKey: "period_30d", days: 30 },
    { labelKey: "period_90d", days: 90 },
    { labelKey: "period_all_time", days: Infinity },
  ];

  function changeForPeriod(days: number): string | null {
    if (weightEntries.length < 2) return null;
    const now = new Date();
    const cutoff = days === Infinity ? new Date(0) : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const inRange = days === Infinity
      ? weightEntries
      : weightEntries.filter((l) => l.date >= cutoffStr);
    if (inRange.length < 1) return null;
    const sorted = [...inRange].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    if (!latest || !earliest || latest.date === earliest.date) return null;
    const diffKg = latest.weight - earliest.weight;
    const diffDisplay = toDisplay(Math.abs(diffKg), weightUnit);
    const sign = diffKg > 0 ? "+" : "−";
    return `${sign}${diffDisplay} ${weightUnit}`;
  }

  const diffKg = Math.round((currentWeightKg - targetWeightKg) * 10) / 10;
  const diffDisplay = toDisplay(Math.abs(diffKg), weightUnit);
  const diff = diffKg;

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
      <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: weightEntries.length < 2 ? 4 : 12 }]}>{t("weight_changes")}</Text>
      {weightEntries.length < 2 && (
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 12 }}>
          {t("log_weight_multi_days")}
        </Text>
      )}
      {PERIODS.map((p, i) => {
        const change = changeForPeriod(p.days);
        const isPos = change && change.startsWith("+");
        const isNeg = change && change.startsWith("−");
        return (
          <View key={p.labelKey} style={{
            flexDirection: "row", justifyContent: "space-between", paddingVertical: 10,
            borderBottomWidth: i < PERIODS.length - 1 ? 0.5 : 0, borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t(p.labelKey)}</Text>
            <Text style={{
              fontSize: 14, fontFamily: "Inter_600SemiBold",
              color: change
                ? (isPos ? colors.destructive : isNeg ? colors.accent : colors.foreground)
                : colors.mutedForeground,
            }}>
              {change ?? "—"}
            </Text>
          </View>
        );
      })}
      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{t("to_goal")}</Text>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: diff > 0 ? colors.destructive : colors.accent }}>
          {diff > 0
            ? `−${diffDisplay} ${weightUnit} ${t("weight_needed")}`
            : diff < 0
            ? `+${diffDisplay} ${weightUnit} ${t("weight_needed")}`
            : t("at_goal")}
        </Text>
      </View>
    </View>
  );
}

// Daily average calories bar chart
function AvgCaloriesBarChart({ allMeals, colors }: { allMeals: MealEntry[]; colors: AppColors }) {
  const { t } = useI18n();

  const PERIODS = [
    { label: "3d", days: 3 },
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
  ];

  function avgForPeriod(days: number): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = allMeals.filter((m) => new Date(m.localDate ?? m.createdAt) >= cutoff);
    if (filtered.length === 0) return 0;
    const byDay = new Map<string, number>();
    for (const m of filtered) {
      const key = m.localDate ?? new Date(m.createdAt).toLocaleDateString("sv");
      byDay.set(key, (byDay.get(key) ?? 0) + m.totalCalories);
    }
    const vals = Array.from(byDay.values());
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  const chartW = SCREEN_WIDTH - 40 - 32;
  const chartH = 90;
  const avgs = PERIODS.map((p) => avgForPeriod(p.days));
  const maxVal = Math.max(...avgs, 100);
  const barW = Math.floor((chartW - (PERIODS.length - 1) * 10) / PERIODS.length);

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
      <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: 16 }]}>{t("avg_daily_calories")}</Text>
      <Svg width={chartW} height={chartH + 28}>
        {avgs.map((avg, i) => {
          const barH = Math.max(avg > 0 ? 8 : 4, (avg / maxVal) * chartH);
          const x = i * (barW + 10);
          const y = chartH - barH;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={y} width={barW} height={barH} rx={6}
                fill={avg > 0 ? colors.foreground : colors.border} opacity={avg > 0 ? 1 : 0.3} />
              <SvgText x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={11}
                fill={colors.mutedForeground} fontFamily="Inter_500Medium">
                {PERIODS[i].label}
              </SvgText>
              {avg > 0 && (
                <SvgText x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10}
                  fill={colors.foreground} fontFamily="Inter_600SemiBold">
                  {avg}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function AvgCaloriesTable({ allMeals, colors }: { allMeals: MealEntry[]; colors: AppColors }) {
  const { t } = useI18n();

  const PERIODS = [
    { labelKey: "period_3d", days: 3 },
    { labelKey: "period_7d", days: 7 },
    { labelKey: "period_14d", days: 14 },
    { labelKey: "period_30d", days: 30 },
    { labelKey: "period_90d", days: 90 },
    { labelKey: "period_all_time", days: Infinity },
  ];

  function avgForPeriod(days: number): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = days === Infinity
      ? allMeals
      : allMeals.filter((m) => new Date(m.localDate ?? m.createdAt) >= cutoff);
    if (filtered.length === 0) return "—";
    const byDay = new Map<string, number>();
    for (const m of filtered) {
      const key = m.localDate ?? new Date(m.createdAt).toLocaleDateString("sv");
      byDay.set(key, (byDay.get(key) ?? 0) + m.totalCalories);
    }
    const days2 = Array.from(byDay.values());
    return `${Math.round(days2.reduce((s, v) => s + v, 0) / days2.length)} kcal`;
  }

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
      <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: 12 }]}>{t("avg_daily_calories")}</Text>
      {PERIODS.map((p, i) => (
        <View key={p.labelKey} style={{
          flexDirection: "row", justifyContent: "space-between", paddingVertical: 10,
          borderBottomWidth: i < PERIODS.length - 1 ? 0.5 : 0, borderBottomColor: colors.border,
        }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t(p.labelKey)}</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{avgForPeriod(p.days)}</Text>
        </View>
      ))}
    </View>
  );
}

function ProgressPhotosCard({ colors }: { colors: AppColors }) {
  const { t } = useI18n();
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
      <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: 12 }]}>{t("progress_photos")}</Text>
      <TouchableOpacity
        activeOpacity={0.75}
        style={{
          borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
          borderRadius: 14, paddingVertical: 32, alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        <Text style={{ fontSize: 28 }}>📸</Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{t("upload_a_photo")}</Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("track_visual_progress")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProgressScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const router = useRouter();
  const [weekView, setWeekView] = useState<"this" | "last">("this");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [healthBurnedByDate, setHealthBurnedByDate] = useState<Record<string, number> | null>(null);
  // null = probe not yet complete (suppress UI); true/false = confirmed state
  const [healthConnected, setHealthConnected] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(WEIGHT_UNIT_KEY).then((saved) => {
      if (saved === "kg" || saved === "lbs") setWeightUnit(saved);
    });
  }, []);

  const loadHealthWeeklyData = useCallback(async () => {
    if (!isHealthKitAvailable()) {
      setHealthConnected(false);
      setHealthBurnedByDate(null);
      return;
    }
    try {
      const isConnected = await refreshHealthConnection();
      setHealthConnected(isConnected);
      if (!isConnected) {
        // Permissions were revoked or never granted — clear any stale data
        setHealthBurnedByDate(null);
        return;
      }
      const weekly = await getWeeklyActiveCalories();
      if (weekly.length > 0) {
        const map: Record<string, number> = {};
        for (const entry of weekly) {
          map[entry.date] = entry.value;
        }
        setHealthBurnedByDate(map);
      } else {
        // Connected but no data yet — clear so we don't show stale values
        setHealthBurnedByDate(null);
      }
    } catch {
      // On error, clear stale data rather than keeping potentially wrong values
      setHealthConnected(false);
      setHealthBurnedByDate(null);
    }
  }, []);

  useEffect(() => {
    loadHealthWeeklyData();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        loadHealthWeeklyData();
      }
    });
    return () => sub.remove();
  }, [loadHealthWeeklyData]);

  // Also refresh immediately on route focus so data updates right after
  // the user returns from the /apple-health connection screen.
  useFocusEffect(
    useCallback(() => {
      loadHealthWeeklyData();
    }, [loadHealthWeeklyData]),
  );

  const handleUnitChange = useCallback((unit: WeightUnit) => {
    setWeightUnit(unit);
    AsyncStorage.setItem(WEIGHT_UNIT_KEY, unit).catch(() => {});
  }, []);

  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile?userId=${userId}`);
      if (!res.ok) throw new Error("No profile");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: today } = useQuery<TodayData>({
    queryKey: ["today", userId],
    queryFn: async () => {
      const localDate = new Date().toLocaleDateString("sv");
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/today?userId=${userId}&localDate=${localDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: historyData } = useInfiniteQuery<MealEntry[], Error, { pages: MealEntry[][] }, [string, string | null], number>({
    queryKey: ["mealHistory", userId],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/history?userId=${userId}&page=${pageParam}&limit=50`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<MealEntry[]>;
    },
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.length === 50 ? all.length + 1 : undefined),
    enabled: !!userId,
  });

  const weightTracking = useWeightTracking(
    profile?.weightKg,
    profile?.goalStartDate,
    profile?.goalStartWeightKg,
    userId,
  );

  // Re-read weight history from storage when this tab gains focus so changes
  // logged on the Home tab are immediately reflected here.
  useFocusEffect(
    useCallback(() => {
      weightTracking.refresh();
    }, [weightTracking.refresh]),
  );

  const allMeals = useMemo(() => historyData?.pages.flat() ?? [], [historyData]);

  const weekData = useMemo(() => {
    const meals = allMeals;
    const DAY_KEYS = ["day_sun", "day_mon", "day_tue", "day_wed", "day_thu", "day_fri", "day_sat"];
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("sv");
      const dayMeals = meals.filter((m) => {
        const mDate = m.localDate ?? new Date(m.createdAt).toLocaleDateString("sv");
        return mDate === dateStr;
      });
      result.push({
        label: i === 0 ? t("day_today") : t(DAY_KEYS[d.getDay()]!),
        calories: dayMeals.reduce((s, m) => s + m.totalCalories, 0),
        date: dateStr,
      });
    }
    return result;
  }, [historyData, t]);

  const streak = today?.streak ?? 0;

  useStreakNotificationInit(streak);

  const latestHistoryEntry = weightTracking.history.length > 0
    ? weightTracking.history[weightTracking.history.length - 1]
    : null;

  const displayWeightKg = weightTracking.currentWeight || profile?.weightKg || 0;
  const bmi = displayWeightKg > 0 && profile ? calcBMI(displayWeightKg, profile.heightCm) : null;
  const bmiCat = bmi ? bmiCategory(bmi) : null;
  const weightDiff = profile ? displayWeightKg - profile.targetWeightKg : null;

  const goalPlan: GoalPlan | null =
    profile?.goalStartDate && profile?.goalStartWeightKg && profile?.goalDurationWeeks && profile?.targetWeightKg
      ? {
          startDate: profile.goalStartDate,
          startWeightKg: profile.goalStartWeightKg,
          targetWeightKg: profile.targetWeightKg,
          durationWeeks: profile.goalDurationWeeks,
        }
      : null;

  const loggedDays = weekData.filter((d) => d.calories > 0);
  const avgCalories = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
    : 0;
  const tdee = profile ? profile.dailyCalorieTarget + 400 : 2400;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(0)}>
          <Text style={[s.title, { color: colors.foreground }]}>{t("progress_title")}</Text>
        </Animated.View>

        {/* Streak + stats row */}
        <Animated.View entering={FadeInDown.delay(60)} style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          <StatCard label={t("streak_label")} value={streak} unit={t("days_fire")}
            color={streak > 0 ? "#f97316" : colors.mutedForeground} colors={colors} />
          <StatCard
            label={t("weight_label")}
            value={displayWeightKg > 0 ? toDisplay(displayWeightKg, weightUnit) : "—"}
            unit={weightUnit}
            color={colors.foreground}
            colors={colors}
          />
          {avgCalories > 0 && (
            <StatCard label={t("avg_per_day")} value={avgCalories} unit="kcal" color={colors.foreground} colors={colors} />
          )}
        </Animated.View>

        {/* Badges earned */}
        <Animated.View entering={FadeInDown.delay(90)}>
          <BadgesCard streak={streak} colors={colors} />
        </Animated.View>

        {/* Weight section — shared with Home tab */}
        {profile && (
          <Animated.View entering={FadeInDown.delay(120)} style={{ marginBottom: 16 }}>
            <WeightSection
              history={weightTracking.history}
              currentWeight={weightTracking.currentWeight}
              goalWeight={profile.targetWeightKg ?? 0}
              goalPlan={goalPlan}
              initialWeight={profile.goalStartWeightKg ?? profile.weightKg}
              onLogWeight={weightTracking.logWeight}
              colors={colors}
            />
          </Animated.View>
        )}

        {/* Avg Daily Calories bar chart */}
        <Animated.View entering={FadeInDown.delay(140)}>
          <AvgCaloriesBarChart allMeals={allMeals} colors={colors} />
        </Animated.View>

        {/* Avg Daily Calories table */}
        <Animated.View entering={FadeInDown.delay(150)}>
          <AvgCaloriesTable allMeals={allMeals} colors={colors} />
        </Animated.View>

        {/* Weight Changes table */}
        {profile && (
          <Animated.View entering={FadeInDown.delay(155)}>
            <WeightChangesTable
              weightEntries={weightTracking.history}
              targetWeightKg={profile.targetWeightKg}
              currentWeightKg={displayWeightKg}
              weightUnit={weightUnit}
              colors={colors}
            />
          </Animated.View>
        )}

        {/* BMI card — uses latest logged weight */}
        {bmi !== null && bmiCat !== null && (
          <Animated.View
            entering={FadeInDown.delay(180)}
            style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>BMI</Text>
              <View style={[s.bmiBadge, { backgroundColor: bmiCat.color + "22" }]}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: bmiCat.color }}>
                  {t(bmiCat.labelKey)}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 32, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 }}>
              {bmi}
            </Text>
            {latestHistoryEntry && (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 6 }}>
                {t("based_on_logged_weight")} {latestHistoryEntry.date}
              </Text>
            )}
            <BMIScale bmi={bmi} colors={colors} />
          </Animated.View>
        )}

        {/* Weekly Calorie bar chart */}
        <Animated.View
          entering={FadeInDown.delay(210)}
          style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("weekly_energy")}</Text>
            <View style={{ flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              {(["this", "last"] as const).map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => setWeekView(w)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 5,
                    backgroundColor: weekView === w ? colors.foreground : colors.card,
                  }}
                >
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: weekView === w ? colors.primaryForeground : colors.mutedForeground }}>
                    {w === "this" ? t("this_wk") : t("last_wk")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 16 }}>
            {weekView === "this" ? t("last_7_days_label") : t("prev_7_days_label")}
          </Text>

          {/* Connect Apple Health prompt — shown only on iOS when probe is complete and disconnected */}
          {isHealthKitAvailable() && healthConnected === false && (
            <TouchableOpacity
              onPress={() => router.push("/apple-health")}
              activeOpacity={0.8}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: "#22c55e12",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#22c55e33",
                padding: 10,
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 18 }}>❤️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>
                  {t("activity_card_title")}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {t("ah_not_connected_notice")}
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>
                {t("ah_connect_btn")} →
              </Text>
            </TouchableOpacity>
          )}

          <WeeklyChart
            data={weekView === "this" ? weekData : weekData.map((d) => ({ ...d, calories: 0 }))}
            target={profile?.dailyCalorieTarget ?? 0}
            tdee={tdee}
            burnedByDate={healthBurnedByDate ?? undefined}
            colors={colors}
          />
          {profile && (
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8 }}>
              {healthBurnedByDate !== null
                ? `— ${profile.dailyCalorieTarget} kcal ${t("goal")} · ❤️ ${t("activity_active_cal")}`
                : `— ${profile.dailyCalorieTarget} kcal · ${t("burned_est_label")} ${tdee} kcal`}
            </Text>
          )}
        </Animated.View>

        {/* Progress Photos */}
        <Animated.View entering={FadeInDown.delay(240)}>
          <ProgressPhotosCard colors={colors} />
        </Animated.View>

        {/* Nutrition Targets */}
        {profile && (
          <Animated.View
            entering={FadeInDown.delay(270)}
            style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[s.cardTitle, { color: colors.foreground, marginBottom: 12 }]}>{t("nutrition_targets_title")}</Text>
            {[
              { label: t("calories"), value: `${profile.dailyCalorieTarget} kcal`, color: colors.calorieColor },
              { label: `${t("protein")} 🥩`, value: `${Math.round(profile.dailyProteinTarget)}g`, color: colors.proteinColor },
              { label: `${t("carbs")} 🌾`, value: `${Math.round(profile.dailyCarbsTarget)}g`, color: colors.carbsColor },
              { label: `${t("fat")} 🫐`, value: `${Math.round(profile.dailyFatTarget)}g`, color: colors.fatColor },
            ].map((row, i, arr) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row", justifyContent: "space-between", paddingVertical: 10,
                  borderBottomWidth: i < arr.length - 1 ? 0.5 : 0, borderBottomColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{row.label}</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: row.color }}>{row.value}</Text>
              </View>
            ))}
          </Animated.View>
        )}
      </ScrollView>

    </>
  );
}

const s = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    marginBottom: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  bmiBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
});
