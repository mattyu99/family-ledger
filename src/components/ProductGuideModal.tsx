import React from 'react';
import {
  Modal,
  View,
  Text as RNText,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextProps,
  Linking,
  Platform,
} from 'react-native';

const Text: React.FC<TextProps> = ({ allowFontScaling = false, maxFontSizeMultiplier = 1.08, ...rest }) => (
  <RNText
    allowFontScaling={allowFontScaling}
    maxFontSizeMultiplier={Math.min(maxFontSizeMultiplier ?? 1.08, 1.08)}
    {...rest}
  />
);

interface ProductGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

interface GuideItem {
  icon: string;
  title: string;
  tag: string;
  tagBg: string;
  tagColor: string;
  steps: string[];
}

const GUIDE_ITEMS: GuideItem[] = [
  {
    icon: '🕒',
    title: '1. 記帳時分秒與時間微調',
    tag: '時序歸位',
    tagBg: '#E0E7FF',
    tagColor: '#3730A3',
    steps: [
      '點選記帳彈窗內的「今日」或「日期/時間標籤」，即可微調時:分，或點「設為現在」。',
      '儲存後系統會自動依真實時間排序歸位，不再有跨筆紀錄時序錯亂問題。',
    ],
  },
  {
    icon: '🎁',
    title: '2. 孩子零用錢怎麼發？',
    tag: '雙向平衡',
    tagBg: '#FCE7F3',
    tagColor: '#9D174D',
    steps: [
      '點擊首頁下方「＋」按鈕 ➔ 頂部直接切換至「🎁 撥零用錢」（無需點選其他轉帳按鈕）。',
      '選擇出資家長（如爸爸/媽媽）與受款孩子，輸入發放金額與備註說明（如月零用錢、考試獎勵）。',
      '送出後自動平衡：家長記一筆公帳支出，孩子帳戶增加可用零用錢餘額！',
    ],
  },
  {
    icon: '📋',
    title: '3. 待辦採買清單怎麼連動公帳？',
    tag: '一鍵省時',
    tagBg: '#DCFCE7',
    tagColor: '#166534',
    steps: [
      '在待辦清單中採買完成後，直接點擊該待辦項目的勾選圓圈。',
      '彈出確認視窗，可直接選擇「連動記帳至公帳」，自動帶入品項名稱與預估金額。',
      '無需重複手動鍵入，一邊採買、一邊打勾、一邊完成家庭記帳！',
    ],
  },
  {
    icon: '🚌',
    title: '4. 悠遊卡靠卡加值',
    tag: '動態出資',
    tagBg: '#FEF3C7',
    tagColor: '#92400E',
    steps: [
      '在首頁帳戶專區點開悠遊卡，點「＋加值」，或支援 NFC 的手機直接靠卡感應加值。',
      '自由選擇加值出資方式（悠遊付、街口支付、銀行轉帳或信用卡）。',
      '系統自動扣抵出資管道並增加悠遊卡可用餘額，對帳絕無差額。',
    ],
  },
  {
    icon: '💳',
    title: '5. 信用卡如何對帳？',
    tag: '精確對齊',
    tagBg: '#DBEAFE',
    tagColor: '#1E40AF',
    steps: [
      '切換至「帳單支付」頁籤或在卡片清單中點擊該張信用卡。',
      '檢視本期消費明細與累積金額，支援核對每筆刷卡。',
      '收到銀行電子帳單時，點「一鍵繳款」即可自公帳/銀行扣款並歸零待繳帳款。',
    ],
  },
  {
    icon: '🎯',
    title: '6. 悠遊卡如何對帳？',
    tag: '排他過濾',
    tagBg: '#F3E8FF',
    tagColor: '#6B21A8',
    steps: [
      '在帳戶列表中點開悠遊卡，完整查看每次搭車、小額消費與加值明細。',
      '對帳系統採專屬 ID 排他過濾機制，精準對應卡片專屬明細，餘額與交易一目了然。',
    ],
  },
  {
    icon: '💡',
    title: '7. 水電瓦斯固定帳單怎麼管理？',
    tag: '週期扣款',
    tagBg: '#CCFBF1',
    tagColor: '#115E59',
    steps: [
      '進入「帳單支付」或「家庭設定」➔「固定週期帳單」。',
      '建立單月/雙月繳的水電、瓦斯、電信、房租或訂閱費，支援到期日前自動提醒。',
      '收到繳費單時，點選待繳清單中的「一鍵確認入帳」即刻入帳。',
    ],
  },
  {
    icon: '🛡️',
    title: '8. 備份與安全 PIN 碼',
    tag: '隱私守護',
    tagBg: '#FFE4E6',
    tagColor: '#9F1239',
    steps: [
      '「家庭設定」提供 6 大要素全量備份，隨時將帳本資料匯出存檔或換機還原。',
      '具備 4 位數安全 PIN 碼保護機制（預設 8888），防止誤刪重要家庭名冊或敏感帳本。',
    ],
  },
];

