import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Rect } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import { useApp } from "@/context/AppContext";
import {
  isHealthConnected,
  isHealthKitAvailable,
  getTodayHealthActivity,
  getWeeklyActiveCalories,
  getTodaySleepHours,
  getTodayHeartRate,
  type HealthActivity,
  type Workout,
} from "@/lib/health";

function StatCard({
  emoji,
  label,
  value,
  unit,
  color,
  colors,
}: {
  emoji: string;
  label: string;
  value: number | null;
  unit: string;
  color: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: color + "20",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>
        {value !== null ? value.toLocaleString() : "—"}
      </Text>
      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
        {value !== null ? unit : ""}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Inter_500Medium",
          color: colors.mutedForeground,
          marginTop: 4,
          textAlign: "center",
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

function WeeklyChart({
  data,
  colors,
}: {
  data: Array<{ date: string; value: number }>;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const CHART_HEIGHT = 120;
  const BAR_COUNT = data.length;
  const [chartWidth, setChartWidth] = React.useState(280);
  const barWidth = Math.floor((chartWidth - (BAR_COUNT - 1) * 6) / BAR_COUNT);

  const dayLabels = t("day_letters").split(",");
  const todayStr = new Date().toLocaleDateString("sv");

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        paddingRight: Platform.OS === "web" ? 80 : 16,
        marginHorizontal: 20,
        marginTop: 16,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontFamily: "Inter_600SemiBold",
          color: colors.mutedForeground,
          marginBottom: 14,
        }}
      >
        {t("health_weekly_chart")}
      </Text>
      <View
        style={{ flexDirection: "column", gap: 8 }}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
      >
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          {data.map((d, i) => {
            const barH = maxVal > 0 ? Math.max(4, Math.round((d.value / maxVal) * CHART_HEIGHT)) : 4;
            const x = i * (barWidth + 6);
            const y = CHART_HEIGHT - barH;
            const isToday = d.date === todayStr;
            return (
              <Rect
                key={d.date}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={5}
                fill={isToday ? "#f97316" : colors.foreground + "55"}
              />
            );
          })}
        </Svg>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {data.map((d, i) => {
            const dayIdx = new Date(d.date + "T12:00:00").getDay();
            const isToday = d.date === todayStr;
            return (
              <View key={d.date} style={{ width: barWidth, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 9,
                    fontFamily: "Inter_500Medium",
                    color: isToday ? "#f97316" : colors.mutedForeground,
                  }}
                >
                  {dayLabels[dayIdx]}
                </Text>
                {d.value > 0 && (
                  <Text
                    style={{
                      fontSize: 8,
                      fontFamily: "Inter_400Regular",
                      color: colors.mutedForeground,
                    }}
                  >
                    {d.value}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function WorkoutRow({
  workout,
  colors,
}: {
  workout: Workout;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#8b5cf620",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 18 }}>🏋️</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
          {workout.name}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
          {workout.durationMinutes} {t("health_workout_mins")}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>
        {workout.calories}
      </Text>
      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
        kcal
      </Text>
    </View>
  );
}

interface ExerciseLogItem {
  id: string;
  exerciseName: string;
  exerciseNameZh: string | null;
  durationMinutes: number;
  calories: number;
  intensity: string;
  source: string;
}

export default function HealthScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useApp();

  const [healthActivity, setHealthActivity] = useState<HealthActivity | null>(null);
  const [weeklyData, setWeeklyData] = useState<Array<{ date: string; value: number }>>([]);
  const [sleepHours, setSleepHours] = useState<number>(0);
  const [heartRate, setHeartRate] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toLocaleDateString("sv");

  const { data: exerciseLogs = [], refetch: refetchExerciseLogs } = useQuery<ExerciseLogItem[]>({
    queryKey: ["exerciseLogs", userId, today],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise-logs?user_id=${userId}&date=${today}`,
      );
      if (!res.ok) return [];
      const data = await res.json() as { success: boolean; logs?: ExerciseLogItem[] };
      return data.logs ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const persistSnapshot = useCallback(
    async (activity: HealthActivity) => {
      if (!userId || !activity.isAuthorized) return;
      try {
        const todayStr = new Date().toLocaleDateString("sv");
        await fetch(
          `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/calories-burned`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              date: todayStr,
              active_energy: activity.activeCalories,
              basal_energy: activity.basalCalories,
            }),
          },
        );
      } catch {
        // fire-and-forget; non-fatal
      }
    },
    [userId],
  );

  const loadData = useCallback(async () => {
    const connected = await isHealthConnected();
    setIsConnected(connected);

    const activity = await getTodayHealthActivity();
    setHealthActivity(activity);

    if (activity.isAuthorized) {
      const [weekly, sleep, hr] = await Promise.all([
        getWeeklyActiveCalories(),
        getTodaySleepHours(),
        getTodayHeartRate(),
      ]);
      setWeeklyData(weekly);
      setSleepHours(sleep);
      setHeartRate(hr);
      persistSnapshot(activity);
    }
  }, [persistSnapshot]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refetchExerciseLogs()]);
    setRefreshing(false);
  }, [loadData, refetchExerciseLogs]);

  const activeCalories = healthActivity?.activeCalories ?? 0;
  const basalCalories = healthActivity?.basalCalories ?? 0;
  const totalBurned = activeCalories + basalCalories;
  const workouts = healthActivity?.workouts ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
        paddingBottom: insets.bottom + 100,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />
      }
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          marginBottom: 20,
        }}
      >
        <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground }}>
          {t("health_title")}
        </Text>
      </View>

      <>
          {/* Connect Apple Health banner — shown only when available but not yet connected */}
          {isHealthKitAvailable() && !isConnected && (
            <TouchableOpacity
              onPress={() => router.push("/apple-health" as never)}
              activeOpacity={0.8}
              style={{
                marginHorizontal: 20,
                marginBottom: 16,
                backgroundColor: "#22c55e18",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#22c55e33",
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 22 }}>❤️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>
                  {t("health_connect_btn")}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                  {t("health_connect_in_settings_sub")}
                </Text>
              </View>
              <Text style={{ fontSize: 16, color: colors.mutedForeground }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Today's Activity section header */}
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_600SemiBold",
              color: colors.mutedForeground,
              paddingHorizontal: 20,
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {t("activity_card_title")}
          </Text>

          {/* Activity stat cards (row 1) */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20 }}>
            <StatCard
              emoji="🔥"
              label={t("health_active_cal")}
              value={isConnected ? activeCalories : null}
              unit="kcal"
              color="#f97316"
              colors={colors}
            />
            <StatCard
              emoji="💤"
              label={t("health_basal_cal")}
              value={isConnected ? basalCalories : null}
              unit="kcal"
              color="#6366f1"
              colors={colors}
            />
            <StatCard
              emoji="⚡"
              label={t("health_total_burned")}
              value={isConnected ? totalBurned : null}
              unit="kcal"
              color="#22c55e"
              colors={colors}
            />
          </View>

          {/* Sleep & Heart Rate (row 2) */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 10 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#6366f120",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 22 }}>🌙</Text>
              </View>
              {!isConnected ? (
                <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>—</Text>
              ) : sleepHours > 0 ? (
                <>
                  <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                    {sleepHours}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                    {t("health_sleep_hours")}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                  {t("health_no_sleep_data")}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "Inter_500Medium",
                  color: colors.mutedForeground,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {t("health_sleep")}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#ef444420",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 22 }}>❤️</Text>
              </View>
              {!isConnected ? (
                <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>—</Text>
              ) : heartRate > 0 ? (
                <>
                  <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                    {heartRate}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                    {t("health_heart_rate_unit")}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
                  {t("health_no_hr_data")}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "Inter_500Medium",
                  color: colors.mutedForeground,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {t("health_heart_rate")}
              </Text>
            </View>
          </View>

          {/* Combined Workouts section */}
          {(() => {
            const combinedCount = workouts.length + exerciseLogs.length;
            const isEmpty = combinedCount === 0;
            return (
              <View
                style={{
                  marginHorizontal: 20,
                  marginTop: 20,
                  backgroundColor: colors.card,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 4,
                }}
              >
                {/* Section header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.mutedForeground,
                      }}
                    >
                      {t("health_recent_workouts")}
                    </Text>
                    {combinedCount > 0 && (
                      <View
                        style={{
                          backgroundColor: colors.primary + "20",
                          borderRadius: 10,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: "Inter_600SemiBold",
                            color: colors.primary,
                          }}
                        >
                          {combinedCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/exercise-log",
                        params: { date: today },
                      } as never)
                    }
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_500Medium",
                        color: colors.primary,
                      }}
                    >
                      {t("add_exercise_btn")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isEmpty ? (
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Inter_400Regular",
                      color: colors.mutedForeground,
                      paddingVertical: 16,
                      textAlign: "center",
                    }}
                  >
                    {t("health_no_workouts")}
                  </Text>
                ) : (
                  <>
                    {/* HealthKit workouts */}
                    {workouts.map((w) => (
                      <WorkoutRow key={w.id} workout={w} colors={colors} />
                    ))}

                    {/* Manual exercise logs */}
                    {exerciseLogs.map((log, index) => {
                      const isLastItem =
                        workouts.length === 0 &&
                        index === exerciseLogs.length - 1;
                      return (
                        <View
                          key={log.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 12,
                            borderBottomWidth: isLastItem
                              ? 0
                              : StyleSheet.hairlineWidth,
                            borderBottomColor: colors.border,
                            gap: 12,
                          }}
                        >
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 20,
                              backgroundColor: "#f9731620",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ fontSize: 18 }}>🔥</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontFamily: "Inter_600SemiBold",
                                  color: colors.foreground,
                                }}
                              >
                                {log.exerciseName}
                              </Text>
                              <View
                                style={{
                                  backgroundColor: "#f9731615",
                                  borderRadius: 6,
                                  paddingHorizontal: 5,
                                  paddingVertical: 2,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontFamily: "Inter_500Medium",
                                    color: "#f97316",
                                  }}
                                >
                                  {t("manual_badge")}
                                </Text>
                              </View>
                            </View>
                            <Text
                              style={{
                                fontSize: 12,
                                fontFamily: "Inter_400Regular",
                                color: colors.mutedForeground,
                                marginTop: 2,
                              }}
                            >
                              {log.durationMinutes} {t("exercise_mins_label")}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 14,
                              fontFamily: "Inter_700Bold",
                              color: colors.foreground,
                            }}
                          >
                            {log.calories}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: "Inter_400Regular",
                              color: colors.mutedForeground,
                            }}
                          >
                            kcal
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            );
          })()}

          {/* Weekly chart — appears last, after workouts */}
          <WeeklyChart
            data={isConnected && weeklyData.length > 0 ? weeklyData : Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              return { date: d.toLocaleDateString("sv"), value: 0 };
            })}
            colors={colors}
          />
      </>
    </ScrollView>
  );
}
