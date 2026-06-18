import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import { useApp } from "@/context/AppContext";

function FABButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tabBarHeight = Platform.OS === "web" ? 84 : 60;
  const fabBottom = insets.bottom + tabBarHeight + 10;

  const menuItems = [
    {
      icon: "search-outline" as const,
      label: t("food_database"),
      onPress: () => { setOpen(false); router.push("/log-food"); },
    },
    {
      icon: "scan-outline" as const,
      label: t("scan_food"),
      onPress: () => { setOpen(false); router.push("/(tabs)/track"); },
    },
  ];

  return (
    <>
      <TouchableOpacity
        style={[fabStyles.fab, { bottom: fabBottom }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#ffffff" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={fabStyles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              fabStyles.menu,
              { bottom: fabBottom + 66, backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {menuItems.map((item, idx) => (
              <React.Fragment key={item.label}>
                {idx > 0 && <View style={[fabStyles.divider, { backgroundColor: colors.border }]} />}
                <TouchableOpacity
                  style={fabStyles.menuRow}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[fabStyles.menuIcon, { backgroundColor: colors.muted }]}>
                    <Ionicons name={item.icon} size={20} color={colors.foreground} />
                  </View>
                  <Text style={[fabStyles.menuLabel, { color: colors.foreground }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>

          {/* Close FAB */}
          <TouchableOpacity
            style={[fabStyles.fab, { position: "absolute", bottom: fabBottom, right: 20, backgroundColor: colors.foreground }]}
            onPress={() => setOpen(false)}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={26} color={colors.background} />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </>
  );
}

const coachStyles = StyleSheet.create({
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
});

const fabStyles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  menu: {
    position: "absolute",
    right: 20,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    minWidth: 210,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});

export default function TabLayout() {
  const colors = useColors();
  const { t } = useI18n();
  const { isPremium, isTrialActive } = useApp();
  const isUnlocked = isPremium || isTrialActive;
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const hasShownPaywall = React.useRef(false);

  function gatePress(e: { preventDefault: () => void }) {
    if (!isUnlocked && !hasShownPaywall.current) {
      e.preventDefault();
      hasShownPaywall.current = true;
      router.push("/paywall");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.foreground,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : colors.background,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            elevation: 0,
            height: isWeb ? 84 : 60,
            paddingBottom: isWeb ? 28 : 6,
            paddingTop: 6,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={90}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : null,
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: "Inter_500Medium",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tab_home"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          listeners={{ tabPress: gatePress }}
          options={{
            title: t("tab_history"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          listeners={{ tabPress: gatePress }}
          options={{
            title: t("tab_coach"),
            tabBarIcon: ({ size }) => (
              <View style={[coachStyles.circle, { backgroundColor: colors.accent, width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]}>
                <Ionicons
                  name="sparkles"
                  size={size - 8}
                  color={colors.accentForeground}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="health"
          listeners={{ tabPress: gatePress }}
          options={{
            title: t("tab_exercise"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="fitness-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t("tab_profile"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: t("tab_progress"),
            href: null,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: t("tab_community"),
            href: null,
          }}
        />
        <Tabs.Screen name="track" options={{ href: null }} />
      </Tabs>
      <FABButton />
    </View>
  );
}
