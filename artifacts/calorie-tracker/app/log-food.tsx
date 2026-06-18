import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient, useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/hooks/useI18n";
import { useApp } from "@/context/AppContext";

type TabKey = "all" | "my_foods" | "my_meals" | "saved";

interface ApiFood {
  id: string;
  name: string;
  nameEn: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingGrams: number;
  servingLabel: string;
}

interface SavedFood {
  id: string;
  foodId: string;
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingLabel: string;
  servingGrams: number;
}

interface MealTemplateItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingLabel: string;
}

interface MealTemplate {
  id: string;
  name: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  items: MealTemplateItem[];
}

interface AiResult {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingGrams: number;
  servingLabel: string;
  saved: boolean;
}

export default function LogFoodScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, languageCode } = useI18n();
  const { userId } = useApp();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const intlLocale = languageCode === "zh-TW" ? "zh-TW" : languageCode === "zh-CN" ? "zh-CN" : "en-US";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Food DB item quantity sheet
  const [selectedFood, setSelectedFood] = useState<ApiFood | null>(null);
  const [selectedSavedFood, setSelectedSavedFood] = useState<SavedFood | null>(null);
  const [qty, setQty] = useState("1");

  // Saved food IDs (for bookmark state)
  const [savedFoodIds, setSavedFoodIds] = useState<Set<string>>(new Set());

  // Manual add form
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCal, setManualCal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

  // AI generate modal
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiPhotoAnalyzing, setAiPhotoAnalyzing] = useState(false);

  // Create custom food modal (saves to library)
  const [showAddCustomFood, setShowAddCustomFood] = useState(false);
  const [cfName, setCfName] = useState("");
  const [cfCal, setCfCal] = useState("");
  const [cfProtein, setCfProtein] = useState("");
  const [cfCarbs, setCfCarbs] = useState("");
  const [cfFat, setCfFat] = useState("");
  const [cfServing, setCfServing] = useState("");
  const [cfSaving, setCfSaving] = useState(false);

  // Create meal template modal
  const [showCreateMeal, setShowCreateMeal] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealItems, setMealItems] = useState<Array<{ name: string; calories: number; proteinG: number; carbsG: number; fatG: number }>>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemCal, setItemCal] = useState("");
  const [itemProtein, setItemProtein] = useState("");
  const [itemCarbs, setItemCarbs] = useState("");
  const [itemFat, setItemFat] = useState("");
  const [mealSaving, setMealSaving] = useState(false);
  const [itemMode, setItemMode] = useState<"search" | "manual">("search");
  const [itemSearchQ, setItemSearchQ] = useState("");
  const [itemSearchResults, setItemSearchResults] = useState<ApiFood[]>([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);

  // Log date/time
  const [logDate, setLogDate] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerDayOffset, setPickerDayOffset] = useState(0);
  const [pickerHour, setPickerHour] = useState(new Date().getHours());
  const [pickerMinute, setPickerMinute] = useState(new Date().getMinutes());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (itemMode !== "search") return;
    if (!itemSearchQ.trim()) { setItemSearchResults([]); return; }
    setItemSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: itemSearchQ.trim(), locale: languageCode, limit: "20" });
        const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/foods?${params}`);
        if (res.ok) {
          const data = await res.json();
          setItemSearchResults(data.foods ?? []);
        }
      } catch { /* ignore */ } finally {
        setItemSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [itemSearchQ, itemMode, languageCode]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function formatLogDate(d: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const timeStr = d.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return `${t("today_short")}, ${timeStr}`;
    if (d.toDateString() === yesterday.toDateString()) return `${t("yesterday_short")}, ${timeStr}`;
    return d.toLocaleDateString(intlLocale, { month: "short", day: "numeric" }) + ", " + timeStr;
  }

  function openTimePicker() {
    const today = new Date();
    const diffDays = Math.round((today.setHours(0,0,0,0) - new Date(logDate).setHours(0,0,0,0)) / 86_400_000);
    setPickerDayOffset(-diffDays);
    setPickerHour(logDate.getHours());
    setPickerMinute(logDate.getMinutes());
    setShowTimePicker(true);
  }

  function confirmTimePicker() {
    const d = new Date();
    d.setDate(d.getDate() + pickerDayOffset);
    d.setHours(pickerHour, pickerMinute, 0, 0);
    setLogDate(d);
    setShowTimePicker(false);
  }

  function resetPickerToNow() {
    const now = new Date();
    setPickerDayOffset(0);
    setPickerHour(now.getHours());
    setPickerMinute(now.getMinutes());
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  // All-tab food search (static DB + AI foods)
  const { data: foodData, isLoading: foodLoading, isError: foodError, error: foodQueryError, refetch: refetchFoods } = useQuery<{ foods: ApiFood[]; total: number }>({
    queryKey: ["foods", debouncedSearch, languageCode],
    queryFn: async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8_000);
      try {
        const params = new URLSearchParams({ locale: languageCode, limit: "50" });
        if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
        const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/foods?${params}`, { signal: ac.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: activeTab === "all",
    staleTime: 120_000,
    retry: (count, err) => (err as Error)?.name !== "AbortError" && count < 1,
  });

  // My Foods tab — user-created custom foods only
  const { data: myFoodsData, isLoading: myFoodsLoading, isError: myFoodsError, error: myFoodsQueryError, refetch: refetchMyFoods } = useQuery<{ foods: ApiFood[]; total: number }>({
    queryKey: ["myFoods", debouncedSearch, userId, languageCode],
    queryFn: async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8_000);
      try {
        const params = new URLSearchParams({ locale: languageCode, limit: "50", source: "user", userId: userId ?? "" });
        if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
        const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/foods?${params}`, { signal: ac.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!userId && activeTab === "my_foods",
    staleTime: 30_000,
    retry: (count, err) => (err as Error)?.name !== "AbortError" && count < 1,
  });

  // Saved foods
  const { data: savedFoodsData, isError: savedFoodsError, refetch: refetchSaved } = useQuery<{ foods: SavedFood[] }>({
    queryKey: ["savedFoods", userId],
    queryFn: async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8_000);
      try {
        const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/saved-foods?userId=${userId}`, { signal: ac.signal });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!userId,
    staleTime: 30_000,
    retry: (count, err) => (err as Error)?.name !== "AbortError" && count < 1,
  });

  const savedFoods = savedFoodsData?.foods ?? [];

  // Keep savedFoodIds set in sync (depend on the query result object, not the derived array)
  useEffect(() => {
    if (savedFoodsData?.foods) {
      setSavedFoodIds(new Set(savedFoodsData.foods.map((f) => f.foodId)));
    }
  }, [savedFoodsData]);

  // Meal templates
  const { data: mealTemplatesData, isLoading: templatesLoading, isError: templatesError, refetch: refetchTemplates } = useQuery<{ templates: MealTemplate[] }>({
    queryKey: ["mealTemplates", userId],
    queryFn: async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8_000);
      try {
        const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meal-templates?userId=${userId}`, { signal: ac.signal });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!userId && activeTab === "my_meals",
    staleTime: 30_000,
    retry: (count, err) => (err as Error)?.name !== "AbortError" && count < 1,
  });

  const foods = foodData?.foods ?? [];
  const myFoods = myFoodsData?.foods ?? [];
  const mealTemplates = mealTemplatesData?.templates ?? [];

  // ── Logging ───────────────────────────────────────────────────────────────
  async function logFoodItem(name: string, calories: number, proteinG: number, carbsG: number, fatG: number) {
    if (!userId) return false;
    setSaving(true);
    try {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          photoUrl: null, aiResponse: null, userCorrections: null,
          totalCalories: Math.round(calories),
          totalProteinG: Math.round(proteinG * 10) / 10,
          totalCarbsG:   Math.round(carbsG   * 10) / 10,
          totalFatG:     Math.round(fatG     * 10) / 10,
          mealName: name,
          localHour: logDate.getHours(),
          localDate: logDate.toLocaleDateString("sv"),
        }),
      });
      if (res.ok) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["today"] });
        queryClient.invalidateQueries({ queryKey: ["weekSummary"] });
        return true;
      }
      throw new Error("Save failed");
    } catch {
      Alert.alert(t("error_title"), t("save_failed"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const logApiFood = useCallback(async (food: ApiFood, servings: number) => {
    const ok = await logFoodItem(food.name, food.calories * servings, food.proteinG * servings, food.carbsG * servings, food.fatG * servings);
    if (ok) { setSelectedFood(null); setQty("1"); router.replace("/(tabs)"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, logDate]);

  const logSavedFood = useCallback(async (food: SavedFood, servings: number) => {
    const ok = await logFoodItem(food.foodName, food.calories * servings, food.proteinG * servings, food.carbsG * servings, food.fatG * servings);
    if (ok) { setSelectedSavedFood(null); setQty("1"); router.replace("/(tabs)"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, logDate]);

  async function logManual() {
    if (!manualName.trim()) { Alert.alert("", t("food_name_required")); return; }
    const cal = parseFloat(manualCal);
    if (isNaN(cal) || cal <= 0) { Alert.alert("", t("calories_required")); return; }
    const ok = await logFoodItem(manualName.trim(), cal, parseFloat(manualProtein) || 0, parseFloat(manualCarbs) || 0, parseFloat(manualFat) || 0);
    if (ok) router.replace("/(tabs)");
  }

  async function logMealTemplate(template: MealTemplate) {
    const ok = await logFoodItem(template.name, template.totalCalories, template.totalProteinG, template.totalCarbsG, template.totalFatG);
    if (ok) router.replace("/(tabs)");
  }

  // ── Save / Unsave food ────────────────────────────────────────────────────
  async function toggleSaveFood(food: ApiFood) {
    if (!userId) return;
    const isSaved = savedFoodIds.has(food.id);
    if (isSaved) {
      setSavedFoodIds((prev) => { const s = new Set(prev); s.delete(food.id); return s; });
      try {
        await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/saved-foods/${encodeURIComponent(food.id)}`, {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
        });
      } catch { /* ignore */ }
    } else {
      setSavedFoodIds((prev) => new Set([...prev, food.id]));
      try {
        await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/saved-foods`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, foodId: food.id, foodName: food.name, calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, servingLabel: food.servingLabel, servingGrams: food.servingGrams }),
        });
      } catch { /* ignore */ }
    }
    refetchSaved();
  }

  // ── Create Custom Food ────────────────────────────────────────────────────
  async function createCustomFood() {
    if (!cfName.trim()) { Alert.alert("", t("food_name_required")); return; }
    const cal = parseFloat(cfCal);
    if (isNaN(cal) || cal < 0) { Alert.alert("", t("calories_required")); return; }
    setCfSaving(true);
    try {
      const servingG = parseFloat(cfServing) || 100;
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/foods/user`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, name: cfName.trim(), calories: Math.round(cal),
          proteinG: parseFloat(cfProtein) || 0, carbsG: parseFloat(cfCarbs) || 0, fatG: parseFloat(cfFat) || 0,
          servingGrams: servingG, servingLabel: `1 serving (${servingG}g)`,
        }),
      });
      if (res.ok) {
        setShowAddCustomFood(false);
        setCfName(""); setCfCal(""); setCfProtein(""); setCfCarbs(""); setCfFat(""); setCfServing("");
        refetchMyFoods();
        queryClient.invalidateQueries({ queryKey: ["myFoods"] });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else throw new Error("Failed");
    } catch {
      Alert.alert(t("error_title"), t("save_failed"));
    } finally {
      setCfSaving(false);
    }
  }

  // ── Create Meal Template ──────────────────────────────────────────────────
  function addMealItem() {
    if (!itemName.trim()) { Alert.alert("", t("food_name_required")); return; }
    const cal = parseFloat(itemCal);
    if (isNaN(cal) || cal < 0) { Alert.alert("", t("calories_required")); return; }
    setMealItems((prev) => [...prev, {
      name: itemName.trim(), calories: Math.round(cal),
      proteinG: parseFloat(itemProtein) || 0, carbsG: parseFloat(itemCarbs) || 0, fatG: parseFloat(itemFat) || 0,
    }]);
    setItemName(""); setItemCal(""); setItemProtein(""); setItemCarbs(""); setItemFat("");
    setShowAddItem(false);
  }

  function addMealItemFromFood(food: ApiFood) {
    setMealItems((prev) => [...prev, {
      name: food.name,
      calories: Math.round(food.calories),
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
    }]);
    setItemSearchQ("");
    setItemSearchResults([]);
    setShowAddItem(false);
  }

  async function createMealTemplate() {
    if (!mealName.trim()) { Alert.alert("", t("meal_name_required")); return; }
    if (mealItems.length === 0) { Alert.alert("", t("meal_items_required")); return; }
    setMealSaving(true);
    try {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meal-templates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name: mealName.trim(), items: mealItems.map((i) => ({ ...i, servingLabel: "1 serving" })) }),
      });
      if (res.ok) {
        setShowCreateMeal(false);
        setMealName(""); setMealItems([]);
        refetchTemplates();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else throw new Error("Failed");
    } catch {
      Alert.alert(t("error_title"), t("save_failed"));
    } finally {
      setMealSaving(false);
    }
  }

  function deleteMealTemplate(id: string) {
    Alert.alert(t("delete_meal_confirm"), "", [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"), style: "destructive", onPress: async () => {
          await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/meal-templates/${id}`, {
            method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
          });
          refetchTemplates();
        },
      },
    ]);
  }

  // ── AI Generate ───────────────────────────────────────────────────────────
  async function generateWithAI() {
    if (!aiDescription.trim()) return;
    setAiGenerating(true);
    setAiResult(null);
    try {
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/foods/ai-generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiDescription.trim(), locale: languageCode }),
      });
      if (!res.ok) { const err = (await res.json().catch(() => ({}))) as { error?: string }; throw new Error(err.error ?? "Failed"); }
      setAiResult(await res.json() as AiResult);
    } catch (err) {
      Alert.alert(t("error_title"), err instanceof Error ? err.message : t("save_failed"));
    } finally {
      setAiGenerating(false);
    }
  }

  async function logAiResult() {
    if (!aiResult) return;
    const ok = await logFoodItem(aiResult.name, aiResult.calories, aiResult.proteinG, aiResult.carbsG, aiResult.fatG);
    if (ok) { setShowAiGenerate(false); setAiResult(null); setAiDescription(""); router.replace("/(tabs)"); }
  }

  function openAiWithQuery() {
    setAiResult(null);
    setAiDescription(debouncedSearch.trim());
    setShowAiGenerate(true);
  }

  async function pickPhotoForAI() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setAiPhotoAnalyzing(true);
    setAiResult(null);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) throw new Error(t("save_failed"));
      const analyzeRes = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/analyze-food`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: manipulated.base64, userId, languageCode }),
      });
      if (!analyzeRes.ok) throw new Error(t("save_failed"));
      const analysis = await analyzeRes.json() as {
        mealName: string; totalCalories: number;
        totalProteinG: number; totalCarbsG: number; totalFatG: number;
      };
      setAiDescription(analysis.mealName ?? "");
      setAiResult({
        id: String(Date.now()),
        name: analysis.mealName,
        calories: analysis.totalCalories,
        proteinG: analysis.totalProteinG,
        carbsG: analysis.totalCarbsG,
        fatG: analysis.totalFatG,
        servingGrams: 0,
        servingLabel: "1 serving",
        saved: false,
      });
    } catch (err) {
      Alert.alert(t("error_title"), err instanceof Error ? err.message : t("save_failed"));
    } finally {
      setAiPhotoAnalyzing(false);
    }
  }

  // ── Tab config ────────────────────────────────────────────────────────────
  const TABS: { key: TabKey; label: string }[] = [
    { key: "all",      label: t("tab_all") },
    { key: "my_foods", label: t("tab_my_foods") },
    { key: "my_meals", label: t("tab_my_meals") },
    { key: "saved",    label: t("tab_saved") },
  ];

  const s = styles(colors);

  // ── Log Time Row ──────────────────────────────────────────────────────────
  const LogTimeRow = () => (
    <TouchableOpacity
      style={[s.logTimeRow, { borderColor: colors.border, backgroundColor: colors.muted }]}
      onPress={openTimePicker}
      activeOpacity={0.75}
    >
      <Ionicons name="calendar-outline" size={15} color={colors.mutedForeground} />
      <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, marginLeft: 8 }}>
        {formatLogDate(logDate)}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  // ── Computed totals for create-meal preview ───────────────────────────────
  const mealTotal = mealItems.reduce((acc, i) => ({
    cal: acc.cal + i.calories,
    p: acc.p + i.proteinG,
    c: acc.c + i.carbsG,
    f: acc.f + i.fatG,
  }), { cal: 0, p: 0, c: 0, f: 0 });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t("log_food_title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          placeholder={t("log_food_search_placeholder")}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        {search.length > 0 && Platform.OS !== "ios" && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, gap: 8 }}
        style={{ flexGrow: 0, flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key} activeOpacity={0.75} onPress={() => setActiveTab(tab.key)}
              style={[s.tabChip, { backgroundColor: active ? colors.foreground : colors.card, borderColor: active ? colors.foreground : colors.border }]}
            >
              <Text style={[s.tabChipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── ALL TAB ─────────────────────────────────────────────── */}
        {activeTab === "all" && (
          <>
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>
              {debouncedSearch.trim() ? t("from_db_title") : t("suggestions_title")}
            </Text>

            {foodLoading ? (
              <View style={s.emptyBox}><ActivityIndicator size="small" color={colors.mutedForeground} /></View>
            ) : foodError ? (
              <View style={s.emptyBox}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t("load_failed_retry")}</Text>
                {(foodQueryError as Error)?.message ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 }}>
                    {(foodQueryError as Error).message}
                  </Text>
                ) : null}
                <TouchableOpacity onPress={() => refetchFoods()} style={{ marginTop: 10, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{t("retry")}</Text>
                </TouchableOpacity>
              </View>
            ) : foods.length === 0 ? (
              debouncedSearch.trim() ? (
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 20, alignItems: "center", marginTop: 8, marginBottom: 4 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                    <Ionicons name="search-outline" size={26} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 6, textAlign: "center" }}>
                    {t("no_foods_found")}
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 16, paddingHorizontal: 8 }}>
                    {t("no_results_try_ai")}
                  </Text>
                  <TouchableOpacity
                    style={[s.emptyCtaBtn, { backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", gap: 8 }]}
                    onPress={openAiWithQuery}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="sparkles" size={16} color={colors.primaryForeground} />
                    <Text style={[s.emptyCtaBtnText, { color: colors.primaryForeground }]}>{t("ai_scan_btn")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.emptyBox}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t("no_foods_found")}</Text>
                </View>
              )
            ) : (
              foods.map((food) => (
                <FoodRow
                  key={food.id}
                  title={food.name}
                  subtitle={`${food.calories} kcal · ${food.servingLabel}`}
                  proteinG={food.proteinG} carbsG={food.carbsG} fatG={food.fatG}
                  colors={colors}
                  isSaved={savedFoodIds.has(food.id)}
                  onPress={() => { setSelectedFood(food); setQty("1"); }}
                  onSave={() => toggleSaveFood(food)}
                />
              ))
            )}

            {/* Inline AI generate button — always shown when search is active, or as a fallback */}
            <TouchableOpacity
              style={[s.aiInlineBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={openAiWithQuery}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[s.aiInlineBtnText, { color: colors.foreground }]}>{t("ai_generate_inline")}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── MY FOODS TAB ────────────────────────────────────────── */}
        {activeTab === "my_foods" && (
          <>
            {myFoodsLoading ? (
              <View style={s.emptyBox}><ActivityIndicator size="small" color={colors.mutedForeground} /></View>
            ) : myFoodsError ? (
              <View style={s.emptyBox}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t("load_failed_retry")}</Text>
                {(myFoodsQueryError as Error)?.message ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 }}>
                    {(myFoodsQueryError as Error).message}
                  </Text>
                ) : null}
              </View>
            ) : myFoods.length === 0 ? (
              <View style={[s.emptyBox, { paddingTop: 50 }]}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🥫</Text>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 }}>
                  {t("my_foods_empty_title")}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 28, paddingHorizontal: 20 }}>
                  {t("my_foods_empty_desc")}
                </Text>
                <TouchableOpacity
                  style={[s.emptyCtaBtn, { backgroundColor: colors.foreground }]}
                  onPress={() => setShowAddCustomFood(true)}
                >
                  <Text style={[s.emptyCtaBtnText, { color: colors.background }]}>{t("my_foods_add_btn")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 10 }}>
                  <Text style={[s.sectionTitle, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>
                    {`${myFoodsData?.total ?? 0} ${t("tab_my_foods")}`}
                  </Text>
                  <TouchableOpacity
                    style={[s.smallAddBtn, { backgroundColor: colors.foreground }]}
                    onPress={() => setShowAddCustomFood(true)}
                  >
                    <Ionicons name="add" size={16} color={colors.background} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.background }}>{t("my_foods_add_btn")}</Text>
                  </TouchableOpacity>
                </View>
                {myFoods
                  .filter((f) => !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()))
                  .map((food) => (
                    <FoodRow
                      key={food.id}
                      title={food.name}
                      subtitle={`${food.calories} kcal · ${food.servingLabel}`}
                      proteinG={food.proteinG} carbsG={food.carbsG} fatG={food.fatG}
                      colors={colors}
                      isSaved={savedFoodIds.has(food.id)}
                      onPress={() => { setSelectedFood(food); setQty("1"); }}
                      onSave={() => toggleSaveFood(food)}
                    />
                  ))}
              </>
            )}
          </>
        )}

        {/* ── MY MEALS TAB ────────────────────────────────────────── */}
        {activeTab === "my_meals" && (
          <>
            {templatesLoading ? (
              <View style={s.emptyBox}><ActivityIndicator size="small" color={colors.mutedForeground} /></View>
            ) : templatesError ? (
              <View style={s.emptyBox}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t("load_failed_retry")}</Text>
              </View>
            ) : mealTemplates.length === 0 ? (
              <View style={[s.emptyBox, { paddingTop: 50 }]}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🍱</Text>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 }}>
                  {t("my_meals_empty_title")}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 28, paddingHorizontal: 20 }}>
                  {t("my_meals_empty_desc")}
                </Text>
                <TouchableOpacity
                  style={[s.emptyCtaBtn, { backgroundColor: colors.foreground }]}
                  onPress={() => setShowCreateMeal(true)}
                >
                  <Text style={[s.emptyCtaBtnText, { color: colors.background }]}>{t("my_meals_create_btn")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 10 }}>
                  <Text style={[s.sectionTitle, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>
                    {`${mealTemplates.length} ${t("tab_my_meals")}`}
                  </Text>
                  <TouchableOpacity
                    style={[s.smallAddBtn, { backgroundColor: colors.foreground }]}
                    onPress={() => setShowCreateMeal(true)}
                  >
                    <Ionicons name="add" size={16} color={colors.background} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.background }}>{t("my_meals_create_btn")}</Text>
                  </TouchableOpacity>
                </View>
                {mealTemplates
                  .filter((m) => !search.trim() || m.name.toLowerCase().includes(search.toLowerCase()))
                  .map((template) => (
                    <TouchableOpacity
                      key={template.id}
                      style={[s.foodRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => logMealTemplate(template)}
                      onLongPress={() => deleteMealTemplate(template.id)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.foodName, { color: colors.foreground }]} numberOfLines={1}>{template.name}</Text>
                        <Text style={[s.foodSub, { color: colors.mutedForeground }]}>{template.totalCalories} kcal · {template.items.length} items</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 5 }}>
                          <MacroBadge value={template.totalProteinG} label="P" color={colors.proteinColor} />
                          <MacroBadge value={template.totalCarbsG}   label="C" color={colors.carbsColor} />
                          <MacroBadge value={template.totalFatG}     label="F" color={colors.fatColor} />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[s.addBtn, { backgroundColor: colors.foreground }]}
                        onPress={() => logMealTemplate(template)}
                        disabled={saving}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {saving ? <ActivityIndicator size="small" color={colors.background} />
                                : <Ionicons name="add" size={20} color={colors.background} />}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
              </>
            )}
          </>
        )}

        {/* ── SAVED TAB ───────────────────────────────────────────── */}
        {activeTab === "saved" && (
          <>
            {savedFoodsError ? (
              <View style={s.emptyBox}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t("load_failed_retry")}</Text>
              </View>
            ) : savedFoods.length === 0 ? (
              <View style={[s.emptyBox, { paddingTop: 50 }]}>
                <View style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <Ionicons name="bookmark-outline" size={38} color={colors.border} />
                </View>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 }}>
                  {t("saved_empty_title")}
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 24 }}>
                  {t("saved_empty_desc")}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[s.sectionTitle, { color: colors.mutedForeground, marginTop: 14 }]}>
                  {`${savedFoods.length} ${t("tab_saved")}`}
                </Text>
                {savedFoods
                  .filter((f) => !search.trim() || f.foodName.toLowerCase().includes(search.toLowerCase()))
                  .map((sf) => (
                    <TouchableOpacity
                      key={sf.id}
                      style={[s.foodRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => { setSelectedSavedFood(sf); setQty("1"); }}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.foodName, { color: colors.foreground }]} numberOfLines={1}>{sf.foodName}</Text>
                        <Text style={[s.foodSub, { color: colors.mutedForeground }]}>{sf.calories} kcal · {sf.servingLabel}</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 5 }}>
                          <MacroBadge value={sf.proteinG} label="P" color={colors.proteinColor} />
                          <MacroBadge value={sf.carbsG}   label="C" color={colors.carbsColor} />
                          <MacroBadge value={sf.fatG}     label="F" color={colors.fatColor} />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[s.addBtn, { backgroundColor: colors.foreground }]}
                        onPress={() => { setSelectedSavedFood(sf); setQty("1"); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="add" size={20} color={colors.background} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Bottom bar ─────────────────────────────────────────────────── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            style={[s.aiBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => { setAiResult(null); setAiDescription(""); setShowAiGenerate(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles-outline" size={18} color={colors.foreground} />
            <Text style={[s.aiBtnText, { color: colors.foreground }]}>{t("ai_scan_btn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.manualBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowManual(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="pencil-outline" size={18} color={colors.primaryForeground} />
            <Text style={[s.manualBtnText, { color: colors.primaryForeground }]}>{t("manual_add")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Quantity sheet (food DB item) ─────────────────────────────── */}
      <Modal visible={!!selectedFood} transparent animationType="slide" onRequestClose={() => setSelectedFood(null)}>
        <View style={s.sheetBackdrop}>
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedFood && (
              <>
                <Text style={[s.sheetTitle, { color: colors.foreground }]}>{selectedFood.name}</Text>
                <Text style={[s.sheetSub, { color: colors.mutedForeground }]}>{selectedFood.calories} kcal · {selectedFood.servingLabel}</Text>
                <View style={s.qtyRow}>
                  <Text style={[s.qtyLabel, { color: colors.foreground }]}>{t("servings_qty")}</Text>
                  <View style={s.qtyControls}>
                    <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => { const n = parseFloat(qty)||1; if(n>0.5) setQty(String(Math.round((n-0.5)*10)/10)); }}>
                      <Ionicons name="remove" size={18} color={colors.foreground} />
                    </TouchableOpacity>
                    <TextInput style={[s.qtyInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={qty} onChangeText={setQty} keyboardType="decimal-pad" selectTextOnFocus />
                    <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => { const n = parseFloat(qty)||1; setQty(String(Math.round((n+0.5)*10)/10)); }}>
                      <Ionicons name="add" size={18} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                </View>
                {(() => { const sv = parseFloat(qty)||1; return (
                  <View style={[s.calPreview, { backgroundColor: colors.secondary }]}>
                    <Text style={[s.calPreviewNum, { color: colors.primary }]}>{Math.round(selectedFood.calories * sv)}</Text>
                    <Text style={[s.calPreviewUnit, { color: colors.primary }]}> kcal</Text>
                  </View>
                ); })()}
                <LogTimeRow />
                <View style={[s.sheetBtns, { marginTop: 16 }]}>
                  <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => setSelectedFood(null)}>
                    <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={() => logApiFood(selectedFood, parseFloat(qty)||1)} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("add_to_log")}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Quantity sheet (saved food) ────────────────────────────────── */}
      <Modal visible={!!selectedSavedFood} transparent animationType="slide" onRequestClose={() => setSelectedSavedFood(null)}>
        <View style={s.sheetBackdrop}>
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedSavedFood && (
              <>
                <Text style={[s.sheetTitle, { color: colors.foreground }]}>{selectedSavedFood.foodName}</Text>
                <Text style={[s.sheetSub, { color: colors.mutedForeground }]}>{selectedSavedFood.calories} kcal · {selectedSavedFood.servingLabel}</Text>
                <View style={s.qtyRow}>
                  <Text style={[s.qtyLabel, { color: colors.foreground }]}>{t("servings_qty")}</Text>
                  <View style={s.qtyControls}>
                    <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => { const n = parseFloat(qty)||1; if(n>0.5) setQty(String(Math.round((n-0.5)*10)/10)); }}>
                      <Ionicons name="remove" size={18} color={colors.foreground} />
                    </TouchableOpacity>
                    <TextInput style={[s.qtyInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={qty} onChangeText={setQty} keyboardType="decimal-pad" selectTextOnFocus />
                    <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => { const n = parseFloat(qty)||1; setQty(String(Math.round((n+0.5)*10)/10)); }}>
                      <Ionicons name="add" size={18} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                </View>
                {(() => { const sv = parseFloat(qty)||1; return (
                  <View style={[s.calPreview, { backgroundColor: colors.secondary }]}>
                    <Text style={[s.calPreviewNum, { color: colors.primary }]}>{Math.round(selectedSavedFood.calories * sv)}</Text>
                    <Text style={[s.calPreviewUnit, { color: colors.primary }]}> kcal</Text>
                  </View>
                ); })()}
                <LogTimeRow />
                <View style={[s.sheetBtns, { marginTop: 16 }]}>
                  <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => setSelectedSavedFood(null)}>
                    <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={() => logSavedFood(selectedSavedFood, parseFloat(qty)||1)} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("add_to_log")}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Manual add sheet ───────────────────────────────────────────── */}
      <Modal visible={showManual} transparent animationType="slide" onRequestClose={() => setShowManual(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.sheetBackdrop}>
            <ScrollView style={[s.sheet, s.manualSheet, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t("manual_add_title")}</Text>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("food_name_label")}</Text>
              <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={manualName} onChangeText={setManualName} placeholder={t("food_name_label")} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("calories_label_required")}</Text>
              <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={manualCal} onChangeText={setManualCal} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" returnKeyType="next" />
              <View style={{ flexDirection: "row", gap: 12 }}>
                {[{ label: t("protein_g_label"), val: manualProtein, set: setManualProtein }, { label: t("carbs_g_label"), val: manualCarbs, set: setManualCarbs }, { label: t("fat_g_label"), val: manualFat, set: setManualFat }].map(({ label, val, set }) => (
                  <View key={label} style={{ flex: 1 }}>
                    <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={val} onChangeText={set} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                  </View>
                ))}
              </View>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("log_time_label")}</Text>
              <LogTimeRow />
              <View style={[s.sheetBtns, { marginTop: 20 }]}>
                <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => setShowManual(false)}>
                  <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={logManual} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("add_food_btn")}</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Custom Food sheet ────────────────────────────────────── */}
      <Modal visible={showAddCustomFood} transparent animationType="slide" onRequestClose={() => setShowAddCustomFood(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.sheetBackdrop}>
            <ScrollView style={[s.sheet, s.manualSheet, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t("create_custom_food_title")}</Text>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("food_name_label")}</Text>
              <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={cfName} onChangeText={setCfName} placeholder={t("food_name_label")} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("calories_label_required")}</Text>
              <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={cfCal} onChangeText={setCfCal} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" returnKeyType="next" />
              <View style={{ flexDirection: "row", gap: 12 }}>
                {[{ label: t("protein_g_label"), val: cfProtein, set: setCfProtein }, { label: t("carbs_g_label"), val: cfCarbs, set: setCfCarbs }, { label: t("fat_g_label"), val: cfFat, set: setCfFat }].map(({ label, val, set }) => (
                  <View key={label} style={{ flex: 1 }}>
                    <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={val} onChangeText={set} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                  </View>
                ))}
              </View>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("serving_size_label")}</Text>
              <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={cfServing} onChangeText={setCfServing} placeholder="100" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
              <View style={[s.sheetBtns, { marginTop: 20 }]}>
                <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => setShowAddCustomFood(false)}>
                  <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: cfSaving ? 0.6 : 1 }]} onPress={createCustomFood} disabled={cfSaving}>
                  {cfSaving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("save_to_my_foods")}</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Meal Template sheet ─────────────────────────────────── */}
      <Modal visible={showCreateMeal} transparent animationType="slide" onRequestClose={() => setShowCreateMeal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.sheetBackdrop}>
            <ScrollView style={[s.sheet, s.manualSheet, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t("create_meal_title")}</Text>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("meal_name_label")}</Text>
              <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={mealName} onChangeText={setMealName} placeholder={t("meal_name_placeholder")} placeholderTextColor={colors.mutedForeground} returnKeyType="next" />

              {/* Items list */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>{t("meal_items_label")}</Text>
                <TouchableOpacity style={[s.smallAddBtn, { backgroundColor: colors.foreground }]} onPress={() => setShowAddItem(true)}>
                  <Ionicons name="add" size={14} color={colors.background} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.background }}>{t("add_item_btn")}</Text>
                </TouchableOpacity>
              </View>

              {mealItems.length === 0 ? (
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", paddingVertical: 20, alignItems: "center" }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>{t("meal_items_empty")}</Text>
                </View>
              ) : (
                <>
                  {mealItems.map((item, idx) => (
                    <View key={idx} style={[s.mealItemRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{item.calories} kcal</Text>
                      </View>
                      <TouchableOpacity onPress={() => setMealItems((prev) => prev.filter((_, i) => i !== idx))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={[s.calPreview, { backgroundColor: colors.secondary, marginVertical: 12 }]}>
                    <Text style={[s.calPreviewNum, { color: colors.primary, fontSize: 26 }]}>{Math.round(mealTotal.cal)}</Text>
                    <Text style={[s.calPreviewUnit, { color: colors.primary }]}> kcal</Text>
                  </View>
                </>
              )}

              <View style={[s.sheetBtns, { marginTop: 20 }]}>
                <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowCreateMeal(false); setMealName(""); setMealItems([]); }}>
                  <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: mealSaving ? 0.6 : 1 }]} onPress={createMealTemplate} disabled={mealSaving}>
                  {mealSaving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("save_meal_btn")}</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Item to Meal sub-sheet ─────────────────────────────────── */}
      <Modal visible={showAddItem} transparent animationType="slide" onRequestClose={() => { setShowAddItem(false); setItemSearchQ(""); setItemSearchResults([]); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.sheetBackdrop}>
            <ScrollView style={[s.sheet, s.manualSheet, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t("add_item_btn")}</Text>

              {/* Mode toggle */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {(["search", "manual"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setItemMode(m)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                      backgroundColor: itemMode === m ? colors.foreground : colors.muted,
                      borderWidth: 1, borderColor: itemMode === m ? colors.foreground : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: itemMode === m ? colors.primaryForeground : colors.mutedForeground }}>
                      {m === "search" ? t("search_db_tab") : t("manual_tab")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {itemMode === "search" ? (
                <>
                  <TextInput
                    style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                    value={itemSearchQ}
                    onChangeText={setItemSearchQ}
                    placeholder={t("search_ingredient_hint")}
                    placeholderTextColor={colors.mutedForeground}
                    autoFocus
                  />
                  {itemSearchLoading ? (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    </View>
                  ) : itemSearchResults.length > 0 ? (
                    itemSearchResults.map((food) => (
                      <TouchableOpacity
                        key={food.id}
                        onPress={() => addMealItemFromFood(food)}
                        style={[s.foodRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[s.foodName, { color: colors.foreground }]} numberOfLines={1}>{food.name}</Text>
                          <Text style={[s.foodSub, { color: colors.mutedForeground }]}>{food.calories} kcal · {food.servingLabel}</Text>
                        </View>
                        <Ionicons name="add-circle" size={22} color={colors.foreground} />
                      </TouchableOpacity>
                    ))
                  ) : itemSearchQ.trim() ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 16, textAlign: "center" }}>
                      {t("no_foods_found")}
                    </Text>
                  ) : null}
                  <View style={{ marginTop: 16 }}>
                    <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowAddItem(false); setItemSearchQ(""); setItemSearchResults([]); }}>
                      <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("item_name_label")}</Text>
                  <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={itemName} onChangeText={setItemName} placeholder={t("food_name_label")} placeholderTextColor={colors.mutedForeground} returnKeyType="next" autoFocus />
                  <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("calories_label_required")}</Text>
                  <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={itemCal} onChangeText={setItemCal} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" returnKeyType="next" />
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {[{ label: t("protein_g_label"), val: itemProtein, set: setItemProtein }, { label: t("carbs_g_label"), val: itemCarbs, set: setItemCarbs }, { label: t("fat_g_label"), val: itemFat, set: setItemFat }].map(({ label, val, set }) => (
                      <View key={label} style={{ flex: 1 }}>
                        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                        <TextInput style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]} value={val} onChangeText={set} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                      </View>
                    ))}
                  </View>
                  <View style={[s.sheetBtns, { marginTop: 20 }]}>
                    <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => setShowAddItem(false)}>
                      <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary }]} onPress={addMealItem}>
                      <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("add_item_btn")}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI Generate sheet ──────────────────────────────────────────── */}
      <Modal visible={showAiGenerate} transparent animationType="slide" onRequestClose={() => { setShowAiGenerate(false); setAiResult(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.sheetBackdrop}>
            <ScrollView style={[s.sheet, s.manualSheet, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sheetTitle, { color: colors.foreground, marginBottom: 0 }]}>{t("ai_generate_title")}</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{t("ai_generate_desc")}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[s.aiBtn, { borderColor: colors.border, backgroundColor: colors.muted, marginBottom: 12, opacity: aiGenerating || aiPhotoAnalyzing ? 0.6 : 1 }]}
                onPress={pickPhotoForAI}
                disabled={aiGenerating || aiPhotoAnalyzing}
                activeOpacity={0.85}
              >
                {aiPhotoAnalyzing ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator size="small" color={colors.foreground} />
                    <Text style={[s.aiBtnText, { color: colors.foreground }]}>{t("ai_analyzing_photo")}</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="image-outline" size={18} color={colors.foreground} />
                    <Text style={[s.aiBtnText, { color: colors.foreground }]}>{t("ai_pick_photo")}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("food_name_label")}</Text>
              <TextInput
                style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, minHeight: 80, textAlignVertical: "top" }]}
                value={aiDescription} onChangeText={setAiDescription}
                placeholder={t("ai_generate_placeholder")} placeholderTextColor={colors.mutedForeground} multiline returnKeyType="done"
              />
              <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: aiGenerating || !aiDescription.trim() ? 0.5 : 1, marginTop: 14 }]} onPress={generateWithAI} disabled={aiGenerating || !aiDescription.trim()}>
                {aiGenerating ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                    <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("ai_generating")}</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="sparkles" size={16} color={colors.primaryForeground} />
                    <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("ai_generate_btn")}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {aiResult && (
                <View style={{ marginTop: 20, backgroundColor: colors.muted, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 12 }}>{aiResult.name}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    {[{ label: "Calories", value: `${Math.round(aiResult.calories)} kcal`, color: colors.calorieColor }, { label: "Protein", value: `${aiResult.proteinG.toFixed(1)}g`, color: colors.proteinColor }, { label: "Carbs", value: `${aiResult.carbsG.toFixed(1)}g`, color: colors.carbsColor }, { label: "Fat", value: `${aiResult.fatG.toFixed(1)}g`, color: colors.fatColor }].map(({ label, value, color }) => (
                      <View key={label} style={{ backgroundColor: color + "18", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: "46%", flex: 1 }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{label}</Text>
                        <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color, marginTop: 2 }}>{value}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 14 }}>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{aiResult.servingLabel}</Text>
                    {aiResult.saved && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#22c55e18", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
                        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>{t("saved_to_library")}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 0 }]}>{t("log_time_label")}</Text>
                  <LogTimeRow />
                  <View style={[s.sheetBtns, { marginTop: 12 }]}>
                    <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={() => setAiResult(null)}>
                      <Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("re_generate")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={logAiResult} disabled={saving}>
                      {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("add_to_log_direct")}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity style={{ alignItems: "center", paddingVertical: 16 }} onPress={() => { setShowAiGenerate(false); setAiResult(null); }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 14 }}>{t("cancel")}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Log Date/Time picker ───────────────────────────────────────── */}
      <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
        <View style={s.sheetBackdrop}>
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.foreground, marginBottom: 20 }]}>{t("log_time_label")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => setPickerDayOffset(Math.max(pickerDayOffset - 1, -30))}>
                <Ionicons name="chevron-back" size={18} color={colors.foreground} />
              </TouchableOpacity>
              <View style={{ alignItems: "center" }}>
                {(() => {
                  const d = new Date(); d.setDate(d.getDate() + pickerDayOffset);
                  const today = new Date(); const yest = new Date(today); yest.setDate(today.getDate()-1);
                  let label = d.toLocaleDateString(intlLocale, { weekday: "short", month: "short", day: "numeric" });
                  if (d.toDateString() === today.toDateString()) label = t("today_short");
                  else if (d.toDateString() === yest.toDateString()) label = t("yesterday_short");
                  return <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>{label}</Text>;
                })()}
              </View>
              <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border, opacity: pickerDayOffset >= 0 ? 0.3 : 1 }]} onPress={() => { if (pickerDayOffset < 0) setPickerDayOffset(pickerDayOffset + 1); }} disabled={pickerDayOffset >= 0}>
                <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 28 }}>
              {[{ val: pickerHour, set: setPickerHour, mod: 24, label: t("hour_label") }, { val: pickerMinute, set: setPickerMinute, mod: 60, label: t("minute_label"), step: 5 }].map(({ val, set, mod, label, step = 1 }) => (
                <View key={label} style={{ alignItems: "center", gap: 8 }}>
                  <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => set((val + step) % mod)}><Ionicons name="chevron-up" size={18} color={colors.foreground} /></TouchableOpacity>
                  <View style={{ width: 60, height: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground }}>{String(val).padStart(2, "0")}</Text>
                  </View>
                  <TouchableOpacity style={[s.qtyBtn, { borderColor: colors.border }]} onPress={() => set((val - step + mod) % mod)}><Ionicons name="chevron-down" size={18} color={colors.foreground} /></TouchableOpacity>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{label}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 24 }}>:</Text>
            </View>
            <View style={s.sheetBtns}>
              <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: colors.border }]} onPress={resetPickerToNow}><Text style={[s.sheetCancelText, { color: colors.foreground }]}>{t("now_btn")}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.sheetLogBtn, { backgroundColor: colors.primary }]} onPress={confirmTimePicker}><Text style={[s.sheetLogText, { color: colors.primaryForeground }]}>{t("confirm")}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function FoodRow({
  title, subtitle, proteinG, carbsG, fatG, colors, isSaved, onPress, onSave,
}: {
  title: string; subtitle: string;
  proteinG: number; carbsG: number; fatG: number;
  isSaved?: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onPress: () => void;
  onSave?: () => void;
}) {
  const s = styles(colors);
  return (
    <TouchableOpacity style={[s.foodRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <Text style={[s.foodName, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
        <Text style={[s.foodSub, { color: colors.mutedForeground }]}>{subtitle}</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 5 }}>
          <MacroBadge value={proteinG} label="P" color={colors.proteinColor} />
          <MacroBadge value={carbsG}   label="C" color={colors.carbsColor} />
          <MacroBadge value={fatG}     label="F" color={colors.fatColor} />
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {onSave && (
          <TouchableOpacity onPress={onSave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={20} color={isSaved ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.addBtn, { backgroundColor: colors.foreground }]} onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="add" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function MacroBadge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color }}>
        {label} {Math.round(value * 10) / 10}g
      </Text>
    </View>
  );
}

function styles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
    searchBar: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, marginBottom: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
    searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
    tabChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
    tabChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 14 },
    foodRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
    foodName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    foodSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
    addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    emptyBox: { alignItems: "center", paddingVertical: 40 },
    emptyCtaBtn: { borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
    emptyCtaBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
    smallAddBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    aiInlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 14, marginTop: 8, marginBottom: 4 },
    aiInlineBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    mealItemRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
    bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    aiBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, borderWidth: 1, paddingVertical: 15 },
    aiBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    manualBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 15 },
    manualBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24 },
    manualSheet: { maxHeight: "85%" },
    sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
    sheetSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20 },
    qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    qtyLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
    qtyControls: { flexDirection: "row", alignItems: "center", gap: 8 },
    qtyBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    qtyInput: { width: 60, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold", borderRadius: 10, borderWidth: 1, paddingVertical: 7 },
    calPreview: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
    calPreviewNum: { fontSize: 36, fontFamily: "Inter_700Bold" },
    calPreviewUnit: { fontSize: 16, fontFamily: "Inter_500Medium" },
    sheetBtns: { flexDirection: "row", gap: 12 },
    sheetCancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, paddingVertical: 14 },
    sheetCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    sheetLogBtn: { flex: 2, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
    sheetLogText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 14 },
    fieldInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular" },
    logTimeRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginTop: 4 },
  });
}
