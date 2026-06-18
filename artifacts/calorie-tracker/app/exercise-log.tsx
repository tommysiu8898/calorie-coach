import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import { useApp } from "@/context/AppContext";
import rawExercises from "@/assets/exercises.json";

interface ExerciseEntry {
  id: string;
  name: string;
  nameZhTW: string;
  nameZhCN: string;
  met: number;
  category: "cardio" | "strength" | "sports" | "mind_body" | "daily";
}

interface ExerciseLog {
  id: string;
  date: string;
  exerciseName: string;
  exerciseNameZh: string | null;
  durationMinutes: number;
  calories: number;
  metUsed: number | null;
  intensity: string;
  source: string;
}

type AddStep = "pick" | "configure";
type Intensity = "light" | "moderate" | "intense";
type Category = "all" | "cardio" | "strength" | "sports" | "mind_body" | "daily";

const exercises = rawExercises as ExerciseEntry[];

const INTENSITY_MULTIPLIER: Record<Intensity, number> = {
  light: 0.8,
  moderate: 1.0,
  intense: 1.25,
};

const CATEGORIES: Category[] = ["all", "cardio", "strength", "sports", "mind_body", "daily"];

const CATEGORY_EMOJI: Record<Category, string> = {
  all: "🏆",
  cardio: "🏃",
  strength: "💪",
  sports: "⚽",
  mind_body: "🧘",
  daily: "🏠",
};

