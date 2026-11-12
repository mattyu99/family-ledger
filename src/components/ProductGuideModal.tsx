import React, { useMemo } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import {
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { Text } from './common/Text';


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
    title: '3. 待辦採買與全模式連動入帳',
    tag: '全模式連動',
    tagBg: '#DCFCE7',
    tagColor: '#166534',
    steps: [
      '在待辦清單中採買或差事辦妥後，直接點擊該待辦項目的勾選圓圈。',
      '彈出辦妥確認視窗，可直接選擇「💰 連動記帳入帳」，支援支出、收入、轉帳發零用錢或接力待辦。',
      '自動帶入品項名稱與預填內容，儲存後雙向智慧綁定，卡片自適應彩色膠囊跳轉！',
    ],
  },
  {
    icon: '🚌',
    title: '4. 悠遊卡儲值加值與累加鍵',
    tag: '動態出資',
    tagBg: '#FEF3C7',
    tagColor: '#92400E',
    steps: [
      '在首頁帳戶專區點開悠遊卡，點「＋加值」；超商現金加值或悠遊付 App 靠卡加值皆可如實記錄。',
      '支援 +$100 ~ +$1000 快捷金額多重累加計算與一鍵「清除」歸零鍵。',
      '自由選擇加值出資方式（現金、悠遊付、街口、銀行轉帳或信用卡），自動扣抵出資並增加卡片可用餘額。',
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
    title: '7. 水電瓦斯固定帳單與 7 天滾動預告',
    tag: '滾動預警',
    tagBg: '#CCFBF1',
    tagColor: '#115E59',
    steps: [
      '進入「帳單支付」➔「⚙️ 管理規則」，建立單月/雙月繳的水電、瓦斯、電信、房租或訂閱費。',
      '系統首創滾動未來 7 天時間軸，唯有進入扣款前 7 天或逾期才會適時預警，平日絕無虛驚紅點。',
      '收到繳費單時，點選待繳清單中的「一鍵確認入帳」即刻轉為公帳支出並自動推進下一期。',
    ],
  },
  {
    icon: '🛡️',
    title: '8. 6 大全要素封存備份與安全 PIN 碼',
    tag: '資料自主',
    tagBg: '#FFE4E6',
    tagColor: '#9F1239',
    steps: [
      '「家庭設定」提供明細、成員、分類、卡片、週期與付款方式 6 大要素全量封存匯出。',
      '支援安全合併還原（依 ID 自動去重，絕不覆蓋最新帳目）與全覆蓋還原。',
      '具備 4 位數安全 PIN 碼保護機制（預設 8888），防止誤刪重要家庭名冊或敏感帳本。',
    ],
  },
  {
    icon: '🧾',
    title: '9. 發票雙碼掃描、防重複與對獎中心',
    tag: '智慧對獎',
    tagBg: '#FEF3C7',
    tagColor: '#B45309',
    steps: [
      '記帳時點擊「📷 掃描發票」，對準電子發票左右雙 QR Code，秒速帶入號碼、金額、店家與長商品明細。',
      '全帳本重複發票即時防呆警告，杜絕夫妻家人重複記同張發票與重複兌獎。',
      '開獎日 100% 全自動同步財政部官方中獎號碼，自動比對全量發票並標註彩色中獎徽章。',
      '「發票對獎中心」支援「全部 / 我的」視角秒切、期別拖曳回溯與「一鍵兌領入帳」！',
    ],
  },
  {
    icon: '🎯',
    title: '10. 雙視角預算控管與個人額度',
    tag: '預算控管',
    tagBg: '#E0E7FF',
    tagColor: '#4338CA',
    steps: [
      '管理員可於預算設定中配置家庭月度公帳總預算、80% 警戒超支門檻與分類預算，彩色動態進度條即時警示。',
      '每位家庭成員可在自己手機上自主設定「個人開銷額度」，互不干涉個人隱私。',
      '預算資料全面納入 WebSocket 即時同步，一人調整額度，全家全體裝置秒級連動更新。',
    ],
  },
  {
    icon: '💎',
    title: '11. 財務淨值看板與小眼睛隱私遮罩',
    tag: '淨值看板',
    tagBg: '#ECFDF5',
    tagColor: '#047857',
    steps: [
      '首頁資產看板全要素整合銀行、現金、悠遊卡與信用卡待繳負債，動態試算即時財務淨值。',
      '支援「個人財務淨值」與「家庭財務淨值」切換，預設僅展示本機個人資產，切換全部成員統整全家。',
      '看板金額預設啟用小眼睛星號遮罩 (NT$ ••••••)，在公共場合檢視無拘無束。',
    ],
  },
  {
    icon: '🔐',
    title: '12. Face ID 與指紋辨識隱私防護鎖',
    tag: '生物辨識',
    tagBg: '#FDF2F8',
    tagColor: '#BE185D',
    steps: [
      '深度整合 iOS Face ID / Touch ID 與 Android 指紋辨識，提供原生級身分安全保護。',
      '點擊資產看板小眼睛，輕觸指紋或臉部辨識，即刻安全解除遮罩並淡入真實金額。',
      '支援 App 冷啟動與喚醒全域安全鎖，防止手機借予他人時家庭財務曝光。',
    ],
  },
  {
    icon: '⚡',
    title: '13. 手機桌面 Quick Actions 快捷直達',
    tag: '桌面捷徑',
    tagBg: '#FFFBEB',
    tagColor: '#B45309',
    steps: [
      '手機桌面長按甜心記帳本 App 圖示，直接彈出「記支出」、「記收入」、「掃描發票」、「隨手記事」4 大捷徑。',
      '點擊「掃描發票」一秒直通相機，對準發票直接掃描，記帳免等待。',
      '支援 familyledger://quick-action 自訂 URL Scheme，可串接 iOS 捷徑與 Siri 語音呼叫。',
    ],
  },
  {
    icon: '🔔',
    title: '14. 記事提醒與信用卡出帳繳款推播',
    tag: '智慧推播',
    tagBg: '#F5F3FF',
    tagColor: '#6D28D9',
    steps: [
      '生活記事設定提醒日期，於當天上午 09:00 由手機本機推送提醒通知，辦妥自動註銷排程。',
      '信用卡出帳日隔天與繳款日前 3 天上午 09:30 自動推播提醒，精準提示待繳金額防忘繳。',
      '每日 21:30 LINE 收支日報同步附帶待辦提醒與帳單標籤，全家群組溫馨提醒。',
    ],
  },
  {
    icon: '📱',
    title: '15. Android 桌面 3D 快捷與 4 則待辦小工具',
    tag: '桌面小工具',
    tagBg: '#E0F2FE',
    tagColor: '#0369A1',
    steps: [
      '支援 2x2 快捷記帳大圖示小工具（記支出、掃發票、記收入、隨手記），3D 立體黏土質感滿版無留白。',
      '支援 4x2 生活手帳待辦小工具，桌面常駐 4 則最急生活備忘，點選任一則一秒直達 App 辦妥確認彈窗。',
      '小工具右上角附帶專屬「🔄」手動刷新鈕，且 App 內任何更新返回桌面皆會秒級自動重繪。',
    ],
  },
  {
    icon: '🔤',
    title: '16. 全域字型自訂與長輩大字模式',
    tag: '長輩模式',
    tagBg: '#F3E8FF',
    tagColor: '#6B21A8',
    steps: [
      '前往「家庭設定」➔「字型大小調整」，提供精簡、標準、舒適放大與特大長輩模式四檔字級切換。',
      '支援「跟隨手機系統字體設定」，全介面具備智慧防爆字排版微調，長輩閱讀清晰舒適。',
      '海量歷史帳目支援游標式極速載入，滑動時浮現位置小藥丸，點開返回維持 6 秒高光聚焦藍框！',
    ],
  },
  {
    icon: '💡',
    title: '17. 智慧日期感知、彩色倒數與慢箋接力提醒',
    tag: '智慧接力',
    tagBg: '#FEF3C7',
    tagColor: '#B45309',
    steps: [
      '打字自動感知：輸入民國年、月日或明天後天，下方自動浮現金黃色微調卡片，預選提醒日並支援提前提醒。',
      '子任務動態倒數：待辦清單每行依到期日標註彩色膠囊（逾期紅、今明黃、未來藍、辦妥灰），首頁與總覽同步。',
      '慢箋多期接力自癒：記事自動對齊未完成的最早子任務（如第2次慢箋），打勾後自動推進至下一期或最終看診日！',
    ],
  },
];

