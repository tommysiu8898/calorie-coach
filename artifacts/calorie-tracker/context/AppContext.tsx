import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";

const USER_ID_KEY = "@calorie_tracker/userId";
const HAS_PROFILE_KEY = "@calorie_tracker/hasProfile";
const THEME_KEY = "@calorie_tracker/themeMode";
const LANGUAGE_KEY = "@calorie_tracker/language";
const SKIP_LOGIN_KEY = "@calorie_tracker/skipLogin";
const ADD_BURNED_KEY = "@calorie_tracker/addBurnedCalories";
const TRIAL_KEY = "@calorie_tracker/trialStartDate";

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

async function loadTrialState(): Promise<{ isTrialActive: boolean; hasUsedTrial: boolean }> {
  try {
    const stored = await AsyncStorage.getItem(TRIAL_KEY);
    if (!stored) return { isTrialActive: false, hasUsedTrial: false };
    const start = parseInt(stored, 10);
    if (isNaN(start)) return { isTrialActive: false, hasUsedTrial: true };
    const isTrialActive = Date.now() - start < TRIAL_DURATION_MS;
    return { isTrialActive, hasUsedTrial: true };
  } catch {
    return { isTrialActive: false, hasUsedTrial: false };
  }
}

export type ThemeMode = "system" | "light" | "dark";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function profileStorageKey(id: string): string {
  return `${HAS_PROFILE_KEY}_${id}`;
}

async function checkProfile(id: string, storageKey: string): Promise<boolean> {
  const localFlag = await AsyncStorage.getItem(storageKey);
  if (localFlag === "true") return true;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain && id) {
    try {
      const res = await fetch(`https://${domain}/api/profile?userId=${id}`);
      const exists = res.ok;
      await AsyncStorage.setItem(storageKey, exists ? "true" : "false");
      return exists;
    } catch {
      return false;
    }
  }
  return false;
}

interface AppContextType {
  userId: string | null;
  isLoading: boolean;
  hasProfile: boolean;
  needsLogin: boolean;
  setHasProfile: (value: boolean) => Promise<void>;
  continueAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  languageCode: string;
  setLanguageCode: (code: string) => Promise<void>;
  addBurnedCalories: boolean;
  setAddBurnedCalories: (value: boolean) => Promise<void>;
  isPremium: boolean;
  isTrialActive: boolean;
  hasUsedTrial: boolean;
  startTrial: () => Promise<void>;
}

export const AppContext = createContext<AppContextType>({
  userId: null,
  isLoading: true,
  hasProfile: false,
  needsLogin: false,
  setHasProfile: async () => {},
  continueAnonymously: async () => {},
  signOut: async () => {},
  themeMode: "system",
  setThemeMode: async () => {},
  languageCode: "en",
  setLanguageCode: async () => {},
  addBurnedCalories: true,
  setAddBurnedCalories: async () => {},
  isPremium: false,
  isTrialActive: false,
  hasUsedTrial: false,
  startTrial: async () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId: clerkUserId, isLoaded: clerkIsLoaded, signOut: clerkSignOut } = useAuth();

  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasProfile, setHasProfileState] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [languageCode, setLanguageCodeState] = useState("en");
  const [addBurnedCalories, setAddBurnedCaloriesState] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [hasUsedTrial, setHasUsedTrial] = useState(false);

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!clerkIsLoaded) return;

    async function init() {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setThemeModeState(savedTheme);
        }

        let savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (savedLang === "zh") {
          savedLang = "zh-CN";
          await AsyncStorage.setItem(LANGUAGE_KEY, "zh-CN");
        }
        if (savedLang) setLanguageCodeState(savedLang);

        const savedAddBurned = await AsyncStorage.getItem(ADD_BURNED_KEY);
        if (savedAddBurned === "false") setAddBurnedCaloriesState(false);

        const trial = await loadTrialState();
        setIsTrialActive(trial.isTrialActive);
        setHasUsedTrial(trial.hasUsedTrial);

        if (isSignedIn && clerkUserId) {
          await AsyncStorage.removeItem(USER_ID_KEY);
          const key = profileStorageKey(clerkUserId);
          const profileExists = await checkProfile(clerkUserId, key);
          setUserId(clerkUserId);
          setHasProfileState(profileExists);
          setNeedsLogin(false);
        } else {
          const skipLogin = await AsyncStorage.getItem(SKIP_LOGIN_KEY);
          const legacyId = await AsyncStorage.getItem(USER_ID_KEY);
          const hasLegacySession = Boolean(legacyId && /^[0-9a-f-]{36}$/.test(legacyId));

          if (skipLogin === "true" || hasLegacySession) {
            let id = hasLegacySession ? legacyId! : generateUUID();
            if (!hasLegacySession) {
              await AsyncStorage.setItem(USER_ID_KEY, id);
            }
            if (skipLogin !== "true") {
              await AsyncStorage.setItem(SKIP_LOGIN_KEY, "true");
            }
            const profileExists = await checkProfile(id, profileStorageKey(id));
            setUserId(id);
            setHasProfileState(profileExists);
            setNeedsLogin(false);
          } else {
            setUserId(null);
            setHasProfileState(false);
            setNeedsLogin(true);
          }
        }
      } catch {
        setNeedsLogin(true);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [clerkIsLoaded, isSignedIn, clerkUserId]);

  const setHasProfile = async (value: boolean) => {
    setHasProfileState(value);
    const id = userIdRef.current;
    if (id) {
      await AsyncStorage.setItem(profileStorageKey(id), value ? "true" : "false");
    }
  };

  const continueAnonymously = async () => {
    let id = await AsyncStorage.getItem(USER_ID_KEY);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = generateUUID();
      await AsyncStorage.setItem(USER_ID_KEY, id);
    }
    await AsyncStorage.setItem(SKIP_LOGIN_KEY, "true");
    const profileExists = await checkProfile(id, profileStorageKey(id));
    setUserId(id);
    setNeedsLogin(false);
    setHasProfileState(profileExists);
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove([SKIP_LOGIN_KEY, USER_ID_KEY]);
    try {
      await clerkSignOut();
    } catch {
    }
    setUserId(null);
    setHasProfileState(false);
    setNeedsLogin(true);
  };

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_KEY, mode);
  };

  const setLanguageCode = async (code: string) => {
    setLanguageCodeState(code);
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  };

  const setAddBurnedCalories = async (value: boolean) => {
    setAddBurnedCaloriesState(value);
    await AsyncStorage.setItem(ADD_BURNED_KEY, value ? "true" : "false");
  };

  const startTrial = async () => {
    const existing = await AsyncStorage.getItem(TRIAL_KEY);
    if (!existing) {
      await AsyncStorage.setItem(TRIAL_KEY, String(Date.now()));
    }
    const trial = await loadTrialState();
    setIsTrialActive(trial.isTrialActive);
    setHasUsedTrial(trial.hasUsedTrial);
  };

  return (
    <AppContext.Provider value={{
      userId, isLoading, hasProfile, needsLogin,
      setHasProfile, continueAnonymously, signOut,
      themeMode, setThemeMode,
      languageCode, setLanguageCode,
      addBurnedCalories, setAddBurnedCalories,
      isPremium,
      isTrialActive,
      hasUsedTrial,
      startTrial,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
