import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown } from "react-native-reanimated";

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

const RING_COLORS = [
  { color: "#00c46a", labelKey: "ring_color_green_label", descKey: "ring_color_green_desc", style: "solid" as const },
  { color: "#f59e0b", labelKey: "ring_color_yellow_label", descKey: "ring_color_yellow_desc", style: "solid" as const },
  { color: "#ef4444", labelKey: "ring_color_red_label", descKey: "ring_color_red_desc", style: "solid" as const },
  { color: "#9ca3af", labelKey: "ring_color_dotted_label", descKey: "ring_color_dotted_desc", style: "dashed" as const },
];

const DAY_KEYS = ["day_sun", "day_mon", "day_tue", "day_wed", "day_thu", "day_fri", "day_sat"];
const TODAY_IDX = 3; // Wednesday

const SAMPLE_RINGS = [
  { color: "#ef4444", dashed: false },
  { color: "#f59e0b", dashed: false },
  { color: "#00c46a", dashed: false },
  { color: "#111827", dashed: false },
  { color: "#9ca3af", dashed: true },
  { color: "#9ca3af", dashed: true },
  { color: "#9ca3af", dashed: true },
];

function RingItem({ ring, colors, t }: { ring: typeof RING_COLORS[0]; colors: AppColors; t: (k: string) => string }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(120)}
      style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: ring.style === "dashed" ? 2 : 2.5,
          borderColor: ring.color,
          borderStyle: ring.style === "dashed" ? "dashed" : "solid",
          backgroundColor: "transparent",
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
          {t(ring.labelKey)}
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
          {t(ring.descKey)}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function RingColorsScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.Text
          entering={FadeInDown.delay(0)}
          style={{
            fontSize: 32,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
            marginTop: 28,
            marginBottom: 24,
          }}
        >
          {t("ring_colors_label")}
        </Animated.Text>

        {/* Calendar preview card */}
        <Animated.View
          entering={FadeInDown.delay(60)}
          style={[
            s.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              padding: 16,
              marginBottom: 24,
            },
          ]}
        >
          {/* Brand row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 18 }}>🍎</Text>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Calories Coach</Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: colors.muted,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 20,
              }}
            >
              <Text style={{ fontSize: 16 }}>🔥</Text>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>15</Text>
            </View>
          </View>

          {/* Day labels */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            {DAY_KEYS.map((d) => (
              <Text key={d} style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1, textAlign: "center" }}>
                {t(d)}
              </Text>
            ))}
          </View>

          {/* Calendar day circles */}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {SAMPLE_RINGS.map((ring, i) => {
              const day = 10 + i;
              const isToday = i === TODAY_IDX;
              return (
                <View key={i} style={{ flex: 1, alignItems: "center" }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      borderWidth: 2,
                      borderColor: ring.dashed ? colors.border : ring.color,
                      borderStyle: ring.dashed ? "dashed" : "solid",
                      backgroundColor: isToday ? colors.foreground : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: isToday ? "Inter_700Bold" : "Inter_400Regular",
                        color: isToday ? colors.primaryForeground : colors.foreground,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Explanation text */}
        <Animated.Text
          entering={FadeInDown.delay(90)}
          style={{
            fontSize: 15,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            lineHeight: 22,
            marginBottom: 24,
          }}
        >
          {t("ring_colors_intro")}
        </Animated.Text>

        {/* Ring legend */}
        <View>
          {RING_COLORS.map((ring, i) => (
            <View
              key={ring.labelKey}
              style={{
                borderBottomWidth: i < RING_COLORS.length - 1 ? 0.5 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <RingItem ring={ring} colors={colors} t={t} />
            </View>
          ))}
        </View>
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
});
