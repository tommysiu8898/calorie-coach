import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
  Alert,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import Animated, {
  FadeInDown,
  useSharedValue,
  withTiming,
  useAnimatedProps,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import {
  getTodayHealthActivity,
  refreshHealthConnection,
  type HealthActivity,
} from "@/lib/health";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useWeightTracking, WeightSection } from "@/components/WeightSection";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const H_PAD = 16;

const WATER_OZ_PER_CUP = 8;
const WATER_CUPS_GOAL = 8;
const WATER_STORAGE_PREFIX = "@calorie_tracker/water_";
const STEP_GOAL = 4000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface TodayData {
  meals: Meal[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  streak: number;
}

interface Meal {
  id: string;
  mealName: string;
  mealType: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  photoUrl?: string;
  createdAt: string;
}

interface Profile {
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbsTarget: number;
  dailyFatTarget: number;
  goal: string;
  weightKg?: number;
  targetWeightKg?: number;
  goalStartDate?: string | null;
  goalStartWeightKg?: number | null;
  goalDurationWeeks?: number | null;
}

// ─── Water Hook ──────────────────────────────────────────────────────────────

function useWaterTracking(selectedLocalDate: string) {
  const [cups, setCups] = useState(0);
  const getKey = (date: string) => `${WATER_STORAGE_PREFIX}${date}`;
  const todayStr = new Date().toLocaleDateString("sv");
  const isToday = selectedLocalDate === todayStr;

  const refresh = useCallback(async () => {
    const val = await AsyncStorage.getItem(getKey(selectedLocalDate));
    setCups(val ? Math.min(parseInt(val, 10) || 0, WATER_CUPS_GOAL) : 0);
  }, [selectedLocalDate]);

  useEffect(() => { refresh(); }, [refresh]);

  const increment = useCallback(async () => {
    const val = await AsyncStorage.getItem(getKey(selectedLocalDate));
    const next = Math.min((val ? parseInt(val, 10) || 0 : 0) + 1, WATER_CUPS_GOAL);
    setCups(next);
    await AsyncStorage.setItem(getKey(selectedLocalDate), String(next));
  }, [selectedLocalDate]);

  const decrement = useCallback(async () => {
    const val = await AsyncStorage.getItem(getKey(selectedLocalDate));
    const next = Math.max((val ? parseInt(val, 10) || 0 : 0) - 1, 0);
    setCups(next);
    await AsyncStorage.setItem(getKey(selectedLocalDate), String(next));
  }, [selectedLocalDate]);

  return { cups, increment, decrement, refresh, isToday, totalOz: cups * WATER_OZ_PER_CUP, goalOz: WATER_CUPS_GOAL * WATER_OZ_PER_CUP };
}

// ─── CalorieRing ─────────────────────────────────────────────────────────────

function CalorieRing({ value, max, color, bgColor, size = 112, strokeWidth = 9, children }: {
  value: number; max: number; color: string; bgColor: string;
  size?: number; strokeWidth?: number; children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming(max > 0 ? Math.min(value / max, 1) : 0, { duration: 900 });
  }, [value, max]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={bgColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} animatedProps={animatedProps} strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── WeekStrip ───────────────────────────────────────────────────────────────

function WeekStrip({ colors, selectedDate, onSelect, weekOffset, onWeekChange, dayData, calorieTarget }: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  selectedDate: Date; onSelect: (d: Date) => void;
  weekOffset: number; onWeekChange: (offset: number) => void;
  dayData: Record<string, { totalCalories: number; count: number }>; calorieTarget: number;
}) {
  const today = new Date();
  const todayStr = today.toLocaleDateString("sv");
  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });

  const getRingColor = (d: Date): string | "empty" | null => {
    const eod = new Date(today); eod.setHours(23, 59, 59, 999);
    if (d > eod) return null;
    const data = dayData[d.toLocaleDateString("sv")];
    if (!data || data.count === 0) return "empty";
    if (data.totalCalories <= calorieTarget + 100) return colors.accent;
    if (data.totalCalories <= calorieTarget + 200) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: 10, paddingHorizontal: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity onPress={() => onWeekChange(weekOffset - 1)} style={{ padding: 8 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-around" }}>
          {days.map((d, i) => {
            const isSelected = d.toDateString() === selectedDate.toDateString();
            const isActualToday = d.toLocaleDateString("sv") === todayStr;
            const ring = getRingColor(d);
            const hasBorder = !isSelected && ring !== null;
            return (
              <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => onSelect(d)}
                style={{ alignItems: "center", paddingHorizontal: 4, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 }}>
                  {DAY_LABELS[d.getDay()]}
                </Text>
                <View style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: isSelected ? colors.primary : "transparent",
                  borderWidth: hasBorder ? 2 : 0,
                  borderColor: hasBorder ? (ring === "empty" ? colors.border : (ring ?? "transparent")) : "transparent",
                  borderStyle: ring === "empty" ? "dashed" : "solid",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Text style={{ fontSize: 13, fontFamily: isSelected ? "Inter_700Bold" : "Inter_400Regular", color: isSelected ? colors.primaryForeground : colors.foreground }}>
                    {d.getDate()}
                  </Text>
                </View>
                {isActualToday && !isSelected && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.foreground, marginTop: 3 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity onPress={() => onWeekChange(weekOffset + 1)} style={{ padding: 8 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────

function BudgetCard({ consumed, target, burnedCalories, protein, proteinTarget, carbs, carbsTarget, fat, fatTarget, colors }: {
  consumed: number; target: number; burnedCalories: number;
  protein: number; proteinTarget: number; carbs: number; carbsTarget: number; fat: number; fatTarget: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  const budget = target + burnedCalories;
  const remaining = budget - consumed;
  const isOver = remaining < 0;
  const ringColor = isOver ? colors.destructive : colors.accent;

  const macros = [
    { label: t("carbs"), value: carbs, max: carbsTarget, color: colors.carbsColor },
    { label: t("protein"), value: protein, max: proteinTarget, color: colors.proteinColor },
    { label: t("fat"), value: fat, max: fatTarget, color: colors.fatColor },
  ];

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 18 }}>
      {/* Ring + stats row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 16 }}>
        <CalorieRing value={consumed} max={budget} size={112} strokeWidth={9} color={ringColor} bgColor={colors.calorieRingBg}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 25, fontFamily: "Inter_700Bold", color: isOver ? colors.destructive : colors.foreground, letterSpacing: -0.5 }}>
              {Math.abs(Math.round(remaining))}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>
              kcal {isOver ? t("over") ?? "over" : t("left")}
            </Text>
          </View>
        </CalorieRing>
        <View style={{ flex: 1, gap: 8 }}>
          <View>
            <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 }}>
              {t("eaten")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5 }}>{consumed}</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>kcal</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <View>
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 1 }}>{t("goal")}</Text>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{target}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 1 }}>{t("burned_label")}</Text>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: burnedCalories > 0 ? "#ef4444" : colors.foreground }}>
                {burnedCalories > 0 ? `+${burnedCalories}` : String(burnedCalories)}
              </Text>
            </View>
            {burnedCalories > 0 && (
              <View>
                <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 1 }}>Budget</Text>
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.accent }}>{budget}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      {/* Divider */}
      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 14 }} />
      {/* Macro bars */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {macros.map(({ label, value, max, color }) => {
          const pct = max > 0 ? Math.min(value / max, 1) : 0;
          return (
            <View key={label} style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{label}</Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{Math.round(value)}g</Text>
              </View>
              <View style={{ height: 5, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(pct * 100)}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 }}>/ {Math.round(max)}g</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── WeeklyInsightBar ─────────────────────────────────────────────────────────

function WeeklyInsightBar({ weekOffset, dayData, calorieTarget, colors }: {
  weekOffset: number;
  dayData: Record<string, { totalCalories: number; count: number }>;
  calorieTarget: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  const today = new Date();
  const todayStr = today.toLocaleDateString("sv");
  const eod = new Date(today); eod.setHours(23, 59, 59, 999);

  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const DAY_LETTERS = t("day_letters").split(",");

  const pastDays = days.filter(d => d <= eod);
  let hits = 0, totalCals = 0;
  pastDays.forEach(d => {
    const cals = dayData[d.toLocaleDateString("sv")]?.totalCalories ?? 0;
    if (cals > 0 && cals <= calorieTarget + 100) hits++;
    totalCals += cals;
  });
  const avg = pastDays.length > 0 ? Math.round(totalCals / pastDays.length) : 0;

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 }}>{t("this_week")}</Text>
        <View style={{ flexDirection: "row", gap: 5 }}>
          {days.map((d, i) => {
            const ds = d.toLocaleDateString("sv");
            const isFuture = d > eod;
            const isToday = ds === todayStr;
            const cals = dayData[ds]?.totalCalories ?? 0;
            const hit = !isFuture && cals > 0 && cals <= calorieTarget + 100;
            const over = !isFuture && cals > calorieTarget + 100;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 3 }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: isFuture ? colors.muted : hit ? colors.accent + "22" : over ? colors.destructive + "18" : colors.muted,
                  borderWidth: isToday ? 2 : 1,
                  borderColor: isToday ? colors.accent : isFuture ? colors.border : hit ? colors.accent + "40" : over ? colors.destructive + "40" : colors.border,
                  alignItems: "center", justifyContent: "center",
                }}>
                  {!isFuture && cals > 0 && (
                    <Ionicons name={hit ? "checkmark" : "close"} size={11} color={hit ? colors.accent : colors.destructive} />
                  )}
                </View>
                <Text style={{ fontSize: 9, fontFamily: isToday ? "Inter_700Bold" : "Inter_400Regular", color: isToday ? colors.accent : colors.mutedForeground }}>
                  {DAY_LETTERS[d.getDay()]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>{hits}</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>/{pastDays.length}</Text>
        </View>
        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("days_on_target")}</Text>
        {avg > 0 && (
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{t("avg")} {avg} kcal</Text>
        )}
      </View>
    </View>
  );
}

// ─── WellnessTipCard ─────────────────────────────────────────────────────────

const WELLNESS_TIPS: Record<string, { cat: string; text: string }[]> = {
  en: [
    { cat: "Hydration", text: "Aim for 8 glasses of water today. Staying hydrated boosts energy and helps control appetite." },
    { cat: "Nutrition", text: "Fill half your plate with vegetables — rich in fibre and nutrients to keep you fuller longer." },
    { cat: "Activity", text: "A 10-minute walk after meals lowers blood sugar and aids digestion." },
    { cat: "Sleep", text: "Poor sleep raises hunger hormones. Aim for 7–9 hours to support your goals." },
    { cat: "Protein", text: "Include a protein source in every meal. It reduces cravings and supports muscle." },
    { cat: "Mindfulness", text: "Eat slowly and without screens. It takes 20 minutes for your brain to feel full." },
    { cat: "Planning", text: "Prep tomorrow's meals tonight. Planning ahead cuts impulsive food choices." },
  ],
  "zh-TW": [
    { cat: "補水", text: "今天目標喝8杯水，充足水分能提升能量，有助於控制食慾。" },
    { cat: "營養", text: "讓蔬菜佔餐盤一半，富含纖維和營養素，讓你更長時間保持飽足感。" },
    { cat: "運動", text: "飯後散步10分鐘有助於降低血糖，促進消化。" },
    { cat: "睡眠", text: "睡眠不足會提高飢餓素水平。每天保持7–9小時睡眠來支持你的目標。" },
    { cat: "蛋白質", text: "每餐都要攝取蛋白質，能減少食慾並幫助維持肌肉。" },
    { cat: "正念", text: "放下手機慢慢吃，大腦需要20分鐘才能感受到飽足感。" },
    { cat: "計劃", text: "今晚準備好明天的餐食，提前計劃能減少衝動飲食。" },
  ],
  "zh-CN": [
    { cat: "补水", text: "今天目标喝8杯水，充足水分能提升能量，有助于控制食欲。" },
    { cat: "营养", text: "让蔬菜占餐盘一半，富含纤维和营养素，让你更长时间保持饱腹感。" },
    { cat: "运动", text: "饭后散步10分钟有助于降低血糖，促进消化。" },
    { cat: "睡眠", text: "睡眠不足会提高饥饿素水平。每天保持7–9小时睡眠来支持你的目标。" },
    { cat: "蛋白质", text: "每餐都要摄取蛋白质，能减少食欲并帮助维持肌肉。" },
    { cat: "正念", text: "放下手机慢慢吃，大脑需要20分钟才能感受到饱腹感。" },
    { cat: "计划", text: "今晚准备好明天的餐食，提前计划能减少冲动饮食。" },
  ],
};

function WellnessTipCard({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const { t, languageCode } = useI18n();
  const loc = languageCode === "zh-TW" ? "zh-TW" : languageCode === "zh-CN" ? "zh-CN" : "en";
  const tip = WELLNESS_TIPS[loc][new Date().getDay()];
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingVertical: 14,
      paddingHorizontal: 16,
    }}>
      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
        {t("today_short")} · {tip.cat}
      </Text>
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 21 }}>
        {tip.text}
      </Text>
    </View>
  );
}

// ─── MealRow ─────────────────────────────────────────────────────────────────

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "#f59e0b",
  lunch: "#22c55e",
  dinner: "#8b5cf6",
  snack: "#f43f5e",
};

function MealRow({ meal, colors, onPress, onDelete }: {
  meal: Meal;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPress?: () => void; onDelete?: (id: string) => void;
}) {
  const { t, languageCode } = useI18n();
  const swipeableRef = useRef<Swipeable>(null);
  const intlLocale = languageCode === "zh-TW" ? "zh-TW" : languageCode === "zh-CN" ? "zh-CN" : "en-US";
  const time = new Date(meal.createdAt).toLocaleTimeString(intlLocale, { hour: "numeric", minute: "2-digit" });
  const typeColor = MEAL_TYPE_COLORS[meal.mealType] ?? colors.accent;
  const typeLabel = t(meal.mealType) !== meal.mealType ? t(meal.mealType) : meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);

  const renderRightActions = () => (
    <TouchableOpacity
      style={mealRowStyles.deleteAction}
      onPress={() => {
        swipeableRef.current?.close();
        Alert.alert(t("delete_meal"), t("delete_meal_confirm"), [
          { text: t("cancel"), style: "cancel" },
          { text: t("delete"), style: "destructive", onPress: () => onDelete?.(meal.id) },
        ]);
      }}
    >
      <Text style={mealRowStyles.deleteText}>{t("delete")}</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} rightThreshold={40} overshootRight={false}>
      <TouchableOpacity activeOpacity={0.78} onPress={onPress}
        style={[mealRowStyles.row, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {/* Type badge */}
        <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: typeColor + "22", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: typeColor, letterSpacing: -0.2 }}>
            {meal.mealType.charAt(0).toUpperCase()}
          </Text>
        </View>
        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{meal.mealName}</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2, textTransform: "capitalize" }}>
            {typeLabel} · {time}
          </Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            {([
              [t("protein_abbr"), meal.totalProteinG, colors.proteinColor],
              [t("carbs_abbr"), meal.totalCarbsG, colors.carbsColor],
              [t("fat_abbr"), meal.totalFatG, colors.fatColor],
            ] as [string, number, string][]).map(([label, value, color]) => (
              <View key={label} style={{ backgroundColor: color + "22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color }}>{label} {Math.round(value)}g</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Calories */}
        <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.calorieColor }}>{meal.totalCalories}</Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>kcal</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.mutedForeground} style={{ marginTop: 6 }} />
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const mealRowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  deleteAction: { backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center", width: 80, borderRadius: 14, marginBottom: 10 },
  deleteText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

// ─── WaterSection ─────────────────────────────────────────────────────────────

function WaterSection({ cups, totalOz, goalOz, onIncrement, onDecrement, readonly, colors }: {
  cups: number; totalOz: number; goalOz: number;
  onIncrement: () => void; onDecrement: () => void; readonly?: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{t("water_section")}</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
            {totalOz} / {goalOz} {t("fl_oz_unit")} · {cups}/{WATER_CUPS_GOAL} {t("cups_label")}
          </Text>
        </View>
        <Ionicons name="water" size={22} color="#3b82f6" />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12, opacity: readonly ? 0.55 : 1 }}>
        {Array.from({ length: WATER_CUPS_GOAL }, (_, i) => {
          const filled = i < cups;
          return (
            <TouchableOpacity key={i} onPress={readonly ? undefined : (filled ? onDecrement : onIncrement)}
              activeOpacity={readonly ? 1 : 0.7}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: filled ? "#3b82f6" : colors.muted, borderWidth: 2, borderColor: filled ? "#3b82f6" : colors.border, alignItems: "center", justifyContent: "center" }}>
              {filled ? <Ionicons name="water" size={15} color="#fff" /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={readonly ? undefined : onDecrement} activeOpacity={readonly ? 1 : 0.75}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.muted, alignItems: "center" }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>− {t("remove") ?? "Remove"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={readonly ? undefined : onIncrement} activeOpacity={readonly ? 1 : 0.75}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: cups >= WATER_CUPS_GOAL || readonly ? colors.muted : colors.primary, alignItems: "center" }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: cups >= WATER_CUPS_GOAL || readonly ? colors.mutedForeground : colors.primaryForeground }}>
            + {t("add_cup") ?? "Add Cup"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── BurnedSection ────────────────────────────────────────────────────────────

function BurnedSection({ activity, colors, onAddWorkout, manualCalories }: {
  activity: HealthActivity | null; colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onAddWorkout: () => void; manualCalories: number;
}) {
  const { t } = useI18n();
  const healthBurned = activity?.isAuthorized ? (activity.activeCalories ?? 0) : 0;
  const burnedTotal = healthBurned + manualCalories;
  const steps = activity?.isAuthorized ? (activity.steps ?? 0) : 0;
  const stepPct = Math.min(steps / STEP_GOAL, 1);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 }}>
      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>{t("calories_burned_label")}</Text>
      <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 14 }}>
        {burnedTotal}<Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> kcal</Text>
      </Text>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 14 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: "#22c55e22", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 22 }}>🚶</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>{t("walk_label")}</Text>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
            {steps.toLocaleString()}<Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> {t("steps_label")}</Text>
          </Text>
          <View style={{ height: 4, backgroundColor: colors.muted, borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
            <View style={{ width: `${Math.round(stepPct * 100)}%`, height: "100%", backgroundColor: "#22c55e", borderRadius: 2 }} />
          </View>
        </View>
        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
          {t("step_goal_label")}:{"\n"}{STEP_GOAL.toLocaleString()} {t("steps_label")}
        </Text>
      </View>
      {manualCalories > 0 && (
        <TouchableOpacity onPress={onAddWorkout} activeOpacity={0.8}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: "#f9731622", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 22 }}>🏋️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 2 }}>{t("manual_workouts_label")}</Text>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              {manualCalories}<Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}> kcal</Text>
            </Text>
          </View>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onAddWorkout} activeOpacity={0.75}
        style={{ backgroundColor: colors.accent + "18", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.accent }}>{t("add_workout_btn")}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, actionLabel, onAction, colors }: {
  title: string; actionLabel?: string; onAction?: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 22 }}>
      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{title}</Text>
      {actionLabel && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{actionLabel} ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const { t, languageCode } = useI18n();
  const insets = useSafeAreaInsets();
  const { userId, addBurnedCalories } = useApp() as { userId: string; addBurnedCalories: boolean; themeMode: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [healthActivity, setHealthActivity] = useState<HealthActivity | null>(null);

  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile?userId=${userId}`);
      if (!res.ok) throw new Error("No profile");
      return res.json();
    },
    enabled: !!userId,
  });

  const selectedLocalDate = selectedDate.toLocaleDateString("sv");
  const isViewingToday = selectedDate.toDateString() === new Date().toDateString();

  const intlLocale = languageCode === "zh-TW" ? "zh-TW" : languageCode === "zh-CN" ? "zh-CN" : "en-US";

  const water = useWaterTracking(selectedLocalDate);
  const weightTracking = useWeightTracking(profile?.weightKg, profile?.goalStartDate, profile?.goalStartWeightKg, userId);

  useFocusEffect(useCallback(() => { weightTracking.refresh(); }, [weightTracking.refresh]));

  const handleWeekChange = useCallback((newOffset: number) => {
    setWeekOffset(newOffset);
    const now = new Date();
    if (newOffset === 0) {
      setSelectedDate(now);
    } else {
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + newOffset * 7);
      setSelectedDate(mon);
    }
  }, []);

  const weekMondayStr = (() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
    mon.setHours(0, 0, 0, 0);
    return mon.toLocaleDateString("sv");
  })();

  const { data: today, refetch: refetchToday, isLoading: todayLoading } = useQuery<TodayData>({
    queryKey: ["today", userId, selectedLocalDate],
    queryFn: async () => {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/today?userId=${userId}&localDate=${selectedLocalDate}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: isViewingToday ? 15000 : false,
  });

  const { data: userStats } = useQuery<{ streakDays: number; vitalityScore: number } | null>({
    queryKey: ["userStats", userId],
    queryFn: async () => {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/user-stats?userId=${userId}`);
      if (!res.ok) return null;
      const d = (await res.json()) as { exists: boolean; stats: { streakDays: number; vitalityScore: number } | null };
      return d.stats ?? null;
    },
    enabled: !!userId,
    staleTime: 60000,
  });

  const { data: weekSummary = {} } = useQuery<Record<string, { totalCalories: number; count: number }>>({
    queryKey: ["weekSummary", userId, weekMondayStr],
    queryFn: async () => {
      const monday = new Date(weekMondayStr);
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
      const results: Record<string, { totalCalories: number; count: number }> = {};
      await Promise.all(days.map(async (d) => {
        const localDate = d.toLocaleDateString("sv");
        try {
          const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/today?userId=${userId}&localDate=${localDate}`);
          if (res.ok) {
            const data = (await res.json()) as { totalCalories: number; meals: unknown[] };
            results[localDate] = { totalCalories: data.totalCalories ?? 0, count: data.meals?.length ?? 0 };
          }
        } catch { /* ignore */ }
      }));
      return results;
    },
    enabled: !!userId,
    staleTime: 120_000,
  });

  const { data: burnedHistory = [] } = useQuery<{ date: string; active_energy: number; basal_energy: number; steps: number }[]>({
    queryKey: ["burnedHistory", userId],
    queryFn: async () => {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/calories-burned?user_id=${userId}&days=90`);
      if (!res.ok) return [];
      const data = await res.json() as { success: boolean; rows?: { date: string; active_energy: number; basal_energy: number; steps: number }[] };
      return data.rows ?? [];
    },
    enabled: !!userId,
    staleTime: 300_000,
  });

  const { data: exerciseLogs = [] } = useQuery<{ id: string; calories: number }[]>({
    queryKey: ["exerciseLogs", userId, selectedLocalDate],
    queryFn: async () => {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise-logs?user_id=${userId}&date=${selectedLocalDate}`);
      if (!res.ok) return [];
      const data = await res.json() as { success: boolean; logs?: { id: string; calories: number }[] };
      return data.logs ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const manualExerciseCalories = exerciseLogs.reduce((sum, l) => sum + (l.calories ?? 0), 0);

  const loadHealthData = useCallback(async () => {
    try {
      await refreshHealthConnection();
      const data = await getTodayHealthActivity();
      setHealthActivity(data);
      if (data?.isAuthorized && userId) {
        const todayDate = new Date().toLocaleDateString("sv");
        fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/calories-burned`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, date: todayDate, active_energy: data.activeCalories ?? 0, basal_energy: data.basalCalories ?? 0, steps: data.steps ?? 0 }),
        }).catch(() => { /* non-critical */ });
      }
    } catch { /* graceful fallback */ }
  }, [userId]);

  useEffect(() => {
    loadHealthData();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => { if (state === "active") loadHealthData(); });
    return () => sub.remove();
  }, [loadHealthData]);

  useFocusEffect(useCallback(() => { loadHealthData(); water.refresh(); }, [loadHealthData, water.refresh]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchToday(), loadHealthData()]);
    setRefreshing(false);
  }, [refetchToday, loadHealthData]);

  const handleDeleteMeal = async (mealId: string) => {
    try {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete meal");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["today", userId] }),
        queryClient.invalidateQueries({ queryKey: ["mealHistory", userId] }),
        queryClient.invalidateQueries({ queryKey: ["dailyLogs", userId] }),
        queryClient.invalidateQueries({ queryKey: ["weekSummary"] }),
      ]);
    } catch {
      Alert.alert(t("delete_meal"), t("delete_error"));
    }
  };

  const consumed = today?.totalCalories ?? 0;
  const target = profile?.dailyCalorieTarget ?? 2000;
  const activeCals = healthActivity?.isAuthorized ? (healthActivity.activeCalories ?? 0) : 0;
  const budgetBurned = (addBurnedCalories ? activeCals : 0) + manualExerciseCalories;
  const protein = today?.totalProteinG ?? 0;
  const carbs = today?.totalCarbsG ?? 0;
  const fat = today?.totalFatG ?? 0;
  const proteinTarget = profile?.dailyProteinTarget ?? 150;
  const carbsTarget = profile?.dailyCarbsTarget ?? 250;
  const fatTarget = profile?.dailyFatTarget ?? 65;
  const streak = userStats?.streakDays ?? today?.streak ?? 0;
  const goalWeight = profile?.targetWeightKg ?? 75;
  const goalPlan =
    profile?.goalStartDate && profile?.goalStartWeightKg && profile?.goalDurationWeeks && profile?.targetWeightKg
      ? { startDate: profile.goalStartDate, startWeightKg: profile.goalStartWeightKg, targetWeightKg: profile.targetWeightKg, durationWeeks: profile.goalDurationWeeks }
      : null;

  const nowDate = new Date();
  const dateTitle = isViewingToday
    ? t("today_short")
    : selectedDate.toLocaleDateString(intlLocale, { weekday: "long", month: "short", day: "numeric" });
  const dateSubtitle = nowDate.toLocaleDateString(intlLocale, { weekday: "long", month: "long", day: "numeric" });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: H_PAD,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(0)}
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>{dateTitle}</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }} numberOfLines={1}>
            {dateSubtitle}
          </Text>
        </View>
        {streak > 0 && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 5,
            backgroundColor: "#f97316" + "22", borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0, marginLeft: 12,
          }}>
            <Ionicons name="flame" size={15} color="#f97316" />
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#f97316" }}>
              {streak} {t("day_streak")}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ── Week Strip ──────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(40)} style={{ marginBottom: 14 }}>
        <WeekStrip
          colors={colors} selectedDate={selectedDate} onSelect={setSelectedDate}
          weekOffset={weekOffset} onWeekChange={handleWeekChange}
          dayData={weekSummary} calorieTarget={target}
        />
      </Animated.View>

      {/* ── Budget Card ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(80)} style={{ marginBottom: 12 }}>
        <BudgetCard
          consumed={consumed} target={target} burnedCalories={budgetBurned}
          protein={protein} proteinTarget={proteinTarget}
          carbs={carbs} carbsTarget={carbsTarget}
          fat={fat} fatTarget={fatTarget} colors={colors}
        />
        {consumed > target + budgetBurned && (
          <View style={{ marginTop: 10, backgroundColor: "#ef444420", borderRadius: 12, borderWidth: 1, borderColor: "#ef4444", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#ef4444" }}>
              {consumed - target - budgetBurned} {t("kcal_over_goal")}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ── Weekly Insight ──────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(110)} style={{ marginBottom: 12 }}>
        <WeeklyInsightBar weekOffset={weekOffset} dayData={weekSummary} calorieTarget={target} colors={colors} />
      </Animated.View>

      {/* ── Wellness Tip ────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(130)} style={{ marginBottom: 22 }}>
        <WellnessTipCard colors={colors} />
      </Animated.View>

      {/* ── Today's Meals ───────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(150)}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
            {isViewingToday ? `${t("today_short")}'s ${t("track") ?? "Track"}` : t("today_meals")}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TouchableOpacity onPress={() => router.push("/(tabs)/track" as never)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.accent }}>{t("log_food_title")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(tabs)/history" as never)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{t("history_title")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {todayLoading ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 36, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t("loading")}</Text>
          </View>
        ) : today?.meals && today.meals.length > 0 ? (
          <View>
            {today.meals.slice().reverse().map((meal, i) => (
              <Animated.View key={meal.id} entering={FadeInDown.delay(200 + i * 50)}>
                <MealRow meal={meal} colors={colors} onPress={() => router.push(`/meal-detail?id=${meal.id}`)} onDelete={handleDeleteMeal} />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: 32, alignItems: "center" }}>
            <Ionicons name="restaurant-outline" size={40} color={colors.mutedForeground} style={{ opacity: 0.35, marginBottom: 12 }} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{t("no_meals")}</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4, textAlign: "center", paddingHorizontal: 24 }}>
              {isViewingToday ? t("no_meals_sub") : t("no_meals_this_day")}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ── Burned ──────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(170)}>
        <SectionHeader title={t("burned_section")} actionLabel={t("more_label")} onAction={() => router.push("/apple-health" as never)} colors={colors} />
        <BurnedSection
          activity={(() => {
            if (isViewingToday) return healthActivity;
            const stored = burnedHistory.find(r => r.date === selectedLocalDate);
            if (!stored) return null;
            return { isAuthorized: true, isAvailable: true, activeCalories: stored.active_energy, basalCalories: stored.basal_energy, steps: stored.steps, workouts: [] };
          })()}
          colors={colors} manualCalories={manualExerciseCalories}
          onAddWorkout={() => router.push({ pathname: "/exercise-log", params: { date: selectedLocalDate } } as never)}
        />
      </Animated.View>

      {/* ── Water ───────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(190)}>
        <SectionHeader title={t("water_section")} colors={colors} />
        <WaterSection cups={water.cups} totalOz={water.totalOz} goalOz={water.goalOz} onIncrement={water.increment} onDecrement={water.decrement} readonly={!water.isToday} colors={colors} />
      </Animated.View>

      {/* ── Weight ──────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(210)}>
        <SectionHeader title={t("weight_section")} actionLabel={t("more_label")} onAction={() => router.push("/(tabs)/progress" as never)} colors={colors} />
        <WeightSection
          history={weightTracking.history} currentWeight={weightTracking.currentWeight}
          goalWeight={goalWeight} goalPlan={goalPlan}
          initialWeight={profile?.goalStartWeightKg ?? profile?.weightKg}
          onLogWeight={weightTracking.logWeight} colors={colors}
        />
      </Animated.View>
    </ScrollView>
  );
}
