import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
  Text as RNText,
  Platform,
  TextProps,
} from 'react-native';
import { LiveToastNotification } from '../context/LedgerContext';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface LiveToastBannerProps {
  toast: LiveToastNotification | null;
  onDismiss: () => void;
}

export const LiveToastBanner: React.FC<LiveToastBannerProps> = ({ toast, onDismiss }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  useEffect(() => {
    if (toast) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      translateY.setValue(-100);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 9,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // 4 秒後自動優雅淡出
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, 4200);

      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    }
  }, [toast?.id]);

  if (!toast) return null;

  const getBorderColor = () => {
    if (toast.type === 'insert') return '#4F46E5';
    if (toast.type === 'update') return '#F59E0B';
    if (toast.type === 'delete') return '#EF4444';
    return '#6366F1';
  };

  const getAvatarBg = () => {
    if (toast.type === 'insert') return '#EEF2FF';
    if (toast.type === 'update') return '#FEF3C7';
    if (toast.type === 'delete') return '#FEE2E2';
    return '#F1F5F9';
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.card, { borderColor: getBorderColor() }]}
        activeOpacity={0.9}
        onPress={handleDismiss}
      >
        <View style={[styles.avatarBox, { backgroundColor: getAvatarBg() }]}>
          <Text style={styles.avatarText}>{toast.avatar || '👤'}</Text>
        </View>

        <View style={styles.contentBox}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {toast.title}
            </Text>
            <Text style={styles.timeTag}>剛剛</Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {toast.message}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : Platform.OS === 'android' ? 38 : 18,
    left: 12,
    right: 12,
    zIndex: 99999,
    alignItems: 'center',
    elevation: 20,
  },
  card: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 20,
  },
  contentBox: {
    flex: 1,
    marginRight: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  timeTag: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  message: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    lineHeight: 16,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  closeBtnText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
});
