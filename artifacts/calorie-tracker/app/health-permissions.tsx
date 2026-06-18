import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";
import { requestHealthPermissions, isHealthKitAvailable } from "@/lib/health";

const DATA_TYPES = [
  {
    icon: "footsteps-outline" as const,
    color: "#3b82f6",
    titleKey: "hp_steps_title",
    descKey: "hp_steps_desc",
  },
  {
    icon: "flame-outline" as const,
    color: "#f97316",
    titleKey: "hp_active_cal_title",
    descKey: "hp_active_cal_desc",
  },
  {
    icon: "barbell-outline" as const,
    color: "#8b5cf6",
    titleKey: "hp_workouts_title",
    descKey: "hp_workouts_desc",
  },
  {
    icon: "heart-outline" as const,
    color: "#ef4444",
    titleKey: "hp_heart_rate_title",
    descKey: "hp_heart_rate_desc",
  },
  {
    icon: "moon-outline" as const,
    color: "#6366f1",
    titleKey: "hp_sleep_title",
    descKey: "hp_sleep_desc",
  },
];

export default function HealthPermissionsScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const healthAvailable = isHealthKitAvailable();

  async function handleConnect() {
    setLoading(true);
    setDenied(false);
    try {
      const granted = await requestHealthPermissions();
      if (granted) {
        (router.replace as (href: string) => void)("/apple-health");
      } else {
        setDenied(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!healthAvailable) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ position: "absolute", top: insets.top + 16, left: 20, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          <Text style={{ fontSize: 16, fontFamily: "Inter_500Medium", color: colors.foreground }}>{t("back")}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 40, marginBottom: 20 }}>❤️</Text>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 12 }}>
          {t("apple_health")}
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22 }}>
          {t("activity_not_available")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 24 }}
      >
        <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        <Text style={{ fontSize: 16, fontFamily: "Inter_500Medium", color: colors.foreground }}>
          {t("back")}
        </Text>
      </TouchableOpacity>

      {/* Header */}
      <Animated.View entering={FadeInDown.delay(0)} style={{ alignItems: "center", marginBottom: 32 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            backgroundColor: "#ff3b3022",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 40 }}>❤️</Text>
        </View>
        <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>
          {t("hp_title")}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            textAlign: "center",
            marginTop: 10,
            lineHeight: 22,
          }}
        >
          {t("hp_subtitle")}
        </Text>
      </Animated.View>

      {/* Benefit strip */}
      <Animated.View entering={FadeInDown.delay(60)}>
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
          }}
        >
          <Text style={{ fontSize: 22 }}>⚡</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, flex: 1, lineHeight: 20 }}>
            {t("hp_benefit")}
          </Text>
        </View>
      </Animated.View>

      {/* Data type list */}
      <Animated.View entering={FadeInDown.delay(100)}>
        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 14 }}>
          {t("hp_data_will_read")}
        </Text>
      </Animated.View>

      {DATA_TYPES.map((item, i) => (
        <Animated.View key={item.titleKey} entering={FadeInDown.delay(120 + i * 50)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              marginBottom: 14,
              backgroundColor: colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: item.color + "22",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {t(item.titleKey)}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2, lineHeight: 18 }}>
                {t(item.descKey)}
              </Text>
            </View>
            <Ionicons name="checkmark-circle-outline" size={20} color="#22c55e" />
          </View>
        </Animated.View>
      ))}

      {/* Privacy note */}
      <Animated.View entering={FadeInDown.delay(380)} style={{ marginTop: 4, marginBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} style={{ marginTop: 2 }} />
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1, lineHeight: 18 }}>
            {t("hp_privacy_note")}
          </Text>
        </View>
      </Animated.View>

      {/* Denied-permission error banner */}
      {denied && (
        <Animated.View entering={FadeInDown.delay(0)} style={{ marginBottom: 16 }}>
          <View
            style={{
              backgroundColor: "#fee2e2",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#fca5a5",
              padding: 14,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#ef4444" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#b91c1c", marginBottom: 2 }}>
                {t("hp_denied_title")}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#b91c1c", lineHeight: 18 }}>
                {t("hp_denied_desc")}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Connect button */}
      <Animated.View entering={FadeInDown.delay(420)}>
        <TouchableOpacity
          onPress={handleConnect}
          disabled={loading}
          activeOpacity={0.85}
          style={{
            backgroundColor: "#ff3b30",
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={{ fontSize: 16 }}>❤️</Text>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" }}>
                {t("hp_connect_btn")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Not now */}
      <Animated.View entering={FadeInDown.delay(450)} style={{ marginTop: 14 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ alignItems: "center", paddingVertical: 10 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
            {t("not_now")}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}