export default function ExerciseLogScreen() {
  const colors = useColors();
  const { t, languageCode } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useApp();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{ date?: string }>();
  const todayStr = new Date().toLocaleDateString("sv");
  const date = params.date ?? todayStr;
  const isToday = date === todayStr;

  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("pick");
  const [showAIModal, setShowAIModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");

  const [selectedExercise, setSelectedExercise] = useState<ExerciseEntry | null>(null);
  const [aiExerciseName, setAiExerciseName] = useState("");
  const [aiMet, setAiMet] = useState(5.0);
  const [durationStr, setDurationStr] = useState("30");
  const [intensity, setIntensity] = useState<Intensity>("moderate");

  const [aiText, setAIText] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: profileData } = useQuery<{ weightKg?: number }>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile?userId=${userId}`,
      );
      if (!res.ok) throw new Error("no profile");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 300_000,
  });
  const userWeightKg = profileData?.weightKg ?? 70;

  const { data: logs = [], isLoading, isError, refetch } = useQuery<ExerciseLog[]>({
    queryKey: ["exerciseLogs", userId, date],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise-logs?user_id=${userId}&date=${date}`,
      );
      if (!res.ok) return [];
      const data = await res.json() as { success: boolean; logs?: ExerciseLog[] };
      return data.logs ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const durationMinutes = parseInt(durationStr, 10) || 0;
  const effectiveMet = selectedExercise?.met ?? aiMet;
  const estimatedCalories =
    durationMinutes > 0
      ? Math.round(effectiveMet * INTENSITY_MULTIPLIER[intensity] * userWeightKg * (durationMinutes / 60))
      : 0;

  function getExerciseName(ex: ExerciseEntry): string {
    if (languageCode === "zh-TW") return ex.nameZhTW;
    if (languageCode === "zh-CN") return ex.nameZhCN;
    return ex.name;
  }

  const filteredExercises = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return exercises.filter((ex) => {
      const matchesCat = selectedCategory === "all" || ex.category === selectedCategory;
      if (!q) return matchesCat;
      return (
        matchesCat &&
        (ex.name.toLowerCase().includes(q) ||
          ex.nameZhTW.includes(q) ||
          ex.nameZhCN.includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  const displayExerciseName = selectedExercise
    ? getExerciseName(selectedExercise)
    : aiExerciseName;
  const canSave =
    durationMinutes > 0 && (selectedExercise !== null || aiExerciseName.trim() !== "");

  const addMutation = useMutation({
    mutationFn: async () => {
      const exerciseName = selectedExercise?.name ?? aiExerciseName;
      const exerciseNameZh = selectedExercise
        ? languageCode === "zh-TW"
          ? selectedExercise.nameZhTW
          : selectedExercise.nameZhCN
        : undefined;
      const source = selectedExercise ? "manual" : "ai";

      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise-logs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            date,
            exerciseName,
            exerciseNameZh,
            durationMinutes,
            calories: estimatedCalories,
            metUsed: effectiveMet,
            intensity,
            source,
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exerciseLogs", userId] });
      setShowAddModal(false);
      resetAddForm();
      Alert.alert("✓", t("exercise_saved"), [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: () => {
      Alert.alert("", t("exercise_log_error"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise-logs/${id}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        },
      );
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exerciseLogs", userId] });
    },
    onError: () => {
      Alert.alert("", t("exercise_log_error"));
    },
  });

  function resetAddForm() {
    setAddStep("pick");
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedExercise(null);
    setAiExerciseName("");
    setAiMet(5.0);
    setDurationStr("30");
    setIntensity("moderate");
    setAIText("");
  }

  function handleSelectExercise(ex: ExerciseEntry) {
    setSelectedExercise(ex);
    setAiExerciseName("");
    setAiMet(ex.met);
    setAddStep("configure");
  }

  function handleDelete(id: string, name: string) {
    Alert.alert(name, t("delete_exercise_confirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => deleteMutation.mutate(id),
      },
    ]);
  }

  async function handleAIEstimate() {
    if (!aiText.trim()) return;
    setAILoading(true);
    try {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/exercise/estimate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: aiText.trim(),
            weightKg: userWeightKg,
            appLanguage: languageCode,
          }),
        },
      );
      const data = await res.json() as {
        success: boolean;
        exerciseType?: string;
        durationMinutes?: number;
        met?: number;
      };
      if (data.success) {
        setAiExerciseName(data.exerciseType ?? "");
        setSelectedExercise(null);
        setAiMet(data.met ?? 5.0);
        setDurationStr(String(data.durationMinutes ?? 30));
        setShowAIModal(false);
        setAIText("");
        setAddStep("configure");
      } else {
        Alert.alert("", t("exercise_log_error"));
      }
    } catch {
      Alert.alert("", t("exercise_log_error"));
    } finally {
      setAILoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const totalCals = logs.reduce((s, l) => s + (l.calories ?? 0), 0);

  const formattedDate = isToday
    ? t("today_label")
    : new Date(date + "T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

  const intensityOptions: Intensity[] = ["light", "moderate", "intense"];
  const intensityLabel: Record<Intensity, string> = {
    light: t("intensity_light"),
    moderate: t("intensity_moderate"),
    intense: t("intensity_intense"),
  };
  const categoryLabel: Record<Category, string> = {
    all: t("category_all"),
    cardio: t("category_cardio"),
    strength: t("category_strength"),
    sports: t("category_sports"),
    mind_body: t("category_mind_body"),
    daily: t("category_daily"),
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Screen Header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 14,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text
            style={{
              fontSize: 20,
              fontFamily: "Inter_700Bold",
              color: colors.foreground,
            }}
          >
            {t("exercise_log_title")}
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              marginTop: 1,
            }}
          >
            {formattedDate}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            resetAddForm();
            setShowAddModal(true);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Log List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.foreground}
          />
        }
      >
        {logs.length > 0 && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 28 }}>🏋️</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_500Medium",
                  color: colors.mutedForeground,
                }}
              >
                {t("calories_burned_label")}
              </Text>
              <Text
                style={{
                  fontSize: 24,
                  fontFamily: "Inter_700Bold",
                  color: colors.foreground,
                }}
              >
                {totalCals}
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
            </View>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {logs.length}{" "}
              {logs.length === 1
                ? t("exercise_count_one")
                : t("exercise_count_other")}
            </Text>
          </View>
        )}

        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                textAlign: "center",
              }}
            >
              {t("exercise_log_error")}
            </Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🏃</Text>
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: colors.foreground,
                marginBottom: 6,
              }}
            >
              {t("exercise_log_empty")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
              }}
            >
              {t("exercise_log_empty_sub")}
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            {logs.map((log, index) => (
              <View
                key={log.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth:
                    index < logs.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor:
                      log.source === "ai" ? "#8b5cf620" : "#f9731620",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>
                    {log.source === "ai" ? "✦" : "🔥"}
                  </Text>
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
                        fontSize: 15,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.foreground,
                      }}
                    >
                      {(languageCode === "zh-TW" || languageCode === "zh-CN") && log.exerciseNameZh
                        ? log.exerciseNameZh
                        : log.exerciseName}
                    </Text>
                    {log.source === "ai" && (
                      <View
                        style={{
                          backgroundColor: "#8b5cf620",
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: "Inter_500Medium",
                            color: "#8b5cf6",
                          }}
                        >
                          AI
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "Inter_400Regular",
                      color: colors.mutedForeground,
                      marginTop: 2,
                    }}
                  >
                    {log.durationMinutes} {t("exercise_mins_label")} ·{" "}
                    {t(`intensity_${log.intensity}`) || log.intensity}
                  </Text>
                </View>
                <View
                  style={{ alignItems: "flex-end", marginRight: 12 }}
                >
                  <Text
                    style={{
                      fontSize: 16,
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
                <TouchableOpacity
                  onPress={() => handleDelete(
                    log.id,
                    (languageCode === "zh-TW" || languageCode === "zh-CN") && log.exerciseNameZh
                      ? log.exerciseNameZh
                      : log.exerciseName,
                  )}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={() => {
            resetAddForm();
            setShowAddModal(true);
          }}
          activeOpacity={0.75}
          style={{
            marginTop: 20,
            backgroundColor: colors.primary + "18",
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={colors.primary}
          />
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Inter_600SemiBold",
              color: colors.primary,
            }}
          >
            {t("add_exercise_btn")}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Add Exercise Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal Header */}
          <View
            style={{
              paddingTop: 20,
              paddingBottom: 14,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}
          >
            {addStep === "configure" ? (
              <TouchableOpacity
                onPress={() => setAddStep("pick")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="chevron-back"
                  size={24}
                  color={colors.foreground}
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Inter_400Regular",
                    color: colors.mutedForeground,
                  }}
                >
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
            )}
            <Text
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 17,
                fontFamily: "Inter_600SemiBold",
                color: colors.foreground,
              }}
            >
              {addStep === "pick"
                ? t("pick_exercise_title")
                : t("add_exercise_title")}
            </Text>
            {addStep === "configure" ? (
              <TouchableOpacity
                onPress={() => addMutation.mutate()}
                disabled={addMutation.isPending || !canSave}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Inter_600SemiBold",
                    color:
                      addMutation.isPending || !canSave
                        ? colors.mutedForeground
                        : colors.primary,
                  }}
                >
                  {addMutation.isPending ? "…" : t("save_exercise_btn")}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setShowAIModal(true)}
                style={{ paddingLeft: 8 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Inter_500Medium",
                    color: colors.primary,
                  }}
                >
                  ✦ {t("ai_estimate_title")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Pick Step */}
          {addStep === "pick" && (
            <View style={{ flex: 1 }}>
              {/* Search bar */}
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Ionicons
                    name="search"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t("search_exercise_placeholder")}
                    placeholderTextColor={colors.mutedForeground}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontFamily: "Inter_400Regular",
                      color: colors.foreground,
                    }}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Category chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: 10,
                  gap: 8,
                }}
              >
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor:
                        selectedCategory === cat
                          ? colors.primary
                          : colors.card,
                      borderWidth: 1,
                      borderColor:
                        selectedCategory === cat
                          ? colors.primary
                          : colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{CATEGORY_EMOJI[cat]}</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_500Medium",
                        color:
                          selectedCategory === cat ? "#fff" : colors.foreground,
                      }}
                    >
                      {categoryLabel[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Exercise list */}
              <FlatList
                data={filteredExercises}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: 40,
                }}
                ListEmptyComponent={
                  <View
                    style={{ alignItems: "center", paddingVertical: 40 }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                      }}
                    >
                      {t("exercise_log_empty")}
                    </Text>
                  </View>
                }
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    onPress={() => handleSelectExercise(item)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 13,
                      paddingHorizontal: 4,
                      borderBottomWidth:
                        index < filteredExercises.length - 1
                          ? StyleSheet.hairlineWidth
                          : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontFamily: "Inter_500Medium",
                          color: colors.foreground,
                        }}
                      >
                        {getExerciseName(item)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "Inter_400Regular",
                          color: colors.mutedForeground,
                          marginTop: 2,
                        }}
                      >
                        MET {item.met} · {categoryLabel[item.category]}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Configure Step */}
          {addStep === "configure" && (
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* Selected exercise chip */}
                <View
                  style={{
                    backgroundColor: colors.primary + "18",
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 26 }}>🏋️</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.primary,
                      }}
                    >
                      {displayExerciseName || t("select_exercise_first")}
                    </Text>
                    {selectedExercise && (
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_400Regular",
                          color: colors.mutedForeground,
                          marginTop: 2,
                        }}
                      >
                        MET {selectedExercise.met}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setAddStep("pick")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_500Medium",
                        color: colors.primary,
                      }}
                    >
                      {t("change_label")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Duration */}
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_500Medium",
                    color: colors.mutedForeground,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {t("duration_minutes_label")}
                </Text>
                <TextInput
                  value={durationStr}
                  onChangeText={setDurationStr}
                  placeholder="30"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 20,
                    fontFamily: "Inter_600SemiBold",
                    color: colors.foreground,
                    marginBottom: 24,
                  }}
                />

                {/* Intensity chips */}
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_500Medium",
                    color: colors.mutedForeground,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {t("intensity_label")}
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}
                >
                  {intensityOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setIntensity(opt)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          intensity === opt ? colors.primary : colors.card,
                        borderWidth: 1,
                        borderColor:
                          intensity === opt ? colors.primary : colors.border,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: "Inter_600SemiBold",
                          color:
                            intensity === opt ? "#fff" : colors.foreground,
                        }}
                      >
                        {intensityLabel[opt]}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "Inter_400Regular",
                          color:
                            intensity === opt
                              ? "rgba(255,255,255,0.75)"
                              : colors.mutedForeground,
                          marginTop: 2,
                        }}
                      >
                        ×{INTENSITY_MULTIPLIER[opt].toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Live calorie preview */}
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 20,
                    alignItems: "center",
                    marginBottom: 24,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "Inter_500Medium",
                      color: colors.mutedForeground,
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("met_preview_label")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 46,
                      fontFamily: "Inter_700Bold",
                      color: colors.primary,
                      lineHeight: 54,
                    }}
                  >
                    {estimatedCalories}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Inter_400Regular",
                      color: colors.mutedForeground,
                    }}
                  >
                    kcal
                  </Text>
                  {durationMinutes > 0 && (
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                        marginTop: 6,
                        textAlign: "center",
                      }}
                    >
                      {`MET ${effectiveMet} × ${INTENSITY_MULTIPLIER[intensity]} × ${userWeightKg.toFixed(0)}kg × ${(durationMinutes / 60).toFixed(2)}h`}
                    </Text>
                  )}
                </View>

                {/* AI Estimate button */}
                <TouchableOpacity
                  onPress={() => setShowAIModal(true)}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.primary,
                    borderRadius: 12,
                    paddingVertical: 13,
                    alignItems: "center",
                    marginBottom: 16,
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>✦</Text>
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: "Inter_600SemiBold",
                      color: colors.primary,
                    }}
                  >
                    {t("ai_estimate_title")}
                  </Text>
                </TouchableOpacity>

                {/* Save button */}
                <TouchableOpacity
                  onPress={() => addMutation.mutate()}
                  disabled={addMutation.isPending || !canSave}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor:
                      addMutation.isPending || !canSave
                        ? colors.muted
                        : colors.primary,
                    borderRadius: 14,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  {addMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: "Inter_700Bold",
                        color: "#fff",
                      }}
                    >
                      {t("save_exercise_btn")}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </View>

        {/* ── AI Estimate nested modal ─────────────────────────────────────────── */}
        <Modal
          visible={showAIModal}
          animationType="slide"
          presentationStyle="formSheet"
          onRequestClose={() => setShowAIModal(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <View
                style={{
                  paddingTop: 20,
                  paddingBottom: 14,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                }}
              >
                <TouchableOpacity onPress={() => setShowAIModal(false)}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontFamily: "Inter_400Regular",
                      color: colors.mutedForeground,
                    }}
                  >
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
                <Text
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 17,
                    fontFamily: "Inter_600SemiBold",
                    color: colors.foreground,
                  }}
                >
                  ✦ {t("ai_estimate_title")}
                </Text>
                <TouchableOpacity
                  onPress={handleAIEstimate}
                  disabled={aiLoading || !aiText.trim()}
                >
                  {aiLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: "Inter_600SemiBold",
                        color: !aiText.trim()
                          ? colors.mutedForeground
                          : colors.primary,
                      }}
                    >
                      {t("estimate_btn")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ padding: 20 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Inter_400Regular",
                    color: colors.mutedForeground,
                    marginBottom: 14,
                    lineHeight: 20,
                  }}
                >
                  {t("ai_describe_hint")}
                </Text>
                <TextInput
                  value={aiText}
                  onChangeText={setAIText}
                  placeholder={t("ai_describe_placeholder")}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    fontFamily: "Inter_400Regular",
                    color: colors.foreground,
                    minHeight: 110,
                    textAlignVertical: "top",
                  }}
                  autoFocus
                />
                {aiLoading && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 14,
                    }}
                  >
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                      }}
                    >
                      {t("ai_estimating")}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Modal>
    </View>
  );
}
