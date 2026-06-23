import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import Animated, {
  FadeInRight,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

const ONBOARDING_DRAFT_KEY = "@calorie_tracker/onboardingDraft";

type StepId = "gender" | "age" | "height" | "weight" | "duration" | "goal" | "activity" | "confirm";
const STEPS: StepId[] = ["gender", "age", "height", "weight", "duration", "goal", "activity", "confirm"];

const STEP_EMOJIS: Record<StepId, string> = {
  gender: "🧬", age: "🎂", height: "📏", weight: "⚖️",
  duration: "📅", goal: "🎯", activity: "🏃", confirm: "🎉",
};

const GOAL_EMOJIS: Record<string, string> = {
  lose: "📉", maintain: "⚖️", gain: "💪",
};

const ACTIVITY_EMOJIS: Record<string, string> = {
  sedentary: "🛋️", light: "🚶", moderate: "🏋️", active: "🚴", very_active: "⚡",
};

const DURATION_WEEKS = [4, 8, 12, 16, 20] as const;

interface DraftState {
  stepIndex: number;
  gender: "male" | "female";
  birthYear: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  goalDurationWeeks: number;
  goal: string;
  activity: string;
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};

function calculateDailyTargets(params: {
  gender: string; birthYear: string; heightCm: string; weightKg: string; goal: string; activity: string;
}) {
  const { gender, birthYear, heightCm, weightKg, goal, activity } = params;
  const age = Math.max(1, new Date().getFullYear() - (parseInt(birthYear, 10) || 1990));
  const h = parseFloat(heightCm) || 170;
  const w = parseFloat(weightKg) || 70;
  const bmr = gender === "male" ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161;
  const tdee = bmr * (ACTIVITY_MULTIPLIERS[activity] ?? 1.55);
  let calories = tdee;
  if (goal === "lose") calories = tdee - 500;
  else if (goal === "gain") calories = tdee + 300;
  calories = Math.round(Math.max(1200, calories));
  const proteinG = Math.round(w * 1.8);
  const fatG = Math.round((calories * 0.28) / 9);
  const carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  return { calories, proteinG: Math.max(0, proteinG), carbsG: Math.max(0, carbsG), fatG: Math.max(0, fatG) };
}

type Colors = ReturnType<typeof import("@/hooks/useColors").useColors>;

// ─── Animated progress bar ───────────────────────────────────────────────────
function ProgressBar({ progress, colors }: { progress: number; colors: Colors }) {
  const width = useSharedValue(progress);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 350, easing: Easing.out(Easing.quad) });
  }, [progress]);

  const animStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as `${number}%`,
  }));

  return (
    <View style={{ flex: 1, height: 5, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
      <Animated.View
        style={[{ height: "100%", backgroundColor: colors.foreground, borderRadius: 3 }, animStyle]}
      />
    </View>
  );
}

// ─── Large numeric input ──────────────────────────────────────────────────────
function BigNumericInput({
  value,
  onChangeText,
  unit,
  placeholder,
  label,
  colors,
  maxLength,
}: {
  value: string;
  onChangeText: (v: string) => void;
  unit: string;
  placeholder: string;
  label?: string;
  colors: Colors;
  maxLength?: number;
}) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      {label && (
        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 }}>
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: colors.border,
          borderRadius: 20,
          paddingHorizontal: 28,
          paddingVertical: 20,
          gap: 6,
          minWidth: 180,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          maxLength={maxLength}
          style={{
            fontSize: 48,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
            textAlign: "center",
            minWidth: 100,
            padding: 0,
          }}
        />
        <Text style={{ fontSize: 20, fontFamily: "Inter_500Medium", color: colors.mutedForeground, paddingBottom: 6 }}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

// ─── Step icon header ─────────────────────────────────────────────────────────
function StepHeader({ emoji, title, subtitle, colors }: { emoji: string; title: string; subtitle: string; colors: Colors }) {
  return (
    <View style={{ alignItems: "center", marginBottom: 32 }}>
      <Animated.View entering={FadeInUp.duration(280)}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 40 }}>{emoji}</Text>
        </View>
      </Animated.View>
      <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>
        {subtitle}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, setHasProfile } = useApp();
  const { t } = useI18n();

  const [stepIndex, setStepIndex] = useState(0);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [birthYear, setBirthYear] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [goalDurationWeeks, setGoalDurationWeeks] = useState(12);
  const [goal, setGoal] = useState("lose");
  const [activity, setActivity] = useState("moderate");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const STEP_META: Record<StepId, { emoji: string; title: string; subtitle: string }> = {
    gender:   { emoji: STEP_EMOJIS.gender,   title: t("onb_gender_title"),   subtitle: t("onb_gender_sub") },
    age:      { emoji: STEP_EMOJIS.age,      title: t("onb_age_title"),      subtitle: t("onb_age_sub") },
    height:   { emoji: STEP_EMOJIS.height,   title: t("onb_height_title"),   subtitle: t("onb_height_sub") },
    weight:   { emoji: STEP_EMOJIS.weight,   title: t("onb_weight_title"),   subtitle: t("onb_weight_sub") },
    duration: { emoji: STEP_EMOJIS.duration, title: t("onb_duration_title"), subtitle: t("onb_duration_sub") },
    goal:     { emoji: STEP_EMOJIS.goal,     title: t("onb_goal_title"),     subtitle: t("onb_goal_sub") },
    activity: { emoji: STEP_EMOJIS.activity, title: t("onb_activity_title"), subtitle: t("onb_activity_sub") },
    confirm:  { emoji: STEP_EMOJIS.confirm,  title: t("onb_confirm_title"),  subtitle: t("onb_confirm_sub") },
  };

  const GOALS = [
    { id: "lose",     emoji: GOAL_EMOJIS.lose,     label: t("goal_lose"),     sub: t("goal_lose_sub") },
    { id: "maintain", emoji: GOAL_EMOJIS.maintain,  label: t("goal_maintain"), sub: t("goal_maintain_sub") },
    { id: "gain",     emoji: GOAL_EMOJIS.gain,      label: t("goal_gain"),     sub: t("goal_gain_sub") },
  ];

  const ACTIVITIES = [
    { id: "sedentary",   emoji: ACTIVITY_EMOJIS.sedentary,   label: t("activity_sedentary"),   sub: t("activity_sedentary_sub") },
    { id: "light",       emoji: ACTIVITY_EMOJIS.light,       label: t("activity_light"),       sub: t("activity_light_sub") },
    { id: "moderate",    emoji: ACTIVITY_EMOJIS.moderate,    label: t("activity_moderate"),    sub: t("activity_moderate_sub") },
    { id: "active",      emoji: ACTIVITY_EMOJIS.active,      label: t("activity_active"),      sub: t("activity_active_sub") },
    { id: "very_active", emoji: ACTIVITY_EMOJIS.very_active, label: t("activity_very_active"), sub: t("activity_very_active_sub") },
  ];

  const DURATION_OPTIONS = DURATION_WEEKS.map((weeks) => ({
    weeks,
    label: t("dur_weeks_label").replace("{n}", String(weeks)),
    sub: t(`dur_${weeks}w_sub`),
  }));

  const step = STEPS[stepIndex] ?? "gender";
  const meta = STEP_META[step];
  const progress = (stepIndex + 1) / STEPS.length;

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DRAFT_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const draft: DraftState = JSON.parse(raw);
            setStepIndex(draft.stepIndex ?? 0);
            setGender(draft.gender ?? "male");
            setBirthYear(draft.birthYear ?? "");
            setHeightCm(draft.heightCm ?? "");
            setWeightKg(draft.weightKg ?? "");
            setTargetWeightKg(draft.targetWeightKg ?? "");
            setGoalDurationWeeks(draft.goalDurationWeeks ?? 12);
            setGoal(draft.goal ?? "lose");
            setActivity(draft.activity ?? "moderate");
          } catch { /* ignore corrupted draft */ }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const draft: DraftState = { stepIndex, gender, birthYear, heightCm, weightKg, targetWeightKg, goalDurationWeeks, goal, activity };
    AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [loaded, stepIndex, gender, birthYear, heightCm, weightKg, targetWeightKg, goalDurationWeeks, goal, activity]);

  function goNext() { if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1); }
  function goPrev() { if (stepIndex > 0) setStepIndex(stepIndex - 1); }

  async function handleSubmit() {
    if (!userId) return;
    setIsSubmitting(true);
    try {
      const birthday = `${birthYear}-01-01`;
      const parsedWeight = parseFloat(weightKg) || 70;
      const goalStartDate = new Date().toLocaleDateString("sv");
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, gender, birthday,
          heightCm: parseFloat(heightCm) || 170,
          weightKg: parsedWeight,
          targetWeightKg: parseFloat(targetWeightKg) || 65,
          goal, activityLevel: activity,
          goalStartDate,
          goalStartWeightKg: parsedWeight,
          goalDurationWeeks,
        }),
      });
      if (res.ok) {
        await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
        await setHasProfile(true);
        router.replace("/(tabs)");
      } else {
        const err = (await res.json()) as { error?: string };
        Alert.alert("Error", err.error ?? "Failed to save profile. Please try again.");
      }
    } catch {
      Alert.alert("Network error", "Could not save your profile. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!loaded) return null;

  const ctaLabel = step !== "confirm" ? t("onb_continue") : isSubmitting ? t("onb_setting_up") : t("onb_start_tracking");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>

      {/* ── Top bar: back + progress ── */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}>
        {stepIndex > 0 ? (
          <TouchableOpacity
            onPress={goPrev}
            activeOpacity={0.7}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <ProgressBar progress={progress} colors={colors} />
        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, minWidth: 32, textAlign: "right" }}>
          {stepIndex + 1}/{STEPS.length}
        </Text>
      </View>

      {/* ── Step content ── */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInRight.duration(220)} key={step}>

            {/* Step icon + title */}
            <StepHeader emoji={meta.emoji} title={meta.title} subtitle={meta.subtitle} colors={colors} />

            {/* Gender */}
            {step === "gender" && (
              <View style={{ flexDirection: "row", gap: 14 }}>
                {(["male", "female"] as const).map((g) => {
                  const active = gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      onPress={() => setGender(g)}
                      activeOpacity={0.85}
                      style={{
                        flex: 1,
                        aspectRatio: 0.9,
                        borderRadius: 24,
                        borderWidth: 2.5,
                        borderColor: active ? colors.foreground : colors.border,
                        backgroundColor: active ? colors.foreground : colors.card,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 12,
                      }}
                    >
                      <Text style={{ fontSize: 52 }}>{g === "male" ? "♂" : "♀"}</Text>
                      <Text style={{
                        fontSize: 17,
                        fontFamily: "Inter_600SemiBold",
                        color: active ? colors.primaryForeground : colors.foreground,
                      }}>
                        {g === "male" ? t("pd_male") : t("pd_female")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Age */}
            {step === "age" && (
              <BigNumericInput
                value={birthYear}
                onChangeText={(v) => setBirthYear(v.replace(/[^0-9]/g, "").slice(0, 4))}
                unit="yr"
                placeholder="1990"
                colors={colors}
                maxLength={4}
              />
            )}

            {/* Height */}
            {step === "height" && (
              <BigNumericInput
                value={heightCm}
                onChangeText={(v) => setHeightCm(v.replace(/[^0-9.]/g, ""))}
                unit="cm"
                placeholder="170"
                colors={colors}
              />
            )}

            {/* Weight */}
            {step === "weight" && (
              <View style={{ gap: 20 }}>
                <BigNumericInput
                  value={weightKg}
                  onChangeText={(v) => setWeightKg(v.replace(/[^0-9.]/g, ""))}
                  unit="kg"
                  placeholder="70"
                  label={t("onb_current_weight_label")}
                  colors={colors}
                />
                <BigNumericInput
                  value={targetWeightKg}
                  onChangeText={(v) => setTargetWeightKg(v.replace(/[^0-9.]/g, ""))}
                  unit="kg"
                  placeholder="65"
                  label={t("onb_target_weight_label")}
                  colors={colors}
                />
              </View>
            )}

            {/* Duration */}
            {step === "duration" && (
              <View style={{ gap: 10 }}>
                {DURATION_OPTIONS.map((opt) => {
                  const active = goalDurationWeeks === opt.weeks;
                  return (
                    <TouchableOpacity
                      key={opt.weeks}
                      onPress={() => setGoalDurationWeeks(opt.weeks)}
                      activeOpacity={0.85}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 18,
                        borderRadius: 20,
                        borderWidth: 2.5,
                        borderColor: active ? colors.foreground : colors.border,
                        backgroundColor: active ? colors.foreground : colors.card,
                      }}
                    >
                      <View>
                        <Text style={{
                          fontSize: 16,
                          fontFamily: "Inter_600SemiBold",
                          color: active ? colors.primaryForeground : colors.foreground,
                        }}>{opt.label}</Text>
                        <Text style={{
                          fontSize: 13,
                          fontFamily: "Inter_400Regular",
                          color: active ? colors.primaryForeground : colors.mutedForeground,
                          opacity: active ? 0.85 : 1,
                          marginTop: 2,
                        }}>{opt.sub}</Text>
                      </View>
                      {active && (
                        <View style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: colors.primaryForeground,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <Ionicons name="checkmark" size={15} color={colors.foreground} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {/* Daily delta hint */}
                {weightKg && targetWeightKg && (
                  <View style={{
                    marginTop: 6,
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: colors.muted,
                    alignItems: "center",
                  }}>
                    {(() => {
                      const delta = (parseFloat(targetWeightKg) - parseFloat(weightKg)) / (goalDurationWeeks * 7);
                      const absDelta = Math.abs(delta);
                      const dir = delta < 0 ? "lose" : delta > 0 ? "gain" : null;
                      if (!dir) return (
                        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                          {t("onb_at_target")}
                        </Text>
                      );
                      return (
                        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" }}>
                          {dir === "lose" ? "📉" : "📈"} {absDelta.toFixed(2)} kg/day to {dir} weight in {goalDurationWeeks} weeks
                        </Text>
                      );
                    })()}
                  </View>
                )}
              </View>
            )}

            {/* Goal */}
            {step === "goal" && (
              <View style={{ gap: 12 }}>
                {GOALS.map((g) => {
                  const active = goal === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => setGoal(g.id)}
                      activeOpacity={0.85}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 16,
                        padding: 18,
                        borderRadius: 20,
                        borderWidth: 2.5,
                        borderColor: active ? colors.foreground : colors.border,
                        backgroundColor: active ? colors.foreground : colors.card,
                      }}
                    >
                      <Text style={{ fontSize: 30 }}>{g.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 16,
                          fontFamily: "Inter_600SemiBold",
                          color: active ? colors.primaryForeground : colors.foreground,
                        }}>{g.label}</Text>
                        <Text style={{
                          fontSize: 13,
                          fontFamily: "Inter_400Regular",
                          color: active ? colors.primaryForeground : colors.mutedForeground,
                          opacity: active ? 0.8 : 1,
                          marginTop: 2,
                        }}>{g.sub}</Text>
                      </View>
                      {active && (
                        <View style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: colors.primaryForeground,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <Ionicons name="checkmark" size={15} color={colors.foreground} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Activity */}
            {step === "activity" && (
              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  overflow: "hidden",
                }}
              >
                {ACTIVITIES.map((a, i) => {
                  const active = activity === a.id;
                  const isLast = i === ACTIVITIES.length - 1;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => setActivity(a.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 15,
                        paddingHorizontal: 18,
                        gap: 14,
                        borderBottomWidth: isLast ? 0 : 0.5,
                        borderBottomColor: colors.border,
                        backgroundColor: active ? colors.muted : "transparent",
                      }}
                    >
                      <Text style={{ fontSize: 24, width: 32, textAlign: "center" }}>{a.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 15,
                          fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                          color: colors.foreground,
                        }}>{a.label}</Text>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>
                          {a.sub}
                        </Text>
                      </View>
                      <View style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: active ? colors.foreground : colors.border,
                        backgroundColor: active ? colors.foreground : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        {active && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primaryForeground }} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Confirm */}
            {step === "confirm" && (
              <ConfirmStep
                gender={gender}
                birthYear={birthYear}
                heightCm={heightCm}
                weightKg={weightKg}
                targetWeightKg={targetWeightKg}
                goalDurationWeeks={goalDurationWeeks}
                goal={goal}
                activity={activity}
                colors={colors}
              />
            )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Sticky CTA ── */}
      <View style={{
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 24),
        borderTopWidth: 0.5,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}>
        <TouchableOpacity
          onPress={step !== "confirm" ? goNext : handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.foreground,
            borderRadius: 18,
            paddingVertical: 17,
            alignItems: "center",
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontSize: 17, fontFamily: "Inter_700Bold" }}>
            {ctaLabel}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Confirm step ─────────────────────────────────────────────────────────────
function ConfirmStep({
  gender, birthYear, heightCm, weightKg, targetWeightKg, goalDurationWeeks, goal, activity, colors,
}: {
  gender: string; birthYear: string; heightCm: string; weightKg: string;
  targetWeightKg: string; goalDurationWeeks: number; goal: string; activity: string; colors: Colors;
}) {
  const { t } = useI18n();
  const goalLabel = t(`goal_${goal}`) || goal;
  const actLabel = t(`activity_${activity}`) || activity;
  const targets = calculateDailyTargets({ gender, birthYear, heightCm, weightKg, goal, activity });

  const profileRows = [
    { label: t("pd_gender"),          value: gender === "male" ? t("pd_male") : t("pd_female"),           emoji: "🧬" },
    { label: t("pd_birth_year"),      value: birthYear,                                                    emoji: "🎂" },
    { label: t("pd_height"),          value: `${heightCm} cm`,                                            emoji: "📏" },
    { label: t("pd_current_weight"),  value: `${weightKg} → ${targetWeightKg} kg`,                       emoji: "⚖️" },
    { label: t("onb_plan_duration"),  value: t("dur_weeks_label").replace("{n}", String(goalDurationWeeks)), emoji: "📅" },
    { label: t("goal_label"),         value: goalLabel,                                                    emoji: "🎯" },
    { label: t("activity_label"),     value: actLabel,                                                     emoji: "🏃" },
  ];

  const macroRows = [
    { label: t("calories"),  value: `${targets.calories} kcal`, color: colors.foreground },
    { label: t("protein"),   value: `${targets.proteinG} g`,    color: colors.proteinColor },
    { label: t("carbs"),     value: `${targets.carbsG} g`,      color: colors.carbsColor },
    { label: t("fat"),       value: `${targets.fatG} g`,        color: colors.fatColor },
  ];

  return (
    <View style={{ gap: 16 }}>
      {/* Profile summary card */}
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: colors.border,
        overflow: "hidden",
      }}>
        {profileRows.map(({ label, value, emoji }, i) => (
          <View
            key={label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 13,
              paddingHorizontal: 18,
              gap: 12,
              borderBottomWidth: i === profileRows.length - 1 ? 0 : 0.5,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, width: 26, textAlign: "center" }}>{emoji}</Text>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
              {label}
            </Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* Daily targets card */}
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: colors.border,
        overflow: "hidden",
      }}>
        <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.5 }}>
            {t("nutrition_targets_title").toUpperCase()}
          </Text>
        </View>
        {macroRows.map(({ label, value, color }, i) => (
          <View
            key={label}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 13,
              paddingHorizontal: 18,
              borderTopWidth: i === 0 ? 0.5 : 0.5,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              {label}
            </Text>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color }}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
