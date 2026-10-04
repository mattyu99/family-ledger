import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 支援從 .env 讀取，若環境變數缺失則使用專案雲端 Supabase 設定作為備援
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://babpppaxzszieropeouh.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_nxHZUg651sBAJ387bZgZIQ_GuEfpAuZ';

// 判斷是否已連接至真實有效的 Supabase 雲端
export const isConfigured = Boolean(
  SUPABASE_URL &&
  !SUPABASE_URL.includes('your-project.supabase.co') &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_ANON_KEY &&
  SUPABASE_ANON_KEY !== 'your-anon-key' &&
  SUPABASE_ANON_KEY !== 'your-publishable-key'
);

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
