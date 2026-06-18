import React, { useState, useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Alert,
  TextInput,
  Dimensions,
} from "react-native";
import Svg, { Circle, Polyline, Line as SvgLine, Text as SvgText } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import { Ionicons } from "@expo/vector-icons";

export const WEIGHT_HISTORY_KEY = "@calorie_tracker/home_weight_history";

const OLD_SEED_WEIGHTS = [85, 83.5, 82.8, 82];

export interface WeightEntry {
  date: string;
  weight: number;
  loggedAt?: string;
}

type Colors = ReturnType<typeof useColors>;

function mergeWeightEntries(
  local: WeightEntry[],
  server: WeightEntry[],
): WeightEntry[] {
  const byDate = new Map<string, WeightEntry>();
  for (const e of server) byDate.set(e.date, e);
  for (const e of local) {
    const existing = byDate.get(e.date);
    if (!existing) {
      byDate.set(e.date, e);
    } else {
      const serverTs = existing.loggedAt ? new Date(existing.loggedAt).getTime() : 0;
      const localTs = e.loggedAt ? new Date(e.loggedAt).getTime() : 0;
      if (localTs >= serverTs) {
        byDate.set(e.date, e);
      }
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function useWeightTracking(
  profileWeightKg?: number,
  goalStartDate?: string | null,
  goalStartWeightKg?: number | null,
  userId?: string | null,
) {
  const [history, setHistory] = useState<WeightEntry[]>([]);

  const loadFromStorage = useCallback(async () => {
    const val = await AsyncStorage.getItem(WEIGHT_HISTORY_KEY);
    let local: WeightEntry[] = [];
    if (val) {
      try {
        const parsed = JSON.parse(val) as WeightEntry[];
        if (parsed.length > 0) {
          const isOldSeed =
            parsed.length === OLD_SEED_WEIGHTS.length &&
            parsed.every((e, i) => e.weight === OLD_SEED_WEIGHTS[i]);
          if (isOldSeed) {
            await AsyncStorage.removeItem(WEIGHT_HISTORY_KEY);
          } else {
            local = parsed;
          }
        }
      } catch { }
    }

    let server: WeightEntry[] = [];
    if (userId) {
      try {
        const today = new Date().toLocaleDateString("sv");
        const url = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/weight?userId=${encodeURIComponent(userId)}&days=365&localDate=${today}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            server = data.map((d: { date: string; weightKg: number; createdAt?: string }) => ({
              date: d.date,
              weight: d.weightKg,
              loggedAt: d.createdAt,
            }));
          }
        }
      } catch { }
    }

    if (local.length > 0 || server.length > 0) {
      const merged = mergeWeightEntries(local, server);
      setHistory(merged);
      await AsyncStorage.setItem(WEIGHT_HISTORY_KEY, JSON.stringify(merged));
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadFromStorage();
    }, [loadFromStorage]),
  );

  useEffect(() => {
    if (profileWeightKg == null || profileWeightKg <= 0) return;
    setHistory((prev) => {
      if (prev.length > 0) return prev;
      const seedDate = goalStartDate ?? new Date().toLocaleDateString("sv");
      const seedWeight = goalStartWeightKg && goalStartWeightKg > 0 ? goalStartWeightKg : profileWeightKg;
      const seeded: WeightEntry[] = [{ date: seedDate, weight: seedWeight }];
      AsyncStorage.setItem(WEIGHT_HISTORY_KEY, JSON.stringify(seeded));
      return seeded;
    });
  }, [profileWeightKg, goalStartDate, goalStartWeightKg]);

  const currentWeight =
    history.length > 0 ? history[history.length - 1].weight : (profileWeightKg ?? 0);

  const logWeight = useCallback(
    async (weight: number) => {
      const today = new Date().toLocaleDateString("sv");
      const nowIso = new Date().toISOString();
      const updated = [
        ...history.filter((e) => e.date !== today),
        { date: today, weight, loggedAt: nowIso },
      ].sort((a, b) => a.date.localeCompare(b.date));
      setHistory(updated);
      await AsyncStorage.setItem(WEIGHT_HISTORY_KEY, JSON.stringify(updated));

      if (userId) {
        try {
          await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/weight`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, weightKg: weight, date: today }),
          });
        } catch { }
      }
    },
    [history, userId],
  );

  return { history, currentWeight, logWeight, refresh: loadFromStorage };
}

function WeightChart({
  history,
  goalWeight,
  goalPlan,
  viewMode,
  colors,
}: {
  history: WeightEntry[];
  goalWeight: number;
  goalPlan?: { startDate: string; startWeightKg: number; targetWeightKg: number; durationWeeks: number } | null;
  viewMode: "week" | "month";
  colors: Colors;
}) {
  const { width: SCREEN_WIDTH } = Dimensions.get("window");
  const chartWidth = SCREEN_WIDTH - 76;
  const chartHeight = 110;

  const todayMs = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const pastCutoffMs = (() => { const d = new Date(); d.setDate(d.getDate() - (viewMode === "week" ? 7 : 30)); d.setHours(0, 0, 0, 0); return d.getTime(); })();

  const planStartMs = goalPlan ? new Date(goalPlan.startDate + "T00:00:00").getTime() : null;
  const planEndMs = planStartMs != null && goalPlan ? planStartMs + goalPlan.durationWeeks * 7 * 86400000 : null;
  const hasPlanLine = planStartMs != null && planEndMs != null && planStartMs < planEndMs;

  const windowStartMs = hasPlanLine && planStartMs != null ? Math.min(planStartMs, pastCutoffMs) : pastCutoffMs;
  const windowEndMs = hasPlanLine && planEndMs != null ? Math.max(planEndMs, todayMs) : todayMs;
  const windowMs = windowEndMs - windowStartMs || 1;

  const filtered = history.filter((e) => new Date(e.date + "T12:00:00").getTime() >= windowStartMs);

  if (filtered.length < 2 && !hasPlanLine) {
    return (
      <View style={{ height: chartHeight, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>
          Log weight on multiple days to see your progress chart
        </Text>
      </View>
    );
  }

  const weights = filtered.map((e) => e.weight);
  const allVals: number[] = [...weights];
  if (goalPlan) {
    allVals.push(goalPlan.startWeightKg, goalPlan.targetWeightKg);
  } else {
    allVals.push(goalWeight);
  }
  if (allVals.length === 0) allVals.push(goalWeight);
  const minW = Math.min(...allVals) - 1;
  const maxW = Math.max(...allVals) + 1;
  const range = maxW - minW || 1;

  const toX = (ms: number) =>
    4 + Math.max(0, Math.min(1, (ms - windowStartMs) / windowMs)) * (chartWidth - 8);
  const toY = (w: number) =>
    chartHeight - 4 - ((w - minW) / range) * (chartHeight - 8);

  const pointsStr = filtered.length >= 2
    ? filtered.map((e) => `${toX(new Date(e.date + "T12:00:00").getTime())},${toY(e.weight)}`).join(" ")
    : "";

  const planX1 = hasPlanLine ? toX(planStartMs!) : null;
  const planY1 = hasPlanLine ? toY(goalPlan!.startWeightKg) : null;
  const planX2 = hasPlanLine ? toX(planEndMs!) : null;
  const planY2 = hasPlanLine ? toY(goalPlan!.targetWeightKg) : null;

  const todayX = toX(todayMs);

  return (
    <Svg width={chartWidth} height={chartHeight} style={{ marginTop: 10 }}>
      {hasPlanLine && planX1 != null && planY1 != null && planX2 != null && planY2 != null ? (
        <SvgLine
          x1={planX1} y1={planY1}
          x2={planX2} y2={planY2}
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="5,4"
        />
      ) : (
        <SvgLine
          x1={0} y1={toY(goalWeight)}
          x2={chartWidth} y2={toY(goalWeight)}
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="5,4"
        />
      )}

      {hasPlanLine && planX1 != null && planY1 != null && (
        <>
          <Circle cx={planX1} cy={planY1} r={4} fill="#3b82f6" stroke={colors.card} strokeWidth={1.5} />
          <SvgText
            x={planX1 + 6}
            y={planY1 - 5}
            fontSize={9}
            fontWeight="600"
            fill="#3b82f6"
            textAnchor="start"
          >
            {goalPlan!.startWeightKg} kg
          </SvgText>
        </>
      )}

      {hasPlanLine && planX2 != null && planY2 != null && (
        <>
          <Circle cx={planX2} cy={planY2} r={4} fill="#3b82f6" stroke={colors.card} strokeWidth={1.5} />
          <SvgText
            x={planX2 - 6}
            y={planY2 - 5}
            fontSize={9}
            fontWeight="600"
            fill="#3b82f6"
            textAnchor="end"
          >
            {goalPlan!.targetWeightKg} kg
          </SvgText>
        </>
      )}

      {hasPlanLine && (
        <SvgLine
          x1={todayX} y1={4}
          x2={todayX} y2={chartHeight - 4}
          stroke={colors.mutedForeground}
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.4}
        />
      )}

      {filtered.length >= 2 && (
        <Polyline
          points={pointsStr}
          fill="none"
          stroke={colors.calorieColor ?? "#f97316"}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {filtered.map((e) => (
        <Circle
          key={e.date}
          cx={toX(new Date(e.date + "T12:00:00").getTime())}
          cy={toY(e.weight)}
          r={4}
          fill={colors.card}
          stroke={colors.calorieColor ?? "#f97316"}
          strokeWidth={2}
        />
      ))}
    </Svg>
  );
}

export function WeightSection({
  history,
  currentWeight,
  goalWeight,
  goalPlan,
  initialWeight,
  onLogWeight,
  colors,
}: {
  history: WeightEntry[];
  currentWeight: number;
  goalWeight: number;
  goalPlan?: { startDate: string; startWeightKg: number; targetWeightKg: number; durationWeeks: number } | null;
  initialWeight?: number;
  onLogWeight: (w: number) => void;
  colors: Colors;
}) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [showInput, setShowInput] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const diff = currentWeight - goalWeight;
  const isAtGoal = Math.abs(diff) < 0.1;

  const handleUpdate = () => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        t("update_weight_title"),
        t("enter_weight_kg_prompt"),
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("save"),
            onPress: (val: string | undefined) => {
              const num = parseFloat(val ?? "");
              if (!isNaN(num) && num > 0) onLogWeight(num);
            },
          },
        ],
        "plain-text",
        String(currentWeight),
        "decimal-pad",
      );
    } else {
      setInputVal(String(currentWeight));
      setShowInput(true);
    }
  };

  const confirmAndroid = () => {
    const num = parseFloat(inputVal);
    if (!isNaN(num) && num > 0) {
      onLogWeight(num);
    }
    setShowInput(false);
  };

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
          alignItems: "flex-start",
          marginBottom: 6,
        }}
      >
        <View>
          <Text
            style={{
              fontSize: 12,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              marginBottom: 2,
            }}
          >
            {t("current_weight_label")}
          </Text>
          <Text
            style={{
              fontSize: 30,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
            }}
          >
            {currentWeight}
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {" "}
              {t("kg_unit")}
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleUpdate}
          activeOpacity={0.75}
          style={{
            backgroundColor: colors.primary + "18",
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 8,
            marginTop: 4,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_600SemiBold",
              color: colors.primary,
            }}
          >
            {t("update_weight_btn")}
          </Text>
        </TouchableOpacity>
      </View>

      {initialWeight != null && Math.abs(initialWeight - currentWeight) > 0.05 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <View style={{
            backgroundColor: "#3b82f610",
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#3b82f6" }}>
              Started: {initialWeight} kg
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>→ now</Text>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 16, marginBottom: 14 }}>
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
          }}
        >
          {t("goal_weight_label")}:{" "}
          <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
            {goalWeight} {t("kg_unit")}
          </Text>
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
          }}
        >
          {isAtGoal
            ? t("at_goal_celebrate")
            : diff > 0
              ? `${t("to_lose_label")}: ${diff.toFixed(1)} ${t("kg_unit")}`
              : `${t("to_gain_label")}: ${Math.abs(diff).toFixed(1)} ${t("kg_unit")}`}
        </Text>
      </View>

      {showInput && (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 14,
            alignItems: "center",
          }}
        >
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 16,
              fontFamily: "Inter_400Regular",
              color: colors.foreground,
              backgroundColor: colors.muted,
            }}
            value={inputVal}
            onChangeText={setInputVal}
            keyboardType="decimal-pad"
            placeholder={t("weight_in_kg_placeholder")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          <TouchableOpacity
            onPress={confirmAndroid}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 9,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
              }}
            >
              {t("save")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowInput(false)}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          gap: 8,
          marginBottom: 4,
        }}
      >
        {(["week", "month"] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setViewMode(mode)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor:
                viewMode === mode ? colors.primary : colors.muted,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
                color:
                  viewMode === mode ? "#fff" : colors.mutedForeground,
              }}
            >
              {mode === "week" ? "Week" : "Month"}
            </Text>
          </TouchableOpacity>
        ))}
        <Text
          style={{
            fontSize: 11,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            alignSelf: "center",
            marginLeft: "auto",
          }}
        >
          {goalPlan
            ? `— Plan: ${goalPlan.startWeightKg} → ${goalPlan.targetWeightKg} kg`
            : `— Goal: ${goalWeight} kg`}
        </Text>
      </View>

      <WeightChart
        history={history}
        goalWeight={goalWeight}
        goalPlan={goalPlan}
        viewMode={viewMode}
        colors={colors}
      />

      {goalPlan && (() => {
        const now = Date.now();
        const startMs = new Date(goalPlan.startDate + "T00:00:00").getTime();
        const totalDays = goalPlan.durationWeeks * 7;
        const daysElapsed = Math.max(0, Math.floor((now - startMs) / 86400000));
        const daysRemaining = Math.max(0, totalDays - daysElapsed);
        const currentWeek = Math.min(Math.floor(daysElapsed / 7) + 1, goalPlan.durationWeeks);
        const isComplete = daysRemaining === 0;

        const totalDelta = goalPlan.startWeightKg - goalPlan.targetWeightKg;
        const lost = goalPlan.startWeightKg - currentWeight;
        const weightPct =
          Math.abs(totalDelta) < 0.01
            ? 100
            : Math.min(100, Math.max(0, Math.round((lost / totalDelta) * 100)));

        return (
          <View
            style={{
              marginTop: 14,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {isComplete ? "🎯 Goal period complete" : `Week ${currentWeek} of ${goalPlan.durationWeeks}`}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {isComplete ? "Goal reached!" : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`}
              </Text>
            </View>

            <View style={{ gap: 4 }}>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.muted,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: 6,
                    width: `${weightPct}%`,
                    borderRadius: 3,
                    backgroundColor: weightPct >= 100 ? "#22c55e" : colors.primary,
                  }}
                />
              </View>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "right" }}>
                {weightPct}% progress
              </Text>
            </View>
          </View>
        );
      })()}
    </View>
  );
}
