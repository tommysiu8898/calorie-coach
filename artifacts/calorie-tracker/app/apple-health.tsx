import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  refreshHealthConnection,
  requestHealthPermissions,
  isHealthKitAvailable,
  isHealthKitOnIOSWithoutModule,
} from "@/lib/health";

const STEPS = [
  {
    number: "1",
    icon: "heart-outline" as const,
    titleKey: "ah_step1_title",
    descKey: "ah_step1_desc",
  },
  {
    number: "2",
    icon: "person-circle-outline" as const,
    titleKey: "ah_step2_title",
    descKey: "ah_step2_desc",
  },
  {
    number: "3",
    icon: "shield-checkmark-outline" as const,
    titleKey: "ah_step3_title",
    descKey: "ah_step3_desc",
  },
  {
    number: "4",
    icon: "phone-portrait-outline" as const,
    titleKey: "ah_step4_title",
    descKey: "ah_step4_desc",
  },
];

export default function AppleHealthScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  const checkConnection = useCallback(async () => {
    if (!isHealthKitAvailable()) {
      setConnected(false);
      return;
    }
    const result = await refreshHealthConnection();
    setConnected(result);
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  async function handleConnect() {
    setConnecting(true);
    try {
      await requestHealthPermissions();
      await checkConnection();
    } finally {
      setConnecting(false);
    }
  }

  function openHealthApp() {
    Linking.openURL("x-apple-health://").catch(() => {
      Linking.openURL("App-prefs:root=Health").catch(() => {});
    });
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
            width: 72,
            height: 72,
            borderRadius: 18,
            backgroundColor: "#ff3b3022",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 36 }}>❤️</Text>
        </View>
        <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>
          {t("ah_title")}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            textAlign: "center",
            marginTop: 8,
            lineHeight: 22,
          }}
        >
          {t("ah_subtitle")}
        </Text>
      </Animated.View>

      {/* Connection status / Connect button */}
      <Animated.View entering={FadeInDown.delay(60)} style={{ marginBottom: 28 }}>
        {connected === null ? (
          <View
            style={{
              backgroundColor: colors.muted,
              borderRadius: 14,
              padding: 16,
              alignItems: "center",
            }}
          >
            <ActivityIndicator color={colors.mutedForeground} />
          </View>
        ) : connected ? (
          <View
            style={{
              backgroundColor: "#22c55e18",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#22c55e33",
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#22c55e", flex: 1 }}>
              {t("ah_connected_notice")}
            </Text>
          </View>
        ) : isHealthKitOnIOSWithoutModule() ? (
          /* Running in Expo Go — native module is unavailable */
          <View
            style={{
              backgroundColor: "#3b82f618",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#3b82f633",
              padding: 14,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <Ionicons name="information-circle-outline" size={20} color="#3b82f6" style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "#3b82f6", flex: 1, lineHeight: 20 }}>
              {t("ah_expo_go_notice")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View
              style={{
                backgroundColor: "#f59e0b18",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#f59e0b33",
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ionicons name="warning-outline" size={20} color="#f59e0b" />
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#f59e0b", flex: 1 }}>
                {t("ah_not_connected_notice")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.85}
              style={{
                backgroundColor: "#22c55e",
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                opacity: connecting ? 0.7 : 1,
              }}
            >
              {connecting ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                    {t("ah_connecting")}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="heart" size={18} color="#fff" />
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                    {t("ah_connect_btn")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* How to manage permissions title */}
      <Animated.View entering={FadeInDown.delay(100)}>
        <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 16 }}>
          {t("ah_manage_title")}
        </Text>
      </Animated.View>

      {/* Steps */}
      {STEPS.map((step, i) => (
        <Animated.View key={step.number} entering={FadeInDown.delay(120 + i * 50)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.foreground,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground }}>
                {step.number}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Ionicons name={step.icon} size={16} color={colors.mutedForeground} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                  {t(step.titleKey)}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20 }}>
                {t(step.descKey)}
              </Text>
            </View>
          </View>
        </Animated.View>
      ))}

      {/* Open Health App button */}
      <Animated.View entering={FadeInDown.delay(340)} style={{ marginTop: 8 }}>
        <TouchableOpacity
          onPress={openHealthApp}
          activeOpacity={0.85}
          style={{
            backgroundColor: "#ff3b30",
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 16 }}>❤️</Text>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" }}>
            {t("ah_open_health_btn")}
          </Text>
          <Ionicons name="open-outline" size={16} color="#ffffff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Data types section */}
      <Animated.View entering={FadeInDown.delay(380)} style={{ marginTop: 28 }}>
        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 12 }}>
          {t("ah_data_read_title")}
        </Text>
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {[
            { icon: "footsteps-outline", label: t("ah_data_steps") },
            { icon: "flame-outline", label: t("ah_data_active_cal") },
            { icon: "barbell-outline", label: t("ah_data_workouts") },
            { icon: "heart-outline", label: t("ah_data_heart_rate") },
            { icon: "moon-outline", label: t("ah_data_sleep") },
          ].map((item, idx, arr) => (
            <View
              key={item.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: idx < arr.length - 1 ? 0.5 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <Ionicons name={item.icon as "home"} size={18} color={colors.mutedForeground} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}>
                {item.label}
              </Text>
              <View style={{ flex: 1 }} />
              <View
                style={{
                  backgroundColor: "#22c55e18",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>
                  {t("ah_read_only")}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}
