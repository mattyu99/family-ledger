import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { PixelRatio, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FontSizeLevel = 'small' | 'standard' | 'large' | 'extra_large';

export interface FontSizeOption {
  level: FontSizeLevel;
  label: string;
  shortLabel: string;
  scale: number;
  description: string;
}

export const FONT_SIZE_LEVEL_SCALES: Record<FontSizeLevel, number> = {
  small: 0.90,
  standard: 1.00,
  large: 1.12,
  extra_large: 1.25,
};

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { level: 'small', label: '精簡模式 (90%)', shortLabel: '精簡', scale: 0.90, description: '緊湊視角，一屏容納更多筆明細' },
  { level: 'standard', label: '標準預設 (100%)', shortLabel: '標準', scale: 1.00, description: '官方標準黃金閱讀比例' },
  { level: 'large', label: '舒適放大 (112%)', shortLabel: '舒適', scale: 1.12, description: '字體稍大一點，日常閱讀更清晰輕鬆' },
  { level: 'extra_large', label: '特大長輩 (125%)', shortLabel: '長輩', scale: 1.25, description: '長輩友善超大清晰字體，醒目好辨識' },
];

const FONT_SIZE_STORAGE_KEY = '@family_ledger_font_size_level';
const FOLLOW_SYSTEM_STORAGE_KEY = '@family_ledger_font_size_follow_system';

interface FontSizeContextValue {
  fontSizeLevel: FontSizeLevel;
  fontScale: number;
  followSystemFont: boolean;
  systemFontScale: number;
  isLoaded: boolean;
  setFontSizeLevel: (level: FontSizeLevel) => Promise<void>;
  setFollowSystemFont: (follow: boolean) => Promise<void>;
}

const defaultContextValue: FontSizeContextValue = {
  fontSizeLevel: 'standard',
  fontScale: 1.00,
  followSystemFont: false,
  systemFontScale: 1.00,
  isLoaded: true,
  setFontSizeLevel: async () => {},
  setFollowSystemFont: async () => {},
};

const FontSizeContext = createContext<FontSizeContextValue>(defaultContextValue);

export const FontSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontSizeLevel, setFontSizeLevelState] = useState<FontSizeLevel>('standard');
  const [followSystemFont, setFollowSystemFontState] = useState<boolean>(false);
  const [systemFontScale, setSystemFontScale] = useState<number>(() => {
    try {
      return PixelRatio.getFontScale() || 1.0;
    } catch {
      return 1.0;
    }
  });
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 監聽螢幕/系統設定變化以取得最新系統字體倍率
  useEffect(() => {
    const updateSystemScale = () => {
      try {
        const scale = PixelRatio.getFontScale() || 1.0;
        setSystemFontScale(scale);
      } catch {
        // ignore
      }
    };

    updateSystemScale();
    const subscription = Dimensions.addEventListener('change', updateSystemScale);
    return () => {
      subscription?.remove?.();
    };
  }, []);

  // 初始化時自本機載入儲存的字型設定
  useEffect(() => {
    const loadFontSizePreference = async () => {
      try {
        const [savedLevel, savedFollow] = await Promise.all([
          AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY),
          AsyncStorage.getItem(FOLLOW_SYSTEM_STORAGE_KEY),
        ]);

        if (savedLevel === 'small' || savedLevel === 'standard' || savedLevel === 'large' || savedLevel === 'extra_large') {
          setFontSizeLevelState(savedLevel);
        }

        if (savedFollow !== null) {
          setFollowSystemFontState(savedFollow === 'true');
        }
      } catch (err) {
        console.warn('[FontSize] 讀取字型偏好失敗:', err);
      } finally {
        setIsLoaded(true);
      }
    };

    loadFontSizePreference();
  }, []);

  // 設定指定字體檔位（自動取消跟隨系統以避免衝突）
  const setFontSizeLevel = useCallback(async (level: FontSizeLevel) => {
    setFontSizeLevelState(level);
    setFollowSystemFontState(false);
    try {
      await Promise.all([
        AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, level),
        AsyncStorage.setItem(FOLLOW_SYSTEM_STORAGE_KEY, 'false'),
      ]);
    } catch (err) {
      console.warn('[FontSize] 儲存字型檔位失敗:', err);
    }
  }, []);

  // 切換是否跟隨手機系統字體
  const setFollowSystemFont = useCallback(async (follow: boolean) => {
    setFollowSystemFontState(follow);
    try {
      await AsyncStorage.setItem(FOLLOW_SYSTEM_STORAGE_KEY, follow ? 'true' : 'false');
    } catch (err) {
      console.warn('[FontSize] 儲存跟隨系統偏好失敗:', err);
    }
  }, []);

  // 計算最終有效縮放倍率（安全保護上限 1.30x，下限 0.85x）
  const fontScale = useMemo(() => {
    if (followSystemFont) {
      const clamped = Math.max(0.85, Math.min(systemFontScale, 1.30));
      return Math.round(clamped * 100) / 100;
    }
    return FONT_SIZE_LEVEL_SCALES[fontSizeLevel] || 1.00;
  }, [followSystemFont, systemFontScale, fontSizeLevel]);

  const value = useMemo(
    () => ({
      fontSizeLevel,
      fontScale,
      followSystemFont,
      systemFontScale,
      isLoaded,
      setFontSizeLevel,
      setFollowSystemFont,
    }),
    [fontSizeLevel, fontScale, followSystemFont, systemFontScale, isLoaded, setFontSizeLevel, setFollowSystemFont]
  );

  return <FontSizeContext.Provider value={value}>{children}</FontSizeContext.Provider>;
};

export const useFontSize = (): FontSizeContextValue => {
  const context = useContext(FontSizeContext);
  return context || defaultContextValue;
};
