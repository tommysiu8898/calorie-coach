import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CalorieBarChart, type BarDatum } from "@/components/CalorieBarChart";
import { Swipeable } from "react-native-gesture-handler";
import Svg, {
  Rect,
  Text as SvgText,
  Line,
  Circle,
  Path,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Constants & types ────────────────────────────────────────────────────────

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

interface MealEntry {
  id: string;
  mealName: string;
  mealType: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  photoUrl: string | null;
  createdAt: string;
  localDate?: string;
}

interface DailyLog {
  id: string;
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  streakDay: number;
  mealsLogged: number;
}

interface DailyLogsResponse {
  logs: DailyLog[];
  bestStreak: number;
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
}

interface WeightLog {
  id: string;
  userId: string;
  date: string;
  weightKg: number;
  createdAt: string;
}

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;
type Period = "7" | "30";

const BADGE_DEFS = [
  { id: "first", labelKey: "badge_first_day", emoji: "🌱", requiredStreak: 1 },
  { id: "week1", labelKey: "badge_7day", emoji: "🔥", requiredStreak: 7 },
  { id: "week2", labelKey: "badge_2weeks", emoji: "⚡", requiredStreak: 14 },
  { id: "month1", labelKey: "badge_30days", emoji: "🏆", requiredStreak: 30 },
  { id: "month3", labelKey: "badge_90days", emoji: "💎", requiredStreak: 90 },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

function localToday(): string {
  return new Date().toLocaleDateString("sv");
}

function buildDateRange(days: number): string[] {
  const range: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    range.push(d.toLocaleDateString("sv"));
  }
  return range;
}

function dayAbbr(dateStr: string, languageCode: string): string {
  const intlLocale =
    languageCode === "zh-TW"
      ? "zh-TW"
      : languageCode === "zh-CN"
      ? "zh-CN"
      : "en-US";
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat(intlLocale, { weekday: "narrow" }).format(d);
}

function formatFullDate(
  dateStr: string,
  todayLabel: string,
  yesterdayLabel: string,
  locale: string
): string {
  const today = localToday();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toLocaleDateString("sv");
  if (dateStr === today) return todayLabel;
  if (dateStr === yStr) return yesterdayLabel;
  const intlLocale =
    locale === "zh-TW" ? "zh-TW" : locale === "zh-CN" ? "zh-CN" : "en-US";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(intlLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(isoString: string, locale: string): string {
  const intlLocale =
    locale === "zh-TW" ? "zh-TW" : locale === "zh-CN" ? "zh-CN" : "en-US";
  return new Date(isoString).toLocaleTimeString(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

// ─── Shared card styles ───────────────────────────────────────────────────────

const card = StyleSheet.create({
  base: { borderRadius: 16, borderWidth: 1, padding: 16 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

const pcard = StyleSheet.create({
  base: { borderRadius: 18, borderWidth: 1, padding: 16 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statCard: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
});

// ─── History sub-components ───────────────────────────────────────────────────

function StreakCard({
  currentStreak,
  bestStreak,
  colors,
  t,
}: {
  currentStreak: number;
  bestStreak: number;
  colors: AppColors;
  t: (key: string) => string;
}) {
  return (
    <View
      style={[
        card.base,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          flexDirection: "row",
          marginBottom: 14,
        },
      ]}
    >
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text
          style={{
            fontSize: 38,
            fontFamily: "Inter_700Bold",
            color:
              currentStreak > 0 ? "#f97316" : colors.mutedForeground,
            lineHeight: 44,
          }}
        >
          {currentStreak}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            marginTop: 2,
          }}
        >
          {t("day_streak_label")}
        </Text>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_500Medium",
            color: colors.mutedForeground,
            marginTop: 4,
          }}
        >
          {t("current_label")}
        </Text>
      </View>
      <View
        style={{
          width: 1,
          backgroundColor: colors.border,
          marginVertical: 4,
        }}
      />
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text
          style={{
            fontSize: 38,
            fontFamily: "Inter_700Bold",
            color: bestStreak > 0 ? "#f59e0b" : colors.mutedForeground,
            lineHeight: 44,
          }}
        >
          {bestStreak}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            marginTop: 2,
          }}
        >
          {t("day_best_label")}
        </Text>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_500Medium",
            color: colors.mutedForeground,
            marginTop: 4,
          }}
        >
          {t("best_label")}
        </Text>
      </View>
    </View>
  );
}

