import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Platform,
  Dimensions,
  Alert,
  AppState,
  TextInput,
  useColorScheme,
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
import Svg, { Circle, Polyline, Line as SvgLine, Text as SvgText } from "react-native-svg";
import {
  getTodayHealthActivity,
  refreshHealthConnection,
  type HealthActivity,
} from "@/lib/health";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useWeightTracking, WeightSection } from "@/components/WeightSection";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_PADDING = 20;
const CARD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;

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

// ─── AsyncStorage Hooks ───────────────────────────────────────────────────────

function useWaterTracking(selectedLocalDate: string) {
  const [cups, setCups] = useState(0);

  const getKey = (date: string) => `${WATER_STORAGE_PREFIX}${date}`;
  const todayStr = new Date().toLocaleDateString("sv");
  const isToday = selectedLocalDate === todayStr;

  const refresh = useCallback(async () => {
    const key = getKey(selectedLocalDate);
    const val = await AsyncStorage.getItem(key);
    setCups(val ? Math.min(parseInt(val, 10) || 0, WATER_CUPS_GOAL) : 0);
  }, [selectedLocalDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const increment = useCallback(async () => {
    const key = getKey(selectedLocalDate);
    const val = await AsyncStorage.getItem(key);
    const current = val ? Math.min(parseInt(val, 10) || 0, WATER_CUPS_GOAL) : 0;
    const next = Math.min(current + 1, WATER_CUPS_GOAL);
    setCups(next);
    await AsyncStorage.setItem(key, String(next));
  }, [selectedLocalDate]);

  const decrement = useCallback(async () => {
    const key = getKey(selectedLocalDate);
    const val = await AsyncStorage.getItem(key);
    const current = val ? Math.min(parseInt(val, 10) || 0, WATER_CUPS_GOAL) : 0;
    const next = Math.max(current - 1, 0);
    setCups(next);
    await AsyncStorage.setItem(key, String(next));
  }, [selectedLocalDate]);

  return {
    cups,
    increment,
    decrement,
    refresh,
    isToday,
    totalOz: cups * WATER_OZ_PER_CUP,
    goalOz: WATER_CUPS_GOAL * WATER_OZ_PER_CUP,
  };
}

// ─── MiniRing ────────────────────────────────────────────────────────────────

function MiniRing({
  value,
  max,
  color,
  bgColor,
  size = 100,
  strokeWidth = 7,
  children,
}: {
  value: number;
  max: number;
  color: string;
  bgColor: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  React.useEffect(() => {
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    progress.value = withTiming(pct, { duration: 900 });
  }, [value, max]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
      }}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

// ─── WeekStrip ───────────────────────────────────────────────────────────────

function WeekStrip({
  colors,
  selectedDate,
  onSelect,
  weekOffset,
  onWeekChange,
  dayData,
  calorieTarget,
}: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  selectedDate: Date;
  onSelect: (d: Date) => void;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  dayData: Record<string, { totalCalories: number; count: number }>;
  calorieTarget: number;
}) {
  const { t } = useI18n();
  const today = new Date();
  const DAY_LABELS = [
    t("day_sun"),
    t("day_mon"),
    t("day_tue"),
    t("day_wed"),
    t("day_thu"),
    t("day_fri"),
    t("day_sat"),
  ];

  const monday = new Date(today);
  monday.setDate(
    today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7,
  );
  monday.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const getRingColor = (d: Date): string | "empty" | null => {
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    if (d > endOfToday) return null;
    const localDate = d.toLocaleDateString("sv");
    const data = dayData[localDate];
    if (!data) return null;
    if (data.count === 0) return "empty";
    if (data.totalCalories <= calorieTarget + 100) return "#00c46a";
    if (data.totalCalories <= calorieTarget + 200) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}
    >
      <TouchableOpacity
        onPress={() => onWeekChange(weekOffset - 1)}
        style={{ padding: 8 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 4,
          paddingVertical: 4,
          flexGrow: 1,
          justifyContent: "space-between",
        }}
        style={{ flex: 1 }}
      >
        {days.map((d, i) => {
          const isSelected = d.toDateString() === selectedDate.toDateString();
          const isActualToday = d.toDateString() === today.toDateString();
          const ringColor = getRingColor(d);
          const hasBorder = !isSelected && ringColor !== null;
          const borderColor =
            ringColor === "empty"
              ? colors.border
              : (ringColor ?? "transparent");
          const borderStyle =
            ringColor === "empty" ? "dashed" : "solid";
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onPress={() => onSelect(d)}
              style={{
                alignItems: "center",
                paddingHorizontal: 4,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "Inter_500Medium",
                  color: colors.mutedForeground,
                  marginBottom: 6,
                }}
              >
                {DAY_LABELS[d.getDay()]}
              </Text>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: hasBorder ? 2 : 0,
                  borderColor: hasBorder ? borderColor : "transparent",
                  borderStyle,
                  backgroundColor: isSelected
                    ? colors.foreground
                    : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: isSelected
                      ? "Inter_700Bold"
                      : "Inter_400Regular",
                    color: isSelected
                      ? colors.primaryForeground
                      : colors.foreground,
                  }}
                >
                  {d.getDate()}
                </Text>
              </View>
              {isActualToday && !isSelected && (
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.foreground,
                    marginTop: 3,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => onWeekChange(weekOffset + 1)}
        style={{ padding: 8 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
    </View>
  );
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────

function BudgetCard({
  consumed,
  target,
  burnedCalories,
  protein,
  proteinTarget,
  carbs,
  carbsTarget,
  fat,
  fatTarget,
  colors,
  onGoalPress,
}: {
  consumed: number;
  target: number;
  burnedCalories: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onGoalPress?: () => void;
}) {
  const { t } = useI18n();
  const net = consumed - burnedCalories;
  const remaining = target - net;
  const isOver = net > target;

  const macros = [
    {
      label: t("carbs"),
      value: carbs,
      max: carbsTarget,
      color: colors.carbsColor,
    },
    {
      label: t("protein"),
      value: protein,
      max: proteinTarget,
      color: colors.proteinColor,
    },
    { label: t("fat"), value: fat, max: fatTarget, color: colors.fatColor },
  ];

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 20,
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      {/* Three-column calorie row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        {/* Eaten */}
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              marginBottom: 4,
            }}
          >
            🍴 {t("eaten")}
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
            }}
          >
            {consumed}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginTop: 1,
            }}
          >
            kcal
          </Text>
        </View>

        {/* Remaining — center, large */}
        <View style={{ alignItems: "center", flex: 1.3 }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              marginBottom: 2,
            }}
          >
            {t("remaining_label")}
          </Text>
          <Text
            style={{
              fontSize: 44,
              fontFamily: "Inter_700Bold",
              color: isOver ? "#ef4444" : colors.foreground,
              lineHeight: 50,
            }}
          >
            {remaining < 0 ? `−${Math.abs(Math.round(remaining))}` : Math.round(remaining)}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginTop: 1,
            }}
          >
            kcal
          </Text>
        </View>

        {/* Burned */}
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              marginBottom: 4,
            }}
          >
            🔥 {t("burned_label")}
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
            }}
          >
            {burnedCalories}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginTop: 1,
            }}
          >
            kcal
          </Text>
        </View>
      </View>

      {/* Goal pill button */}
      <TouchableOpacity
        onPress={onGoalPress}
        activeOpacity={0.75}
        style={{
          alignSelf: "center",
          backgroundColor: colors.muted,
          borderRadius: 20,
          paddingVertical: 7,
          paddingHorizontal: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_500Medium",
            color: colors.foreground,
          }}
        >
          {t("goal").charAt(0).toUpperCase() + t("goal").slice(1)}: {target} kcal
        </Text>
        <Ionicons name="chevron-forward" size={13} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* Macro progress bars — horizontal row */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {macros.map(({ label, value, max, color }) => {
          const pct = max > 0 ? Math.min(value / max, 1) : 0;
          return (
            <View key={label} style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    color: colors.foreground,
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: "Inter_400Regular",
                    color: colors.mutedForeground,
                  }}
                >
                  {Math.round(value)}g
                </Text>
              </View>
              <View
                style={{
                  height: 5,
                  backgroundColor: colors.muted,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${Math.round(pct * 100)}%`,
                    height: "100%",
                    backgroundColor: color,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                  marginTop: 3,
                }}
              >
                / {Math.round(max)}g
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── WellnessStrip ─────────────────────────────────────────────────────────

const WELLNESS_TIPS: Record<
  string,
  { icon: string; cat: string; text: string }[]
> = {
  en: [
    {
      icon: "💧",
      cat: "Hydration",
      text: "Aim for 8 glasses of water today. Staying hydrated boosts energy and helps control appetite.",
    },
    {
      icon: "🥦",
      cat: "Nutrition",
      text: "Fill half your plate with vegetables — rich in fibre and nutrients to keep you fuller longer.",
    },
    {
      icon: "🚶",
      cat: "Activity",
      text: "A 10-minute walk after meals lowers blood sugar and aids digestion.",
    },
    {
      icon: "😴",
      cat: "Sleep",
      text: "Poor sleep raises hunger hormones. Aim for 7–9 hours to support your goals.",
    },
    {
      icon: "🥩",
      cat: "Protein",
      text: "Include a protein source in every meal. It reduces cravings and supports muscle.",
    },
    {
      icon: "🧘",
      cat: "Mindfulness",
      text: "Eat slowly and without screens. It takes 20 minutes for your brain to feel full.",
    },
    {
      icon: "📋",
      cat: "Planning",
      text: "Prep tomorrow's meals tonight. Planning ahead cuts impulsive food choices.",
    },
  ],
  "zh-TW": [
    {
      icon: "💧",
      cat: "補水",
      text: "今天目標喝8杯水，充足水分能提升能量，有助於控制食慾。",
    },
    {
      icon: "🥦",
      cat: "營養",
      text: "讓蔬菜佔餐盤一半，富含纖維和營養素，讓你更長時間保持飽足感。",
    },
    {
      icon: "🚶",
      cat: "運動",
      text: "飯後散步10分鐘有助於降低血糖，促進消化。",
    },
    {
      icon: "😴",
      cat: "睡眠",
      text: "睡眠不足會提高飢餓素水平。每天保持7–9小時睡眠來支持你的目標。",
    },
    {
      icon: "🥩",
      cat: "蛋白質",
      text: "每餐都要攝取蛋白質，能減少食慾並幫助維持肌肉。",
    },
    {
      icon: "🧘",
      cat: "正念",
      text: "放下手機慢慢吃，大腦需要20分鐘才能感受到飽足感。",
    },
    {
      icon: "📋",
      cat: "計劃",
      text: "今晚準備好明天的餐食，提前計劃能減少衝動飲食。",
    },
  ],
  "zh-CN": [
    {
      icon: "💧",
      cat: "补水",
      text: "今天目标喝8杯水，充足水分能提升能量，有助于控制食欲。",
    },
    {
      icon: "🥦",
      cat: "营养",
      text: "让蔬菜占餐盘一半，富含纤维和营养素，让你更长时间保持饱腹感。",
    },
    {
      icon: "🚶",
      cat: "运动",
      text: "饭后散步10分钟有助于降低血糖，促进消化。",
    },
    {
      icon: "😴",
      cat: "睡眠",
      text: "睡眠不足会提高饥饿素水平。每天保持7–9小时睡眠来支持你的目标。",
    },
    {
      icon: "🥩",
      cat: "蛋白质",
      text: "每餐都要摄取蛋白质，能减少食欲并帮助维持肌肉。",
    },
    {
      icon: "🧘",
      cat: "正念",
      text: "放下手机慢慢吃，大脑需要20分钟才能感受到饱腹感。",
    },
    {
      icon: "📋",
      cat: "计划",
      text: "今晚准备好明天的餐食，提前计划能减少冲动饮食。",
    },
  ],
};

function WellnessStrip({
  colors,
}: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t, languageCode } = useI18n();
  const loc =
    languageCode === "zh-TW"
      ? "zh-TW"
      : languageCode === "zh-CN"
        ? "zh-CN"
        : "en";
  const tip = WELLNESS_TIPS[loc][new Date().getDay()];

  return (
    <View
      style={{
        backgroundColor: colors.primary + "12",
        borderRadius: 16,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 26 }}>{tip.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_600SemiBold",
            color: colors.primary,
            marginBottom: 2,
          }}
        >
          {t("wellness_tip_title")} · {tip.cat}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: colors.foreground,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {tip.text}
        </Text>
      </View>
    </View>
  );
}

// ─── RecentMealRow ────────────────────────────────────────────────────────────

function RecentMealRow({
  meal,
  colors,
  onPress,
  onDelete,
}: {
  meal: Meal;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPress?: () => void;
  onDelete?: (id: string) => void;
}) {
  const { t, languageCode } = useI18n();
  const swipeableRef = useRef<Swipeable>(null);
  const [photoError, setPhotoError] = useState(false);
  const intlLocale =
    languageCode === "zh-TW"
      ? "zh-TW"
      : languageCode === "zh-CN"
        ? "zh-CN"
        : "en-US";
  const time = new Date(meal.createdAt).toLocaleTimeString(intlLocale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const photoUri =
    !photoError && meal.photoUrl
      ? meal.photoUrl.startsWith("/api")
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${meal.photoUrl}`
        : meal.photoUrl
      : null;

  const renderRightActions = () => (
    <TouchableOpacity
      style={recentRowStyles.deleteAction}
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
      <Text style={recentRowStyles.deleteText}>{t("delete")}</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <TouchableOpacity
        activeOpacity={0.78}
        onPress={onPress}
        style={[
          cardStyles.recentRow,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={cardStyles.recentPhoto}
            resizeMode="cover"
            onError={() => setPhotoError(true)}
          />
        ) : (
          <View
            style={[
              cardStyles.recentPhoto,
              {
                backgroundColor: colors.muted,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 24 }}>🍽</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              color: colors.foreground,
            }}
            numberOfLines={1}
          >
            {meal.mealName}
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginTop: 2,
            }}
          >
            {t(meal.mealType) !== meal.mealType
              ? t(meal.mealType)
              : capitalize(meal.mealType)}{" "}
            · {time}
          </Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 5 }}>
            <View
              style={{
                backgroundColor: colors.proteinColor + "22",
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.proteinColor,
                }}
              >
                {t("protein_abbr")} {Math.round(meal.totalProteinG)}g
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.carbsColor + "22",
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.carbsColor,
                }}
              >
                {t("carbs_abbr")} {Math.round(meal.totalCarbsG)}g
              </Text>
            </View>
            <View
              style={{
                backgroundColor: colors.fatColor + "22",
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.fatColor,
                }}
              >
                {t("fat_abbr")} {Math.round(meal.totalFatG)}g
              </Text>
            </View>
          </View>
        </View>
        <Text
          style={{
            fontSize: 15,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
          }}
        >
          {meal.totalCalories}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
          }}
        >
          {" "}
          {t("kcal_abbr")}
        </Text>
      </TouchableOpacity>
    </Swipeable>
  );
}

