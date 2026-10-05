import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export interface AvatarCategory {
  id: string;
  label: string;
  icon: string;
  options: string[];
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    id: 'family',
    label: '家庭成員',
    icon: '👨‍👩‍👧',
    options: ['👨', '👩', '👦', '👧', '👴', '👵', '👶', '👱'],
  },
  {
    id: 'pets',
    label: '毛孩萌寵',
    icon: '🐾',
    options: ['🐶', '🐱', '🐰', '🐹', '🐻', '🐼', '🐨', '🦊'],
  },
  {
    id: 'pokemon',
    label: '寶可夢',
    icon: '⚡',
    options: ['⚡', '🐢', '🦎', '🐸', '🦊', '👻', '🦆', '🐟', '🦉', '🐧', '🔴', '🦖', '🦕', '🥚'],
  },
];

export const AVATAR_NAMES: Record<string, string> = {
  // 寶可夢夥伴
  '⚡': '皮卡丘',
  '🐢': '傑尼龜',
  '🦎': '小火龍',
  '🐸': '妙蛙種子',
  '🦊': '伊布',
  '👻': '耿鬼',
  '🦆': '可達鴨',
  '🐟': '鯉魚王',
  '🦉': '木木梟',
  '🐧': '波加曼',
  '🔴': '精靈球',
  '🦖': '恐龍 / 班基拉斯',
  '🦕': '乘龍 (拉普拉斯)',
  '🥚': '波克比',
  // 毛孩萌寵
  '🐶': '小狗',
  '🐱': '小貓 / 喵喵',
  '🐰': '兔子',
  '🐹': '倉鼠',
  '🐻': '小熊',
  '🐼': '熊貓',
  '🐨': '無尾熊',
  // 家庭成員
  '👨': '爸爸 / 男士',
  '👩': '媽媽 / 女士',
  '👦': '男孩 / 兒子',
  '👧': '女孩 / 女兒',
  '👴': '爺爺 / 阿公',
  '👵': '奶奶 / 阿嬤',
  '👶': '小寶寶',
  '👱': '青年',
};

export const ALL_AVATAR_OPTIONS = Array.from(new Set(AVATAR_CATEGORIES.flatMap(c => c.options)));

export interface AvatarPickerProps {
  selectedAvatar: string;
  onSelectAvatar: (avatar: string) => void;
  containerStyle?: object;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  selectedAvatar,
  onSelectAvatar,
  containerStyle,
}) => {
  const [activeTab, setActiveTab] = useState<string>(() => {
    const found = AVATAR_CATEGORIES.find(c => c.options.includes(selectedAvatar));
    return found ? found.id : 'family';
  });

  useEffect(() => {
    if (selectedAvatar) {
      const found = AVATAR_CATEGORIES.find(c => c.options.includes(selectedAvatar));
      if (found && found.id !== activeTab) {
        setActiveTab(found.id);
      }
    }
  }, [selectedAvatar]);

  const currentCategory = AVATAR_CATEGORIES.find(c => c.id === activeTab) || AVATAR_CATEGORIES[0];
  const selectedName = AVATAR_NAMES[selectedAvatar];

  return (
    <View style={[styles.container, containerStyle]}>
      {/* 分類切換按鈕列 */}
      <View style={styles.tabContainer}>
        {AVATAR_CATEGORIES.map(cat => {
          const isActive = activeTab === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(cat.id)}
              activeOpacity={0.7}
            >
              <Text
                allowFontScaling={false}
                maxFontSizeMultiplier={1.08}
                style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}
              >
                {cat.icon} {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 頭像選擇網格 */}
      <View style={styles.avatarGrid}>
        {currentCategory.options.map(avatar => {
          const isSelected = selectedAvatar === avatar;
          return (
            <TouchableOpacity
              key={avatar}
              style={[styles.avatarChip, isSelected && styles.avatarChipActive]}
              onPress={() => onSelectAvatar(avatar)}
              activeOpacity={0.7}
            >
              <Text
                allowFontScaling={false}
                maxFontSizeMultiplier={1.08}
                style={styles.avatarEmoji}
              >
                {avatar}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 目前選中角色提示 */}
      <View style={styles.selectedRow}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.selectedLabel}>
          目前頭像：
        </Text>
        <View style={styles.selectedBadge}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.selectedBadgeEmoji}>
            {selectedAvatar || '👤'}
          </Text>
          {selectedName ? (
            <Text allowFontScaling={false} maxFontSizeMultiplier={1.08} style={styles.selectedBadgeName}>
              {selectedName}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  avatarChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
    transform: [{ scale: 1.06 }],
  },
  avatarEmoji: {
    fontSize: 22,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 6,
  },
  selectedLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 3,
    paddingHorizontal: 8,
    gap: 4,
  },
  selectedBadgeEmoji: {
    fontSize: 14,
  },
  selectedBadgeName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
});

