import AsyncStorage from '@react-native-async-storage/async-storage';

export const OFFLINE_OUTBOX_STORAGE_KEY = '@family_ledger_offline_outbox';

export type OfflineMutationType =
  | 'insert_transaction'
  | 'update_transaction'
  | 'delete_transaction'
  | 'toggle_memo_settled'
  | 'transfer_allowance';

export interface OfflineMutation {
  id: string;
  type: OfflineMutationType;
  ledgerId: string;
  payload: any;
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

type QueueListener = (queue: OfflineMutation[]) => void;
const listeners = new Set<QueueListener>();

let memoryQueue: OfflineMutation[] | null = null;

const notifyListeners = (queue: OfflineMutation[]) => {
  listeners.forEach((listener) => {
    try {
      listener(queue);
    } catch (e) {
      console.warn('OfflineQueue listener error:', e);
    }
  });
};

/**
 * 訂閱離線佇列變更事件
 */
export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  if (memoryQueue !== null) {
    listener(memoryQueue);
  } else {
    getOfflineQueue().then((q) => listener(q));
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 讀取本機全部離線排隊操作
 */
export async function getOfflineQueue(): Promise<OfflineMutation[]> {
  if (memoryQueue !== null) {
    return memoryQueue;
  }
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_OUTBOX_STORAGE_KEY);
    if (!raw) {
      memoryQueue = [];
      return [];
    }
    const parsed = JSON.parse(raw);
    memoryQueue = Array.isArray(parsed) ? parsed : [];
    return memoryQueue;
  } catch (e) {
    console.warn('讀取離線佇列失敗:', e);
    memoryQueue = [];
    return [];
  }
}

/**
 * 儲存離線佇列至 AsyncStorage
 */
async function saveOfflineQueue(queue: OfflineMutation[]): Promise<void> {
  memoryQueue = queue;
  notifyListeners(queue);
  try {
    await AsyncStorage.setItem(OFFLINE_OUTBOX_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('儲存離線佇列失敗:', e);
  }
}

/**
 * 排入一筆離線變更至隊列末端 (若存在相同 id 的相同類型操作則自動合併更新)
 */
export async function enqueueOfflineMutation(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt' | 'retryCount'> & { id?: string }
): Promise<OfflineMutation> {
  const current = await getOfflineQueue();
  const mutationId = mutation.id || `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // 若為針對同一筆 transaction 的 update 操作，替換為最新 payload
  let updatedQueue: OfflineMutation[];
  const existingIdx = current.findIndex(
    (m) => m.type === mutation.type && m.payload?.id === mutation.payload?.id && m.payload?.id
  );

  const newEntry: OfflineMutation = {
    id: mutationId,
    type: mutation.type,
    ledgerId: mutation.ledgerId,
    payload: mutation.payload,
    createdAt: Date.now(),
    retryCount: 0,
  };

  if (existingIdx >= 0) {
    updatedQueue = [...current];
    updatedQueue[existingIdx] = newEntry;
  } else {
    updatedQueue = [...current, newEntry];
  }

  await saveOfflineQueue(updatedQueue);
  return newEntry;
}

/**
 * 當某筆操作成功同步至雲端後，移出佇列
 */
export async function dequeueOfflineMutation(mutationId: string): Promise<void> {
  const current = await getOfflineQueue();
  const next = current.filter((m) => m.id !== mutationId);
  await saveOfflineQueue(next);
}

/**
 * 記錄某筆操作重試失敗訊息與遞增重試計數
 */
export async function updateMutationFailure(mutationId: string, errorMsg?: string): Promise<void> {
  const current = await getOfflineQueue();
  const next = current.map((m) => {
    if (m.id === mutationId) {
      return {
        ...m,
        retryCount: (m.retryCount || 0) + 1,
        lastError: errorMsg || '連線逾時',
      };
    }
    return m;
  });
  await saveOfflineQueue(next);
}

/**
 * 清空佇列
 */
export async function clearOfflineQueue(): Promise<void> {
  await saveOfflineQueue([]);
}

