import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  Image,
  ScrollView,
  TextInput,
} from "react-native";
import { cancelTodayStreakNudge } from "@/hooks/useStreakNotification";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

type TrackState = "camera" | "analyzing" | "result";

interface Ingredient {
  name: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface AnalysisResult {
  mealName: string;
  ingredients: Ingredient[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  confidenceScore: number;
  photoUrl: string | null;
  capturedImageUri: string;
}

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function getMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

interface CompressedImage {
  uri: string;
  base64: string;
}

async function compressImage(uri: string, t: (k: string) => string): Promise<CompressedImage> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512, height: 512 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );

  if (!manipulated.base64) {
    throw new Error(t("compression_failed"));
  }
  return { uri: manipulated.uri, base64: manipulated.base64 };
}

async function createThumbnail(uri: string): Promise<string | null> {
  try {
    const thumb = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 200, height: 200 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return thumb.base64 ? `data:image/jpeg;base64,${thumb.base64}` : null;
  } catch {
    return null;
  }
}

function ConfidenceIndicator({
  score,
  colors,
}: {
  score: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { t } = useI18n();

  const color =
    score >= 0.85
      ? colors.highConfidence
      : score >= 0.7
      ? colors.mediumConfidence
      : colors.lowConfidence;

  const label =
    score >= 0.85
      ? t("confidence_high")
      : score >= 0.7
      ? t("confidence_medium")
      : t("confidence_low");

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color, fontSize: 13, fontFamily: "Inter_500Medium" }}>{label}</Text>
    </View>
  );
}

