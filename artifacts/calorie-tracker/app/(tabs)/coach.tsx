import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  Linking,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import { getTodayHealthActivity } from "@/lib/health";

const safeOpenSettings = () => {
  if (typeof Linking.openSettings === "function") {
    Linking.openSettings().catch(() => {});
  } else {
    Linking.openURL("app-settings:").catch(() => {});
  }
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

const OVERPASS_TAGS: Record<string, string> = {
  gym:        `["leisure"="fitness_centre"]`,
  fitness:    `["leisure"="fitness_centre"]`,
  "健身房":   `["leisure"="fitness_centre"]`,
  "健身中心": `["leisure"="fitness_centre"]`,
  yoga:       `["sport"="yoga"]`,
  "瑜伽":     `["sport"="yoga"]`,
  swimming:   `["leisure"="swimming_pool"]["access"!="private"]`,
  pool:       `["leisure"="swimming_pool"]["access"!="private"]`,
  "游泳池":   `["leisure"="swimming_pool"]["access"!="private"]`,
  park:       `["leisure"="park"]`,
  nature:     `["leisure"="park"]`,
  outdoor:    `["leisure"="park"]`,
  "公園":     `["leisure"="park"]`,
  "公园":     `["leisure"="park"]`,
  restaurant: `["amenity"="restaurant"]`,
  "餐廳":     `["amenity"="restaurant"]`,
  "餐厅":     `["amenity"="restaurant"]`,
  "餐館":     `["amenity"="restaurant"]`,
  "食肆":     `["amenity"="restaurant"]`,
};

async function searchNearbyOverpass(lat: number, lng: number, query: string): Promise<PlaceResult[]> {
  const lower = query.trim().toLowerCase();
  const tag = Object.entries(OVERPASS_TAGS).find(([k]) => lower.includes(k.toLowerCase()))?.[1]
    ?? `["leisure"="fitness_centre"]`;
  const oql = `[out:json][timeout:15];(node${tag}(around:5000,${lat},${lng});way${tag}(around:5000,${lat},${lng}););out center 10;`;
  const resp = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(oql)}`,
  });
  if (!resp.ok) throw new Error(`Overpass error ${resp.status}`);
  const data = await resp.json() as {
    elements?: Array<{
      lat?: number; lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };
  return (data.elements ?? [])
    .filter((el) => el.tags?.name)
    .map((el) => {
      const pLat = el.lat ?? el.center?.lat ?? lat;
      const pLng = el.lon ?? el.center?.lon ?? lng;
      const tags = el.tags ?? {};
      const addrParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"] ?? tags["addr:suburb"]].filter(Boolean);
      return {
        name: tags.name ?? "",
        address: addrParts.join(", "),
        rating: null,
        distance: haversineKm(lat, lng, pLat, pLng),
        mapsUrl: `https://maps.google.com/?q=${pLat},${pLng}`,
      };
    })
    .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
}

type MessageRole = "user" | "agent";

interface BaseMessage {
  id: string;
  role: MessageRole;
  timestamp: Date;
}

interface TextMessage extends BaseMessage {
  type: "text";
  text: string;
}

interface AnalysisMessage extends BaseMessage {
  type: "analysis";
  summary: string;
  deficiencies: string[];
  recommendation_text: string;
}

interface GymPartner {
  id: string;
  partnerId: string;
  name: string;
  title: string;
  promoCode: string | null;
  discount: string;
  description: string;
  validUntil: string;
}

interface GymMessage extends BaseMessage {
  type: "gym";
  partners: GymPartner[];
  reasoning?: string;
}

interface PlaceResult {
  name: string;
  address: string;
  rating: number | null;
  distance?: number | null;
  mapsUrl: string;
}

interface NearbyMessage extends BaseMessage {
  type: "nearby";
  places: PlaceResult[];
  placeType: string;
}

interface SupplementProduct {
  name: string;
  description: string;
  affiliateLink: string;
  priceNote: string;
}

interface SupplementMessage extends BaseMessage {
  type: "supplement";
  products: SupplementProduct[];
}

type QuestionKey =
  | "q_hypertension"
  | "q_high_cholesterol"
  | "q_diabetes"
  | "q_pregnant"
  | "q_medications"
  | "q_supplement_allergies";

