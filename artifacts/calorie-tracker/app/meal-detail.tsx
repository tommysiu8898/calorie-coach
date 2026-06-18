import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/hooks/useI18n";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

interface Ingredient {
  name: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface AIResponse {
  mealName?: string;
  ingredients?: Ingredient[];
  totalCalories?: number;
  totalProteinG?: number;
  totalCarbsG?: number;
  totalFatG?: number;
  confidenceScore?: number;
}

interface MealDetail {
  id: string;
  mealName: string;
  mealType: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  photoUrl: string | null;
  createdAt: string;
  localDate?: string | null;
  aiResponse: AIResponse | null;
  userCorrections: Ingredient[] | null;
}

type AppColors = ReturnType<typeof import("@/hooks/useColors").useColors>;

const GRAM_STEP = 10;
const MIN_GRAMS = 1;

function MacroCard({
  emoji,
  label,
  value,
  unit,
  color,
  colors,
}: {
  emoji: string;
  label: string;
  value: number;
  unit: string;
  color: string;
  colors: AppColors;
}) {
  return (
    <View style={[s.macroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ fontSize: 22, marginBottom: 6 }}>{emoji}</Text>
      <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground }}>
        {Math.round(value * 10) / 10}
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
          {unit}
        </Text>
      </Text>
      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function IngredientRow({ ingredient, colors }: { ingredient: Ingredient; colors: AppColors }) {
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 11,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}
          numberOfLines={1}
        >
          {ingredient.name}
        </Text>
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
          {ingredient.portionGrams}g · {t("protein_abbr")}{Math.round(ingredient.proteinG)}g · {t("carbs_abbr")}{Math.round(ingredient.carbsG)}g · {t("fat_abbr")}{Math.round(ingredient.fatG)}g
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginLeft: 12 }}>
        {Math.round(ingredient.calories)} {t("kcal_abbr")}
      </Text>
    </View>
  );
}

function scaleIngredient(ing: Ingredient, newGrams: number): Ingredient {
  const ratio = ing.portionGrams > 0 ? newGrams / ing.portionGrams : 0;
  return {
    ...ing,
    portionGrams: newGrams,
    calories: ing.calories * ratio,
    proteinG: ing.proteinG * ratio,
    carbsG: ing.carbsG * ratio,
    fatG: ing.fatG * ratio,
  };
}

function sumIngredients(ings: Ingredient[]) {
  return ings.reduce(
    (acc, ing) => ({
      totalCalories: acc.totalCalories + ing.calories,
      totalProteinG: acc.totalProteinG + ing.proteinG,
      totalCarbsG: acc.totalCarbsG + ing.carbsG,
      totalFatG: acc.totalFatG + ing.fatG,
    }),
    { totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0 },
  );
}

interface AddIngredientFormProps {
  colors: AppColors;
  onAdd: (ing: Ingredient) => void;
  onCancel: () => void;
}