function MacroAveragesCard({
  logs,
  colors,
  t,
}: {
  logs: DailyLog[];
  colors: AppColors;
  t: (key: string) => string;
}) {
  const active = logs.filter((l) => l.mealsLogged > 0);
  if (active.length === 0) return null;

  const avg = (key: keyof DailyLog) =>
    Math.round(
      active.reduce((s, l) => s + (l[key] as number), 0) / active.length
    );

  const avgCal = avg("totalCalories");
  const avgP = avg("totalProteinG");
  const avgC = avg("totalCarbsG");
  const avgF = avg("totalFatG");
  const totalG = avgP + avgC + avgF;

  const macros = [
    { label: t("protein"), value: avgP, color: colors.proteinColor },
    { label: t("carbs"), value: avgC, color: colors.carbsColor },
    { label: t("fat"), value: avgF, color: colors.fatColor },
  ];

  return (
    <View
      style={[
        card.base,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          marginBottom: 14,
        },
      ]}
    >
      <Text
        style={[card.title, { color: colors.foreground, marginBottom: 14 }]}
      >
        {t("avg_daily_macros")}
      </Text>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: 22,
              fontFamily: "Inter_700Bold",
              color: colors.calorieColor,
            }}
          >
            {avgCal}
          </Text>
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
            }}
          >
            {t("kcal_per_day")}
          </Text>
        </View>
        {macros.map((m) => (
          <View key={m.label} style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 22,
                fontFamily: "Inter_700Bold",
                color: m.color,
              }}
            >
              {m.value}
              <Text style={{ fontSize: 12, fontWeight: "400" as const }}>
                g
              </Text>
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {m.label}
            </Text>
          </View>
        ))}
      </View>

      {totalG > 0 && (
        <>
          <View
            style={{
              flexDirection: "row",
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              gap: 1,
            }}
          >
            {macros.map((m) => (
              <View
                key={m.label}
                style={{
                  flex: m.value / totalG,
                  backgroundColor: m.color,
                  borderRadius: 4,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", marginTop: 6, gap: 12 }}>
            {macros.map((m) => (
              <View
                key={m.label}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: m.color,
                  }}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: "Inter_400Regular",
                    color: colors.mutedForeground,
                  }}
                >
                  {totalG > 0
                    ? `${Math.round((m.value / totalG) * 100)}% ${m.label}`
                    : m.label}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function MacroChip({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700" as const,
          color,
          fontFamily: "Inter_700Bold",
        }}
      >
        {value}
        <Text style={{ fontSize: 11, fontWeight: "400" as const }}>{unit}</Text>
      </Text>
      <Text
        style={{
          fontSize: 10,
          color,
          opacity: 0.7,
          fontFamily: "Inter_400Regular",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function MealCard({
  meal,
  colors,
  onDelete,
}: {
  meal: MealEntry;
  colors: AppColors;
  onDelete?: (id: string) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const { t, languageCode } = useI18n();
  const [photoError, setPhotoError] = useState(false);

  const photoUri =
    !photoError && meal.photoUrl
      ? meal.photoUrl.startsWith("/api")
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${meal.photoUrl}`
        : meal.photoUrl
      : null;

  const renderRightActions = () => (
    <TouchableOpacity
      style={mealCard.deleteAction}
      onPress={() => {
        swipeableRef.current?.close();
        Alert.alert(t("delete_meal"), t("delete_meal_confirm"), [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("delete"),
            style: "destructive",
            onPress: () => onDelete?.(meal.id),
          },
        ]);
      }}
    >
      <Text style={mealCard.deleteText}>{t("delete")}</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <View
        style={[
          mealCard.container,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={mealCard.photo}
            resizeMode="cover"
            onError={() => setPhotoError(true)}
          />
        ) : (
          <View
            style={[
              mealCard.photo,
              {
                backgroundColor: colors.muted,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 26 }}>🍽</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.primary,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {t(meal.mealType) !== meal.mealType
                ? t(meal.mealType)
                : meal.mealType}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              }}
            >
              {formatTime(meal.createdAt, languageCode)}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600" as const,
              color: colors.foreground,
              fontFamily: "Inter_600SemiBold",
              marginBottom: 8,
            }}
            numberOfLines={2}
          >
            {meal.mealName}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <MacroChip
              label={t("cal_abbr")}
              value={meal.totalCalories}
              unit={t("kcal_abbr")}
              color={colors.calorieColor}
            />
            <MacroChip
              label={t("protein_abbr")}
              value={Math.round(meal.totalProteinG)}
              unit="g"
              color={colors.proteinColor}
            />
            <MacroChip
              label={t("carbs_abbr")}
              value={Math.round(meal.totalCarbsG)}
              unit="g"
              color={colors.carbsColor}
            />
            <MacroChip
              label={t("fat_abbr")}
              value={Math.round(meal.totalFatG)}
              unit="g"
              color={colors.fatColor}
            />
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

const mealCard = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  photo: { width: 82, height: 82, borderRadius: 12, flexShrink: 0 },
  deleteAction: {
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginBottom: 10,
  },
  deleteText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

// ─── Body & Progress sub-components ──────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  color,
  colors,
}: {
  label: string;
  value: string | number;
  unit: string;
  color: string;
  colors: AppColors;
}) {
  return (
    <View
      style={[
        pcard.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text
        style={{ fontSize: 26, fontFamily: "Inter_700Bold", color }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Inter_400Regular",
          color: colors.mutedForeground,
        }}
      >
        {unit}
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Inter_500Medium",
          color: colors.mutedForeground,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function BadgesCard({
  streak,
  colors,
}: {
  streak: number;
  colors: AppColors;
}) {
  const { t } = useI18n();
  return (
    <View
      style={[
        pcard.base,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          marginBottom: 16,
        },
      ]}
    >
      <Text
        style={[pcard.title, { color: colors.foreground, marginBottom: 12 }]}
      >
        {t("badges_earned")}
      </Text>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        {BADGE_DEFS.map((badge) => {
          const earned = streak >= badge.requiredStreak;
          return (
            <View
              key={badge.id}
              style={{ alignItems: "center", width: 56, opacity: earned ? 1 : 0.3 }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: earned ? colors.muted : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 4,
                  borderWidth: earned ? 1.5 : 0,
                  borderColor: earned ? colors.foreground : "transparent",
                }}
              >
                <Text style={{ fontSize: 22 }}>{badge.emoji}</Text>
              </View>
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: "Inter_500Medium",
                  color: colors.mutedForeground,
                  textAlign: "center",
                }}
              >
                {t(badge.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function WeightLineChart({
  weightLogs,
  targetWeightKg,
  fallbackWeightKg,
  weightUnit,
  colors,
}: {
  weightLogs: WeightLog[];
  targetWeightKg: number;
  fallbackWeightKg: number;
  weightUnit: WeightUnit;
  colors: AppColors;
}) {
  const { t } = useI18n();
  const chartW = SCREEN_WIDTH - 40 - 32;
  const chartH = 120;
  const sorted = useMemo(
    () => [...weightLogs].sort((a, b) => a.date.localeCompare(b.date)),
    [weightLogs]
  );

  if (sorted.length === 0) {
    const minW = Math.min(fallbackWeightKg, targetWeightKg) - 5;
    const maxW = Math.max(fallbackWeightKg, targetWeightKg) + 5;
    const range = Math.max(1, maxW - minW);
    const currentY = chartH - ((fallbackWeightKg - minW) / range) * chartH;
    const targetY = chartH - ((targetWeightKg - minW) / range) * chartH;
    return (
      <View style={{ marginTop: 8 }}>
        <Svg width={chartW} height={chartH + 24}>
          <Line
            x1={0} y1={targetY} x2={chartW} y2={targetY}
            stroke={colors.accent} strokeWidth={1} strokeDasharray="6,4"
          />
          <Line
            x1={0} y1={currentY} x2={chartW} y2={currentY}
            stroke={colors.foreground} strokeWidth={2}
          />
          <Circle cx={chartW / 2} cy={currentY} r={5} fill={colors.foreground} />
          <SvgText x={4} y={currentY - 8} fontSize={10} fill={colors.foreground} fontFamily="Inter_600SemiBold">
            {toDisplay(fallbackWeightKg, weightUnit)} {weightUnit} {t("weight_profile_label")}
          </SvgText>
          <SvgText x={4} y={targetY - 8} fontSize={10} fill={colors.accent} fontFamily="Inter_600SemiBold">
            {t("weight_chart_goal_label")} {toDisplay(targetWeightKg, weightUnit)} {weightUnit}
          </SvgText>
          <SvgText x={0} y={chartH + 18} fontSize={10} fill={colors.mutedForeground} fontFamily="Inter_400Regular">
            {t("weight_chart_hint")}
          </SvgText>
        </Svg>
      </View>
    );
  }

  const allWeights = sorted.map((l) => l.weightKg);
  const minW = Math.min(...allWeights, targetWeightKg) - 2;
  const maxW = Math.max(...allWeights, targetWeightKg) + 2;
  const range = Math.max(1, maxW - minW);
  const targetY = chartH - ((targetWeightKg - minW) / range) * chartH;
  const xStep = sorted.length > 1 ? chartW / (sorted.length - 1) : chartW / 2;
  const points = sorted.map((l, i) => ({
    x: sorted.length === 1 ? chartW / 2 : i * xStep,
    y: chartH - ((l.weightKg - minW) / range) * chartH,
    weightKg: l.weightKg,
    date: l.date,
  }));

  let pathD = "";
  points.forEach((pt, i) => {
    pathD += i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`;
  });

  const latestPt = points[points.length - 1]!;
  const firstPt = points[0]!;

  return (
    <View style={{ marginTop: 8 }}>
      <Svg width={chartW} height={chartH + 24}>
        <Line
          x1={0} y1={targetY} x2={chartW} y2={targetY}
          stroke={colors.accent} strokeWidth={1} strokeDasharray="6,4"
        />
        {points.length > 1 && (
          <Path d={pathD} stroke={colors.foreground} strokeWidth={2} fill="none" />
        )}
        {points.map((pt, i) => (
          <Circle key={i} cx={pt.x} cy={pt.y} r={4} fill={colors.foreground} />
        ))}
        <SvgText
          x={Math.min(latestPt.x + 4, chartW - 60)}
          y={Math.max(latestPt.y - 8, 12)}
          fontSize={10} fill={colors.foreground} fontFamily="Inter_600SemiBold"
        >
          {toDisplay(latestPt.weightKg, weightUnit)} {weightUnit}
        </SvgText>
        {points.length > 1 && (
          <SvgText
            x={firstPt.x} y={Math.max(firstPt.y - 8, 12)}
            fontSize={10} fill={colors.mutedForeground} fontFamily="Inter_400Regular"
          >
            {toDisplay(firstPt.weightKg, weightUnit)} {weightUnit}
          </SvgText>
        )}
        <SvgText x={0} y={targetY - 6} fontSize={10} fill={colors.accent} fontFamily="Inter_600SemiBold">
          {t("weight_chart_goal_label")} {toDisplay(targetWeightKg, weightUnit)} {weightUnit}
        </SvgText>
      </Svg>
    </View>
  );
}

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
              fill={seg.color} opacity={0.85}
            />
          );
        })}
        <Circle cx={markerX} cy={6} r={7} fill="#fff" stroke="#111827" strokeWidth={2} />
      </Svg>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 2,
        }}
      >
        {segments.map((seg) => (
          <Text
            key={seg.labelKey}
            style={{
              fontSize: 10,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
            }}
          >
            {t(seg.labelKey)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function WeightChangesTable({
  weightLogs,
  targetWeightKg,
  currentWeightKg,
  weightUnit,
  colors,
}: {
  weightLogs: WeightLog[];
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
    if (weightLogs.length < 2) return null;
    const now = new Date();
    const cutoff =
      days === Infinity
        ? new Date(0)
        : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const inRange =
      days === Infinity
        ? weightLogs
        : weightLogs.filter((l) => l.date >= cutoffStr!);
    if (inRange.length < 1) return null;
    const sorted = [...inRange].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    if (!latest || !earliest || latest.date === earliest.date) return null;
    const diffKg = latest.weightKg - earliest.weightKg;
    const diffDisplay = toDisplay(Math.abs(diffKg), weightUnit);
    const sign = diffKg > 0 ? "+" : "−";
    return `${sign}${diffDisplay} ${weightUnit}`;
  }

  const diffKg = Math.round((currentWeightKg - targetWeightKg) * 10) / 10;
  const diffDisplay = toDisplay(Math.abs(diffKg), weightUnit);

  return (
    <View
      style={[
        pcard.base,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          marginBottom: 16,
        },
      ]}
    >
      <Text
        style={[
          pcard.title,
          {
            color: colors.foreground,
            marginBottom: weightLogs.length < 2 ? 4 : 12,
          },
        ]}
      >
        {t("weight_changes")}
      </Text>
      {weightLogs.length < 2 && (
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            marginBottom: 12,
          }}
        >
          {t("log_weight_multi_days")}
        </Text>
      )}
      {PERIODS.map((p, i) => {
        const change = changeForPeriod(p.days);
        const isPos = change && change.startsWith("+");
        const isNeg = change && change.startsWith("−");
        return (
          <View
            key={p.labelKey}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: 10,
              borderBottomWidth: i < PERIODS.length - 1 ? 0.5 : 0,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {t(p.labelKey)}
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                color: change
                  ? isPos
                    ? colors.destructive
                    : isNeg
                    ? colors.accent
                    : colors.foreground
                  : colors.mutedForeground,
              }}
            >
              {change ?? "—"}
            </Text>
          </View>
        );
      })}
      <View
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_500Medium",
            color: colors.mutedForeground,
          }}
        >
          {t("to_goal")}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
            color: diffKg > 0 ? colors.destructive : colors.accent,
          }}
        >
          {diffKg > 0
            ? `−${diffDisplay} ${weightUnit} ${t("weight_needed")}`
            : diffKg < 0
            ? `+${diffDisplay} ${weightUnit} ${t("weight_needed")}`
            : t("at_goal")}
        </Text>
      </View>
    </View>
  );
}

