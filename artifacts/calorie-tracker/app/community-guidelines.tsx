import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";

const RULES = [
  {
    emoji: "🤝",
    titleKey: "community_rule_1_title",
    descKey: "community_rule_1_desc",
  },
  {
    emoji: "💪",
    titleKey: "community_rule_2_title",
    descKey: "community_rule_2_desc",
  },
  {
    emoji: "🚨",
    titleKey: "community_rule_3_title",
    descKey: "community_rule_3_desc",
  },
];

export default function CommunityGuidelinesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ groupId?: string; groupName?: string }>();

  function handleAgree() {
    router.replace({
      pathname: "/community-profile-setup",
      params: {
        groupId: params.groupId,
        groupName: params.groupName,
        fromGuidelines: "1",
      },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 24, alignSelf: "flex-start" }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={26} color={colors.foreground} />
        </TouchableOpacity>

        <View style={{ alignItems: "center", marginBottom: 28 }}>
          <View
            style={[
              st.iconCircle,
              { backgroundColor: colors.foreground },
            ]}
          >
            <Text style={{ fontSize: 36 }}>📋</Text>
          </View>
          <Text style={[st.title, { color: colors.foreground }]}>
            {t("community_guidelines_title")}
          </Text>
          <Text style={[st.subtitle, { color: colors.mutedForeground }]}>
            {t("community_guidelines_subtitle")}
          </Text>
        </View>

        {RULES.map((rule, i) => (
          <View
            key={i}
            style={[
              st.ruleCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={st.ruleEmoji}>{rule.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.ruleTitle, { color: colors.foreground }]}>
                {t(rule.titleKey)}
              </Text>
              <Text style={[st.ruleDesc, { color: colors.mutedForeground }]}>
                {t(rule.descKey)}
              </Text>
            </View>
          </View>
        ))}

        <View style={{ height: 16 }} />
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          paddingTop: 16,
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        <TouchableOpacity
          onPress={handleAgree}
          style={[st.agreeBtn, { backgroundColor: colors.foreground }]}
        >
          <Text style={[st.agreeBtnText, { color: colors.primaryForeground }]}>
            {t("community_guidelines_agree")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  ruleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  ruleEmoji: {
    fontSize: 28,
    marginTop: 2,
  },
  ruleTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  ruleDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  agreeBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  agreeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