function AddIngredientForm({ colors, onAdd, onCancel }: AddIngredientFormProps) {
  const { t, languageCode } = useI18n();
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; calories: number; proteinG: number; carbsG: number; fatG: number; servingGrams: number; servingLabel: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("0");
  const [carbs, setCarbs] = useState("0");
  const [fat, setFat] = useState("0");

  useEffect(() => {
    if (mode !== "search") return;
    if (!searchQ.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQ.trim(), locale: languageCode, limit: "20" });
        const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/foods?${params}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.foods ?? []);
        }
      } catch { /* ignore */ } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQ, mode, languageCode]);

  function handlePickSearchResult(food: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; servingGrams: number }) {
    onAdd({
      name: food.name,
      portionGrams: food.servingGrams,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
    });
  }

  function handleAdd() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t("missing_name_title"), t("enter_ingredient_name"));
      return;
    }
    const parsedGrams = parseFloat(grams);
    const parsedCalories = parseFloat(calories);
    if (isNaN(parsedGrams) || parsedGrams <= 0) {
      Alert.alert(t("invalid_grams_title"), t("enter_valid_grams"));
      return;
    }
    if (isNaN(parsedCalories) || parsedCalories < 0) {
      Alert.alert(t("invalid_calories_title"), t("enter_valid_calories"));
      return;
    }
    onAdd({
      name: trimmedName,
      portionGrams: parsedGrams,
      calories: parsedCalories,
      proteinG: parseFloat(protein) || 0,
      carbsG: parseFloat(carbs) || 0,
      fatG: parseFloat(fat) || 0,
    });
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular" as const,
    color: colors.foreground,
    backgroundColor: colors.background,
  };

  const labelStyle = {
    fontSize: 12,
    fontFamily: "Inter_500Medium" as const,
    color: colors.mutedForeground,
    marginBottom: 4,
    marginTop: 10,
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 12 }}>
        {t("add_ingredient_title")}
      </Text>
      {/* Mode toggle */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        {(["search", "manual"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
              backgroundColor: mode === m ? colors.foreground : colors.muted,
              borderWidth: 1, borderColor: mode === m ? colors.foreground : colors.border,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: mode === m ? colors.primaryForeground : colors.mutedForeground }}>
              {m === "search" ? t("search_db_tab") : t("manual_tab")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "search" ? (
        <>
          <TextInput
            style={inputStyle}
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder={t("search_ingredient_hint")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          {searchLoading ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            </View>
          ) : searchResults.length > 0 ? (
            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {searchResults.map((food) => (
                <TouchableOpacity
                  key={food.id}
                  onPress={() => handlePickSearchResult(food)}
                  style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>{food.name}</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                    {food.calories} kcal · {food.servingLabel}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : searchQ.trim() ? (
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 16, textAlign: "center" }}>
              {t("no_foods_found")}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={labelStyle}>{t("field_name_label")}</Text>
          <TextInput
            style={inputStyle}
            value={name}
            onChangeText={setName}
            placeholder={t("ingredient_placeholder")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>{t("field_grams_label")}</Text>
              <TextInput
                style={inputStyle}
                value={grams}
                onChangeText={setGrams}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>{t("field_calories_label")}</Text>
              <TextInput
                style={inputStyle}
                value={calories}
                onChangeText={setCalories}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>{t("field_protein_g_label")}</Text>
              <TextInput
                style={inputStyle}
                value={protein}
                onChangeText={setProtein}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>{t("field_carbs_g_label")}</Text>
              <TextInput
                style={inputStyle}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>{t("field_fat_g_label")}</Text>
              <TextInput
                style={inputStyle}
                value={fat}
                onChangeText={setFat}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>
        </>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.foreground }}>{t("cancel")}</Text>
        </TouchableOpacity>
        {mode === "manual" && (
          <TouchableOpacity
            onPress={handleAdd}
            style={{ flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: colors.foreground }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primaryForeground }}>{t("add_ingredient_btn")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

interface EditIngredientsModalProps {
  visible: boolean;
  initialIngredients: Ingredient[];
  colors: AppColors;
  isSaving: boolean;
  onSave: (ingredients: Ingredient[]) => void;
  onClose: () => void;
}

function EditIngredientsModal({
  visible,
  initialIngredients,
  colors,
  isSaving,
  onSave,
  onClose,
}: EditIngredientsModalProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);
  const [showAddForm, setShowAddForm] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setIngredients(initialIngredients);
      setShowAddForm(false);
    }
  }, [visible]);

  const totals = sumIngredients(ingredients);

  function adjustGrams(index: number, delta: number) {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const newGrams = Math.max(MIN_GRAMS, Math.round(ing.portionGrams + delta));
        return scaleIngredient(ing, newGrams);
      }),
    );
  }

  function deleteIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function addIngredient(ing: Ingredient) {
    setIngredients((prev) => [...prev, ing]);
    setShowAddForm(false);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: insets.top + 16,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{t("cancel")}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
            {t("edit_ingredients_title")}
          </Text>
          <TouchableOpacity
            onPress={() => onSave(ingredients)}
            disabled={isSaving || ingredients.length === 0}
            style={{ padding: 4, opacity: (isSaving || ingredients.length === 0) ? 0.4 : 1 }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{t("save_changes")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Totals preview */}
          <View style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 8, padding: 14, borderRadius: 14, backgroundColor: colors.muted }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 6 }}>
              {t("updated_totals")}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                  {Math.round(totals.totalCalories)}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("kcal_abbr")}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                  {Math.round(totals.totalProteinG)}g
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("protein")}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                  {Math.round(totals.totalCarbsG)}g
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("carbs")}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                  {Math.round(totals.totalFatG)}g
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t("fat")}</Text>
              </View>
            </View>
          </View>

          {/* Ingredient rows */}
          <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 10 }}>
              {ingredients.length}{" "}
              {ingredients.length !== 1 ? t("items_plural") : t("item_singular")}
            </Text>
            {ingredients.length === 0 && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }}>
                {t("no_ingredients_add_below")}
              </Text>
            )}
            {ingredients.map((ing, i) => (
              <View
                key={i}
                style={{
                  borderBottomWidth: 0.5,
                  borderBottomColor: colors.border,
                  paddingVertical: 14,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text
                    style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}
                    numberOfLines={1}
                  >
                    {ing.name}
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginHorizontal: 8 }}>
                    {Math.round(ing.calories)} {t("kcal_abbr")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => deleteIngredient(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
                {/* Gram stepper */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, flex: 1 }}>
                    {t("protein_abbr")}{Math.round(ing.proteinG)}g · {t("carbs_abbr")}{Math.round(ing.carbsG)}g · {t("fat_abbr")}{Math.round(ing.fatG)}g
                  </Text>
                  <TouchableOpacity
                    onPress={() => adjustGrams(i, -GRAM_STEP)}
                    style={[s.stepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="remove" size={16} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground, minWidth: 50, textAlign: "center" }}>
                    {Math.round(ing.portionGrams)}g
                  </Text>
                  <TouchableOpacity
                    onPress={() => adjustGrams(i, GRAM_STEP)}
                    style={[s.stepperBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="add" size={16} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Add ingredient */}
          {showAddForm ? (
            <AddIngredientForm
              colors={colors}
              onAdd={addIngredient}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <TouchableOpacity
              onPress={() => setShowAddForm(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginHorizontal: 20,
                marginTop: 20,
                paddingVertical: 13,
                borderRadius: 12,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: colors.border,
                justifyContent: "center",
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.foreground} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {t("add_ingredient_btn")}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const WHEEL_ITEM_H = 48;
const WHEEL_VISIBLE = 5;

function TimeWheel({
  selectedIdx,
  count,
  formatItem,
  onChange,
  colors,
}: {
  selectedIdx: number;
  count: number;
  formatItem: (i: number) => string;
  onChange: (newIdx: number) => void;
  colors: AppColors;
}) {
  const ref = useRef<ScrollView>(null);
  const [currentIdx, setCurrentIdx] = useState(selectedIdx);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIdx * WHEEL_ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ height: WHEEL_ITEM_H * WHEEL_VISIBLE, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2),
          left: 0,
          right: 0,
          height: WHEEL_ITEM_H,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2) }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
          const clamped = Math.max(0, Math.min(count - 1, idx));
          setCurrentIdx(clamped);
          onChange(clamped);
        }}
      >
        {Array.from({ length: count }, (_, i) => {
          const isSel = i === currentIdx;
          return (
            <View key={i} style={{ height: WHEEL_ITEM_H, alignItems: "center", justifyContent: "center" }}>
              <Text
                style={{
                  fontSize: isSel ? 22 : 16,
                  fontFamily: isSel ? "Inter_700Bold" : "Inter_400Regular",
                  color: isSel ? colors.foreground : colors.mutedForeground,
                }}
              >
                {formatItem(i)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function MealDetailScreen() {
  const colors = useColors();
  const { t, languageCode } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useApp();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const mealId = params.id;

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [servings, setServings] = useState(1);
  const [bookmarked, setBookmarked] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickerHour, setPickerHour] = useState(12);
  const [pickerMinuteIdx, setPickerMinuteIdx] = useState(0);
  const [pickerDayIdx, setPickerDayIdx] = useState(0);
  const [photoError, setPhotoError] = useState(false);

  const { data: meal, isLoading, isError } = useQuery<MealDetail>({
    queryKey: ["meal", mealId],
    queryFn: async () => {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}?userId=${userId}`,
      );
      if (!res.ok) throw new Error("Failed to load meal");
      return res.json();
    },
    enabled: !!mealId && !!userId,
  });

  const photoUri = !photoError && meal?.photoUrl
    ? meal.photoUrl.startsWith("/api")
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${meal.photoUrl}`
      : meal.photoUrl
    : null;

  const intlLocale = languageCode === "zh-TW" ? "zh-TW" : languageCode === "zh-CN" ? "zh-CN" : "en-US";

  const formattedTime = meal?.createdAt
    ? new Date(meal.createdAt).toLocaleTimeString(intlLocale, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const formattedDate = meal?.createdAt
    ? new Date(meal.createdAt).toLocaleDateString(intlLocale, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";

  const ingredients: Ingredient[] =
    meal?.userCorrections ?? meal?.aiResponse?.ingredients ?? [];

  const scaledCalories = meal ? Math.round(meal.totalCalories * servings) : 0;
  const scaledProtein = meal ? Math.round(meal.totalProteinG * servings * 10) / 10 : 0;
  const scaledCarbs = meal ? Math.round(meal.totalCarbsG * servings * 10) / 10 : 0;
  const scaledFat = meal ? Math.round(meal.totalFatG * servings * 10) / 10 : 0;

  const confidenceScore = meal?.aiResponse?.confidenceScore;
  const confidenceLabel =
    confidenceScore !== undefined
      ? confidenceScore >= 0.85
        ? t("confidence_high")
        : confidenceScore >= 0.7
        ? t("confidence_medium")
        : t("confidence_low")
      : null;
  const confidenceColor =
    confidenceScore !== undefined
      ? confidenceScore >= 0.85
        ? colors.highConfidence
        : confidenceScore >= 0.7
        ? colors.mediumConfidence
        : colors.lowConfidence
      : colors.mutedForeground;

  function handleOpenTimePicker() {
    if (meal?.createdAt) {
      const d = new Date(meal.createdAt);
      setPickerHour(d.getHours());
      setPickerMinuteIdx(Math.min(11, Math.round(d.getMinutes() / 5)));
      const mealDateStr = meal.localDate ?? d.toLocaleDateString("sv");
      const todayStr = new Date().toLocaleDateString("sv");
      const diffMs = new Date(todayStr + "T00:00:00").getTime() - new Date(mealDateStr + "T00:00:00").getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      setPickerDayIdx(Math.max(0, Math.min(7, diffDays)));
    }
    setTimePickerVisible(true);
  }

  async function handleSaveTime() {
    if (!meal || !userId) return;
    setIsSavingTime(true);
    try {
      const target = new Date();
      target.setDate(target.getDate() - pickerDayIdx);
      const localDate = target.toLocaleDateString("sv");
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            localHour: pickerHour,
            localMinute: pickerMinuteIdx * 5,
            utcOffsetMinutes: -(new Date().getTimezoneOffset()),
            localDate,
          }),
        },
      );
      if (!res.ok) {
        Alert.alert(t("error_title"), t("could_not_save_changes"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["meal", mealId] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["mealHistory"] });
      queryClient.invalidateQueries({ queryKey: ["weekSummary"] });
      setTimePickerVisible(false);
    } catch {
      Alert.alert(t("error_title"), t("could_not_save_changes"));
    } finally {
      setIsSavingTime(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      t("delete_meal"),
      t("delete_meal_sure"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const res = await fetch(
                `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}?userId=${userId}`,
                { method: "DELETE" },
              );
              if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ["today"] });
                queryClient.invalidateQueries({ queryKey: ["mealHistory"] });
                router.back();
              } else {
                Alert.alert(t("error_title"), t("could_not_delete_detail"));
              }
            } catch {
              Alert.alert(t("error_title"), t("could_not_delete_detail"));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }

  async function handleSaveCorrections(updatedIngredients: Ingredient[]) {
    if (!meal || !userId) return;
    setIsSaving(true);
    try {
      const totals = sumIngredients(updatedIngredients);
      const body = {
        userId,
        userCorrections: updatedIngredients,
        totalCalories: Math.round(totals.totalCalories),
        totalProteinG: totals.totalProteinG,
        totalCarbsG: totals.totalCarbsG,
        totalFatG: totals.totalFatG,
      };

      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals/${mealId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        Alert.alert(t("error_title"), t("could_not_save_changes"));
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["meal", mealId] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["mealHistory"] });
      setEditModalVisible(false);
    } catch {
      Alert.alert(t("error_title"), t("could_not_save_changes"));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  if (isError || !meal) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
          {t("could_not_load_meal")}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{t("go_back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Full-bleed photo header */}
      <View style={s.photoHeader}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setPhotoError(true)}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.muted,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 60 }}>🍽</Text>
          </View>
        )}
        {/* Gradient overlay for close button */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 60,
            paddingTop: insets.top + 12,
            paddingHorizontal: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => setBookmarked((b) => !b)}
            >
              <Ionicons
                name={bookmarked ? "bookmark" : "bookmark-outline"}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.headerBtn}
              onPress={handleDelete}
              disabled={isDeleting}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Slide-up detail card */}
      <Animated.View
        entering={FadeInUp.delay(100).springify()}
        style={[s.detailCard, { backgroundColor: colors.card }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/* Header: meal type badge + tappable time */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <View style={[s.typeBadge, { backgroundColor: colors.muted }]}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>
                {t(meal.mealType) !== meal.mealType ? t(meal.mealType) : meal.mealType}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleOpenTimePicker}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {formattedDate} · {formattedTime}
              </Text>
              <Ionicons name="pencil-outline" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Meal name + servings stepper */}
          <Text style={[s.mealName, { color: colors.foreground }]}>{meal.mealName}</Text>

          {/* Servings stepper */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
              {t("servings")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setServings((sv) => Math.max(0.5, sv - 0.5))}
                style={[s.stepperBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="remove" size={16} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, minWidth: 28, textAlign: "center" }}>
                {servings % 1 === 0 ? servings : servings.toFixed(1)}
              </Text>
              <TouchableOpacity
                onPress={() => setServings((sv) => Math.min(10, sv + 0.5))}
                style={[s.stepperBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="add" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confidence */}
          {confidenceLabel && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: confidenceColor }} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: confidenceColor }}>
                {confidenceLabel}
              </Text>
            </View>
          )}

          {/* Calories banner */}
          <View style={[s.calorieBanner, { backgroundColor: colors.muted }]}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
              🔥 {t("calories_label")}
            </Text>
            <Text style={{ fontSize: 36, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              {scaledCalories}
              <Text style={{ fontSize: 16, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {" "}{t("kcal_abbr")}
              </Text>
            </Text>
          </View>

          {/* 3 macro cards */}
          <View style={s.macroRow}>
            <MacroCard
              emoji="🥩"
              label={t("protein")}
              value={scaledProtein}
              unit="g"
              color={colors.proteinColor}
              colors={colors}
            />
            <MacroCard
              emoji="🌾"
              label={t("carbs")}
              value={scaledCarbs}
              unit="g"
              color={colors.carbsColor}
              colors={colors}
            />
            <MacroCard
              emoji="🫐"
              label={t("fat")}
              value={scaledFat}
              unit="g"
              color={colors.fatColor}
              colors={colors}
            />
          </View>

          {/* Ingredients */}
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                {t("ingredients_title")}
              </Text>
              {meal.userCorrections && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.highConfidence} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.highConfidence }}>
                    {t("edited_badge")}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 12 }}>
              {ingredients.length > 0
                ? `${ingredients.length} ${ingredients.length !== 1 ? t("items_plural") : t("item_singular")}`
                : t("no_ingredient_breakdown")}
            </Text>
            {ingredients.map((ing, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(i * 30)}>
                <IngredientRow ingredient={ing} colors={colors} />
              </Animated.View>
            ))}
          </View>
        </ScrollView>

        {/* Bottom action buttons */}
        <View
          style={[
            s.bottomActions,
            { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <TouchableOpacity
            style={[s.fixBtn, { borderColor: colors.border }]}
            onPress={() => setEditModalVisible(true)}
          >
            <Ionicons name="create-outline" size={16} color={colors.foreground} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
              {t("fix_issue")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.doneBtn, { backgroundColor: colors.foreground }]}
            onPress={() => router.back()}
          >
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>
              {t("done")}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Edit ingredients modal */}
      <EditIngredientsModal
        visible={editModalVisible}
        initialIngredients={ingredients}
        colors={colors}
        isSaving={isSaving}
        onSave={handleSaveCorrections}
        onClose={() => setEditModalVisible(false)}
      />

      {/* Time picker modal */}
      <Modal
        visible={timePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <View style={s.timePickerBackdrop}>
          <View style={[s.timePickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 20 }}>
              {t("edit_date_time")}
            </Text>

            {/* Date wheel */}
            <View style={{ alignItems: "center", gap: 6, marginBottom: 24 }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 }}>
                {t("date_label")}
              </Text>
              <TimeWheel
                selectedIdx={pickerDayIdx}
                count={8}
                formatItem={(i) => {
                  if (i === 0) return t("today_label");
                  if (i === 1) return t("yesterday_label");
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  return d.toLocaleDateString(intlLocale, { weekday: "short", month: "short", day: "numeric" });
                }}
                onChange={setPickerDayIdx}
                colors={colors}
              />
            </View>

            {/* Scroll-wheel pickers */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 32 }}>
              {/* Hour wheel */}
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 }}>
                  {t("hour_label")}
                </Text>
                <TimeWheel
                  selectedIdx={pickerHour}
                  count={24}
                  formatItem={(i) => String(i).padStart(2, "0")}
                  onChange={setPickerHour}
                  colors={colors}
                />
              </View>

              <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 28, paddingHorizontal: 4 }}>
                :
              </Text>

              {/* Minute wheel (5-min steps, 12 items) */}
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 4 }}>
                  {t("minute_label")}
                </Text>
                <TimeWheel
                  selectedIdx={pickerMinuteIdx}
                  count={12}
                  formatItem={(i) => String(i * 5).padStart(2, "0")}
                  onChange={setPickerMinuteIdx}
                  colors={colors}
                />
              </View>
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[s.timePickerCancelBtn, { borderColor: colors.border }]}
                onPress={() => setTimePickerVisible(false)}
                disabled={isSavingTime}
              >
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.timePickerSaveBtn, { backgroundColor: colors.foreground, opacity: isSavingTime ? 0.6 : 1 }]}
                onPress={handleSaveTime}
                disabled={isSavingTime}
              >
                {isSavingTime ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.background }}>
                    {t("save")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoHeader: {
    height: 280,
    position: "relative",
    overflow: "hidden",
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailCard: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mealName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  calorieBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    alignItems: "center",
  },
  macroRow: {
    flexDirection: "row",
    gap: 10,
  },
  macroCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
  },
  bottomActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  fixBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  doneBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  timePickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  timePickerCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  timePickerSaveBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
});
