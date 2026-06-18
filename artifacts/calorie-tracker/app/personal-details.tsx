import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";

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
}

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function SectionLabel({ label, colors }: { label: string; colors: AppColors }) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontFamily: "Inter_600SemiBold",
        color: colors.mutedForeground,
        letterSpacing: 0.6,
        marginBottom: 10,
        marginTop: 24,
        paddingHorizontal: 4,
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function FieldCard({ children, colors }: { children: React.ReactNode; colors: AppColors }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

function NumericRow({
  label,
  value,
  onChangeText,
  unit,
  placeholder,
  colors,
  last,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  unit: string;
  placeholder: string;
  colors: AppColors;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontFamily: "Inter_500Medium",
          color: colors.foreground,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          style={{
            fontSize: 17,
            fontFamily: "Inter_600SemiBold",
            color: colors.foreground,
            textAlign: "right",
            minWidth: 64,
            borderBottomWidth: 1.5,
            borderBottomColor: colors.border,
            paddingVertical: 2,
            paddingHorizontal: 4,
          }}
        />
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
          }}
        >
          {unit}
        </Text>
      </View>
    </View>
  );
}

export default function PersonalDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [gender, setGender] = useState<"male" | "female">("male");
  const [birthYear, setBirthYear] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [goal, setGoal] = useState("lose");
  const [activity, setActivity] = useState("moderate");
  const [saving, setSaving] = useState(false);
  const [populated, setPopulated] = useState(false);

  const GOALS = [
    { id: "lose", label: t("goal_lose"), sub: t("pd_goal_lose_sub"), icon: "📉" },
    { id: "maintain", label: t("goal_maintain"), sub: t("pd_goal_maintain_sub"), icon: "⚖️" },
    { id: "gain", label: t("goal_gain"), sub: t("pd_goal_gain_sub"), icon: "💪" },
  ];

  const ACTIVITIES = [
    { id: "sedentary", label: t("activity_sedentary"), sub: "Little to no exercise" },
    { id: "light", label: t("activity_light"), sub: "Exercise 1–3 days/week" },
    { id: "moderate", label: t("activity_moderate"), sub: "Exercise 3–5 days/week" },
    { id: "active", label: t("activity_active"), sub: "Hard exercise 6–7 days/week" },
    { id: "very_active", label: t("activity_very_active"), sub: "Physical job + daily exercise" },
  ];

  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useQuery<Profile>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile?userId=${userId}`
      );
      if (!res.ok) throw new Error("No profile");
      return res.json();
    },
    enabled: !!userId,
    retry: 2,
  });

  useEffect(() => {
    if (profile && !populated) {
      setGender((profile.gender as "male" | "female") ?? "male");
      setBirthYear(profile.birthday ? profile.birthday.slice(0, 4) : "");
      setHeightCm(profile.heightCm ? String(profile.heightCm) : "");
      setWeightKg(profile.weightKg ? String(profile.weightKg) : "");
      setTargetWeightKg(profile.targetWeightKg ? String(profile.targetWeightKg) : "");
      setGoal(profile.goal ?? "lose");
      setActivity(profile.activityLevel ?? "moderate");
      setPopulated(true);
    }
  }, [profile, populated]);

  async function handleSave() {
    if (!userId) return;

    const hCm = parseFloat(heightCm);
    const wKg = parseFloat(weightKg);
    const tKg = parseFloat(targetWeightKg);
    const bYear = parseInt(birthYear, 10);

    if (!birthYear || isNaN(bYear) || bYear < 1920 || bYear > new Date().getFullYear() - 5) {
      Alert.alert("Invalid birth year", "Please enter a valid birth year (e.g. 1990).");
      return;
    }
    if (isNaN(hCm) || hCm < 50 || hCm > 300) {
      Alert.alert("Invalid height", "Please enter your height in centimeters (50–300).");
      return;
    }
    if (isNaN(wKg) || wKg < 20 || wKg > 600) {
      Alert.alert("Invalid weight", "Please enter a valid current weight in kg.");
      return;
    }
    if (isNaN(tKg) || tKg < 20 || tKg > 600) {
      Alert.alert("Invalid target weight", "Please enter a valid target weight in kg.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          gender,
          birthday: `${birthYear}-01-01`,
          heightCm: hCm,
          weightKg: wKg,
          targetWeightKg: tKg,
          goal,
          activityLevel: activity,
        }),
      });

      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        router.back();
      } else {
        const err = (await res.json()) as { error?: string };
        Alert.alert("Save failed", err.error ?? "Could not save your details. Please try again.");
      }
    } catch {
      Alert.alert("Network error", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + (Platform.OS === "web" ? 16 : 8),
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            fontSize: 18,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
          }}
        >
          {t("pd_title")}
        </Text>
      </View>

      {/* Loading state */}
      {isLoading && !populated && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      )}

      {/* Error state — profile failed to load */}
      {isError && !populated && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 40,
            gap: 16,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={48} color={colors.mutedForeground} />
          <Text
            style={{
              fontSize: 16,
              fontFamily: "Inter_500Medium",
              color: colors.mutedForeground,
              textAlign: "center",
            }}
          >
            {t("pd_load_error")}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 28,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: colors.foreground,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: "Inter_600SemiBold",
                color: colors.primaryForeground,
              }}
            >
              {t("pd_retry")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Form — shown once data is populated (or loading is done) */}
      {!isError && (isLoading ? populated : true) && (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Gender */}
          <Animated.View entering={FadeInDown.delay(0)}>
            <SectionLabel label={t("pd_gender")} colors={colors} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              {(["male", "female"] as const).map((g) => {
                const isSelected = gender === g;
                return (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGender(g)}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      paddingVertical: 16,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.foreground : colors.border,
                      backgroundColor: isSelected ? colors.foreground : colors.card,
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{g === "male" ? "♂" : "♀"}</Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: "Inter_600SemiBold",
                        color: isSelected ? colors.primaryForeground : colors.foreground,
                      }}
                    >
                      {g === "male" ? t("pd_male") : t("pd_female")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          {/* Measurements */}
          <Animated.View entering={FadeInDown.delay(40)}>
            <SectionLabel label={t("pd_measurements")} colors={colors} />
            <FieldCard colors={colors}>
              <NumericRow
                label={t("pd_birth_year")}
                value={birthYear}
                onChangeText={(v) => setBirthYear(v.replace(/[^0-9]/g, "").slice(0, 4))}
                unit="yr"
                placeholder="1990"
                colors={colors}
              />
              <NumericRow
                label={t("pd_height")}
                value={heightCm}
                onChangeText={setHeightCm}
                unit="cm"
                placeholder="170"
                colors={colors}
              />
              <NumericRow
                label={t("pd_current_weight")}
                value={weightKg}
                onChangeText={setWeightKg}
                unit="kg"
                placeholder="70"
                colors={colors}
              />
              <NumericRow
                label={t("pd_target_weight")}
                value={targetWeightKg}
                onChangeText={setTargetWeightKg}
                unit="kg"
                placeholder="65"
                colors={colors}
                last
              />
            </FieldCard>
          </Animated.View>

          {/* Goal */}
          <Animated.View entering={FadeInDown.delay(80)}>
            <SectionLabel label={t("goal_label")} colors={colors} />
            <View style={{ gap: 10 }}>
              {GOALS.map((g) => {
                const isSelected = goal === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setGoal(g.id)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      padding: 16,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.foreground : colors.border,
                      backgroundColor: isSelected ? colors.foreground : colors.card,
                    }}
                  >
                    <Text style={{ fontSize: 26 }}>{g.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontFamily: "Inter_600SemiBold",
                          color: isSelected ? colors.primaryForeground : colors.foreground,
                        }}
                      >
                        {g.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_400Regular",
                          color: isSelected ? colors.primaryForeground : colors.mutedForeground,
                          opacity: isSelected ? 0.8 : 1,
                          marginTop: 2,
                        }}
                      >
                        {g.sub}
                      </Text>
                    </View>
                    {isSelected && (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: colors.primaryForeground,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={14} color={colors.foreground} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          {/* Activity Level */}
          <Animated.View entering={FadeInDown.delay(120)}>
            <SectionLabel label={t("pd_activity_level")} colors={colors} />
            <FieldCard colors={colors}>
              {ACTIVITIES.map((a, i) => {
                const isSelected = activity === a.id;
                const isLast = i === ACTIVITIES.length - 1;
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setActivity(a.id)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderBottomWidth: isLast ? 0 : 0.5,
                      borderBottomColor: colors.border,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: isSelected ? colors.foreground : colors.border,
                        backgroundColor: isSelected ? colors.foreground : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isSelected && (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: colors.primaryForeground,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_500Medium",
                          color: colors.foreground,
                        }}
                      >
                        {a.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_400Regular",
                          color: colors.mutedForeground,
                          marginTop: 1,
                        }}
                      >
                        {a.sub}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </FieldCard>
          </Animated.View>
        </ScrollView>
      )}

      {/* Sticky Save button — hidden when showing error or initial load */}
      {!isError && (isLoading ? populated : true) && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 16,
            paddingTop: 12,
            backgroundColor: colors.background,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || isLoading}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.foreground,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              opacity: saving || isLoading ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Inter_700Bold",
                  color: colors.primaryForeground,
                }}
              >
                {t("pd_save_changes")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