interface QuestionMessage extends BaseMessage {
  type: "question";
  questionKey: QuestionKey;
  answered: boolean;
}

interface SupplementApiResponse {
  success: boolean;
  products?: SupplementProduct[];
  needs_questionnaire?: boolean;
  next_question?: string;
  fallback?: boolean;
}

interface HealthFlagsData {
  hypertension?: boolean;
  high_cholesterol?: boolean;
  diabetes?: boolean;
  pregnant?: boolean;
  medications?: string | boolean;
  supplement_allergies?: boolean;
}

interface HealthProfileSummaryMessage extends BaseMessage {
  type: "health_profile_summary";
  flags: HealthFlagsData;
}

type Message =
  | TextMessage
  | AnalysisMessage
  | GymMessage
  | NearbyMessage
  | SupplementMessage
  | QuestionMessage
  | HealthProfileSummaryMessage;


function genId() {
  return Math.random().toString(36).slice(2);
}


function PlaceCard({
  place,
  colors,
  t,
}: {
  place: PlaceResult;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
}) {
  return (
    <View style={[cs.partnerCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Text style={[cs.gymName, { color: colors.foreground, marginRight: 0 }]} numberOfLines={2}>
        {place.name}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
        <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
        <Text style={[cs.gymAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
          {place.address}
        </Text>
      </View>
      {place.distance != null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
          <Ionicons name="navigate-outline" size={12} color={colors.mutedForeground} />
          <Text style={[cs.gymAddress, { color: colors.mutedForeground }]}>{place.distance} km</Text>
        </View>
      )}
      <TouchableOpacity
        style={[cs.getOfferBtn, { backgroundColor: colors.foreground, marginTop: 8, alignSelf: "flex-start" }]}
        activeOpacity={0.8}
        onPress={() => Linking.openURL(place.mapsUrl).catch(() => null)}
      >
        <Text style={[cs.getOfferText, { color: colors.background }]}>{t("coach_directions_btn")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SupplementCard({
  product,
  colors,
  t,
}: {
  product: SupplementProduct;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
}) {
  return (
    <View style={[cs.partnerCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Text style={[cs.gymName, { color: colors.foreground, marginRight: 0 }]} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={[cs.gymDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
        {product.description}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <Text
          style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1, marginRight: 8 }}
        >
          {product.priceNote || t("coach_supplement_price_note")}
        </Text>
        <TouchableOpacity
          style={[cs.getOfferBtn, { backgroundColor: "#22c55e" }]}
          activeOpacity={0.8}
          onPress={() => Linking.openURL(product.affiliateLink).catch(() => null)}
        >
          <Text style={[cs.getOfferText, { color: "#fff" }]}>{t("coach_shop_iherb")}</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 8, fontStyle: "italic" }}>
        {t("coach_supplement_disclaimer")}
      </Text>
    </View>
  );
}

// Bundled question definitions: when user answers "Yes", show follow-up chips.
// "No" sets all associated flags to false immediately (no follow-up needed).
const BUNDLED_QUESTIONS: Record<
  string,
  {
    promptKey: string;
    chips: Array<{
      labelKey: string;
      flags: Record<string, boolean>;
    }>;
    noFlags: Record<string, boolean>;
  }
> = {
  q_hypertension: {
    promptKey: "coach_hq_followup_cardiovascular_prompt",
    chips: [
      { labelKey: "coach_hq_followup_hypertension_chip", flags: { hypertension: true, high_cholesterol: false } },
      { labelKey: "coach_hq_followup_cholesterol_chip", flags: { hypertension: false, high_cholesterol: true } },
      { labelKey: "coach_hq_followup_both_chip", flags: { hypertension: true, high_cholesterol: true } },
    ],
    noFlags: { hypertension: false, high_cholesterol: false },
  },
  q_diabetes: {
    promptKey: "coach_hq_followup_metabolic_prompt",
    chips: [
      { labelKey: "coach_hq_followup_diabetes_chip", flags: { diabetes: true, pregnant: false } },
      { labelKey: "coach_hq_followup_pregnant_chip", flags: { diabetes: false, pregnant: true } },
      { labelKey: "coach_hq_followup_both_chip", flags: { diabetes: true, pregnant: true } },
    ],
    noFlags: { diabetes: false, pregnant: false },
  },
};

function QuestionBubble({
  msg,
  colors,
  t,
  onAnswer,
  disabled,
}: {
  msg: QuestionMessage;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
  onAnswer: (msgId: string, flags: Record<string, unknown>, displayText: string) => void;
  disabled: boolean;
}) {
  const [textValue, setTextValue] = React.useState("");
  const [showFollowUp, setShowFollowUp] = React.useState(false);
  const questionText = t(`coach_hq_${msg.questionKey}_text`);
  const isTextQuestion = msg.questionKey === "q_medications";
  const bundled = BUNDLED_QUESTIONS[msg.questionKey];
  // Each question maps 1-to-1 to its flag key: strip the "q_" prefix
  const flagName = msg.questionKey.replace("q_", "");

  const handleYes = () => {
    if (msg.answered || disabled) return;
    if (bundled) {
      setShowFollowUp(true);
    } else {
      onAnswer(msg.id, { [flagName]: true }, t("coach_hq_yes_display"));
    }
  };

  const handleNo = () => {
    if (msg.answered || disabled) return;
    if (bundled) {
      onAnswer(msg.id, bundled.noFlags as Record<string, unknown>, t("coach_hq_no_display"));
    } else {
      onAnswer(msg.id, { [flagName]: false }, t("coach_hq_no_display"));
    }
  };

  const handleChipSelect = (chip: { labelKey: string; flags: Record<string, boolean> }) => {
    if (msg.answered || disabled) return;
    onAnswer(msg.id, chip.flags as Record<string, unknown>, t(chip.labelKey));
  };

  const handleTextSubmit = () => {
    if (msg.answered || disabled) return;
    const trimmed = textValue.trim();
    onAnswer(
      msg.id,
      { medications: trimmed || "none" },
      trimmed || t("coach_hq_skip_display"),
    );
  };

  const handleSkip = () => {
    if (msg.answered || disabled) return;
    onAnswer(msg.id, { medications: "none" }, t("coach_hq_skip_display"));
  };

  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.agentText, { color: colors.foreground }]}>{questionText}</Text>
        {!msg.answered && (
          isTextQuestion ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              <TextInput
                style={[
                  cs.hqInput,
                  { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
                ]}
                placeholder={t("coach_hq_q_medications_text")}
                placeholderTextColor={colors.mutedForeground}
                value={textValue}
                onChangeText={setTextValue}
                editable={!disabled}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[cs.hqBtn, { backgroundColor: colors.foreground, flex: 1 }]}
                  onPress={handleTextSubmit}
                  disabled={disabled}
                  activeOpacity={0.8}
                >
                  <Text style={[cs.hqBtnText, { color: colors.background }]}>{t("coach_hq_submit")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cs.hqBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                  onPress={handleSkip}
                  disabled={disabled}
                  activeOpacity={0.8}
                >
                  <Text style={[cs.hqBtnText, { color: colors.mutedForeground }]}>{t("coach_hq_skip")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : showFollowUp && bundled ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              <Text style={[cs.agentText, { color: colors.mutedForeground, fontSize: 13 }]}>
                {t(bundled.promptKey)}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {bundled.chips.map((chip) => (
                  <TouchableOpacity
                    key={chip.labelKey}
                    style={[
                      cs.hqBtn,
                      { backgroundColor: colors.foreground, paddingHorizontal: 14 },
                    ]}
                    onPress={() => handleChipSelect(chip)}
                    disabled={disabled}
                    activeOpacity={0.8}
                  >
                    <Text style={[cs.hqBtnText, { color: colors.background }]}>{t(chip.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[cs.hqBtn, { backgroundColor: colors.foreground, flex: 1 }]}
                onPress={handleYes}
                disabled={disabled}
                activeOpacity={0.8}
              >
                <Text style={[cs.hqBtnText, { color: colors.background }]}>{t("coach_hq_yes")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[cs.hqBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, flex: 1 }]}
                onPress={handleNo}
                disabled={disabled}
                activeOpacity={0.8}
              >
                <Text style={[cs.hqBtnText, { color: colors.foreground }]}>{t("coach_hq_no")}</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </View>
    </View>
  );
}


function NearbyResultsMessage({
  msg,
  colors,
  t,
}: {
  msg: NearbyMessage;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
}) {
  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.analysisTitle, { color: colors.foreground }]}>{t("coach_nearby_title")}</Text>
        {msg.places.length === 0 ? (
          <Text style={[cs.summaryText, { color: colors.mutedForeground }]}>{t("coach_no_places")}</Text>
        ) : (
          <View style={{ marginTop: 8, gap: 8 }}>
            {msg.places.map((p, i) => (
              <PlaceCard key={i} place={p} colors={colors} t={t} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function SupplementResultsMessage({
  msg,
  colors,
  t,
}: {
  msg: SupplementMessage;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
}) {
  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.analysisTitle, { color: colors.foreground }]}>{t("coach_supplement_title")}</Text>
        <View style={{ marginTop: 8, gap: 8 }}>
          {msg.products.map((p, i) => (
            <SupplementCard key={i} product={p} colors={colors} t={t} />
          ))}
        </View>
      </View>
    </View>
  );
}

function HealthProfileSummaryCard({
  msg,
  colors,
  t,
  onUpdate,
  disabled,
}: {
  msg: HealthProfileSummaryMessage;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
  onUpdate: () => void;
  disabled: boolean;
}) {
  const { flags } = msg;

  function flagDisplay(val: boolean | undefined): string {
    if (val === undefined) return "—";
    return val ? t("coach_hp_yes") : t("coach_hp_no");
  }

  function medDisplay(val: string | boolean | undefined): string {
    if (val === undefined) return "—";
    if (val === false || val === "none") return t("coach_hp_none");
    if (val === true) return t("coach_hp_yes");
    return String(val);
  }

  const rows: Array<{ labelKey: string; value: string }> = [
    { labelKey: "coach_hp_hypertension", value: flagDisplay(flags.hypertension) },
    { labelKey: "coach_hp_high_cholesterol", value: flagDisplay(flags.high_cholesterol) },
    { labelKey: "coach_hp_diabetes", value: flagDisplay(flags.diabetes) },
    { labelKey: "coach_hp_pregnant", value: flagDisplay(flags.pregnant) },
    { labelKey: "coach_hp_medications", value: medDisplay(flags.medications) },
    { labelKey: "coach_hp_supplement_allergies", value: flagDisplay(flags.supplement_allergies) },
  ];

  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.analysisTitle, { color: colors.foreground }]}>{t("coach_hp_summary_title")}</Text>
        <View style={{ marginTop: 8, gap: 7 }}>
          {rows.map((row) => (
            <View
              key={row.labelKey}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
            >
              <Text
                style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1, marginRight: 8 }}
              >
                {t(row.labelKey)}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={[
            cs.hqBtn,
            { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, marginTop: 12, alignSelf: "flex-start" },
          ]}
          onPress={onUpdate}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={[cs.hqBtnText, { color: colors.foreground }]}>{t("coach_hp_update_btn")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AnalysisCard({
  msg,
  colors,
  t,
}: {
  msg: AnalysisMessage;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
}) {
  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.analysisTitle, { color: colors.foreground }]}>{t("coach_analysis_title")}</Text>
        <Text style={[cs.summaryText, { color: colors.foreground }]}>{msg.summary}</Text>
        {msg.deficiencies.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={[cs.sectionLabel, { color: colors.mutedForeground }]}>{t("coach_deficiencies_label")}</Text>
            <View style={cs.tagRow}>
              {msg.deficiencies.map((d, i) => (
                <View key={i} style={[cs.defTag, { backgroundColor: "#ef444420", borderColor: "#ef444440" }]}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#ef4444" }}>{d}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={[cs.recBox, { backgroundColor: colors.muted, marginTop: 10 }]}>
          <Ionicons name="bulb-outline" size={14} color={colors.mutedForeground} />
          <Text style={[cs.recText, { color: colors.foreground }]}>{msg.recommendation_text}</Text>
        </View>
      </View>
    </View>
  );
}

function PartnerCard({
  gym,
  colors,
  t,
  baseUrl,
  userId,
}: {
  gym: GymPartner;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
  baseUrl: string;
  userId: string | null;
}) {
  const handleGetOffer = async () => {
    try {
      await fetch(`${baseUrl}/api/partners/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId ?? "anonymous", partnerId: gym.partnerId, offerId: gym.id }),
      });
    } catch {
      // non-fatal
    }
    const alertBody = gym.promoCode
      ? `${t("coach_offer_alert_msg_prefix")} ${gym.promoCode}\n${t("coach_offer_alert_msg_suffix")} ${gym.discount}`
      : `${t("coach_offer_alert_msg_suffix")} ${gym.discount}`;
    Alert.alert(t("coach_offer_alert_title"), alertBody);
  };

  return (
    <View style={[cs.partnerCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={[cs.gymName, { color: colors.foreground }]} numberOfLines={1}>{gym.name}</Text>
        {gym.promoCode ? (
          <View style={[cs.promoBadge, { backgroundColor: "#111827" }]}>
            <Text style={cs.promoCode}>{gym.promoCode}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[cs.gymDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{gym.title}</Text>
      <Text style={[cs.gymDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{gym.description}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>{gym.discount}</Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
            {t("coach_valid_until")} {gym.validUntil}
          </Text>
        </View>
        <TouchableOpacity
          style={[cs.getOfferBtn, { backgroundColor: colors.foreground }]}
          activeOpacity={0.8}
          onPress={handleGetOffer}
        >
          <Text style={[cs.getOfferText, { color: colors.background }]}>{t("coach_get_offer")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function GymMessageBubble({
  msg,
  colors,
  t,
  baseUrl,
  userId,
}: {
  msg: GymMessage;
  colors: ReturnType<typeof useColors>;
  t: (k: string) => string;
  baseUrl: string;
  userId: string | null;
}) {
  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cs.analysisTitle, { color: colors.foreground }]}>{t("coach_gym_title")}</Text>
        {!!msg.reasoning && (
          <Text style={[cs.summaryText, { color: colors.mutedForeground }]}>{msg.reasoning}</Text>
        )}
        <View style={{ marginTop: msg.reasoning ? 10 : 4, gap: 8 }}>
          {msg.partners.map((gym) => (
            <PartnerCard key={gym.id} gym={gym} colors={colors} t={t} baseUrl={baseUrl} userId={userId} />
          ))}
        </View>
      </View>
    </View>
  );
}

function AgentTextBubble({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cs.aiBadge}>
        <Text style={cs.aiBadgeText}>AI</Text>
      </View>
      <Text style={[cs.agentText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

function UserBubble({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={cs.userBubbleRow}>
      <View style={[cs.userBubble, { backgroundColor: colors.foreground }]}>
        <Text style={[cs.userText, { color: colors.background }]}>{text}</Text>
      </View>
    </View>
  );
}

export default function CoachScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const { t, languageCode } = useI18n();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastDeficienciesRef = useRef<string[]>([]);
  // Always-fresh language ref so callbacks never hold a stale languageCode closure
  const languageCodeRef = useRef(languageCode);
  useEffect(() => { languageCodeRef.current = languageCode; }, [languageCode]);

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const appendMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ── Analyze my week ────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (loading) return;
    appendMessage({ id: genId(), role: "user", type: "text", text: t("coach_chip_analyze"), timestamp: new Date() });
    setLoading(true);
    try {
      const healthActivity = await getTodayHealthActivity();
      const res = await fetch(`${baseUrl}/api/agent/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          appLanguage: languageCodeRef.current,
          steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
          activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { summary: string; deficiencies: string[]; recommendation_text: string };
      lastDeficienciesRef.current = data.deficiencies ?? [];
      appendMessage({
        id: genId(), role: "agent", type: "analysis",
        summary: data.summary,
        deficiencies: data.deficiencies,
        recommendation_text: data.recommendation_text,
        timestamp: new Date(),
      });
    } catch {
      appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  }, [loading, userId, baseUrl, t, appendMessage]);

  // ── Ask Coach (free-form Q&A) ──────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const query = inputText.trim();
    if (!query || loading) return;
    setInputText("");
    appendMessage({ id: genId(), role: "user", type: "text", text: query, timestamp: new Date() });
    setLoading(true);
    try {
      const healthActivity = await getTodayHealthActivity();
      const res = await fetch(`${baseUrl}/api/agent/advise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          user_query: query,
          appLanguage: languageCodeRef.current,
          steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
          activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { response: string };
      appendMessage({ id: genId(), role: "agent", type: "text", text: data.response, timestamp: new Date() });
    } catch {
      appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, userId, baseUrl, t, appendMessage]);

  const handleAskCoach = useCallback(() => {
    if (loading) return;
    setInputText(t("coach_ask_placeholder_sample"));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [loading, t]);

  // ── Direct nearby search (Gyms / Restaurants / Parks & Nature) ───────────
  const handleNearbyDirect = useCallback(async (category: string, labelKey: string) => {
    if (loading) return;
    appendMessage({ id: genId(), role: "user", type: "text", text: t(labelKey), timestamp: new Date() });
    setLoading(true);
    try {
      // Check if device-level location services are on first
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(
          t("coach_location_denied_title"),
          t("coach_location_services_off"),
          [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("coach_location_settings_btn"),
              onPress: () =>
                Linking.openURL("App-prefs:root=Privacy").catch(() => safeOpenSettings()),
            },
          ]
        );
        setLoading(false);
        return;
      }

      // Check current permission status (non-prompting)
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      if (existing === Location.PermissionStatus.DENIED) {
        // Already denied — iOS won't re-prompt, must go to Settings
        Alert.alert(
          t("coach_location_denied_title"),
          t("coach_location_denied_body"),
          [
            { text: t("cancel"), style: "cancel" },
            { text: t("coach_location_settings_btn"), onPress: safeOpenSettings },
          ]
        );
        setLoading(false);
        return;
      }

      // Request permission (first-time or web)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("coach_location_denied_title"),
          t("coach_location_denied_body"),
          [
            { text: t("cancel"), style: "cancel" },
            { text: t("coach_location_settings_btn"), onPress: safeOpenSettings },
          ]
        );
        setLoading(false);
        return;
      }

      appendMessage({
        id: genId(), role: "agent", type: "text",
        text: t("coach_location_rationale"),
        timestamp: new Date(),
      });

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let places: PlaceResult[];
      if (process.env.EXPO_PUBLIC_DOMAIN) {
        const res = await fetch(`${baseUrl}/api/search-nearby`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: category,
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            appLanguage: languageCodeRef.current,
          }),
        });
        const data = await res.json() as {
          success: boolean; places?: PlaceResult[]; error?: string; warning?: string;
        };
        if (!data.success && !data.warning) throw new Error(data.error ?? "Failed");
        if (data.warning) {
          appendMessage({ id: genId(), role: "agent", type: "text", text: data.warning, timestamp: new Date() });
          return;
        }
        places = data.places ?? [];
      } else {
        places = await searchNearbyOverpass(loc.coords.latitude, loc.coords.longitude, category);
      }
      appendMessage({
        id: genId(), role: "agent", type: "nearby",
        places,
        placeType: category,
        timestamp: new Date(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t("coach_error_generic");
      appendMessage({ id: genId(), role: "agent", type: "text", text: errMsg, timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  }, [loading, baseUrl, t, appendMessage]);

  // ── Inner: fetch supplement recommendations (no loading management) ─────────
  const fetchSupplements = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/supplement-recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          deficiencies: lastDeficienciesRef.current,
          appLanguage: languageCodeRef.current,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as SupplementApiResponse;
      if (data.needs_questionnaire && data.next_question) {
        appendMessage({
          id: genId(), role: "agent", type: "question",
          questionKey: data.next_question as QuestionKey,
          answered: false,
          timestamp: new Date(),
        });
      } else if (data.products) {
        appendMessage({
          id: genId(), role: "agent", type: "supplement",
          products: data.products,
          timestamp: new Date(),
        });
      }
    } catch {
      appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
    }
  }, [userId, baseUrl, languageCode, t, appendMessage]);

  // ── Find supplements (iHerb affiliate recommendations) ────────────────────
  const handleSupplements = useCallback(async () => {
    if (loading) return;
    appendMessage({ id: genId(), role: "user", type: "text", text: t("coach_chip_supplements"), timestamp: new Date() });
    setLoading(true);
    try {
      // Step 1: Always run nutrition analysis first and show the card
      const healthActivity = await getTodayHealthActivity();
      try {
        const analyzeRes = await fetch(`${baseUrl}/api/agent/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            appLanguage: languageCodeRef.current,
            steps: healthActivity.isAuthorized ? healthActivity.steps : undefined,
            activeCalories: healthActivity.isAuthorized ? healthActivity.activeCalories : undefined,
          }),
        });
        if (analyzeRes.ok) {
          const ad = await analyzeRes.json() as { summary: string; deficiencies: string[]; recommendation_text: string };
          lastDeficienciesRef.current = ad.deficiencies ?? [];
          appendMessage({
            id: genId(), role: "agent", type: "analysis",
            summary: ad.summary,
            deficiencies: ad.deficiencies ?? [],
            recommendation_text: ad.recommendation_text,
            timestamp: new Date(),
          });
        }
      } catch {
        appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
      }

      // Step 2: If all 6 health flags are stored, show the summary card before products
      if (userId) {
        try {
          const flagsRes = await fetch(`${baseUrl}/api/health-flags?user_id=${encodeURIComponent(userId)}`);
          if (flagsRes.ok) {
            const flagsData = await flagsRes.json() as { success: boolean; flags?: HealthFlagsData };
            const flags = flagsData.flags ?? {};
            const allAnswered =
              flags.hypertension !== undefined &&
              flags.high_cholesterol !== undefined &&
              flags.diabetes !== undefined &&
              flags.pregnant !== undefined &&
              flags.medications !== undefined &&
              flags.supplement_allergies !== undefined;
            if (allAnswered) {
              appendMessage({
                id: genId(), role: "agent", type: "health_profile_summary",
                flags: flags as HealthFlagsData,
                timestamp: new Date(),
              });
            }
          }
        } catch {
          // non-fatal
        }
      }

      // Step 3: Fetch recommendations (may trigger questionnaire if flags are incomplete)
      await fetchSupplements();
    } catch {
      appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  }, [loading, userId, baseUrl, t, appendMessage, fetchSupplements]);

  // ── Reset health flags and re-trigger supplement questionnaire ───────────
  const handleResetFlags = useCallback(async () => {
    if (loading) return;
    appendMessage({ id: genId(), role: "user", type: "text", text: t("coach_hp_update_btn"), timestamp: new Date() });
    setLoading(true);
    try {
      if (userId) {
        const res = await fetch(`${baseUrl}/api/health-flags`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        if (!res.ok) {
          appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
          return;
        }
      }
      await fetchSupplements();
    } catch {
      appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  }, [loading, userId, baseUrl, t, appendMessage, fetchSupplements]);

  // ── Answer a health questionnaire question ────────────────────────────────
  const handleAnswerQuestion = useCallback(async (
    msgId: string,
    flags: Record<string, unknown>,
    displayText: string,
  ) => {
    if (loading) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, answered: true } as QuestionMessage : m)),
    );
    appendMessage({ id: genId(), role: "user", type: "text", text: displayText, timestamp: new Date() });
    setLoading(true);
    try {
      const flagRes = await fetch(`${baseUrl}/api/health-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, flags }),
      });
      if (!flagRes.ok) throw new Error(`Failed to save flag (${flagRes.status})`);
      await fetchSupplements();
    } catch {
      appendMessage({ id: genId(), role: "agent", type: "text", text: t("coach_error_generic"), timestamp: new Date() });
    } finally {
      setLoading(false);
    }
  }, [loading, userId, baseUrl, t, appendMessage, fetchSupplements]);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0) + 16;
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 84 : 60) + 8;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingTop: topPad,
            paddingBottom: bottomPad + 72,
            paddingHorizontal: 16,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 20 }}>
            <Text style={[cs.title, { color: colors.foreground }]}>{t("tab_coach")}</Text>
            <Text style={[cs.subtitle, { color: colors.mutedForeground }]}>{t("coach_subtitle")}</Text>
          </View>

          <View style={cs.chipRow}>
            <TouchableOpacity
              style={[cs.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleAnalyze}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Ionicons name="bar-chart-outline" size={16} color={colors.foreground} />
              <Text style={[cs.chipText, { color: colors.foreground }]}>{t("coach_chip_analyze")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleAskCoach}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.foreground} />
              <Text style={[cs.chipText, { color: colors.foreground }]}>{t("coach_chip_ask")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleNearbyDirect("gym", "coach_chip_gyms")}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Ionicons name="fitness-outline" size={16} color={colors.foreground} />
              <Text style={[cs.chipText, { color: colors.foreground }]}>{t("coach_chip_gyms")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleNearbyDirect("restaurant", "coach_chip_restaurants")}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Ionicons name="restaurant-outline" size={16} color={colors.foreground} />
              <Text style={[cs.chipText, { color: colors.foreground }]}>{t("coach_chip_restaurants")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleNearbyDirect("park", "coach_chip_nature")}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Ionicons name="leaf-outline" size={16} color={colors.foreground} />
              <Text style={[cs.chipText, { color: colors.foreground }]}>{t("coach_chip_nature")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleSupplements}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Ionicons name="nutrition-outline" size={16} color={colors.foreground} />
              <Text style={[cs.chipText, { color: colors.foreground }]}>{t("coach_chip_supplements")}</Text>
            </TouchableOpacity>
          </View>

          {messages.length === 0 && (
            <View style={[cs.emptyState, { borderColor: colors.border }]}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.mutedForeground} />
              <Text style={[cs.emptyText, { color: colors.mutedForeground }]}>{t("coach_empty_hint")}</Text>
            </View>
          )}

          {messages.map((msg) => {
            if (msg.role === "user") {
              return <UserBubble key={msg.id} text={(msg as TextMessage).text} colors={colors} />;
            }
            if (msg.type === "analysis") {
              return <AnalysisCard key={msg.id} msg={msg as AnalysisMessage} colors={colors} t={t} />;
            }
            if (msg.type === "gym") {
              return (
                <GymMessageBubble
                  key={msg.id}
                  msg={msg as GymMessage}
                  colors={colors}
                  t={t}
                  baseUrl={baseUrl}
                  userId={userId}
                />
              );
            }
            if (msg.type === "nearby") {
              return <NearbyResultsMessage key={msg.id} msg={msg as NearbyMessage} colors={colors} t={t} />;
            }
            if (msg.type === "supplement") {
              return <SupplementResultsMessage key={msg.id} msg={msg as SupplementMessage} colors={colors} t={t} />;
            }
            if (msg.type === "question") {
              return (
                <QuestionBubble
                  key={msg.id}
                  msg={msg as QuestionMessage}
                  colors={colors}
                  t={t}
                  onAnswer={handleAnswerQuestion}
                  disabled={loading}
                />
              );
            }
            if (msg.type === "health_profile_summary") {
              return (
                <HealthProfileSummaryCard
                  key={msg.id}
                  msg={msg as HealthProfileSummaryMessage}
                  colors={colors}
                  t={t}
                  onUpdate={handleResetFlags}
                  disabled={loading}
                />
              );
            }
            return <AgentTextBubble key={msg.id} text={(msg as TextMessage).text} colors={colors} />;
          })}

          {loading && (
            <View style={[cs.agentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={cs.aiBadge}>
                <Text style={cs.aiBadgeText}>AI</Text>
              </View>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            </View>
          )}
        </ScrollView>

        <View
          style={[
            cs.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: bottomPad,
            },
          ]}
        >
          <TextInput
            style={[
              cs.input,
              {
                backgroundColor: colors.card,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            placeholder={t("coach_input_placeholder")}
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!loading}
          />
          <TouchableOpacity
            style={[cs.sendBtn, { backgroundColor: loading || !inputText.trim() ? colors.muted : colors.foreground }]}
            onPress={handleSend}
            disabled={loading || !inputText.trim()}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={loading || !inputText.trim() ? colors.mutedForeground : colors.background}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const cs = StyleSheet.create({
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    borderWidth: 1,
    borderRadius: 16,
    borderStyle: "dashed",
    gap: 12,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 220,
  },
  userBubbleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  userBubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  userText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  agentBubble: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    padding: 12,
    marginBottom: 12,
    maxWidth: "92%",
  },
  aiBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  aiBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  agentText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  analysisTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  defTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  recBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
  },
  recText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  partnerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  gymName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    flex: 1,
    marginRight: 8,
  },
  promoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  promoCode: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  gymAddress: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  gymDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 4,
  },
  getOfferBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  getOfferText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  typePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typePickerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginBottom: 1,
  },
  hqInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 44,
  },
  hqBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  hqBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  healthPromptCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  healthPromptTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  healthPromptSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
