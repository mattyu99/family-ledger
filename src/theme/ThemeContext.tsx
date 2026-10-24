import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, lightColors, darkColors } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = '@family_ledger_theme_mode';

interface ThemeContextValue {
  themeMode: ThemeMode;
  isDark: boolean;
  isLoaded: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'system',
  isDark: false,
  isLoaded: false,
  colors: lightColors,
  setThemeMode: async () => {},
  toggleTheme: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 初始化時讀取本機偏好
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemeModeState(saved);
        }
      } catch (err) {
        console.warn('[Theme] 讀取外觀偏好失敗:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadThemePreference();
  }, []);

  // 計算當前是否為深色模式
  const isDark = useMemo(() => {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return systemColorScheme === 'dark';
  }, [themeMode, systemColorScheme]);

  // 切換主題並持久化儲存
  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (err) {
      console.warn('[Theme] 儲存外觀偏好失敗:', err);
    }
  }, []);

  // 快速輪播切換：淺色 (light) -> 深色 (dark) -> 跟隨系統 (system) -> 淺色
  const toggleTheme = useCallback(async () => {
    let nextMode: ThemeMode;
    if (themeMode === 'light') {
      nextMode = 'dark';
    } else if (themeMode === 'dark') {
      nextMode = 'system';
    } else {
      nextMode = 'light';
    }
    await setThemeMode(nextMode);
  }, [themeMode, setThemeMode]);

  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(
    () => ({
      themeMode,
      isDark,
      isLoaded,
      colors,
      setThemeMode,
      toggleTheme,
    }),
    [themeMode, isDark, isLoaded, colors, setThemeMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme 必須在 ThemeProvider 內部使用');
  }
  return context;
};