const recentRowStyles = StyleSheet.create({
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── HealthScoreBar ───────────────────────────────────────────────────────────

function HealthScoreBar({
  consumed,
  target,
  protein,
  proteinTarget,
  carbs,
  carbsTarget,
  fat,
  fatTarget,
  colors,
}: {
  consumed: number;
  target: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  const calPct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const protPct =
    proteinTarget > 0 ? Math.min(protein / proteinTarget, 1) : 0;
  const carbPct = carbsTarget > 0 ? Math.min(carbs / carbsTarget, 1) : 0;
  const fatPct = fatTarget > 0 ? Math.min(fat / fatTarget, 1) : 0;

  const calScore =
    consumed > target && target > 0
      ? Math.max(0, 1 - (consumed - target) / target)
      : calPct;
  const avgScore = (calScore + protPct + carbPct + fatPct) / 4;

  let scoreLabel = t("score_poor");
  let scoreColor = "#ef4444";
  if (avgScore >= 0.8) {
    scoreLabel = t("score_excellent");
    scoreColor = "#22c55e";
  } else if (avgScore >= 0.6) {
    scoreLabel = t("score_good");
    scoreColor = "#84cc16";
  } else if (avgScore >= 0.35) {
    scoreLabel = t("score_fair");
    scoreColor = "#f59e0b";
  }

  const bars = [
    { label: t("cal_abbr"), pct: calPct, color: colors.calorieColor },
    { label: t("protein_abbr"), pct: protPct, color: colors.proteinColor },
    { label: t("carbs_abbr"), pct: carbPct, color: colors.carbsColor },
    { label: t("fat_abbr"), pct: fatPct, color: colors.fatColor },
  ];

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 14,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
            color: colors.mutedForeground,
          }}
        >
          {t("health_score")}
        </Text>
        <View
          style={{
            backgroundColor: scoreColor + "26",
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 3,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontFamily: "Inter_700Bold",
              color: scoreColor,
            }}
          >
            {scoreLabel}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {bars.map(({ label, pct, color }) => (
          <View key={label} style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: "100%",
                height: 6,
                backgroundColor: colors.muted,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${Math.min(Math.round(pct * 100), 100)}%`,
                  height: "100%",
                  backgroundColor: color,
                  borderRadius: 3,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Inter_500Medium",
                color: colors.mutedForeground,
                marginTop: 4,
              }}
            >
              {label} {Math.round(pct * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  actionLabel,
  onAction,
  colors,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontFamily: "Inter_700Bold",
          color: colors.foreground,
        }}
      >
        {title}
      </Text>
      {actionLabel && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
            }}
          >
            {actionLabel} ›
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── BurnedSection ────────────────────────────────────────────────────────────

function BurnedSection({
  activity,
  colors,
  onAddWorkout,
  manualCalories,
}: {
  activity: HealthActivity | null;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onAddWorkout: () => void;
  manualCalories: number;
}) {
  const { t } = useI18n();
  const healthBurned =
    activity?.isAuthorized
      ? (activity.activeCalories ?? 0)
      : 0;
  const burnedTotal = healthBurned + manualCalories;
  const steps = activity?.isAuthorized ? (activity.steps ?? 0) : 0;
  const stepPct = Math.min(steps / STEP_GOAL, 1);

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 18,
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Inter_500Medium",
          color: colors.mutedForeground,
          marginBottom: 2,
        }}
      >
        {t("calories_burned_label")}
      </Text>
      <Text
        style={{
          fontSize: 30,
          fontFamily: "Inter_700Bold",
          color: colors.foreground,
          marginBottom: 14,
        }}
      >
        {burnedTotal}
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
          }}
        >
          {" "}
          kcal
        </Text>
      </Text>

      <View
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginBottom: 14,
        }}
      />

      {/* Walk / steps row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: "#22c55e22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 22 }}>🚶</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              marginBottom: 2,
            }}
          >
            {t("walk_label")}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
            }}
          >
            {steps.toLocaleString()}
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {" "}
              {t("steps_label")}
            </Text>
          </Text>
          <View
            style={{
              height: 4,
              backgroundColor: colors.muted,
              borderRadius: 2,
              overflow: "hidden",
              marginTop: 6,
            }}
          >
            <View
              style={{
                width: `${Math.round(stepPct * 100)}%`,
                height: "100%",
                backgroundColor: "#22c55e",
                borderRadius: 2,
              }}
            />
          </View>
        </View>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
          }}
        >
          {t("step_goal_label")}:{"\n"}{STEP_GOAL.toLocaleString()} {t("steps_label")}
        </Text>
      </View>

      {/* Manual calories row */}
      {manualCalories > 0 && (
        <TouchableOpacity
          onPress={onAddWorkout}
          activeOpacity={0.8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: "#f9731622",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 22 }}>🏋️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: colors.mutedForeground,
                marginBottom: 2,
              }}
            >
              {t("manual_workouts_label")}
            </Text>
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_700Bold",
                color: colors.foreground,
              }}
            >
              {manualCalories}
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                }}
              >
                {" "}kcal
              </Text>
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Add Workout button */}
      <TouchableOpacity
        onPress={onAddWorkout}
        activeOpacity={0.75}
        style={{
          backgroundColor: colors.primary + "18",
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_600SemiBold",
            color: colors.primary,
          }}
        >
          {t("add_workout_btn")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── WaterSection ─────────────────────────────────────────────────────────────

function WaterSection({
  cups,
  totalOz,
  goalOz,
  onIncrement,
  onDecrement,
  readonly,
  colors,
}: {
  cups: number;
  totalOz: number;
  goalOz: number;
  onIncrement: () => void;
  onDecrement: () => void;
  readonly?: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 18,
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
          }}
        >
          {cups === 0 ? "—" : totalOz}
          {cups > 0 && (
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {" "}
              {t("fl_oz_unit")}
            </Text>
          )}
        </Text>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          {readonly && (
            <View style={{
              backgroundColor: colors.muted,
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                Past date
              </Text>
            </View>
          )}
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
            }}
          >
            {t("goal_label")}: {goalOz} {t("fl_oz_unit")}
          </Text>
        </View>
      </View>

      {/* Cup icons row */}
      <View
        style={{ flexDirection: "row", gap: 6, alignItems: "center", opacity: readonly ? 0.55 : 1 }}
      >
        {/* Minus button */}
        <TouchableOpacity
          onPress={readonly ? undefined : onDecrement}
          activeOpacity={readonly ? 1 : 0.7}
          style={{
            width: 32,
            height: 44,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: cups > 0 && !readonly ? "#3b82f6" : colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="remove"
            size={16}
            color={cups > 0 && !readonly ? "#3b82f6" : colors.mutedForeground}
          />
        </TouchableOpacity>

        {/* Cup icons */}
        {Array.from({ length: WATER_CUPS_GOAL }).map((_, i) => {
          const filled = i < cups;
          return (
            <TouchableOpacity
              key={i}
              onPress={readonly ? undefined : (filled ? onDecrement : onIncrement)}
              activeOpacity={readonly ? 1 : 0.7}
              style={{ flex: 1 }}
            >
              <View
                style={{
                  height: 44,
                  borderRadius: 8,
                  backgroundColor: filled ? "#3b82f620" : colors.muted,
                  borderWidth: 1.5,
                  borderColor: filled ? "#3b82f6" : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: filled ? 16 : 12 }}>
                  {filled ? "💧" : ""}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text
        style={{
          fontSize: 11,
          fontFamily: "Inter_400Regular",
          color: colors.mutedForeground,
          textAlign: "center",
          marginTop: 10,
        }}
      >
        {cups} / {WATER_CUPS_GOAL} {t("cups_label")} · {readonly ? "View only" : t("tap_to_add_remove")}
      </Text>
    </View>
  );
}

// ─── cardStyles ───────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  recentPhoto: {
    width: 82,
    height: 82,
    borderRadius: 12,
    flexShrink: 0,
  },
});

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const { t, languageCode } = useI18n();
  const insets = useSafeAreaInsets();
  const { userId, addBurnedCalories, themeMode } = useApp() as {
    userId: string;
    addBurnedCalories: boolean;
    themeMode: string;
  };
  const router = useRouter();
  const queryClient = useQueryClient();
  const systemScheme = useColorScheme();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [healthActivity, setHealthActivity] =
    useState<HealthActivity | null>(null);

  const selectedLocalDate = selectedDate.toLocaleDateString("sv");
  const isViewingToday =
    selectedDate.toDateString() === new Date().toDateString();

  // Background adapts to light/dark mode — soft blue-grey in light mode
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && systemScheme === "dark");
  const screenBg = isDark ? colors.background : "#EDF2F7";

  const intlLocale =
    languageCode === "zh-TW"
      ? "zh-TW"
      : languageCode === "zh-CN"
        ? "zh-CN"
        : "en-US";

  // Water & weight local state
  const water = useWaterTracking(selectedLocalDate);
  const weightTracking = useWeightTracking(
    profile?.weightKg,
    profile?.goalStartDate,
    profile?.goalStartWeightKg,
    userId,
  );

  // Re-read weight history from storage when this tab gains focus so changes
  // logged on the Progress tab are immediately reflected here.
  useFocusEffect(
    useCallback(() => {
      weightTracking.refresh();
    }, [weightTracking.refresh]),
  );

  // Week navigation
  const handleWeekChange = useCallback((newOffset: number) => {
    setWeekOffset(newOffset);
    const now = new Date();
    if (newOffset === 0) {
      setSelectedDate(now);
    } else {
      const mon = new Date(now);
      mon.setDate(
        now.getDate() - ((now.getDay() + 6) % 7) + newOffset * 7,
      );
      setSelectedDate(mon);
    }
  }, []);

  // Week summary for the strip calendar
  const weekMondayStr = (() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(
      now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7,
    );
    mon.setHours(0, 0, 0, 0);
    return mon.toLocaleDateString("sv");
  })();

  const {
    data: today,
    refetch: refetchToday,
    isLoading: todayLoading,
  } = useQuery<TodayData>({
    queryKey: ["today", userId, selectedLocalDate],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/today?userId=${userId}&localDate=${selectedLocalDate}`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: isViewingToday ? 15000 : false,
  });

  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile?userId=${userId}`,
      );
      if (!res.ok) throw new Error("No profile");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: userStats } = useQuery<{
    streakDays: number;
    vitalityScore: number;
  } | null>({
    queryKey: ["userStats", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/user-stats?userId=${userId}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        exists: boolean;
        stats: { streakDays: number; vitalityScore: number } | null;
      };
      return data.stats ?? null;
    },
    enabled: !!userId,
    staleTime: 60000,
  });

  const { data: weekSummary = {} } = useQuery<
    Record<string, { totalCalories: number; count: number }>
  >({
    queryKey: ["weekSummary", userId, weekMondayStr],
    queryFn: async () => {
      const monday = new Date(weekMondayStr);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      });
      const results: Record<
        string,
        { totalCalories: number; count: number }
      > = {};
      await Promise.all(
        days.map(async (d) => {
          const localDate = d.toLocaleDateString("sv");
          try {
            const res = await fetch(
              `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/today?userId=${userId}&localDate=${localDate}`,
            );
            if (res.ok) {
              const data = (await res.json()) as {
                totalCalories: number;
                meals: unknown[];
              };
              results[localDate] = {
                totalCalories: data.totalCalories ?? 0,
                count: data.meals?.length ?? 0,
              };
            }
          } catch { /* ignore */ }
        }),
      );
      return results;
    },
    enabled: !!userId,
    staleTime: 120_000,
  });

  // Fetch stored burned calories for the past 90 days (covers any week the user browses)
  const { data: burnedHistory = [] } = useQuery<
    { date: string; active_energy: number; basal_energy: number; steps: number }[]
  >({
    queryKey: ["burnedHistory", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/calories-burned?user_id=${userId}&days=90`,
      );
      if (!res.ok) return [];
      const data = await res.json() as { success: boolean; rows?: { date: string; active_energy: number; basal_energy: number; steps: number }[] };
      return data.rows ?? [];
    },
    enabled: !!userId,
    staleTime: 300_000,
  });

  // Fetch manual exercise logs for the selected date
  const { data: exerciseLogs = [] } = useQuery<{ id: string; calories: number }[]>({
    queryKey: ["exerciseLogs", userId, selectedLocalDate],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise-logs?user_id=${userId}&date=${selectedLocalDate}`,
      );
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
      // Sync today's HealthKit totals to the backend so past-date history is available
      if (data?.isAuthorized && userId) {
        const today = new Date().toLocaleDateString("sv");
        fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/calories-burned`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            date: today,
            active_energy: data.activeCalories ?? 0,
            basal_energy: data.basalCalories ?? 0,
            steps: data.steps ?? 0,
          }),
        }).catch(() => { /* non-critical */ });
      }
    } catch { /* graceful fallback */ }
  }, [userId]);

  useEffect(() => {
    loadHealthData();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") loadHealthData();
    });
    return () => sub.remove();
  }, [loadHealthData]);

  useFocusEffect(
    useCallback(() => {
      loadHealthData();
      water.refresh();
    }, [loadHealthData, water.refresh]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchToday(), loadHealthData()]);
    setRefreshing(false);
  }, [refetchToday, loadHealthData]);

  const handleDeleteMeal = async (mealId: string) => {
    try {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}?userId=${userId}`,
        { method: "DELETE" },
      );
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

  // Derived values
  const consumed = today?.totalCalories ?? 0;
  const target = profile?.dailyCalorieTarget ?? 2000;
  // Active calories only (from HealthKit) — used for the Budget card "Burned" column.
  // Basal calories are excluded here; they appear only in the Burned section total.
  const activeCals = healthActivity?.isAuthorized
    ? (healthActivity.activeCalories ?? 0)
    : 0;
  // When "Add burned calories" is enabled, active cals are added back to the remaining budget.
  // When disabled, remaining = target − consumed (burned shown as 0 in Budget).
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
      ? {
          startDate: profile.goalStartDate,
          startWeightKg: profile.goalStartWeightKg,
          targetWeightKg: profile.targetWeightKg,
          durationWeeks: profile.goalDurationWeeks,
        }
      : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: screenBg }}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
        paddingBottom: insets.bottom + 100,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.foreground}
        />
      }
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(0)}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        {/* Ask AI pill */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() =>
            router.canGoBack()
              ? router.push("/(tabs)/coach" as never)
              : Alert.alert(
                  "Coming Soon",
                  "AI coaching is coming in a future update.",
                )
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: colors.card,
            borderRadius: 24,
            paddingHorizontal: 16,
            paddingVertical: 9,
            shadowColor: "#000",
            shadowOpacity: 0.07,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <Ionicons
            name="sparkles"
            size={16}
            color={colors.primary}
          />
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              color: colors.foreground,
            }}
          >
            Ask Calories Coach
          </Text>
        </TouchableOpacity>

        {/* Streak badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: "#ff6b0020",
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderWidth: 1,
            borderColor: "#ff6b0030",
          }}
        >
          <Text style={{ fontSize: 15 }}>🔥</Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_700Bold",
              color: "#cc4400",
            }}
          >
            {streak}
          </Text>
        </View>
      </Animated.View>

      {/* ── Week Strip ─────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(40)}>
        <WeekStrip
          colors={colors}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          weekOffset={weekOffset}
          onWeekChange={handleWeekChange}
          dayData={weekSummary}
          calorieTarget={target}
        />
      </Animated.View>

      {/* ── Budget ─────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(80)}
        style={{ paddingHorizontal: CARD_PADDING, marginTop: 16 }}
      >
        <Text
          style={{
            fontSize: 18,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
            marginBottom: 12,
          }}
        >
          {t("budget_section")}
        </Text>
        <BudgetCard
          consumed={consumed}
          target={target}
          burnedCalories={budgetBurned}
          protein={protein}
          proteinTarget={proteinTarget}
          carbs={carbs}
          carbsTarget={carbsTarget}
          fat={fat}
          fatTarget={fatTarget}
          colors={colors}
          onGoalPress={() => router.push("/personal-details" as never)}
        />
        {/* Over-budget banner */}
        {consumed > target + budgetBurned && (
          <View
            style={{
              marginTop: 10,
              backgroundColor: "#ef444420",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ef4444",
              paddingHorizontal: 14,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                fontFamily: "Inter_500Medium",
                color: "#ef4444",
              }}
            >
              {consumed - target - budgetBurned} {t("kcal_over_goal")}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ── Wellness Tip Strip ─────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(110)}
        style={{ paddingHorizontal: CARD_PADDING, marginTop: 12 }}
      >
        <WellnessStrip colors={colors} />
      </Animated.View>

      {/* ── Today's Meals ─────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(150)}
        style={{ paddingHorizontal: CARD_PADDING, marginTop: 22 }}
      >
        <SectionHeader
          title={t("today_meals")}
          actionLabel={t("see_all")}
          onAction={() => router.push("/(tabs)/history" as never)}
          colors={colors}
        />

        {todayLoading ? (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 36,
              alignItems: "center",
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              }}
            >
              {t("loading")}
            </Text>
          </View>
        ) : today?.meals && today.meals.length > 0 ? (
          <View>
            {today.meals
              .slice()
              .reverse()
              .map((meal, i) => (
                <Animated.View
                  key={meal.id}
                  entering={FadeInDown.delay(200 + i * 50)}
                >
                  <RecentMealRow
                    meal={meal}
                    colors={colors}
                    onPress={() =>
                      router.push(`/meal-detail?id=${meal.id}`)
                    }
                    onDelete={handleDeleteMeal}
                  />
                </Animated.View>
              ))}
          </View>
        ) : (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 36,
              alignItems: "center",
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🍽</Text>
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: colors.foreground,
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              {t("no_meals")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                textAlign: "center",
              }}
            >
              {t("no_meals_sub")}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ── Burned ─────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(170)}
        style={{ paddingHorizontal: CARD_PADDING, marginTop: 22 }}
      >
        <SectionHeader
          title={t("burned_section")}
          actionLabel={t("more_label")}
          onAction={() => router.push("/apple-health" as never)}
          colors={colors}
        />
        <BurnedSection
          activity={(() => {
            if (isViewingToday) return healthActivity;
            const stored = burnedHistory.find(r => r.date === selectedLocalDate);
            if (!stored) return null;
            return {
              isAuthorized: true,
              isAvailable: true,
              activeCalories: stored.active_energy,
              basalCalories: stored.basal_energy,
              steps: stored.steps,
              workouts: [],
            };
          })()}
          colors={colors}
          manualCalories={manualExerciseCalories}
          onAddWorkout={() => router.push({
            pathname: "/exercise-log",
            params: { date: selectedLocalDate },
          } as never)}
        />
      </Animated.View>

      {/* ── Water ──────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(190)}
        style={{ paddingHorizontal: CARD_PADDING, marginTop: 22 }}
      >
        <SectionHeader
          title={t("water_section")}
          colors={colors}
        />
        <WaterSection
          cups={water.cups}
          totalOz={water.totalOz}
          goalOz={water.goalOz}
          onIncrement={water.increment}
          onDecrement={water.decrement}
          readonly={!water.isToday}
          colors={colors}
        />
      </Animated.View>

      {/* ── Weight ─────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(210)}
        style={{ paddingHorizontal: CARD_PADDING, marginTop: 22 }}
      >
        <SectionHeader
          title={t("weight_section")}
          actionLabel={t("more_label")}
          onAction={() => router.push("/(tabs)/progress" as never)}
          colors={colors}
        />
        <WeightSection
          history={weightTracking.history}
          currentWeight={weightTracking.currentWeight}
          goalWeight={goalWeight}
          goalPlan={goalPlan}
          initialWeight={profile?.goalStartWeightKg ?? profile?.weightKg}
          onLogWeight={weightTracking.logWeight}
          colors={colors}
        />
      </Animated.View>
    </ScrollView>
  );
}