export const ProductGuideModal: React.FC<ProductGuideModalProps> = ({ visible, onClose }) => {
  const handleOpenBrochure = async () => {
    const url = 'https://mattyu99.github.io/family-ledger/product_brochure.html';
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      try {
        await Linking.openURL(url);
      } catch {
        // fallback ignore
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* 頂部標題列 */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>📖 產品介紹與操作指南</Text>
              <Text style={styles.subtitle}>
                甜心記帳本 • 8 大日常操作速查手冊
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* 產品理念介紹橫幅 */}
            <View style={styles.introBanner}>
              <View style={styles.introBadgeRow}>
                <View style={styles.introBadge}>
                  <Text style={styles.introBadgeText}>💖 甜心記帳本核心理念</Text>
                </View>
                <Text style={styles.introSubText}>Sweetheart Family Ledger</Text>
              </View>
              <Text style={styles.introTitle}>
                專為雙薪家庭、新手爸媽與全家人打造的智慧公帳協作系統
              </Text>
              <Text style={styles.introDesc}>
                秉持「公款共濟、零用透明、一人一機、無感對帳」四大核心哲學。支援多人即時同步、待辦採買連動入帳、悠遊卡靠卡加值與信用卡對帳，讓日常記帳如聊天般溫暖自然！
              </Text>
            </View>

            {/* 8 大常用操作指引 */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>📌 8 大日常操作速查</Text>
              <Text style={styles.sectionDesc}>點選下方項目快速熟悉功能</Text>
            </View>

            {GUIDE_ITEMS.map((item) => (
              <View key={item.title} style={styles.guideCard}>
                <View style={styles.guideHeader}>
                  <View style={styles.guideTitleRow}>
                    <Text style={styles.guideIcon}>{item.icon}</Text>
                    <Text style={styles.guideTitleText}>{item.title}</Text>
                  </View>
                  <View style={[styles.guideTag, { backgroundColor: item.tagBg }]}>
                    <Text style={[styles.guideTagText, { color: item.tagColor }]}>{item.tag}</Text>
                  </View>
                </View>

                <View style={styles.stepsBox}>
                  {item.steps.map((step, sIdx) => (
                    <View key={sIdx} style={styles.stepRow}>
                      <Text style={styles.stepBullet}>•</Text>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* 線上完整型錄推廣卡片 */}
            <TouchableOpacity
              style={styles.brochureCard}
              onPress={handleOpenBrochure}
              activeOpacity={0.8}
            >
              <View style={styles.brochureLeft}>
                <View style={styles.brochureIconWrap}>
                  <Text style={styles.brochureIcon}>🌐</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.brochureTitle}>閱讀完整產品介紹與功能型錄</Text>
                  <Text style={styles.brochureSubtitle}>
                    包含 6 大核心價值主張、系統三層架構與即時協同特色（網頁版）
                  </Text>
                </View>
              </View>
              <View style={styles.brochureActionBadge}>
                <Text style={styles.brochureActionText}>開啟網頁 ›</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* 底部按鈕列 */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.brochureFooterBtn}
              onPress={handleOpenBrochure}
              activeOpacity={0.8}
            >
              <Text style={styles.brochureFooterBtnText}>🌐 線上完整型錄</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeFooterBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.closeFooterBtnText}>我知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '88%',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  scrollArea: {
    marginTop: 12,
    marginBottom: 12,
  },
  introBanner: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  introBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  introBadge: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  introBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  introSubText: {
    fontSize: 11,
    color: '#BE123C',
    fontWeight: '600',
  },
  introTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#881337',
    marginTop: 4,
    marginBottom: 6,
    lineHeight: 19,
  },
  introDesc: {
    fontSize: 12,
    color: '#9F1239',
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  sectionDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  guideCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  guideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  guideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
  },
  guideIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  guideTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  guideTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  guideTagText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  stepsBox: {
    gap: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  stepBullet: {
    fontSize: 12,
    color: '#E11D48',
    lineHeight: 17,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  brochureCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brochureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  brochureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  brochureIcon: {
    fontSize: 18,
  },
  brochureTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
  },
  brochureSubtitle: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
    lineHeight: 15,
  },
  brochureActionBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  brochureActionText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  brochureFooterBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brochureFooterBtnText: {
    color: '#2563EB',
    fontSize: 13.5,
    fontWeight: '700',
  },
  closeFooterBtn: {
    flex: 1,
    backgroundColor: '#E11D48',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
