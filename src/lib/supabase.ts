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

// 解析取得最高管理員服務權杖 (僅限後端 Node.js 執行環境如 daily-report，前端預設為空以確保資安)
export const getStorageServiceToken = (): string => {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
};

// 集中管理員客戶端（若環境有注入 service_role 則為 admin client，前端未注入時安全降級為標準 supabase 客戶端，由資料庫 SECURITY DEFINER RPC 提供權限穿透）
let _supabaseAdmin: typeof supabase | null = null;
export const getSupabaseAdmin = (): typeof supabase => {
  if (!_supabaseAdmin && isConfigured) {
    const token = getStorageServiceToken();
    if (token) {
      _supabaseAdmin = createClient(SUPABASE_URL, token, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }) as unknown as typeof supabase;
    }
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

