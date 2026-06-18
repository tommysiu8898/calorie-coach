import React, { useState, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  AppState,
  type AppStateStatus,
  Platform,
  Linking,
  Image,
} from "react-native";

import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import LanguageModal, { LANGUAGES, type Language } from "@/components/LanguageModal";
import { isHealthKitAvailable, refreshHealthConnection } from "@/lib/health";

const safeOpenSettings = () => {
  if (typeof Linking.openSettings === "function") {
    Linking.openSettings().catch(() => {});
  } else {
    Linking.openURL("app-settings:").catch(() => {});
  }
};

interface Profile {
  userId: string;
  gender: string;
  birthday: string;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  goal: string;
  activityLevel: string;
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbsTarget: number;
  dailyFatTarget: number;
  goalStartDate?: string | null;
  goalStartWeightKg?: number | null;
  goalDurationWeeks?: number | null;
}

interface TodayData {
  streak: number;
}

interface AnalysisData {
  mealName?: string;
  totalCalories?: number;
  totalProteinG?: number;
  totalCarbsG?: number;
  totalFatG?: number;
}

interface StoredUploadMeta {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

const GOALS: Record<string, string> = {
  lose: "Lose weight",
  maintain: "Maintain weight",
  gain: "Gain muscle",
};

const ACTIVITIES: Record<string, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  active: "Very active",
  very_active: "Super active",
};

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};

function recalcTargets(
  profile: Profile,
  goal: string,
  activity: string,
  targetWeightKg?: number,
  durationWeeks?: number,
) {
  const age = Math.max(1, new Date().getFullYear() - (parseInt(profile.birthday?.slice(0, 4) ?? "1990", 10) || 1990));
  const w = profile.weightKg;
  const h = profile.heightCm;
  const bmr = profile.gender === "male" ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161;
  const tdee = bmr * (ACTIVITY_MULTIPLIERS[activity] ?? 1.55);

  // Duration-based deficit/surplus (mirrors API logic)
  let calorieAdj = goal === "lose" ? -500 : goal === "gain" ? 300 : 0;
  const targetW = targetWeightKg ?? profile.targetWeightKg;
  if (goal === "lose" && durationWeeks && targetW < w) {
    const deficit = Math.round((w - targetW) * 7700 / (durationWeeks * 7));
    calorieAdj = -Math.max(250, Math.min(1000, deficit));
  } else if (goal === "gain" && durationWeeks && targetW > w) {
    const surplus = Math.round((targetW - w) * 7700 / (durationWeeks * 7));
    calorieAdj = Math.max(100, Math.min(500, surplus));
  }
  const calories = Math.round(Math.max(1200, tdee + calorieAdj));

  // Body-weight protein: higher on a cut to preserve muscle
  const proteinMultiplier = goal === "lose" ? 2.0 : goal === "gain" ? 1.8 : 1.6;
  const proteinG = Math.round(w * proteinMultiplier);

  // Fat: 25% for lose/maintain, 22% for gain
  const fatPct = goal === "gain" ? 0.22 : 0.25;
  const fatG = Math.round((calories * fatPct) / 9);

  // Carbs: fill remaining, min 50 g
  const carbsG = Math.round(Math.max(50, (calories - proteinG * 4 - fatG * 9) / 4));

  return { dailyCalorieTarget: calories, dailyProteinTarget: Math.max(0, proteinG), dailyCarbsTarget: Math.max(0, carbsG), dailyFatTarget: Math.max(0, fatG) };
}