function AvgCaloriesTable({
  allMeals,
  colors,
}: {
  allMeals: MealEntry[];
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

  function avgForPeriod(days: number): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered =
      days === Infinity
        ? allMeals
        : allMeals.filter(
            (m) => new Date(m.localDate ?? m.createdAt) >= cutoff
          );
    if (filtered.length === 0) return "—";
    const byDay = new Map<string, number>();
    for (const m of filtered) {
      const key =
        m.localDate ?? new Date(m.createdAt).toLocaleDateString("sv");
      byDay.set(key, (byDay.get(key) ?? 0) + m.totalCalories);
    }
    const vals = Array.from(byDay.values());
    return `${Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)} kcal`;
  }

  return (
    <View
      style={[
        pcard.base,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          marginBottom: 16,
        },
      ]}
    >
      <Text
        style={[pcard.title, { color: colors.foreground, marginBottom: 12 }]}
      >
        {t("avg_daily_calories")}
      </Text>
      {PERIODS.map((p, i) => (
        <View
          key={p.labelKey}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 10,
            borderBottomWidth: i < PERIODS.length - 1 ? 0.5 : 0,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
            }}
          >
            {t(p.labelKey)}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              color: colors.foreground,
            }}
          >
            {avgForPeriod(p.days)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WeeklyChart({
  data,
  target,
  tdee,
  colors,
}: {
  data: { label: string; calories: number }[];
  target: number;
  tdee: number;
  colors: AppColors;
}) {
  const { t } = useI18n();
  const chartW = SCREEN_WIDTH - 40 - 32;
  const chartH = 130;
  const barCount = data.length;
  const colW = Math.floor((chartW - (barCount - 1) * 8) / barCount);
  const pairGap = 2;
  const barW = Math.floor((colW - pairGap) / 2);
  const maxVal = Math.max(
    target * 1.15,
    tdee * 1.05,
    ...data.map((d) => d.calories),
    100
  );

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
        const burnedVal = d.calories > 0 ? tdee : 0;
        const burnedH = Math.max(burnedVal > 0 ? 4 : 0, (burnedVal / maxVal) * chartH);
        const consumedY = chartH - consumedH;
        const burnedY = chartH - burnedH;
        const isOver = target > 0 && d.calories > target;
        return (
          <React.Fragment key={i}>
            <Rect
              x={colX} y={consumedY} width={barW} height={consumedH} rx={4}
              fill={isOver ? colors.destructive : d.calories > 0 ? colors.foreground : colors.border}
              opacity={d.calories > 0 ? 1 : 0.3}
            />
            <Rect
              x={colX + barW + pairGap} y={burnedY} width={barW} height={burnedH} rx={4}
              fill={colors.accent} opacity={burnedVal > 0 ? 0.8 : 0.2}
            />
            <SvgText
              x={colX + colW / 2} y={chartH + 16}
              textAnchor="middle" fontSize={10}
              fill={colors.mutedForeground} fontFamily="Inter_500Medium"
            >
              {d.label}
            </SvgText>
          </React.Fragment>
        );
      })}
      <Rect x={0} y={chartH + 26} width={10} height={10} rx={3} fill={colors.foreground} />
      <SvgText x={14} y={chartH + 36} fontSize={10} fill={colors.mutedForeground} fontFamily="Inter_400Regular">
        {t("consumed_label")}
      </SvgText>
      <Rect x={84} y={chartH + 26} width={10} height={10} rx={3} fill={colors.accent} />
      <SvgText x={98} y={chartH + 36} fontSize={10} fill={colors.mutedForeground} fontFamily="Inter_400Regular">
        {t("burned_est_label")}
      </SvgText>
    </Svg>
  );
}