export const ProductGuideModal: React.FC<ProductGuideModalProps> = ({ visible, onClose }) => {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => getStyles(isDark, colors), [isDark, colors]);

  const handleOpenManual = async () => {
    const url = 'https://mattyu99.github.io/family-ledger/manual.html';
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
                甜心記帳本 • 16 大家庭生活與理財操作速查
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
                秉持「公款共濟、零用透明、一人一機、無感對帳」四大核心哲學。支援多人即時同步、待辦採買連動入帳、悠遊卡儲值加值與信用卡對帳，讓日常記帳如聊天般溫暖自然！
              </Text>
            </View>

            {/* 16 大常用操作指引 */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>📌 16 大家庭日常操作速查</Text>
              <Text style={styles.sectionDesc}>點選下方項目快速熟悉各項貼心功能</Text>
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

            {/* 官方完整手冊推廣卡片 */}
            <TouchableOpacity
              style={styles.brochureCard}
              onPress={handleOpenManual}
              activeOpacity={0.8}
            >
              <View style={styles.brochureLeft}>
                <View style={styles.brochureIconWrap}>
                  <Text style={styles.brochureIcon}>📖</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.brochureTitle}>查閱官方完整使用者手冊 (User Manual)</Text>
                  <Text style={styles.brochureSubtitle}>
                    包含 10 大核心章節、情境操作流程圖、桌面小工具與新手 FAQ（線上純淨版）
                  </Text>
                </View>
              </View>
              <View style={styles.brochureActionBadge}>
                <Text style={styles.brochureActionText}>線上閱讀 ›</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* 底部按鈕列 */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.brochureFooterBtn}
              onPress={handleOpenManual}
              activeOpacity={0.8}
            >
              <Text style={styles.brochureFooterBtnText}>📖 完整使用者手冊</Text>
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