export default function TrackScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const { t, languageCode } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [state, setState] = useState<TrackState>("camera");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editingIngredients, setEditingIngredients] = useState<Ingredient[]>([]);
  const [showIngredients, setShowIngredients] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [portionPct, setPortionPct] = useState(100);
  const [portionText, setPortionText] = useState("100");

  const s = styles(colors);

  async function processImage(imageUri: string) {
    setState("analyzing");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const domain = process.env.EXPO_PUBLIC_DOMAIN;

    try {
      const [compressed, thumbnailDataUrl] = await Promise.all([
        compressImage(imageUri, t),
        createThumbnail(imageUri),
      ]);

      const analysisRes = await fetch(`https://${domain}/api/analyze-food`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: compressed.base64, userId, languageCode }),
      });

      const analysisText = await analysisRes.text();
      if (!analysisRes.ok) {
        let errMsg = t("analysis_failed_default");
        try {
          const err = JSON.parse(analysisText) as { error?: string };
          if (err.error) errMsg = err.error;
        } catch { /* non-JSON body */ }
        throw new Error(errMsg);
      }

      let analysis: Omit<AnalysisResult, "capturedImageUri" | "photoUrl">;
      try {
        analysis = JSON.parse(analysisText);
      } catch {
        throw new Error(t("unexpected_response"));
      }
      const photoUrl = thumbnailDataUrl;
      const fullResult: AnalysisResult = { ...analysis, photoUrl, capturedImageUri: imageUri };
      setResult(fullResult);
      setEditingIngredients(fullResult.ingredients);
      setPortionPct(100);
      setPortionText("100");
      setState("result");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: unknown) {
      setState("camera");
      const message = error instanceof Error ? error.message : t("please_try_again");
      Alert.alert(t("analysis_failed_title"), message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function takePicture() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        t("camera_access_title"),
        t("allow_camera_msg"),
        [
          { text: t("not_now"), style: "cancel" },
          { text: t("open_settings"), onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.9,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets[0]) {
      await processImage(res.assets[0].uri);
    }
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
    });
    if (!res.canceled && res.assets[0]) {
      await processImage(res.assets[0].uri);
    }
  }

  function updateIngredientPortion(idx: number, newGrams: number) {
    setEditingIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== idx) return ing;
        if (ing.portionGrams === 0) return { ...ing, portionGrams: newGrams };
        const ratio = newGrams / ing.portionGrams;
        return {
          ...ing,
          portionGrams: newGrams,
          calories: Math.round(ing.calories * ratio),
          proteinG: Math.round(ing.proteinG * ratio * 10) / 10,
          carbsG: Math.round(ing.carbsG * ratio * 10) / 10,
          fatG: Math.round(ing.fatG * ratio * 10) / 10,
        };
      }),
    );
  }

  async function saveMeal() {
    if (!result || !userId) return;
    setIsSaving(true);

    const rawCalories = editingIngredients.reduce((s, i) => s + i.calories, 0);
    const rawProteinG = editingIngredients.reduce((s, i) => s + i.proteinG, 0);
    const rawCarbsG = editingIngredients.reduce((s, i) => s + i.carbsG, 0);
    const rawFatG = editingIngredients.reduce((s, i) => s + i.fatG, 0);
    const saveScale = portionPct / 100;
    const totalCalories = rawCalories * saveScale;
    const totalProteinG = rawProteinG * saveScale;
    const totalCarbsG = rawCarbsG * saveScale;
    const totalFatG = rawFatG * saveScale;

    const hasCorrections =
      JSON.stringify(editingIngredients) !== JSON.stringify(result.ingredients) || portionPct !== 100;

    try {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          photoUrl: result.photoUrl,
          aiResponse: {
            mealName: result.mealName,
            ingredients: result.ingredients,
            totalCalories: result.totalCalories,
            totalProteinG: result.totalProteinG,
            totalCarbsG: result.totalCarbsG,
            totalFatG: result.totalFatG,
            confidenceScore: result.confidenceScore,
          },
          userCorrections: hasCorrections ? editingIngredients : null,
          totalCalories: Math.round(totalCalories),
          totalProteinG,
          totalCarbsG,
          totalFatG,
          mealName: result.mealName,
          localHour: new Date().getHours(),
          localDate: new Date().toLocaleDateString("sv"),
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        cancelTodayStreakNudge().catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["today"] });
        setState("camera");
        setResult(null);
        setEditingIngredients([]);
        setPortionPct(100);
        setPortionText("100");
        router.replace("/(tabs)");
      } else {
        throw new Error("Save failed");
      }
    } catch {
      Alert.alert(t("error_title"), t("save_failed"));
    } finally {
      setIsSaving(false);
    }
  }

  // Photo picker UI
  if (state === "camera") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            s.pickerScreen,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40 },
          ]}
        >
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <View style={[s.pickerIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="camera" size={40} color={colors.primary} />
            </View>
            <Text style={[s.permTitle, { color: colors.foreground, textAlign: "center", marginTop: 24 }]}>
              {t("log_your_meal")}
            </Text>
            <Text style={[s.permText, { color: colors.mutedForeground, textAlign: "center" }]}>
              {t("take_photo_hint")}
            </Text>
          </View>

          <View style={{ gap: 12, paddingHorizontal: 24 }}>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={takePicture}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="camera" size={20} color={colors.primaryForeground} />
                <Text style={[s.primaryBtnText, { color: colors.primaryForeground }]}>{t("take_photo_btn")}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.secondaryBtn, { borderColor: colors.border }]}
              onPress={pickFromLibrary}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="images" size={20} color={colors.foreground} />
                <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>{t("choose_from_library")}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Analyzing
  if (state === "analyzing") {
    return (
      <View style={[s.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Animated.View entering={FadeIn} style={s.analyzingBox}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
          <Text style={[s.analyzingTitle, { color: colors.foreground }]}>{t("analyzing_meal")}</Text>
          <Text style={[s.analyzingSubtitle, { color: colors.mutedForeground }]}>
            {t("ai_identifying")}
          </Text>
        </Animated.View>
      </View>
    );
  }

  // Result
  if (state === "result" && result) {
    const rawCalories = editingIngredients.reduce((s, i) => s + i.calories, 0);
    const rawProteinG = editingIngredients.reduce((s, i) => s + i.proteinG, 0);
    const rawCarbsG = editingIngredients.reduce((s, i) => s + i.carbsG, 0);
    const rawFatG = editingIngredients.reduce((s, i) => s + i.fatG, 0);
    const scale = portionPct / 100;
    const totalCalories = rawCalories * scale;
    const totalProteinG = rawProteinG * scale;
    const totalCarbsG = rawCarbsG * scale;
    const totalFatG = rawFatG * scale;

    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[
            s.resultContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {result.capturedImageUri && (
            <Animated.View entering={FadeIn} style={s.photoWrapper}>
              <Image
                source={{ uri: result.capturedImageUri }}
                style={s.resultPhoto}
                resizeMode="cover"
              />
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(80)}
            style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[s.mealName, { color: colors.foreground }]}>{result.mealName}</Text>
            <ConfidenceIndicator score={result.confidenceScore} colors={colors} />

            <View style={[s.calorieBanner, { backgroundColor: colors.secondary }]}>
              <Text style={[s.calorieValue, { color: colors.primary }]}>{Math.round(totalCalories)}</Text>
              <Text style={[s.calorieUnit, { color: colors.primary }]}> {t("kcal_abbr")}</Text>
            </View>

            <View style={s.macroRow}>
              <MacroPill label={t("protein")} value={totalProteinG} color={colors.proteinColor} />
              <MacroPill label={t("carbs")} value={totalCarbsG} color={colors.carbsColor} />
              <MacroPill label={t("fat")} value={totalFatG} color={colors.fatColor} />
            </View>

            {/* Portion selector */}
            <View style={[s.portionRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
              <Text style={[s.portionLabel, { color: colors.foreground }]}>{t("portion_label")}</Text>
              <View style={s.portionBtns}>
                {([100, 75, 50, 33] as const).map((pct) => (
                  <TouchableOpacity
                    key={pct}
                    onPress={() => { setPortionPct(pct); setPortionText(String(pct)); }}
                    style={[
                      s.portionBtn,
                      { borderColor: portionPct === pct ? colors.primary : colors.border,
                        backgroundColor: portionPct === pct ? colors.primary : "transparent" },
                    ]}
                  >
                    <Text style={[s.portionBtnText, { color: portionPct === pct ? colors.primaryForeground : colors.mutedForeground }]}>
                      {pct}%
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <TextInput
                    style={[s.portionInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                    value={portionText}
                    onChangeText={(v) => {
                      setPortionText(v);
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n > 0 && n <= 100) setPortionPct(n);
                    }}
                    onBlur={() => {
                      const n = parseInt(portionText, 10);
                      if (isNaN(n) || n <= 0 || n > 100) { setPortionText(String(portionPct)); }
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                  />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>%</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[s.ingToggle, { borderColor: colors.border }]}
              onPress={() => setShowIngredients(!showIngredients)}
            >
              <Text style={[s.ingToggleText, { color: colors.foreground }]}>
                {editingIngredients.length}{" "}
                {editingIngredients.length !== 1 ? t("ingredient_plural") : t("ingredient_singular")}
              </Text>
              <Ionicons
                name={showIngredients ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>

            {showIngredients &&
              editingIngredients.map((ing, idx) => (
                <IngredientRow
                  key={idx}
                  ingredient={ing}
                  colors={colors}
                  onUpdatePortion={(grams) => updateIngredientPortion(idx, grams)}
                  onRemove={() =>
                    setEditingIngredients((prev) => prev.filter((_, i) => i !== idx))
                  }
                />
              ))}
          </Animated.View>
        </ScrollView>

        <View
          style={[
            s.resultFooter,
            { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={[s.retakeBtn, { borderColor: colors.border }]}
            onPress={() => {
              setState("camera");
              setResult(null);
              setEditingIngredients([]);
              setPortionPct(100);
              setPortionText("100");
            }}
          >
            <Ionicons name="refresh" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.logBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
            onPress={saveMeal}
            disabled={isSaving}
          >
            <Text style={[s.logBtnText, { color: colors.primaryForeground }]}>
              {isSaving ? t("saving") : t("log_meal_btn")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 16, fontWeight: "700" as const, color, fontFamily: "Inter_700Bold" }}>
        {Math.round(value * 10) / 10}g
      </Text>
      <Text style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Inter_400Regular" }}>{label}</Text>
    </View>
  );
}

function IngredientRow({
  ingredient,
  colors,
  onUpdatePortion,
  onRemove,
}: {
  ingredient: Ingredient;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onUpdatePortion: (grams: number) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [portionText, setPortionText] = useState(String(Math.round(ingredient.portionGrams)));

  function handlePortionChange(text: string) {
    setPortionText(text);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdatePortion(parsed);
    }
  }

  function handlePortionBlur() {
    const parsed = parseFloat(portionText);
    if (isNaN(parsed) || parsed <= 0) {
      setPortionText(String(Math.round(ingredient.portionGrams)));
    }
  }

  return (
    <View style={[ingStyles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[ingStyles.name, { color: colors.foreground }]} numberOfLines={1}>
          {ingredient.name}
        </Text>
        <Text style={[ingStyles.cals, { color: colors.mutedForeground }]}>
          {Math.round(ingredient.calories)} {t("kcal_abbr")} · {t("protein_abbr")}{Math.round(ingredient.proteinG)}g {t("carbs_abbr")}{Math.round(ingredient.carbsG)}g {t("fat_abbr")}{Math.round(ingredient.fatG)}g
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <TextInput
          style={[
            ingStyles.portionInput,
            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted },
          ]}
          value={portionText}
          onChangeText={handlePortionChange}
          onBlur={handlePortionBlur}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <Text style={[ingStyles.gram, { color: colors.mutedForeground }]}>g</Text>
      </View>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ paddingLeft: 8 }}
      >
        <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

const ingStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: "500" as const,
    fontFamily: "Inter_500Medium",
  },
  cals: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  portionInput: {
    width: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    textAlign: "right",
    fontFamily: "Inter_500Medium",
  },
  gram: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    minWidth: 10,
  },
});

const styles = (colors: ReturnType<typeof import("@/hooks/useColors").useColors>) =>
  StyleSheet.create({
    container: { flex: 1 },
    pickerScreen: {
      flex: 1,
      flexDirection: "column",
    },
    pickerIcon: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    permTitle: { fontSize: 26, fontWeight: "700" as const, fontFamily: "Inter_700Bold", marginBottom: 12 },
    permText: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular", marginBottom: 32 },
    primaryBtn: {
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
    },
    primaryBtnText: { fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
    secondaryBtn: {
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      borderWidth: 1.5,
    },
    secondaryBtnText: { fontSize: 16, fontWeight: "500" as const, fontFamily: "Inter_500Medium" },
    analyzingBox: { alignItems: "center", padding: 32 },
    analyzingTitle: { fontSize: 20, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
    analyzingSubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 20,
      marginTop: 8,
    },
    resultContent: { paddingHorizontal: 16 },
    photoWrapper: { borderRadius: 20, overflow: "hidden", marginBottom: 14 },
    resultPhoto: { width: "100%", height: 220 },
    resultCard: { borderRadius: 20, padding: 20, borderWidth: 1 },
    mealName: {
      fontSize: 22,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      marginBottom: 10,
    },
    calorieBanner: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
    },
    calorieValue: { fontSize: 42, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
    calorieUnit: { fontSize: 18, fontFamily: "Inter_500Medium", marginBottom: 6 },
    macroRow: { flexDirection: "row", marginBottom: 16 },
    ingToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    ingToggleText: { fontSize: 14, fontFamily: "Inter_500Medium" },
    resultFooter: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
    },
    retakeBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    logBtn: {
      flex: 1,
      borderRadius: 26,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    logBtnText: { fontSize: 17, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
    portionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderTopWidth: 1,
      marginBottom: 0,
    },
    portionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    portionBtns: { flexDirection: "row", alignItems: "center", gap: 6 },
    portionBtn: {
      borderRadius: 8,
      borderWidth: 1.5,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    portionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    portionInput: {
      width: 46,
      height: 32,
      borderRadius: 8,
      borderWidth: 1.5,
      textAlign: "center",
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
  });
