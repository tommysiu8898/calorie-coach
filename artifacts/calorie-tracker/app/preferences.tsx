import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import type { ThemeMode } from "@/context/AppContext";
import Animated, { FadeInDown } from "react-native-reanimated";

type AppearanceMode = ThemeMode;

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function ThemePreview({ mode, colors }: { mode: AppearanceMode; colors: AppColors }) {
  const accent = "#00c46a";

  if (mode === "system") {
    const lightBg = "#ffffff"; const lightCard = "#f3f4f6"; const lightLine = "#e5e7eb"; const lightText = "#111827";
    const darkBg = "#0a0f0d"; const darkCard = "#111a14"; const darkLine = "#1e2d24"; const darkText = "#f1f5f9";
    return (
      <View style={[tp.outer, { backgroundColor: lightBg, borderColor: lightLine, overflow: "hidden" }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, flexDirection: "row" }}>
            <View style={{ width: "50%", height: "100%", backgroundColor: lightBg }} />
            <View style={{ width: "50%", height: "100%", backgroundColor: darkBg }} />
          </View>
        </View>
        <View style={[tp.topBar, { backgroundColor: "transparent", borderBottomColor: lightLine }]}>
          <View style={[tp.dot, { backgroundColor: lightText }]} />
          <View style={[tp.dot, { backgroundColor: darkText }]} />
          <View style={[tp.dot, { backgroundColor: lightText }]} />
        </View>
        <View style={{ padding: 6, gap: 4 }}>
          <View style={{ flexDirection: "row", borderRadius: 6, overflow: "hidden", height: 22 }}>
            <View style={{ flex: 1, backgroundColor: lightCard, padding: 5, justifyContent: "center" }}>
              <View style={[tp.textLine, { backgroundColor: lightText, width: "90%" }]} />
            </View>
            <View style={{ flex: 1, backgroundColor: darkCard, padding: 5, justifyContent: "center" }}>
              <View style={[tp.textLine, { backgroundColor: darkText, width: "90%" }]} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 4, justifyContent: "space-between" }}>
            {["#f43f5e", accent, "#3b82f6"].map((c, i) => (
              <View key={i} style={[tp.miniRing, { borderColor: c, backgroundColor: i < 2 ? lightCard : darkCard }]} />
            ))}
          </View>
        </View>
        <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
          <View style={{ position: "absolute", top: 0, left: "47%", width: 2, height: "100%", backgroundColor: "rgba(128,128,128,0.35)", transform: [{ rotate: "6deg" }] }} />
        </View>
      </View>
    );
  }

  const isDark = mode === "dark";
  const bg = isDark ? "#0a0f0d" : "#ffffff";
  const card = isDark ? "#111a14" : "#f3f4f6";
  const line = isDark ? "#1e2d24" : "#e5e7eb";
  const text = isDark ? "#f1f5f9" : "#111827";

  return (
    <View style={[tp.outer, { backgroundColor: bg, borderColor: line }]}>
      <View style={[tp.topBar, { backgroundColor: bg, borderBottomColor: line }]}>
        <View style={[tp.dot, { backgroundColor: text }]} />
        <View style={[tp.dot, { backgroundColor: text }]} />
        <View style={[tp.dot, { backgroundColor: text }]} />
      </View>
      <View style={{ padding: 6, gap: 4 }}>
        <View style={[tp.cardRow, { backgroundColor: card }]}>
          <View style={[tp.textLine, { backgroundColor: text, width: "60%" }]} />
          <View style={[tp.textLine, { backgroundColor: text, width: "30%", opacity: 0.4 }]} />
        </View>
        <View style={{ flexDirection: "row", gap: 4, justifyContent: "space-between" }}>
          {["#f43f5e", accent, "#3b82f6"].map((c, i) => (
            <View key={i} style={[tp.miniRing, { borderColor: c, backgroundColor: card }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  outer: {
    width: 90,
    height: 100,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
    borderBottomWidth: 0.5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.5,
  },
  cardRow: {
    borderRadius: 6,
    padding: 5,
    gap: 3,
  },
  textLine: {
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  miniRing: {
    flex: 1,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
  },
});


function NavRow({
  label,
  description,
  onPress,
  colors,
  last,
}: {
  label: string;
  description?: string;
  onPress: () => void;
  colors: AppColors;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: colors.border,
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
          {label}
        </Text>
        {description && (
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 }}>
            {description}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function PreferencesScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { themeMode, setThemeMode } = useApp();

  const appearance: AppearanceMode = themeMode;
  const setAppearance = (mode: AppearanceMode) => { setThemeMode(mode); };

  const MODES: { key: AppearanceMode; label: string; icon: string }[] = [
    { key: "system", label: t("theme_system"), icon: "contrast-outline" },
    { key: "light",  label: t("theme_light"),  icon: "sunny-outline" },
    { key: "dark",   label: t("theme_dark"),   icon: "moon-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
          {t("prefs_title")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 32,
          paddingTop: 24,
          paddingHorizontal: 20,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Appearance */}
        <Animated.View entering={FadeInDown.delay(0)}>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                {t("appearance_title")}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                {t("appearance_desc")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12, padding: 16, justifyContent: "space-between" }}>
              {MODES.map((m) => {
                const isSelected = appearance === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    activeOpacity={0.8}
                    onPress={() => setAppearance(m.key)}
                    style={{ alignItems: "center", gap: 8, flex: 1 }}
                  >
                    <View
                      style={[
                        s.themePicker,
                        {
                          borderColor: isSelected ? colors.foreground : colors.border,
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                    >
                      <ThemePreview mode={m.key} colors={colors} />
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons
                        name={m.icon as "contrast-outline"}
                        size={13}
                        color={isSelected ? colors.foreground : colors.mutedForeground}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular",
                          color: isSelected ? colors.foreground : colors.mutedForeground,
                        }}
                      >
                        {m.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* More */}
        <Animated.View entering={FadeInDown.delay(120)}>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NavRow
              label={t("tracking_reminders_label")}
              description={t("tracking_reminders_desc")}
              onPress={() => router.push("/tracking-reminders")}
              colors={colors}
            />
            <NavRow
              label={t("ring_colors_label")}
              description={t("ring_colors_desc")}
              onPress={() => router.push("/ring-colors")}
              colors={colors}
              last
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  themePicker: {
    borderRadius: 16,
    overflow: "hidden",
  },
});
