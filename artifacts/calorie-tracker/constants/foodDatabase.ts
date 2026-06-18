// Food data has been moved to the API server.
// Use GET /api/foods?q=...&locale=en&limit=30 to search.
// These type definitions are kept for any legacy references.

export interface FoodName {
  en: string;
  "zh-TW": string;
  "zh-CN": string;
}

export interface FoodItem {
  id: string;
  name: FoodName;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingGrams: number;
  servingLabel: FoodName;
}