// -- TestAI Section (hidden, tap version 5×) --
function TestAISection({ userId, colors }: { userId: string; colors: AppColors }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<{ objectKey: string; publicUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      setResult(null); setAnalysisData(null); setUploadMeta(null); setLogged(false);
    }
  }

  async function analyze() {
    if (!imageUri) return;
    setLoading(true); setResult(null); setUploadMeta(null);
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    try {
      const urlRes = await fetch(`https://${domain}/api/storage/upload-url`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fileName: "test-photo.jpg", contentType: "image/jpeg" }),
      });
      const storedMeta: StoredUploadMeta | null = urlRes.ok ? (await urlRes.json()) as StoredUploadMeta : null;
      const imgFetch = await fetch(imageUri);
      const blob = await imgFetch.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const [, analysisRes] = await Promise.all([
        storedMeta ? fetch(storedMeta.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob }).catch(() => null) : Promise.resolve(null),
        fetch(`https://${domain}/api/analyze-food`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, userId }) }),
      ]);
      const data = await analysisRes.json() as AnalysisData;
      setResult(storedMeta ? JSON.stringify({ _upload: { objectKey: storedMeta.objectKey, publicUrl: storedMeta.publicUrl }, ...data }, null, 2) : JSON.stringify(data, null, 2));
      setAnalysisData(data);
      if (storedMeta) setUploadMeta({ objectKey: storedMeta.objectKey, publicUrl: storedMeta.publicUrl });
      setLogged(false);
    } catch (e: unknown) { setResult("Error: " + (e instanceof Error ? e.message : "Unknown")); }
    finally { setLoading(false); }
  }

  async function logMeal() {
    if (!analysisData) return;
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    try {
      const res = await fetch(`https://${domain}/api/meals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, photoUrl: uploadMeta?.publicUrl ?? null, aiResponse: analysisData, totalCalories: Math.round(analysisData.totalCalories ?? 0), totalProteinG: analysisData.totalProteinG ?? 0, totalCarbsG: analysisData.totalCarbsG ?? 0, totalFatG: analysisData.totalFatG ?? 0, mealName: analysisData.mealName ?? "Test meal", localHour: new Date().getHours(), localDate: new Date().toLocaleDateString("sv") }),
      });
      if (res.ok) { setLogged(true); Alert.alert("Logged!", "Meal saved to database"); }
      else Alert.alert("Error", `HTTP ${res.status}`);
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Unknown"); }
  }

  return (
    <View style={{ backgroundColor: "#111", borderRadius: 12, padding: 16, marginTop: 8 }}>
      <Text style={{ color: "#00c46a", fontWeight: "700", fontSize: 14, marginBottom: 12, fontFamily: "Inter_700Bold" }}>TestAI Pipeline</Text>
      <TouchableOpacity style={{ backgroundColor: "#1e2d24", padding: 12, borderRadius: 8, marginBottom: 12 }} onPress={pickImage}>
        <Text style={{ color: "#fff", textAlign: "center", fontFamily: "Inter_500Medium" }}>Select Image</Text>
      </TouchableOpacity>
      {imageUri && (
        <TouchableOpacity style={{ backgroundColor: "#00c46a", padding: 12, borderRadius: 8, marginBottom: 12, opacity: loading ? 0.6 : 1 }} onPress={analyze} disabled={loading}>
          <Text style={{ color: "#000", textAlign: "center", fontWeight: "700", fontFamily: "Inter_700Bold" }}>{loading ? "Uploading + Analyzing..." : "Analyze Food"}</Text>
        </TouchableOpacity>
      )}
      {result && (
        <>
          <ScrollView style={{ backgroundColor: "#0a0f0d", borderRadius: 8, padding: 10, maxHeight: 300, marginBottom: 12 }} showsVerticalScrollIndicator>
            <Text style={{ color: "#86efac", fontSize: 11, fontFamily: "Inter_400Regular" }}>{result}</Text>
          </ScrollView>
          {analysisData && !logged && (
            <TouchableOpacity style={{ backgroundColor: "#3b82f6", padding: 12, borderRadius: 8 }} onPress={logMeal}>
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "700", fontFamily: "Inter_700Bold" }}>Log Meal to DB</Text>
            </TouchableOpacity>
          )}
          {logged && <Text style={{ color: "#00c46a", textAlign: "center", fontFamily: "Inter_500Medium" }}>Meal logged!</Text>}
        </>
      )}
    </View>
  );
}

// Settings row component
function SettingsRow({
  label,
  icon,
  value,
  onPress,
  colors,
  last,
  valueColor,
  destructive,
}: {
  label: string;
  icon?: string;
  value?: string;
  onPress?: () => void;
  colors: AppColors;
  last?: boolean;
  valueColor?: string;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {icon && <Ionicons name={icon as "home"} size={18} color={destructive ? colors.destructive : colors.mutedForeground} />}
        <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: destructive ? colors.destructive : colors.foreground }}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {value ? (
          <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: valueColor ?? colors.mutedForeground }}>
            {value}
          </Text>
        ) : null}
        {onPress && !destructive && <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />}
      </View>
    </TouchableOpacity>
  );
}

function SectionCard({ children, colors }: { children: React.ReactNode; colors: AppColors }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      {children}
    </View>
  );
}

function SectionHeader({ label, colors }: { label: string; colors: AppColors }) {
  return (
    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, marginTop: 24, paddingHorizontal: 4, letterSpacing: 0.5 }}>
      {label.toUpperCase()}
    </Text>
  );
}

// Goal editor — inline expandable
function GoalEditorSection({ profile, colors, onSaved }: { profile: Profile; colors: AppColors; onSaved: () => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [goal, setGoal] = useState(profile.goal);
  const [activity, setActivity] = useState(profile.activityLevel);
  const [editTargetWeight, setEditTargetWeight] = useState(String(profile.targetWeightKg));
  const [editStartWeight, setEditStartWeight] = useState(
    String(profile.goalStartWeightKg ?? profile.weightKg)
  );
  const [editDurationWeeks, setEditDurationWeeks] = useState(
    profile.goalDurationWeeks ?? 12
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setGoal(profile.goal);
    setActivity(profile.activityLevel);
    setEditTargetWeight(String(profile.targetWeightKg));
    setEditStartWeight(String(profile.goalStartWeightKg ?? profile.weightKg));
    setEditDurationWeeks(profile.goalDurationWeeks ?? 12);
  }, [profile.goal, profile.activityLevel, profile.targetWeightKg, profile.goalStartWeightKg, profile.weightKg, profile.goalDurationWeeks]);

  const resolvedTarget = parseFloat(editTargetWeight) || profile.targetWeightKg;
  const resolvedStart = parseFloat(editStartWeight) || (profile.goalStartWeightKg ?? profile.weightKg);

  const isDirty =
    goal !== profile.goal ||
    activity !== profile.activityLevel ||
    resolvedTarget !== profile.targetWeightKg ||
    resolvedStart !== (profile.goalStartWeightKg ?? profile.weightKg) ||
    editDurationWeeks !== (profile.goalDurationWeeks ?? 12);

  const dailyDeltaKg =
    editDurationWeeks > 0
      ? (resolvedTarget - resolvedStart) / (editDurationWeeks * 7)
      : 0;

  async function save() {
    setSaving(true);
    try {
      const newTargets = recalcTargets(profile, goal, activity, resolvedTarget, editDurationWeeks);
      const today = new Date().toLocaleDateString("sv");
      await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile.userId,
          gender: profile.gender,
          birthday: profile.birthday,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          targetWeightKg: resolvedTarget,
          goal,
          activityLevel: activity,
          goalStartDate: today,
          goalStartWeightKg: resolvedStart,
          goalDurationWeeks: editDurationWeeks,
          ...newTargets,
        }),
      });
      onSaved();
      setExpanded(false);
    } catch { Alert.alert("Error", "Could not save. Please try again."); }
    finally { setSaving(false); }
  }

  function confirmStartNewPlan() {
    Alert.alert(
      "Start new plan?",
      `Today's weight (${profile.weightKg} kg) will become the new starting point. Your target weight and duration stay the same — you can adjust them below.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start new plan",
          style: "default",
          onPress: async () => {
            setResetting(true);
            try {
              const newTargets = recalcTargets(profile, goal, activity);
              const today = new Date().toLocaleDateString("sv");
              const currentWeight = profile.weightKg;
              await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: profile.userId,
                  gender: profile.gender,
                  birthday: profile.birthday,
                  heightCm: profile.heightCm,
                  weightKg: profile.weightKg,
                  targetWeightKg: resolvedTarget,
                  goal,
                  activityLevel: activity,
                  goalStartDate: today,
                  goalStartWeightKg: currentWeight,
                  goalDurationWeeks: editDurationWeeks,
                  ...newTargets,
                }),
              });
              setEditStartWeight(String(currentWeight));
              onSaved();
              setExpanded(false);
            } catch { Alert.alert("Error", "Could not reset plan. Please try again."); }
            finally { setResetting(false); }
          },
        },
      ]
    );
  }

  const GOAL_LIST = Object.entries(GOALS);
  const ACTIVITY_LIST = Object.entries(ACTIVITIES);

  const currentWeightRow = profile.goalDurationWeeks
    ? `${profile.weightKg} kg → ${profile.targetWeightKg} kg · ${profile.goalDurationWeeks} wks`
    : `${profile.weightKg} kg → ${profile.targetWeightKg} kg`;

  return (
    <>
      <SettingsRow label={t("edit_nutrition_goals")} icon="flag-outline" onPress={() => setExpanded(!expanded)} colors={colors} />
      <SettingsRow label={t("goals_current_weight")} icon="trending-up-outline" value={currentWeightRow} onPress={() => setExpanded(!expanded)} colors={colors} last />

      {expanded && (
        <View style={{ padding: 16, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          {/* Weight plan */}
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 8 }}>
            Weight plan
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 4 }}>
                Start weight (kg)
              </Text>
              <TextInput
                value={editStartWeight}
                onChangeText={(v) => setEditStartWeight(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  fontSize: 15,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  textAlign: "center",
                }}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 4 }}>
                Target weight (kg)
              </Text>
              <TextInput
                value={editTargetWeight}
                onChangeText={(v) => setEditTargetWeight(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  fontSize: 15,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  textAlign: "center",
                }}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>

          {/* Duration stepper */}
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 4 }}>
            Duration (weeks)
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <TouchableOpacity
              onPress={() => setEditDurationWeeks(Math.max(1, editDurationWeeks - 1))}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="remove" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              {editDurationWeeks}
            </Text>
            <TouchableOpacity
              onPress={() => setEditDurationWeeks(Math.min(104, editDurationWeeks + 1))}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="add" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Daily delta hint */}
          {Math.abs(dailyDeltaKg) > 0.001 && (
            <View style={{ backgroundColor: colors.muted, borderRadius: 10, padding: 10, marginBottom: 14, alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                {dailyDeltaKg < 0 ? "📉" : "📈"} {Math.abs(dailyDeltaKg).toFixed(2)} kg/day to {dailyDeltaKg < 0 ? "lose" : "gain"} in {editDurationWeeks} wks
              </Text>
            </View>
          )}

          {/* Goal type */}
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 8 }}>{t("goal_label")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {GOAL_LIST.map(([id]) => (
              <TouchableOpacity key={id} onPress={() => setGoal(id)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: goal === id ? colors.foreground : colors.border, backgroundColor: goal === id ? colors.foreground : colors.card, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: goal === id ? colors.primaryForeground : colors.mutedForeground }}>{t(`goal_${id}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 8 }}>{t("activity_label")}</Text>
          <View style={{ gap: 6, marginBottom: 14 }}>
            {ACTIVITY_LIST.map(([id]) => (
              <TouchableOpacity key={id} onPress={() => setActivity(id)} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: activity === id ? colors.foreground : colors.border, backgroundColor: activity === id ? colors.foreground : colors.card }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: activity === id ? colors.primaryForeground : colors.foreground }}>{t(`activity_${id}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Live nutrition preview */}
          {(() => {
            const p = recalcTargets(profile, goal, activity, resolvedTarget, editDurationWeeks);
            return (
              <View style={{ backgroundColor: colors.muted, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 0.5 }}>
                  ESTIMATED DAILY TARGETS
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  {[
                    { label: "Calories", value: `${p.dailyCalorieTarget}`, unit: "kcal", color: colors.calorieColor },
                    { label: "Protein", value: `${p.dailyProteinTarget}`, unit: "g", color: colors.proteinColor },
                    { label: "Carbs", value: `${p.dailyCarbsTarget}`, unit: "g", color: colors.carbsColor },
                    { label: "Fat", value: `${p.dailyFatTarget}`, unit: "g", color: colors.fatColor },
                  ].map(({ label, value, unit, color }) => (
                    <View key={label} style={{ alignItems: "center", flex: 1 }}>
                      <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color }}>{value}</Text>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{unit}</Text>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          <TouchableOpacity onPress={save} disabled={!isDirty || saving} style={{ backgroundColor: isDirty ? colors.foreground : colors.border, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: isDirty ? colors.primaryForeground : colors.mutedForeground }}>{saving ? t("saving") : t("save_changes")}</Text>
          </TouchableOpacity>

          {/* Start new plan */}
          <TouchableOpacity
            onPress={confirmStartNewPlan}
            disabled={resetting || saving}
            style={{
              marginTop: 10,
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: colors.border,
              opacity: resetting ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
              {resetting ? "Restarting…" : "↺  Start new plan"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { userId, languageCode, setLanguageCode, signOut } = useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [devTaps, setDevTaps] = useState(0);
  const [showTestAI, setShowTestAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editWeight, setEditWeight] = useState("");
  const [weightExpanded, setWeightExpanded] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [healthConnected, setHealthConnected] = useState(false);
  const healthAvailable = isHealthKitAvailable();
  const [locationStatus, setLocationStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkLocationPermission = React.useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationStatus(status as "granted" | "denied" | "undetermined");
    } catch {
      setLocationStatus("undetermined");
    }
  }, []);

  useEffect(() => {
    checkLocationPermission();
    if (healthAvailable) {
      refreshHealthConnection().then(setHealthConnected).catch(() => setHealthConnected(false));
    }
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appStateRef.current !== "active" && nextState === "active") {
        checkLocationPermission();
        if (healthAvailable) {
          refreshHealthConnection().then(setHealthConnected).catch(() => setHealthConnected(false));
        }
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [checkLocationPermission, healthAvailable]);

  useFocusEffect(
    React.useCallback(() => {
      checkLocationPermission();
      if (healthAvailable) {
        refreshHealthConnection().then(setHealthConnected).catch(() => setHealthConnected(false));
      }
    }, [healthAvailable, checkLocationPermission]),
  );

  const selectedLanguage = LANGUAGES.find((l) => l.code === languageCode) ?? LANGUAGES[0];

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

  const handleVersionTap = () => {
    const next = devTaps + 1;
    setDevTaps(next);
    if (next >= 5) { setShowTestAI(true); setDevTaps(0); }
  };

  const handleUpdateWeight = async () => {
    if (!profile || !userId || !editWeight) return;
    const val = parseFloat(editWeight);
    if (isNaN(val) || val < 20 || val > 500) return Alert.alert("Invalid weight", "Please enter a valid weight in kg.");
    setSaving(true);
    try {
      await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, userId, weightKg: val }),
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditWeight("");
      setWeightExpanded(false);
      Alert.alert("Updated!", "Weight logged successfully.");
    } catch { Alert.alert("Error", "Could not update weight."); }
    finally { setSaving(false); }
  };

  const initials = userId ? userId.slice(0, 2).toUpperCase() : "?";
  const ageDisplay = profile?.birthday
    ? `${new Date().getFullYear() - parseInt(profile.birthday.slice(0, 4), 10)} yrs`
    : null;
  const displayName = profile
    ? `${ageDisplay ?? ""} · ${profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : ""}`
    : "Set up your profile";

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
      {/* Avatar + greeting */}
      <Animated.View entering={FadeInDown.delay(0)} style={{ alignItems: "center", marginBottom: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>{initials}</Text>
        </View>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground }}>{t("my_profile")}</Text>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{displayName}</Text>
        {(today?.streak ?? 0) > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
              {today?.streak} {t("day_streak")}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Invite Friends referral card */}
      <Animated.View entering={FadeInDown.delay(40)}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={{
            backgroundColor: colors.foreground,
            borderRadius: 18,
            padding: 18,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>
              {t("invite_friends")}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.primaryForeground, opacity: 0.75 }}>
              {t("invite_friends_sub")}
            </Text>
          </View>
          <Text style={{ fontSize: 28, marginLeft: 12 }}>🎁</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Account section */}
      <Animated.View entering={FadeInDown.delay(80)}>
        <SectionHeader label={t("account")} colors={colors} />
        <SectionCard colors={colors}>
          {profile && (
            <SettingsRow
              label={t("personal_details")}
              icon="person-outline"
              onPress={() => router.push("/personal-details")}
              colors={colors}
            />
          )}
          <SettingsRow
            label={t("community_profile_menu")}
            icon="person-circle-outline"
            onPress={() => router.push({ pathname: "/community-profile-setup", params: { editMode: "1" } })}
            colors={colors}
          />
          <SettingsRow
            label={t("tab_community")}
            icon="people-outline"
            onPress={() => router.push("/(tabs)/groups")}
            colors={colors}
          />
          <SettingsRow label={t("preferences")} icon="settings-outline" onPress={() => router.push("/preferences")} colors={colors} />
          <SettingsRow label={t("language")} icon="language-outline" value={`${selectedLanguage.flag} ${selectedLanguage.label}`} onPress={() => setShowLanguageModal(true)} colors={colors} />
          <SettingsRow
            label={t("profile_location_access")}
            icon="location-outline"
            value={
              locationStatus === "granted"
                ? t("profile_location_status_allowed")
                : locationStatus === "denied"
                ? t("profile_location_status_denied")
                : t("profile_location_status_not_asked")
            }
            valueColor={
              locationStatus === "granted" ? "#22c55e"
              : locationStatus === "denied" ? "#ef4444"
              : undefined
            }
            onPress={safeOpenSettings}
            colors={colors}
            last
          />
        </SectionCard>
      </Animated.View>

      {/* Nutrition Targets (read-only) */}
      {profile && (
        <Animated.View entering={FadeInDown.delay(120)}>
          <SectionHeader label={t("nutrition_targets")} colors={colors} />
          <SectionCard colors={colors}>
            <SettingsRow label={t("calories")} icon="flame-outline" value={`${profile.dailyCalorieTarget} kcal`} colors={colors} valueColor={colors.calorieColor} />
            <SettingsRow label="Protein 🥩" value={`${Math.round(profile.dailyProteinTarget)}g`} colors={colors} valueColor={colors.proteinColor} />
            <SettingsRow label="Carbs 🌾" value={`${Math.round(profile.dailyCarbsTarget)}g`} colors={colors} valueColor={colors.carbsColor} />
            <SettingsRow label="Fat 🫐" value={`${Math.round(profile.dailyFatTarget)}g`} colors={colors} valueColor={colors.fatColor} last />
          </SectionCard>
        </Animated.View>
      )}

      {/* Goals & Tracking */}
      {profile && (
        <Animated.View entering={FadeInDown.delay(160)}>
          <SectionHeader label={t("goals_tracking")} colors={colors} />
          <SectionCard colors={colors}>
            <GoalEditorSection
              profile={profile}
              colors={colors}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["profile"] })}
            />
          </SectionCard>
        </Animated.View>
      )}

      {/* Integrations — iOS only */}
      {Platform.OS === "ios" && (
        <Animated.View entering={FadeInDown.delay(185)}>
          <SectionHeader label={t("integrations")} colors={colors} />
          <SectionCard colors={colors}>
            <SettingsRow
              label={t("apple_health")}
              icon="heart-outline"
              value={healthConnected ? t("ah_connected") : t("ah_not_connected")}
              valueColor={healthConnected ? "#22c55e" : undefined}
              onPress={() => {
                (router.push as (href: string) => void)("/apple-health");
              }}
              colors={colors}
              last
            />
          </SectionCard>
        </Animated.View>
      )}

      {/* Support & Legal */}
      <Animated.View entering={FadeInDown.delay(200)}>
        <SectionHeader label={t("support_legal")} colors={colors} />
        <SectionCard colors={colors}>
          <SettingsRow label={t("help_center")} icon="help-circle-outline" onPress={() => {}} colors={colors} />
          <SettingsRow label={t("privacy_policy")} icon="shield-outline" onPress={() => {}} colors={colors} />
          <SettingsRow label={t("terms_of_service")} icon="document-text-outline" onPress={() => {}} colors={colors} />
          <SettingsRow label={t("contact_us")} icon="mail-outline" onPress={() => {}} colors={colors} last />
        </SectionCard>
      </Animated.View>

      {/* Follow Us */}
      <Animated.View entering={FadeInDown.delay(230)}>
        <SectionHeader label={t("follow_us")} colors={colors} />
        <SectionCard colors={colors}>
          <SettingsRow
            label="Instagram"
            icon="logo-instagram"
            onPress={() => Linking.openURL("https://instagram.com").catch(() => {})}
            colors={colors}
          />
          <SettingsRow
            label="TikTok"
            icon="musical-notes-outline"
            onPress={() => Linking.openURL("https://tiktok.com").catch(() => {})}
            colors={colors}
          />
          <SettingsRow
            label="X (Twitter)"
            icon="logo-twitter"
            onPress={() => Linking.openURL("https://x.com").catch(() => {})}
            colors={colors}
            last
          />
        </SectionCard>
      </Animated.View>

      {/* App */}
      <Animated.View entering={FadeInDown.delay(260)}>
        <SectionHeader label={t("app_section")} colors={colors} />
        <SectionCard colors={colors}>
          <SettingsRow label="Version" value="1.0.0" onPress={handleVersionTap} colors={colors} last />
        </SectionCard>
      </Animated.View>

      {/* Account Actions */}
      <Animated.View entering={FadeInDown.delay(290)}>
        <SectionHeader label={t("account_actions")} colors={colors} />
        <SectionCard colors={colors}>
          <SettingsRow
            label={t("log_out")}
            icon="log-out-outline"
            onPress={() => Alert.alert(t("log_out"), "Are you sure you want to log out?", [{ text: "Cancel", style: "cancel" }, { text: t("log_out"), style: "destructive", onPress: () => { signOut().catch(() => {}); } }])}
            colors={colors}
          />
          <SettingsRow
            label={t("delete_account")}
            icon="trash-outline"
            destructive
            onPress={() => Alert.alert(t("delete_account"), "This will permanently delete all your data. This action cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => {} }])}
            colors={colors}
            last
          />
        </SectionCard>
      </Animated.View>

      {/* TestAI (hidden) */}
      {showTestAI && userId && (
        <Animated.View entering={FadeInDown} style={{ marginTop: 16 }}>
          <TestAISection userId={userId} colors={colors} />
        </Animated.View>
      )}
    </ScrollView>
    <LanguageModal
      visible={showLanguageModal}
      selectedCode={selectedLanguage.code}
      onSelect={(lang) => {
        setLanguageCode(lang.code);
      }}
      onClose={() => setShowLanguageModal(false)}
    />
    </>
  );
}

const st = StyleSheet.create({
  weightInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
