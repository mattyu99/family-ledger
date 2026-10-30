import React, { useState, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile, MemberDevice, Ledger } from '../types/database';
import { getDeviceId, getDeviceName, getDevicePlatform } from '../lib/device';
import { APP_FULL_VERSION } from '../constants/version';
import { safeAlert } from '../lib/ledgerUtils';
import { STORAGE_KEYS, DEMO_LEDGER_ID } from '../constants/ledgerDefaults';
// supabaseAdmin removed for zero-token architecture

export interface UseDeviceAuthProps {
  currentLedger: Ledger;
  setCurrentLedger: React.Dispatch<React.SetStateAction<Ledger>>;
  currentUser: Profile;
  setCurrentUser: (user: Profile) => void;
  members: Profile[];
  setMembers: React.Dispatch<React.SetStateAction<Profile[]>>;
  setLedgers: React.Dispatch<React.SetStateAction<Ledger[]>>;
  isConfigured: boolean;
  supabase: any;
  triggerLiveToast: (toast: any) => void;
  initLedger: () => Promise<void>;
  refreshLedger: () => Promise<void>;
}

export function useDeviceAuth({
  currentLedger,
  setCurrentLedger,
  currentUser,
  setCurrentUser,
  members,
  setMembers,
  setLedgers,
  isConfigured,
  supabase,
  triggerLiveToast,
  initLedger,
  refreshLedger,
}: UseDeviceAuthProps) {
  const [memberDevices, setMemberDevices] = useState<MemberDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isDeviceBound, setIsDeviceBound] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member'>('owner');
  const [adminPin, setAdminPin] = useState<string>('8888');
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [previewMember, setPreviewMember] = useState<Profile | null>(null);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState<boolean>(false);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);

  const isPreviewMode = Boolean(previewMember);
  const effectiveCurrentUser = previewMember || currentUser;
  const isOwner = userRole === 'owner' || userRole === 'admin';
  const effectiveIsOwner = isPreviewMode
    ? (previewMember?.role === 'owner' || previewMember?.role === 'admin')
    : (isOwner && isAdminMode);
  const isCurrentUserLocked = Boolean(currentUser?.is_locked);

  const startMemberPreview = useCallback((member: Profile) => {
    setPreviewMember(member);
  }, []);

  const startCurrentMemberPreview = useCallback(() => {
    setPreviewMember({ ...currentUser, role: 'member' });
  }, [currentUser]);

  const exitMemberPreview = useCallback(() => {
    setPreviewMember(null);
  }, []);

  const enableAdminMode = useCallback((inputPin: string): { success: boolean; message?: string } => {
    const clean = (inputPin || '').trim();
    const expected = (((currentLedger as any)?.admin_pin || adminPin || '8888') as string).trim();
    if (!clean || clean !== expected) {
      return { success: false, message: '管理員安全 PIN 碼錯誤，請重新輸入！' };
    }
    setIsAdminMode(true);
    return { success: true };
  }, [currentLedger, adminPin]);

  const disableAdminMode = useCallback(() => {
    setIsAdminMode(false);
  }, []);

  const updateAdminPin = useCallback(async (newPin: string): Promise<boolean> => {
    const clean = newPin.trim();
    if (!clean || clean.length < 4) {
      safeAlert('PIN 碼格式錯誤', '管理員 PIN 碼至少需要 4 位數');
      return false;
    }
    setAdminPin(clean);
    await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_PIN, clean);
    if (currentLedger?.id) {
      await AsyncStorage.setItem(`${STORAGE_KEYS.ADMIN_PIN}_${currentLedger.id}`, clean);
    }
    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        await supabase.rpc('secure_set_admin_pin', {
          p_ledger_id: currentLedger.id,
          p_admin_pin: clean,
        });
      } catch (err) {
        console.warn('雲端更新管理員 PIN 碼失敗:', err);
      }
    }
    return true;
  }, [currentLedger?.id, isConfigured, supabase]);

  const fetchMemberDevices = useCallback(async (targetLedgerId?: string, targetMemberId?: string) => {
    const lId = targetLedgerId || currentLedger.id;
    if (!lId || lId === DEMO_LEDGER_ID) return;

    const devId = await getDeviceId();
    setCurrentDeviceId(devId);
    const devName = getDeviceName();
    const platform = getDevicePlatform();
    const mId = targetMemberId || effectiveCurrentUser?.id || currentUser.id;

    const myDev: MemberDevice = {
      id: devId,
      ledger_id: lId,
      member_id: mId,
      device_id: devId,
      device_name: devName,
      platform,
      app_version: APP_FULL_VERSION,
      last_active_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (isConfigured && lId !== DEMO_LEDGER_ID) {
      try {
        const { data, error } = await supabase
          .from('member_devices')
          .select('*')
          .eq('ledger_id', lId)
          .order('last_active_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const hasMe = data.some(d => d.device_id === devId);
          const combined = hasMe ? data : [myDev, ...data];
          setMemberDevices(combined as MemberDevice[]);
          await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(combined));
          return;
        }
      } catch (e) {
        console.warn('讀取雲端成員裝置清單失敗:', e);
      }
    }

    try {
      const cachedStr = await AsyncStorage.getItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`);
      let cachedList: MemberDevice[] = [];
      if (cachedStr) {
        try { cachedList = JSON.parse(cachedStr); } catch {}
      }
      const hasMe = cachedList.some(d => d.device_id === devId);
      const combined = hasMe ? cachedList : [myDev, ...cachedList];
      setMemberDevices(combined);
    } catch {}
  }, [currentLedger.id, effectiveCurrentUser?.id, currentUser.id, isConfigured, supabase]);

  const registerDevice = useCallback(async (targetMemberId?: string, targetLedgerId?: string) => {
    try {
      const devId = await getDeviceId();
      setCurrentDeviceId(devId);
      const devName = getDeviceName();
      const platform = getDevicePlatform();
      const lId = targetLedgerId || currentLedger.id;
      const mId = targetMemberId || effectiveCurrentUser?.id || currentUser.id;

      if (!lId || lId === DEMO_LEDGER_ID) return;

      const nowIso = new Date().toISOString();
      const myDev: MemberDevice = {
        id: devId,
        ledger_id: lId,
        member_id: mId,
        device_id: devId,
        device_name: devName,
        platform,
        app_version: APP_FULL_VERSION,
        last_active_at: nowIso,
        created_at: nowIso,
      };

      setMemberDevices(prev => {
        const remaining = prev.filter(d => !(d.device_id === devId && d.ledger_id === lId));
        const next = [myDev, ...remaining];
        AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(next)).catch(() => {});
        return next;
      });

      if (isConfigured && lId !== DEMO_LEDGER_ID) {
        try {
          const { error } = await supabase.from('member_devices').upsert({
            ledger_id: lId,
            member_id: mId,
            device_id: devId,
            device_name: devName,
            platform,
            app_version: APP_FULL_VERSION,
            last_active_at: nowIso,
          }, { onConflict: 'ledger_id,device_id' });

          if (!error) {
            const { data: cloudData } = await supabase
              .from('member_devices')
              .select('*')
              .eq('ledger_id', lId)
              .order('last_active_at', { ascending: false });

            if (cloudData && Array.isArray(cloudData)) {
              const hasMe = cloudData.some(d => d.device_id === devId);
              const combined = hasMe ? cloudData : [myDev, ...cloudData];
              setMemberDevices(combined as MemberDevice[]);
              await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(combined));
            }
          }
        } catch (e) {
          console.warn('登記裝置心跳失敗:', e);
        }
      }
    } catch (err) {
      console.warn('本機登記裝置發生異常:', err);
    }
  }, [currentLedger.id, effectiveCurrentUser?.id, currentUser.id, isConfigured, supabase]);

  const removeDevice = useCallback(async (targetDeviceId: string): Promise<boolean> => {
    try {
      const lId = currentLedger.id;
      if (isConfigured && lId !== DEMO_LEDGER_ID) {
        try {
          await supabase
            .from('member_devices')
            .delete()
            .eq('ledger_id', lId)
            .eq('device_id', targetDeviceId);
        } catch (e) {
          console.warn('雲端刪除成員裝置失敗:', e);
        }
      }
      setMemberDevices(prev => {
        const next = prev.filter(d => d.device_id !== targetDeviceId);
        AsyncStorage.setItem(`${STORAGE_KEYS.MEMBER_DEVICES}_${lId}`, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return true;
    } catch (e) {
      console.warn('移除裝置失敗:', e);
      return false;
    }
  }, [currentLedger.id, isConfigured, supabase]);

  const linkGoogleAccount = useCallback(async (
    targetProfileId?: string,
    actionType: 'bind_google' | 'claim' = 'bind_google'
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!isConfigured) {
        return { success: false, message: '目前為示範或離線模式，無法進行 Google 帳號綁定。' };
      }

      const targetId = targetProfileId || currentUser.id;
      const targetMember = members.find(m => m.id === targetId) || currentUser;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.location) {
          const redirectUrl = `${window.location.origin}${window.location.pathname}?action=${actionType}&profile_id=${targetId}&ledger_id=${currentLedger.id}&display_name=${encodeURIComponent(targetMember.display_name)}`;
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
            },
          });
          if (error) {
            return { success: false, message: error.message };
          }
          return { success: true };
        }
      } else {
        const redirectUrl = `https://mattyu99.github.io/family-ledger/auth-callback.html?action=${actionType}&profile_id=${targetId}&ledger_id=${currentLedger.id}&display_name=${encodeURIComponent(targetMember.display_name)}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data?.url) {
          await Linking.openURL(data.url);
          return { success: true, message: '已開啟瀏覽器進行 Google 授權，請在授權完成後返回 APP' };
        }
      }
      return { success: false, message: '未能取得 Google 授權轉跳網址' };
    } catch (err: any) {
      console.warn('發起 Google 帳號授權失敗:', err);
      return { success: false, message: err?.message || '授權失敗' };
    }
  }, [isConfigured, currentUser, members, currentLedger.id, supabase]);

  const unlinkGoogleAccount = useCallback(async (targetProfileId?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const targetId = targetProfileId || currentUser.id;
      const targetMember = members.find(m => m.id === targetId) || currentUser;

      if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
        try {
          const payload = {
            auth_email: null,
            auth_provider: null,
            is_locked: false,
            claim_code: null,
            claim_code_expires_at: null,
            updated_at: new Date().toISOString(),
          };
          const { data, error } = await supabase.from('profiles').update(payload).eq('id', targetId).select('id');
          if (error || !data || data.length === 0) {
            await supabase.rpc('secure_unlink_profile', { p_profile_id: targetId });
          }
        } catch (e) {
          console.warn('雲端解除綁定更新失敗:', e);
        }
      }

      const updatedUser: Profile = {
        ...currentUser,
        auth_email: undefined,
        auth_provider: null,
        is_locked: false,
      };

      if (currentUser.id === targetId) {
        setCurrentUser(updatedUser);
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
        if (currentLedger?.id) {
          await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(updatedUser));
        }
      }

      setMembers(prev => prev.map(m => m.id === targetId ? {
        ...m,
        auth_email: undefined,
        auth_provider: null,
        is_locked: false,
      } : m));

      triggerLiveToast({
        id: `auth-${Date.now()}`,
        type: 'info',
        actorName: '帳號安全',
        avatar: '🛡️',
        title: '已解除 Google 綁定',
        message: `稱謂【${targetMember.display_name}】已恢復為訪客模式`,
        createdAt: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      console.warn('解除 Google 綁定失敗:', err);
      return { success: false, message: err?.message || '解除失敗' };
    }
  }, [currentUser, members, isConfigured, currentLedger.id, supabase, setCurrentUser, setMembers, triggerLiveToast]);

  const claimGoogleIdentity = useCallback(async (codeOrEmail: string): Promise<{ success: boolean; message?: string; profile?: Profile }> => {
    const clean = (codeOrEmail || '').trim();
    if (!clean) return { success: false, message: '請輸入有效的 Google Email 或 6 位數認領驗證碼' };

    try {
      if (!isConfigured) {
        return { success: false, message: '雲端資料庫未連線，無法認領身分' };
      }

      let query = supabase.from('profiles').select('*').eq('is_locked', true);
      if (clean.includes('@')) {
        query = query.eq('auth_email', clean.toLowerCase());
      } else {
        query = query.eq('claim_code', clean);
      }

      const { data: matchedProfiles, error } = await query;
      if (error || !matchedProfiles || matchedProfiles.length === 0) {
        return { success: false, message: '找不到符合且受保護的 Google 身分稱謂，請確認輸入是否正確' };
      }

      const matched = matchedProfiles[0] as Profile;

      if (!clean.includes('@') && (matched as any).claim_code_expires_at) {
        const expiresAt = new Date((matched as any).claim_code_expires_at).getTime();
        if (Date.now() > expiresAt) {
          return { success: false, message: '驗證碼已過期（超過 10 分鐘），請重新驗證 Google 登入以獲取新驗證碼' };
        }
      }

      await registerDevice(matched.id, currentLedger.id);

      // 跨裝置 Google 授權與 RLS 權限鏈接：
      // 確保當前連線 Session 的 auth.uid() 獲得雲端 ledger_members 存取權限
      const { data: { session: curSession } } = await supabase.auth.getSession();
      const currentAuthUserId = curSession?.user?.id;
      if (currentAuthUserId) {
        try {
          const { data: matchedLedgerRows } = await supabase
            .from('ledger_members')
            .select('ledger_id, role')
            .eq('user_id', matched.id);

          if (matchedLedgerRows && matchedLedgerRows.length > 0) {
            for (const row of matchedLedgerRows) {
              await supabase.from('ledger_members').upsert({
                ledger_id: row.ledger_id,
                user_id: currentAuthUserId,
                role: row.role || 'member',
              }, { onConflict: 'ledger_id,user_id' });
            }
          } else if (currentLedger?.id && currentLedger.id !== DEMO_LEDGER_ID) {
            await supabase.from('ledger_members').upsert({
              ledger_id: currentLedger.id,
              user_id: currentAuthUserId,
              role: matched.role || 'member',
            }, { onConflict: 'ledger_id,user_id' });
          }

          // 同步更新當前 Session 在 profiles 中的身分與保護狀態
          await supabase.from('profiles').upsert({
            id: currentAuthUserId,
            display_name: matched.display_name,
            avatar_url: matched.avatar_url,
            auth_email: matched.auth_email,
            auth_provider: 'google',
            is_locked: true,
            updated_at: new Date().toISOString(),
          });
        } catch (linkErr) {
          console.warn('同步 Google 授權成員權限失敗:', linkErr);
        }
      }

      if (!clean.includes('@')) {
        try {
          const payload = {
            claim_code: null,
            claim_code_expires_at: null,
            updated_at: new Date().toISOString(),
          };
          const { data, error } = await supabase.from('profiles').update(payload).eq('id', matched.id).select('id');
          if (error || !data || data.length === 0) {
            await supabase.from('profiles').update(payload).eq('id', matched.id);
          }
        } catch {}
      }

      setCurrentUser(matched);
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(matched));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(matched));
      }

      if (matched.auth_email) {
        setIsGoogleAuthenticated(true);
        setGoogleUserEmail(matched.auth_email);
        await AsyncStorage.setItem('@family_ledger_google_email', matched.auth_email);
      }

      if (matched.role === 'owner' || matched.role === 'admin' || currentLedger.created_by === matched.id) {
        const targetRole = matched.role === 'owner' || matched.role === 'admin' ? matched.role : 'owner';
        setUserRole(targetRole);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, targetRole);
      }

      await initLedger();
      await refreshLedger();

      triggerLiveToast({
        id: `auth-claim-${Date.now()}`,
        type: 'complete',
        actorName: matched.display_name,
        avatar: matched.avatar_url || '🔑',
        title: '🎉 身分認領成功！',
        message: `已成功恢復為【${matched.display_name}】(${matched.auth_email || '受保護'})`,
        createdAt: Date.now(),
      });

      return { success: true, profile: matched };
    } catch (err: any) {
      console.warn('身分認領過程發生異常:', err);
      return { success: false, message: err?.message || '認領身分失敗' };
    }
  }, [isConfigured, supabase, registerDevice, currentLedger, setCurrentUser, initLedger, refreshLedger, triggerLiveToast]);

  const signInWithGoogle = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!isConfigured) {
        return { success: false, message: '目前為示範或離線模式，無法進行 Google 登入。' };
      }
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.location) {
          const redirectUrl = `${window.location.origin}${window.location.pathname}?action=login`;
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
            },
          });
          if (error) {
            return { success: false, message: error.message };
          }
          return { success: true };
        }
      } else {
        const syncCode = Math.floor(100000 + Math.random() * 900000).toString();
        await AsyncStorage.setItem('@family_ledger_pending_sync_code', syncCode);
        const redirectUrl = `https://mattyu99.github.io/family-ledger/auth-callback.html?action=login&sync_code=${syncCode}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          return { success: false, message: error.message };
        }
        if (data?.url) {
          await Linking.openURL(data.url);
          return { success: true, message: '已開啟系統瀏覽器進行 Google 授權，完成後返回 App 即可自動同步' };
        }
      }
      return { success: false, message: '未能取得 Google 授權轉跳網址' };
    } catch (err: any) {
      console.warn('發起 Google 登入失敗:', err);
      return { success: false, message: err?.message || '登入失敗' };
    }
  }, [isConfigured, supabase]);

  const signOutGoogle = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setIsGoogleAuthenticated(false);
      setGoogleUserEmail(null);
      const { data: anonData } = await supabase.auth.signInAnonymously();
      if (anonData?.session) {
        await initLedger();
      }
      triggerLiveToast({
        id: `auth-signout-${Date.now()}`,
        type: 'info',
        actorName: '帳號安全',
        avatar: '👋',
        title: '已登出 Google 帳號',
        message: '已安全登出並重設為本機訪客身分',
        createdAt: Date.now(),
      });
    } catch (err) {
      console.warn('Google 登出失敗:', err);
    }
  }, [supabase, initLedger, triggerLiveToast]);

  const switchCurrentUser = useCallback(async (member: Profile, inputPin?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const isMemberCreator = currentLedger.created_by === member.id;
      const targetIsAdmin = isMemberCreator || member.role === 'owner' || member.role === 'admin';
      const currentIsAdmin = userRole === 'owner' || userRole === 'admin';

      if (member.is_locked && (!currentUser.auth_email || currentUser.auth_email.toLowerCase() !== (member.auth_email || '').toLowerCase())) {
        return {
          success: false,
          message: `「${member.display_name}」身分已受 Google 帳號（${member.auth_email || '受保護'}）鎖定。請於設定頁使用「以 Google 帳號認領身分」以完成切換。`
        };
      }

      if (!currentIsAdmin && targetIsAdmin) {
        const clean = (inputPin || '').trim();
        const expected = ((currentLedger as any)?.admin_pin || adminPin || '8888').trim();
        if (!clean || clean !== expected) {
          return { success: false, message: '管理員安全 PIN 碼錯誤，無法切換至管理員身分！' };
        }
      }

      const resolvedRole: 'owner' | 'admin' | 'member' =
        isMemberCreator ? 'owner' : (member.role === 'owner' || member.role === 'admin' ? member.role : 'member');
      const updatedUser: Profile = { ...member, role: resolvedRole };

      setCurrentUser(updatedUser);
      setUserRole(resolvedRole);
      setIsDeviceBound(true);

      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
      if (currentLedger?.id) {
        await AsyncStorage.setItem(`${STORAGE_KEYS.CURRENT_USER}_${currentLedger.id}`, JSON.stringify(updatedUser));
      }
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, resolvedRole);
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_BOUND, 'true');

      setLedgers(prev => prev.map(l => l.id === currentLedger.id ? {
        ...l,
        userRole: resolvedRole,
        userDisplayName: member.display_name,
        userAvatar: member.avatar_url,
      } : l));

      return { success: true };
    } catch (err: any) {
      console.error('switchCurrentUser 異常:', err);
      return { success: false, message: err?.message || '切換身分失敗' };
    }
  }, [currentLedger, userRole, currentUser.auth_email, adminPin, setCurrentUser, setLedgers]);

  const bindDeviceToMember = useCallback(async (member: Profile) => {
    await switchCurrentUser(member);
  }, [switchCurrentUser]);

  const unbindDevice = useCallback(async () => {
    setIsDeviceBound(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_BOUND);
  }, []);

  const updateMemberRole = useCallback(async (memberId: string, newRole: 'owner' | 'member'): Promise<boolean> => {
    if (!effectiveIsOwner) {
      safeAlert('權限不足', '只有在管理員模式下才能變更成員角色權限');
      return false;
    }

    if (currentLedger.created_by === memberId && newRole === 'member') {
      safeAlert('操作無效', '此帳本的原始建立者不能被降為一般成員');
      return false;
    }

    if (newRole === 'member') {
      const remainingAdmins = members.filter(
        m => m.id !== memberId && (m.role === 'owner' || m.role === 'admin' || currentLedger.created_by === m.id)
      );
      if (remainingAdmins.length === 0) {
        safeAlert('無法降級', '家庭公帳至少需保留一位管理員。若要卸任，請先將另一位家人（如伴侶）設為管理員！');
        return false;
      }
    }

    const updated = members.map(m => m.id === memberId ? { ...m, role: newRole } : m);
    setMembers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updated));
    await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(updated));

    const { data: { session } } = await supabase.auth.getSession();
    const myAuthId = session?.user?.id;
    if (myAuthId === memberId) {
      setUserRole(newRole);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, newRole);
    }

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        let rpcSuccess = false;
        try {
          const { data: rpcRes } = await supabase.rpc('set_member_role', {
            target_ledger_id: currentLedger.id,
            target_user_id: memberId,
            new_role: newRole,
          });
          if (rpcRes && rpcRes.success) {
            rpcSuccess = true;
          }
        } catch {}

        if (!rpcSuccess) {
          const { error } = await supabase
            .from('ledger_members')
            .update({ role: newRole })
            .eq('ledger_id', currentLedger.id)
            .eq('user_id', memberId);

          if (error) {
            console.warn('雲端更新成員角色失敗:', error);
            safeAlert('變更失敗', '變更成員權限失敗: ' + error.message);
            return false;
          }
        }
      } catch (err: any) {
        console.warn('雲端更新成員角色異常:', err);
        return false;
      }
    }

    return true;
  }, [effectiveIsOwner, currentLedger.created_by, currentLedger.id, members, setMembers, supabase, isConfigured]);

  const claimAdminRoleWithPin = useCallback(async (inputPin: string): Promise<{ success: boolean; message?: string }> => {
    const clean = inputPin.trim();
    const expected = (currentLedger as any)?.admin_pin || adminPin || '8888';
    if (!clean || clean !== expected.trim()) {
      return { success: false, message: '管理員安全 PIN 碼錯誤，無法取得管理員權限！' };
    }

    const { data: { session } } = await supabase.auth.getSession();
    const authUserId = session?.user?.id || currentUser.id;

    setPreviewMember(null);
    setUserRole('owner');
    await AsyncStorage.setItem(STORAGE_KEYS.USER_ROLE, 'owner');

    const updatedMembers = members.map(m => (m.id === currentUser.id ? { ...m, role: 'owner' as const } : m));
    setMembers(updatedMembers);
    await AsyncStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(updatedMembers));
    await AsyncStorage.setItem(`${STORAGE_KEYS.MEMBERS}_${currentLedger.id}`, JSON.stringify(updatedMembers));

    if (isConfigured && currentLedger.id !== DEMO_LEDGER_ID) {
      try {
        if (currentUser.display_name && currentUser.display_name !== '家庭成員') {
          await supabase.from('profiles').upsert({
            id: authUserId,
            display_name: currentUser.display_name,
            avatar_url: currentUser.avatar_url,
            updated_at: new Date().toISOString(),
          });
        }

        await supabase.from('ledger_members').upsert({
          ledger_id: currentLedger.id,
          user_id: authUserId,
          role: 'owner',
        }, { onConflict: 'ledger_id,user_id' });

        if (currentUser.id && currentUser.id !== authUserId) {
          await supabase.from('ledger_members').upsert({
            ledger_id: currentLedger.id,
            user_id: currentUser.id,
            role: 'owner',
          }, { onConflict: 'ledger_id,user_id' });
        }

        // 僅在帳本目前無建立者或本使用者即為創立者時，才設定 created_by；否則只升級 owner 角色，避免誤改帳本原創者
        if (!currentLedger.created_by || currentLedger.created_by === authUserId) {
          await supabase.from('ledgers').update({ created_by: authUserId, updated_at: new Date().toISOString() }).eq('id', currentLedger.id);
          setCurrentLedger(prev => ({ ...prev, created_by: authUserId }));
        }

        // 跨裝置同步：若名冊中有其他同名紀錄 (例如同成員的手機 APP 或其他瀏覽器裝置)，一併升級為 owner
        const myName = (currentUser.display_name || '').trim().toLowerCase();
        if (myName) {
          const { data: allMembersInLedger } = await supabase
            .from('ledger_members')
            .select('user_id, profiles(display_name)')
            .eq('ledger_id', currentLedger.id);

          if (allMembersInLedger) {
            for (const m of allMembersInLedger) {
              const mName = ((m.profiles as any)?.display_name || '').trim().toLowerCase();
              if (mName === myName && m.user_id !== authUserId) {
                await supabase
                  .from('ledger_members')
                  .update({ role: 'owner' })
                  .eq('ledger_id', currentLedger.id)
                  .eq('user_id', m.user_id);
              }
            }
          }
        }
      } catch (e) {
        console.warn('雲端更新角色失敗:', e);
      }
    }
    return { success: true };
  }, [adminPin, currentLedger, currentUser, isConfigured, members, setMembers, supabase]);

  return {
    memberDevices,
    setMemberDevices,
    currentDeviceId,
    setCurrentDeviceId,
    isDeviceBound,
    setIsDeviceBound,
    userRole,
    setUserRole,
    adminPin,
    setAdminPin,
    isAdminMode,
    setIsAdminMode,
    enableAdminMode,
    disableAdminMode,
    previewMember,
    setPreviewMember,
    isPreviewMode,
    effectiveCurrentUser,
    isOwner,
    effectiveIsOwner,
    isCurrentUserLocked,
    isGoogleAuthenticated,
    setIsGoogleAuthenticated,
    googleUserEmail,
    setGoogleUserEmail,
    startMemberPreview,
    startCurrentMemberPreview,
    exitMemberPreview,
    updateAdminPin,
    fetchMemberDevices,
    registerDevice,
    removeDevice,
    linkGoogleAccount,
    unlinkGoogleAccount,
    claimGoogleIdentity,
    signInWithGoogle,
    signOutGoogle,
    switchCurrentUser,
    bindDeviceToMember,
    unbindDevice,
    updateMemberRole,
    claimAdminRoleWithPin,
  };
}