const getStyles = (isDark: boolean, colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: colors.background.modal,
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
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? colors.border.default : 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.border.default : '#F1F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 3,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? colors.background.cardSubtle : '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.text.muted,
    fontWeight: '700',
  },
  scrollArea: {
    marginTop: 12,
    marginBottom: 12,
  },
  introBanner: {
    backgroundColor: isDark ? 'rgba(225, 29, 72, 0.15)' : '#FFF1F2',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(225, 29, 72, 0.35)' : '#FECDD3',
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
    color: isDark ? '#FB7185' : '#BE123C',
    fontWeight: '600',
  },
  introTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: isDark ? '#FDA4AF' : '#881337',
    marginTop: 4,
    marginBottom: 6,
    lineHeight: 19,
  },
  introDesc: {
    fontSize: 12,
    color: isDark ? '#FECDD3' : '#9F1239',
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
    color: colors.text.primary,
  },
  sectionDesc: {
    fontSize: 11,
    color: colors.text.muted,
  },
  guideCard: {
    backgroundColor: isDark ? colors.background.cardSubtle : '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: isDark ? colors.border.default : '#E2E8F0',
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
    color: colors.text.primary,
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
    color: isDark ? '#FB7185' : '#E11D48',
    lineHeight: 17,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 17,
  },
  brochureCard: {
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(37, 99, 235, 0.35)' : '#BFDBFE',
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
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.25)' : '#DBEAFE',
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
    color: isDark ? '#93C5FD' : '#1E40AF',
  },
  brochureSubtitle: {
    fontSize: 11,
    color: isDark ? '#60A5FA' : '#3B82F6',
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
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(37, 99, 235, 0.4)' : '#BFDBFE',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brochureFooterBtnText: {
    color: isDark ? '#60A5FA' : '#2563EB',
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