function LogWeightModal({
  visible,
  onClose,
  onSubmit,
  isLoading,
  currentWeightKg,
  weightUnit,
  onUnitChange,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (weightKg: number) => void;
  isLoading: boolean;
  currentWeightKg: number;
  weightUnit: WeightUnit;
  onUnitChange: (unit: WeightUnit) => void;
  colors: AppColors;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const displayDefault =
    currentWeightKg > 0 ? String(toDisplay(currentWeightKg, weightUnit)) : "";
  const [value, setValue] = useState(displayDefault);

  useEffect(() => {
    if (currentWeightKg > 0) {
      setValue(String(toDisplay(currentWeightKg, weightUnit)));
    }
  }, [weightUnit, currentWeightKg]);

  const maxDisplay = weightUnit === "lbs" ? 1323 : 600;
  const placeholder = weightUnit === "lbs" ? "e.g. 165.3" : "e.g. 75.5";

  const handleSubmit = useCallback(() => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0 || num > maxDisplay) {
      Alert.alert(
        t("invalid_weight"),
        `${t("todays_weight")} 1–${maxDisplay} ${weightUnit}`
      );
      return;
    }
    onSubmit(toKg(num, weightUnit));
  }, [value, onSubmit, weightUnit, maxDisplay, t]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: insets.bottom + 24,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontFamily: "Inter_700Bold",
                color: colors.foreground,
              }}
            >
              {t("log_weight")}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Inter_500Medium",
                  color: colors.mutedForeground,
                }}
              >
                {t("cancel")}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 20,
              alignSelf: "flex-start",
            }}
          >
            {(["kg", "lbs"] as WeightUnit[]).map((u) => (
              <TouchableOpacity
                key={u}
                onPress={() => onUnitChange(u)}
                style={{
                  borderRadius: 10,
                  paddingHorizontal: 24,
                  paddingVertical: 8,
                  backgroundColor:
                    weightUnit === u ? colors.foreground : colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Inter_600SemiBold",
                    color:
                      weightUnit === u
                        ? colors.background
                        : colors.mutedForeground,
                  }}
                >
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginBottom: 8,
            }}
          >
            {t("todays_weight")} ({weightUnit})
          </Text>
          <TextInput
            style={{
              backgroundColor: colors.background,
              borderWidth: 1.5,
              borderColor: colors.border,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 24,
              fontFamily: "Inter_600SemiBold",
              color: colors.foreground,
              textAlign: "center",
              marginBottom: 20,
            }}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            selectTextOnFocus
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading}
            style={{
              backgroundColor: colors.foreground,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Inter_700Bold",
                  color: colors.background,
                }}
              >
                {t("save_weight")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const { t, languageCode } = useI18n();
  const queryClient = useQueryClient();

  // ── History state ──
  const [period, setPeriod] = useState<Period>("7");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allMealsExpanded, setAllMealsExpanded] = useState(false);

  // ── Body & Progress state ──
  const [weekView, setWeekView] = useState<"this" | "last">("this");
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");

  const today = localToday();

  useEffect(() => {
    AsyncStorage.getItem(WEIGHT_UNIT_KEY).then((saved) => {
      if (saved === "kg" || saved === "lbs") setWeightUnit(saved);
    });
  }, []);

  const handleUnitChange = useCallback((unit: WeightUnit) => {
    setWeightUnit(unit);
    AsyncStorage.setItem(WEIGHT_UNIT_KEY, unit).catch(() => {});
  }, []);

  // ── History queries ──
  const {
    data: logsData,
    isLoading: logsLoading,
    isError: logsError,
  } = useQuery<DailyLogsResponse>({
    queryKey: ["dailyLogs", userId, period, today],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/daily-logs?userId=${userId}&days=${period}&localDate=${today}`
      );
      if (!res.ok) throw new Error("Failed to load logs");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: burnedData } = useQuery<{
    rows: Array<{ date: string; total_energy: number }>;
  }>({
    queryKey: ["caloriesBurned", userId, period],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/calories-burned?user_id=${userId}&days=${period}`
      );
      if (!res.ok) return { rows: [] };
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: profileData } = useQuery<Profile>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile?userId=${userId}`
      );
      if (!res.ok) return {} as Profile;
      return res.json();
    },
    enabled: !!userId,
  });

  const PAGE_SIZE = 30;
  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: historyLoading,
    isError,
    refetch,
  } = useInfiniteQuery<
    MealEntry[],
    Error,
    { pages: MealEntry[][] },
    [string, string | null],
    number
  >({
    queryKey: ["mealHistory", userId],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/history?userId=${userId}&page=${pageParam}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error("Failed to load history");
      return res.json() as Promise<MealEntry[]>;
    },
    initialPageParam: 1,
    getNextPageParam: (last, all) =>
      last.length === PAGE_SIZE ? all.length + 1 : undefined,
    enabled: !!userId,
  });

  const { data: dayMeals, isLoading: dayMealsLoading, isError: dayMealsError } =
    useQuery<MealEntry[]>({
      queryKey: ["dayMeals", userId, selectedDate],
      queryFn: async () => {
        const res = await fetch(
          `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/history?userId=${userId}&localDate=${selectedDate}`
        );
        if (!res.ok) throw new Error("Failed");
        return res.json();
      },
      enabled: !!userId && !!selectedDate,
    });

  // ── Body & Progress queries ──
  const { data: weightLogs = [] } = useQuery<WeightLog[]>({
    queryKey: ["weightLogs", userId],
    queryFn: async () => {
      const localDate = new Date().toLocaleDateString("sv");
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/weight?userId=${userId}&days=365&localDate=${localDate}`
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  const logWeightMutation = useMutation({
    mutationFn: async (weightKg: number) => {
      const date = new Date().toLocaleDateString("sv");
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/weight`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, weightKg, date }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? t("log_weight_failed")
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weightLogs", userId] });
      setShowLogWeight(false);
    },
    onError: (err: Error) => {
      Alert.alert(t("error_title"), err.message ?? t("log_weight_failed"));
    },
  });

  // ── Derived values ──
  const allMeals = historyData?.pages.flat() ?? [];
  const displayedMeals: MealEntry[] = selectedDate
    ? (dayMeals ?? [])
    : allMealsExpanded ? allMeals : [];
  const isListLoading = selectedDate ? dayMealsLoading : historyLoading;

  const logsMap = useMemo(() => {
    const m = new Map<string, DailyLog>();
    for (const l of logsData?.logs ?? []) m.set(l.date, l);
    return m;
  }, [logsData]);

  const dateRange = useMemo(
    () => buildDateRange(Number(period)),
    [period]
  );

  const burnedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of burnedData?.rows ?? []) m.set(r.date, r.total_energy);
    return m;
  }, [burnedData]);

  const barData: BarDatum[] = useMemo(
    () =>
      dateRange.map((date) => {
        const log = logsMap.get(date);
        return {
          date,
          label:
            date === today
              ? Number(period) <= 7
                ? t("today_label")
                : t("today_short")
              : dayAbbr(date, languageCode),
          calories: log?.totalCalories ?? 0,
          burnedCalories: burnedMap.get(date) ?? 0,
          isToday: date === today,
          isSelected: selectedDate === date,
        };
      }),
    [dateRange, logsMap, burnedMap, selectedDate, today, period, t, languageCode]
  );

  const currentStreak = useMemo(() => {
    const sorted = [...(logsData?.logs ?? [])].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    if (!sorted.length) return 0;
    const most = sorted[0]!;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toLocaleDateString("sv");
    if (most.date !== today && most.date !== yStr) return 0;
    return most.streakDay;
  }, [logsData, today]);

  const bestStreak = logsData?.bestStreak ?? 0;

  // Body & Progress derived
  const latestWeightLog = useMemo(() => {
    if (weightLogs.length === 0) return null;
    return (
      [...weightLogs].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
    );
  }, [weightLogs]);

  const displayWeightKg =
    latestWeightLog?.weightKg ?? profileData?.weightKg ?? 0;
  const bmi =
    displayWeightKg > 0 && profileData
      ? calcBMI(displayWeightKg, profileData.heightCm)
      : null;
  const bmiCat = bmi ? bmiCategory(bmi) : null;
  const weightDiff = profileData
    ? displayWeightKg - profileData.targetWeightKg
    : null;

  const DAY_KEYS = [
    "day_sun", "day_mon", "day_tue", "day_wed",
    "day_thu", "day_fri", "day_sat",
  ];

  const weekData = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("sv");
      const dayMealsArr = allMeals.filter((m) => {
        const mDate =
          m.localDate ?? new Date(m.createdAt).toLocaleDateString("sv");
        return mDate === dateStr;
      });
      result.push({
        label:
          i === 0 ? t("day_today") : t(DAY_KEYS[d.getDay()]!),
        calories: dayMealsArr.reduce((s, m) => s + m.totalCalories, 0),
      });
    }
    return result;
  }, [allMeals, t]);

  const loggedDays = weekData.filter((d) => d.calories > 0);
  const avgCalories =
    loggedDays.length > 0
      ? Math.round(
          loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length
        )
      : 0;
  const tdee = profileData ? profileData.dailyCalorieTarget + 400 : 2400;

  const calorieTarget = profileData?.dailyCalorieTarget ?? 0;

  const handleDayPress = (date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  };

  const handleDeleteMeal = async (mealId: string) => {
    try {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}?userId=${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete meal");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["mealHistory", userId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dayMeals", userId, selectedDate],
        }),
        queryClient.invalidateQueries({ queryKey: ["dailyLogs", userId] }),
        queryClient.invalidateQueries({ queryKey: ["today", userId] }),
      ]);
    } catch {
      Alert.alert(t("delete_meal"), t("delete_error"));
    }
  };

  const selectedLog = selectedDate ? logsMap.get(selectedDate) : null;

  if (isError) {
    return (
      <View
        style={[
          scr.container,
          {
            paddingTop:
              insets.top + (Platform.OS === "web" ? 67 : 0),
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          },
        ]}
      >
        <Text
          style={{
            color: colors.mutedForeground,
            textAlign: "center",
            fontFamily: "Inter_400Regular",
            marginBottom: 16,
          }}
        >
          {t("could_not_load_history")}
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 24,
          }}
        >
          <Text
            style={{
              color: colors.primaryForeground,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {t("retry")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listHeader = (
    <View>
      {/* ── Header row ── */}
      <Animated.View entering={FadeInDown.delay(0)} style={scr.headerRow}>
        <Text style={[scr.title, { color: colors.foreground }]}>
          {t("tab_history")}
        </Text>
        <View style={[scr.toggle, { backgroundColor: colors.muted }]}>
          {(["7", "30"] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => {
                setPeriod(p);
                setSelectedDate(null);
              }}
              style={[
                scr.toggleBtn,
                period === p && { backgroundColor: colors.foreground },
              ]}
            >
              <Text
                style={[
                  scr.toggleText,
                  {
                    color:
                      period === p
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  },
                ]}
              >
                {p === "7" ? t("seven_days") : t("thirty_days")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {logsLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : logsError ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          <View
            style={[
              card.base,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                textAlign: "center",
              }}
            >
              {t("could_not_load_chart")}
            </Text>
          </View>
        </View>
      ) : (
        <>
          {/* ── Streak card ── */}
          <Animated.View
            entering={FadeInDown.delay(60)}
            style={{ paddingHorizontal: 20 }}
          >
            <StreakCard
              currentStreak={currentStreak}
              bestStreak={bestStreak}
              colors={colors}
              t={t}
            />
          </Animated.View>

          {/* ── Bar chart ── */}
          <Animated.View
            entering={FadeInDown.delay(90)}
            style={[
              card.base,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginHorizontal: 20,
                marginBottom: 14,
              },
            ]}
          >
            <Text
              style={[
                card.title,
                { color: colors.foreground, marginBottom: 2 },
              ]}
            >
              {t("daily_calories")}
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                marginBottom: 10,
              }}
            >
              {t("tap_bar_hint")}
            </Text>
            {barData.some((d) => (d.burnedCalories ?? 0) > 0) &&
              Number(period) <= 7 && (
                <View
                  style={{ flexDirection: "row", gap: 14, marginBottom: 10 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: colors.foreground,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                      }}
                    >
                      {t("chart_eaten_label")}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: "#f97316",
                        opacity: 0.75,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                      }}
                    >
                      {t("chart_burned_label")}
                    </Text>
                  </View>
                </View>
              )}
            <CalorieBarChart
              data={barData}
              target={calorieTarget}
              onDayPress={handleDayPress}
              colors={colors}
            />
          </Animated.View>

          {/* ── Macro averages ── */}
          <Animated.View
            entering={FadeInDown.delay(120)}
            style={{ paddingHorizontal: 20 }}
          >
            <MacroAveragesCard
              logs={logsData?.logs ?? []}
              colors={colors}
              t={t}
            />
          </Animated.View>
        </>
      )}

      {/* ── Day filter header ── */}
      {selectedDate ? (
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={{
            paddingHorizontal: 20,
            marginBottom: 10,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 17,
                fontFamily: "Inter_700Bold",
                color: colors.foreground,
              }}
            >
              {formatFullDate(
                selectedDate,
                t("today_label"),
                t("yesterday_label"),
                languageCode
              )}
            </Text>
            {selectedLog && (
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                  marginTop: 2,
                }}
              >
                {selectedLog.totalCalories} {t("kcal_unit")} ·{" "}
                {selectedLog.mealsLogged}{" "}
                {selectedLog.mealsLogged === 1
                  ? t("meal_singular")
                  : t("meals_plural")}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setSelectedDate(null)}
            style={{
              backgroundColor: colors.muted,
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: colors.mutedForeground,
              }}
            >
              {t("clear_filter")}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <TouchableOpacity
          onPress={() => setAllMealsExpanded((v) => !v)}
          activeOpacity={0.7}
          style={{
            paddingHorizontal: 20,
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
            }}
          >
            {t("all_meals")}
          </Text>
          <Ionicons
            name={allMealsExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Body & Progress footer section ──
  const bodyProgressSection = (
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      {/* Section separator */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20, marginTop: 8 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
            color: colors.mutedForeground,
            letterSpacing: 0.5,
          }}
        >
          {t("section_body_progress")}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      {/* Stat cards row */}
      <Animated.View
        entering={FadeInDown.delay(60)}
        style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}
      >
        <StatCard
          label={t("streak_label")}
          value={currentStreak}
          unit={t("days_fire")}
          color={currentStreak > 0 ? "#f97316" : colors.mutedForeground}
          colors={colors}
        />
        <StatCard
          label={t("weight_label")}
          value={displayWeightKg > 0 ? toDisplay(displayWeightKg, weightUnit) : "—"}
          unit={weightUnit}
          color={colors.foreground}
          colors={colors}
        />
        {avgCalories > 0 && (
          <StatCard
            label={t("avg_per_day")}
            value={avgCalories}
            unit="kcal"
            color={colors.foreground}
            colors={colors}
          />
        )}
      </Animated.View>

      {/* Badges */}
      <Animated.View entering={FadeInDown.delay(80)}>
        <BadgesCard streak={currentStreak} colors={colors} />
      </Animated.View>

      {/* Weight card */}
      {profileData && (
        <Animated.View
          entering={FadeInDown.delay(100)}
          style={[
            pcard.base,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 16,
            }}
          >
            <View>
              <Text style={[pcard.title, { color: colors.foreground }]}>
                {t("weight_label")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                }}
              >
                {t("weight_target_label")}{" "}
                {toDisplay(profileData.targetWeightKg, weightUnit)} {weightUnit}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text
                style={{
                  fontSize: 28,
                  fontFamily: "Inter_700Bold",
                  color: colors.foreground,
                }}
              >
                {displayWeightKg > 0
                  ? `${toDisplay(displayWeightKg, weightUnit)} ${weightUnit}`
                  : "—"}
              </Text>
              {weightDiff !== null && displayWeightKg > 0 && (
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Inter_500Medium",
                    color:
                      weightDiff > 0 ? colors.destructive : colors.accent,
                  }}
                >
                  {weightDiff > 0
                    ? `${toDisplay(weightDiff, weightUnit)} ${weightUnit} ${t("weight_above_goal")}`
                    : `${toDisplay(Math.abs(weightDiff), weightUnit)} ${weightUnit} ${t("weight_below_goal")}`}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => setShowLogWeight(true)}
                style={{
                  backgroundColor: colors.foreground,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                    color: colors.background,
                  }}
                >
                  {t("log_weight")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <WeightLineChart
            weightLogs={weightLogs}
            targetWeightKg={profileData.targetWeightKg}
            fallbackWeightKg={profileData.weightKg}
            weightUnit={weightUnit}
            colors={colors}
          />
        </Animated.View>
      )}

      {/* Avg Daily Calories table */}
      <Animated.View entering={FadeInDown.delay(120)}>
        <AvgCaloriesTable allMeals={allMeals} colors={colors} />
      </Animated.View>

      {/* Weight Changes table */}
      {profileData && (
        <Animated.View entering={FadeInDown.delay(140)}>
          <WeightChangesTable
            weightLogs={weightLogs}
            targetWeightKg={profileData.targetWeightKg}
            currentWeightKg={displayWeightKg}
            weightUnit={weightUnit}
            colors={colors}
          />
        </Animated.View>
      )}

      {/* BMI card */}
      {bmi !== null && bmiCat !== null && (
        <Animated.View
          entering={FadeInDown.delay(160)}
          style={[
            pcard.base,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={[pcard.title, { color: colors.foreground }]}>BMI</Text>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: bmiCat.color + "22",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: bmiCat.color,
                }}
              >
                {t(bmiCat.labelKey)}
              </Text>
            </View>
          </View>
          <Text
            style={{
              fontSize: 32,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
              marginBottom: 6,
            }}
          >
            {bmi}
          </Text>
          {latestWeightLog && (
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                marginBottom: 6,
              }}
            >
              {t("based_on_logged_weight")} {latestWeightLog.date}
            </Text>
          )}
          <BMIScale bmi={bmi} colors={colors} />
        </Animated.View>
      )}

      {/* Weekly Energy chart */}
      <Animated.View
        entering={FadeInDown.delay(180)}
        style={[
          pcard.base,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            marginBottom: 16,
          },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <Text style={[pcard.title, { color: colors.foreground }]}>
            {t("weekly_energy")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              borderRadius: 8,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {(["this", "last"] as const).map((w) => (
              <TouchableOpacity
                key={w}
                onPress={() => setWeekView(w)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  backgroundColor:
                    weekView === w ? colors.foreground : colors.card,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    color:
                      weekView === w
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  }}
                >
                  {w === "this" ? t("this_wk") : t("last_wk")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            marginBottom: 16,
          }}
        >
          {weekView === "this"
            ? t("last_7_days_label")
            : t("prev_7_days_label")}
        </Text>
        <WeeklyChart
          data={
            weekView === "this"
              ? weekData
              : weekData.map((d) => ({ ...d, calories: 0 }))
          }
          target={profileData?.dailyCalorieTarget ?? 0}
          tdee={tdee}
          colors={colors}
        />
        {profileData && (
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginTop: 8,
            }}
          >
            {`— ${profileData.dailyCalorieTarget} kcal · ${t("burned_est_label")} ${tdee} kcal`}
          </Text>
        )}
      </Animated.View>
    </View>
  );

  return (
    <View
      style={[
        scr.container,
        { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) },
      ]}
    >
      <FlatList
        data={displayedMeals}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 20 }}>
            <MealCard meal={item} colors={colors} onDelete={handleDeleteMeal} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        onEndReached={() => {
          if (!selectedDate && hasNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !selectedDate && !allMealsExpanded ? (
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 4,
                paddingBottom: 8,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                }}
              >
                {t("see_all_meals_prompt")}
              </Text>
            </View>
          ) : dayMealsError ? (
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.foreground,
                  marginBottom: 6,
                  textAlign: "center",
                }}
              >
                {t("could_not_load_meals_day")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                  textAlign: "center",
                }}
              >
                {t("check_connection_retry")}
              </Text>
            </View>
          ) : !isListLoading ? (
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 8,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.foreground,
                  marginBottom: 6,
                  textAlign: "center",
                }}
              >
                {selectedDate
                  ? t("no_meals_this_day")
                  : t("no_past_meals_yet")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                  textAlign: "center",
                }}
              >
                {selectedDate
                  ? t("try_different_bar")
                  : t("track_first_meal_hint")}
              </Text>
            </View>
          ) : (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            bodyProgressSection
          )
        }
      />

      <LogWeightModal
        visible={showLogWeight}
        onClose={() => setShowLogWeight(false)}
        onSubmit={(weightKg) => logWeightMutation.mutate(weightKg)}
        isLoading={logWeightMutation.isPending}
        currentWeightKg={displayWeightKg}
        weightUnit={weightUnit}
        onUnitChange={handleUnitChange}
        colors={colors}
      />
    </View>
  );
}

const scr = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
  },
  toggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 2 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleText: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
