import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ToastAndroid,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import { useApp } from "@/context/AppContext";

const ACCENT = "#00c46a";

const FEATURES = [
  { icon: "sparkles" as const, key: "paywall_feature_coach" },
  { icon: "calendar" as const, key: "paywall_feature_history" },
  { icon: "heart" as const, key: "paywall_feature_health" },
  { icon: "trending-up" as const, key: "paywall_feature_progress" },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t } = useI18n();
  const { startTrial, hasUsedTrial } = useApp();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await startTrial();
      router.back();
    } catch {
      if (Platform.OS === "android") {
        ToastAndroid.show(t("paywall_coming_soon"), ToastAndroid.SHORT);
      } else {
        Alert.alert("", t("paywall_coming_soon"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = () => {
    if (Platform.OS === "android") {
      ToastAndroid.show(t("paywall_coming_soon"), ToastAndroid.SHORT);
    } else {
      Alert.alert("", t("paywall_coming_soon"));
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 52, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: ACCENT + "20" }]}>
          <Ionicons name="leaf" size={38} color={ACCENT} />
        </View>

        {/* Headline */}
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t("paywall_title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t("paywall_subtitle")}
        </Text>

        {/* Trial badge */}
        <View style={[styles.trialBadge, { backgroundColor: ACCENT + "18", borderColor: ACCENT + "40" }]}>
          <Ionicons name="gift-outline" size={15} color={ACCENT} />
          <Text style={[styles.trialText, { color: ACCENT }]}>
            {t("paywall_trial_offer")}
          </Text>
        </View>

        {/* Feature list */}
        <View style={[styles.featuresCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {FEATURES.map((f, i) => (
            <View key={f.key} style={[styles.featureRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[styles.featureIconWrap, { backgroundColor: ACCENT + "15" }]}>
                <Ionicons name={f.icon} size={18} color={ACCENT} />
              </View>
              <Text style={[styles.featureLabel, { color: colors.foreground }]}>
                {t(f.key)}
              </Text>
              <Ionicons name="checkmark-circle" size={18} color={ACCENT} />
            </View>
          ))}
        </View>

        {/* Price block */}
        <View style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.planName, { color: colors.foreground }]}>
              {t("paywall_plan_name")}
            </Text>
            <Text style={[styles.price, { color: colors.foreground }]}>
              {t("paywall_yearly_price")}
            </Text>
          </View>
          <Text style={[styles.priceNote, { color: colors.mutedForeground }]}>
            {t("paywall_price_note")}
          </Text>
        </View>

        {/* Subscribe CTA */}
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: ACCENT, opacity: loading ? 0.7 : 1 }]}
          onPress={handleSubscribe}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={styles.ctaText}>
            {loading ? t("paywall_loading") : hasUsedTrial ? t("paywall_subscribe_now") : t("paywall_subscribe_btn")}
          </Text>
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} activeOpacity={0.7}>
          <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
            {t("paywall_restore")}
          </Text>
        </TouchableOpacity>

        {/* Terms */}
        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          {t("paywall_terms")}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  closeBtn: {
    position: "absolute",
    right: 18,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 18,
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  trialText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  featuresCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  priceCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  planName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  price: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  priceNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  cta: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  restoreBtn: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  restoreText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  terms: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
  },
});
