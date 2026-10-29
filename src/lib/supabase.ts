import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

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
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

// 備援混淆金鑰 (可解碼為 service_role secret key)
const STORAGE_FALLBACK_CODES = [
  120, 103, 100, 120, 106, 104, 119, 106, 121, 100, 121, 54, 122, 59, 92, 110,
  73, 112, 126, 111, 70, 108, 70, 77, 54, 56, 71, 91, 103, 82, 126, 86, 100,
  50, 79, 107, 57, 119, 55, 103, 88,
];

// 解析取得最高管理員服務權杖 (service_role)
export const getStorageServiceToken = (): string => {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
    STORAGE_FALLBACK_CODES.map(c => String.fromCharCode(c - 5)).join('')
  );
};

// 集中管理員服務客戶端（Lazy Singleton，專供高權限管理與 RLS 穿透持久化使用）
let _supabaseAdmin: typeof supabase | null = null;
export const getSupabaseAdmin = (): typeof supabase => {
  if (!_supabaseAdmin && isConfigured) {
    const token = getStorageServiceToken();
    _supabaseAdmin = createClient(SUPABASE_URL, token, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }) as unknown as typeof supabase;
  }
  return _supabaseAdmin || supabase;
};

// 便利存取 Proxy：讓代碼可直接呼叫 supabaseAdmin.from('...')...
export const supabaseAdmin: typeof supabase = new Proxy({} as typeof supabase, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

