import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 請在 Supabase 專案建立後，將 URL 與 ANON_KEY 填入此處（或使用 .env）
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

// 判斷是否已連接至真實 Supabase 雲端
export const isConfigured = 
  SUPABASE_URL !== 'https://babpppaxzszieropeouh.supabase.co' && 
  SUPABASE_ANON_KEY !== 'sb_publishable_nxHZUg651sBAJ387bZgZIQ_GuEfpAuZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
