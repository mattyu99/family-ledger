const { withAndroidManifest, withDangerousMod, withMainActivity } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: 為 Android 原生平台自動注入桌面小工具 (Home Screen AppWidgets)
 * 包含：
 * 1. 2x2 極速發票與記帳小工具 (QuickActionsWidget)
 * 2. 4x2 今日生活待辦與快捷複合看板小工具 (MemoTodayWidget)
 * 3. 離開 App 回桌面 0 秒秒級自動強刷 (MainActivity.onPause Broadcast)
 * 4. 桌面小工具右上角 🔄 即時手動重新整理按鈕 (PendingIntent Broadcast)
 */
function withAndroidWidgets(config) {
  // 1. 修改 AndroidManifest.xml 註冊 Receiver 與自訂廣播 Action
  config = withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }

    const packageName = config.android?.package || 'com.mattyu.familyledger';

    const addActionToReceiver = (receiver, actionName) => {
      if (!receiver['intent-filter']) receiver['intent-filter'] = [];
      let filter = receiver['intent-filter'][0];
      if (!filter) {
        filter = { action: [] };
        receiver['intent-filter'].push(filter);
      }
      if (!filter.action) filter.action = [];
      const exists = filter.action.some((a) => a.$['android:name'] === actionName);
      if (!exists) {
        filter.action.push({ $: { 'android:name': actionName } });
      }
    };

    // 註冊 2x2 快捷按鈕小工具
    const quickActionsReceiverName = `${packageName}.QuickActionsWidgetProvider`;
    let quickReceiver = mainApplication.receiver.find(
      (r) => r.$['android:name'] === quickActionsReceiverName || r.$['android:name'] === '.QuickActionsWidgetProvider'
    );

    if (!quickReceiver) {
      quickReceiver = {
        $: {
          'android:name': '.QuickActionsWidgetProvider',
          'android:exported': 'true',
          'android:label': '甜心記帳 - 極速捷徑',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
              { $: { 'android:name': 'com.mattyu.familyledger.ACTION_UPDATE_WIDGETS' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_quick_actions_info',
            },
          },
        ],
      };
      mainApplication.receiver.push(quickReceiver);
    } else {
      addActionToReceiver(quickReceiver, 'android.appwidget.action.APPWIDGET_UPDATE');
      addActionToReceiver(quickReceiver, 'com.mattyu.familyledger.ACTION_UPDATE_WIDGETS');
    }

    // 註冊 4x2 今日生活待辦小工具
    const memoTodayReceiverName = `${packageName}.MemoTodayWidgetProvider`;
    let memoReceiver = mainApplication.receiver.find(
      (r) => r.$['android:name'] === memoTodayReceiverName || r.$['android:name'] === '.MemoTodayWidgetProvider'
    );

    if (!memoReceiver) {
      memoReceiver = {
        $: {
          'android:name': '.MemoTodayWidgetProvider',
          'android:exported': 'true',
          'android:label': '甜心記帳 - 今日生活待辦',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
              { $: { 'android:name': 'com.mattyu.familyledger.ACTION_UPDATE_WIDGETS' } },
              { $: { 'android:name': 'com.mattyu.familyledger.ACTION_REFRESH_MEMO' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_memo_today_info',
            },
          },
        ],
      };
      mainApplication.receiver.push(memoReceiver);
    } else {
      addActionToReceiver(memoReceiver, 'android.appwidget.action.APPWIDGET_UPDATE');
      addActionToReceiver(memoReceiver, 'com.mattyu.familyledger.ACTION_UPDATE_WIDGETS');
      addActionToReceiver(memoReceiver, 'com.mattyu.familyledger.ACTION_REFRESH_MEMO');
    }

    return config;
  });

  // 2. 修改 MainActivity 注入 onPause 生命週期廣播（離開 App 回到桌面時即刻強制刷新小工具）
  config = withMainActivity(config, async (config) => {
    let contents = config.modResults.contents;
    const language = config.modResults.language;

    if (!contents.includes('ACTION_UPDATE_WIDGETS')) {
      const isKotlin = language === 'kt';
      const onPauseCode = isKotlin
        ? `
    override fun onPause() {
        super.onPause()
        try {
            val intent = android.content.Intent("com.mattyu.familyledger.ACTION_UPDATE_WIDGETS")
            intent.setPackage(packageName)
            sendBroadcast(intent)
        } catch (_: Exception) {}
    }
`
        : `
    @Override
    protected void onPause() {
        super.onPause();
        try {
            android.content.Intent intent = new android.content.Intent("com.mattyu.familyledger.ACTION_UPDATE_WIDGETS");
            intent.setPackage(getPackageName());
            sendBroadcast(intent);
        } catch (Exception ignored) {}
    }
`;
      const lastBraceIndex = contents.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        contents = contents.slice(0, lastBraceIndex) + onPauseCode + '\n' + contents.slice(lastBraceIndex);
      }
      config.modResults.contents = contents;
    }
    return config;
  });

  // 2. 注入 Java 原始碼與 XML 資源檔 (Dangerous Mod)
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidResDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
      const packageName = config.android?.package || 'com.mattyu.familyledger';
      const packagePath = packageName.replace(/\./g, '/');
      const androidJavaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', packagePath);

      // 若尚未 prebuild (android 目錄不存在)，則先行略過，等待 prebuild 或 EAS Build 執行
      if (!fs.existsSync(path.join(projectRoot, 'android'))) {
        return config;
      }

      // 建立所需目錄
      const layoutDir = path.join(androidResDir, 'layout');
      const xmlDir = path.join(androidResDir, 'xml');
      const valuesDir = path.join(androidResDir, 'values');
      const drawableDir = path.join(androidResDir, 'drawable');

      [layoutDir, xmlDir, valuesDir, drawableDir, androidJavaDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // 2.1 注入圓角背景 drawable
      const bgCardXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#1E293B" />
    <corners android:radius="16dp" />
    <stroke android:width="1dp" android:color="#334155" />
</shape>`;
      fs.writeFileSync(path.join(drawableDir, 'widget_card_bg.xml'), bgCardXml, 'utf8');

      const bgBtnXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#0F172A" />
    <corners android:radius="10dp" />
    <stroke android:width="1dp" android:color="#475569" />
</shape>`;
      fs.writeFileSync(path.join(drawableDir, 'widget_btn_bg.xml'), bgBtnXml, 'utf8');

      // 2.2 注入 2x2 快捷按鈕小工具佈局 (widget_quick_actions.xml)
      const quickActionsLayoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_card_bg"
    android:padding="12dp">

    <TextView
        android:id="@+id/quick_widget_badge"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="甜心記帳本 🍟"
        android:textColor="#F8FAFC"
        android:textSize="12sp"
        android:textStyle="bold"
        android:singleLine="true"
        android:ellipsize="end"
        android:layout_marginBottom="8dp" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="horizontal"
        android:layout_marginBottom="6dp">

        <LinearLayout
            android:id="@+id/btn_expense"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:orientation="vertical"
            android:gravity="center"
            android:layout_marginEnd="3dp">
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="💸"
                android:textSize="20sp" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="記支出"
                android:textColor="#F1F5F9"
                android:textSize="11sp"
                android:textStyle="bold" />
        </LinearLayout>

        <LinearLayout
            android:id="@+id/btn_scan"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:orientation="vertical"
            android:gravity="center"
            android:layout_marginStart="3dp">
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="📷"
                android:textSize="20sp" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="掃發票"
                android:textColor="#F1F5F9"
                android:textSize="11sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="horizontal">

        <LinearLayout
            android:id="@+id/btn_income"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:orientation="vertical"
            android:gravity="center"
            android:layout_marginEnd="3dp">
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="💰"
                android:textSize="20sp" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="記收入"
                android:textColor="#F1F5F9"
                android:textSize="11sp"
                android:textStyle="bold" />
        </LinearLayout>

        <LinearLayout
            android:id="@+id/btn_memo"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:orientation="vertical"
            android:gravity="center"
            android:layout_marginStart="3dp">
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="📝"
                android:textSize="20sp" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="隨手記"
                android:textColor="#F1F5F9"
                android:textSize="11sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>
</LinearLayout>`;
      fs.writeFileSync(path.join(layoutDir, 'widget_quick_actions.xml'), quickActionsLayoutXml, 'utf8');

      // 2.3 注入 4x2 今日待辦小工具佈局 (widget_memo_today.xml)
      const memoTodayLayoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_card_bg"
    android:padding="12dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:layout_marginBottom="6dp">
        <TextView
            android:id="@+id/memo_widget_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="📋 今日生活待辦"
            android:textColor="#F8FAFC"
            android:textSize="12sp"
            android:textStyle="bold" />
        <TextView
            android:id="@+id/memo_widget_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="測試記帳本 🍟"
            android:textColor="#94A3B8"
            android:textSize="10sp" />
        <TextView
            android:id="@+id/btn_memo_refresh"
            android:layout_width="26dp"
            android:layout_height="22dp"
            android:gravity="center"
            android:text="🔄"
            android:textSize="11sp"
            android:layout_marginStart="4dp"
            android:padding="2dp" />
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="vertical"
        android:gravity="center_vertical">

        <LinearLayout
            android:id="@+id/memo_row_1"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="4dp">
            <TextView
                android:id="@+id/memo_item_1"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="⭕ 今日尚無待辦事項"
                android:textColor="#E2E8F0"
                android:textSize="11sp"
                android:singleLine="true"
                android:ellipsize="end" />
            <TextView
                android:id="@+id/memo_badge_1"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#F87171"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginStart="6dp" />
        </LinearLayout>

        <LinearLayout
            android:id="@+id/memo_row_2"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="4dp"
            android:visibility="gone">
            <TextView
                android:id="@+id/memo_item_2"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text=""
                android:textColor="#CBD5E1"
                android:textSize="11sp"
                android:singleLine="true"
                android:ellipsize="end" />
            <TextView
                android:id="@+id/memo_badge_2"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#F87171"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginStart="6dp" />
        </LinearLayout>

        <LinearLayout
            android:id="@+id/memo_row_3"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:visibility="gone">
            <TextView
                android:id="@+id/memo_item_3"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text=""
                android:textColor="#CBD5E1"
                android:textSize="11sp"
                android:singleLine="true"
                android:ellipsize="end" />
            <TextView
                android:id="@+id/memo_badge_3"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#F87171"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginStart="6dp" />
        </LinearLayout>
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:layout_marginTop="6dp">

        <TextView
            android:id="@+id/btn_memo_add_expense"
            android:layout_width="0dp"
            android:layout_height="28dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:gravity="center"
            android:text="💸 記支出"
            android:textColor="#F8FAFC"
            android:textSize="11sp"
            android:layout_marginEnd="4dp" />

        <TextView
            android:id="@+id/btn_memo_scan"
            android:layout_width="0dp"
            android:layout_height="28dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:gravity="center"
            android:text="📷 掃發票"
            android:textColor="#F8FAFC"
            android:textSize="11sp"
            android:layout_marginEnd="4dp" />

        <TextView
            android:id="@+id/btn_memo_view_all"
            android:layout_width="0dp"
            android:layout_height="28dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:gravity="center"
            android:text="📝 加待辦"
            android:textColor="#F8FAFC"
            android:textSize="11sp" />
    </LinearLayout>
</LinearLayout>`;
      fs.writeFileSync(path.join(layoutDir, 'widget_memo_today.xml'), memoTodayLayoutXml, 'utf8');

      // 2.3.1 注入 4x2 今日待辦小工具預覽版面 (widget_memo_today_preview.xml，供 Android 12+ 啟動器 Widget Picker 展示)
      const memoTodayPreviewLayoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_card_bg"
    android:padding="12dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:layout_marginBottom="6dp">
        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="📋 今日生活待辦"
            android:textColor="#F8FAFC"
            android:textSize="12sp"
            android:textStyle="bold" />
        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="甜心記帳本 🍟"
            android:textColor="#94A3B8"
            android:textSize="10sp" />
        <TextView
            android:layout_width="26dp"
            android:layout_height="22dp"
            android:gravity="center"
            android:text="🔄"
            android:textSize="11sp"
            android:layout_marginStart="4dp"
            android:padding="2dp" />
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="vertical"
        android:gravity="center_vertical">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="4dp">
            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="⚠️ 【採買清單】買小夜燈"
                android:textColor="#E2E8F0"
                android:textSize="11sp"
                android:singleLine="true"
                android:ellipsize="end" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="已逾期"
                android:textColor="#F87171"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginStart="6dp" />
        </LinearLayout>

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="4dp">
            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="⚠️ 洋領鮮奶"
                android:textColor="#E2E8F0"
                android:textSize="11sp"
                android:singleLine="true"
                android:ellipsize="end" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="已逾期"
                android:textColor="#F87171"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginStart="6dp" />
        </LinearLayout>

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">
            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="⭕ 初一、十五吃素"
                android:textColor="#E2E8F0"
                android:textSize="11sp"
                android:singleLine="true"
                android:ellipsize="end" />
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="11-09"
                android:textColor="#94A3B8"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginStart="6dp" />
        </LinearLayout>
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:layout_marginTop="6dp">

        <TextView
            android:layout_width="0dp"
            android:layout_height="28dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:gravity="center"
            android:text="💸 記支出"
            android:textColor="#F8FAFC"
            android:textSize="11sp"
            android:layout_marginEnd="4dp" />

        <TextView
            android:layout_width="0dp"
            android:layout_height="28dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:gravity="center"
            android:text="📷 掃發票"
            android:textColor="#F8FAFC"
            android:textSize="11sp"
            android:layout_marginEnd="4dp" />

        <TextView
            android:layout_width="0dp"
            android:layout_height="28dp"
            android:layout_weight="1"
            android:background="@drawable/widget_btn_bg"
            android:gravity="center"
            android:text="📝 加待辦"
            android:textColor="#F8FAFC"
            android:textSize="11sp" />
    </LinearLayout>
</LinearLayout>`;
      fs.writeFileSync(path.join(layoutDir, 'widget_memo_today_preview.xml'), memoTodayPreviewLayoutXml, 'utf8');

      // 2.4 注入 Widget Info 元資料 XML (支援 Android 12+ previewLayout 原生向量預覽與 targetCell 標準格數鎖定)
      const quickActionsInfoXml = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:minWidth="110dp"
    android:minHeight="110dp"
    android:minResizeWidth="110dp"
    android:minResizeHeight="110dp"
    android:maxResizeWidth="320dp"
    android:maxResizeHeight="320dp"
    android:updatePeriodMillis="86400000"
    android:initialLayout="@layout/widget_quick_actions"
    android:previewLayout="@layout/widget_quick_actions"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_quick_actions_desc" />`;
      fs.writeFileSync(path.join(xmlDir, 'widget_quick_actions_info.xml'), quickActionsInfoXml, 'utf8');

      const memoTodayInfoXml = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:targetCellWidth="3"
    android:targetCellHeight="2"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="110dp"
    android:maxResizeWidth="500dp"
    android:maxResizeHeight="400dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_memo_today"
    android:previewLayout="@layout/widget_memo_today_preview"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_memo_today_desc" />`;
      fs.writeFileSync(path.join(xmlDir, 'widget_memo_today_info.xml'), memoTodayInfoXml, 'utf8');

      // 2.5 注入 strings.xml 描述文字
      const stringsPath = path.join(valuesDir, 'strings.xml');
      let stringsXml = fs.existsSync(stringsPath)
        ? fs.readFileSync(stringsPath, 'utf8')
        : '<resources></resources>';

      if (!stringsXml.includes('widget_quick_actions_desc')) {
        stringsXml = stringsXml.replace(
          '</resources>',
          '    <string name="widget_quick_actions_desc">甜心記帳極速捷徑：桌面 1 鍵啟動記支出、掃發票、記收入與隨手筆記。</string>\n    <string name="widget_memo_today_desc">甜心記帳生活備忘：桌面即時檢視今日與逾期待辦，隨時掌握家庭任務。</string>\n</resources>'
        );
        fs.writeFileSync(stringsPath, stringsXml, 'utf8');
      }

      // 2.6 注入 Java 類別 QuickActionsWidgetProvider.java
      const quickActionsJava = `package ${packageName};

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.io.File;

public class QuickActionsWidgetProvider extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent != null ? intent.getAction() : null;
        if ("com.mattyu.familyledger.ACTION_UPDATE_WIDGETS".equals(action)) {
            try {
                AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
                android.content.ComponentName thisAppWidget = new android.content.ComponentName(context, QuickActionsWidgetProvider.class);
                int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisAppWidget);
                if (appWidgetIds != null && appWidgetIds.length > 0) {
                    for (int appWidgetId : appWidgetIds) {
                        updateAppWidget(context, appWidgetManager, appWidgetId);
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_actions);

        // 嘗試從本地快照讀取當前公帳名稱
        String ledgerName = "家庭記帳本";
        try {
            File dbFile = context.getDatabasePath("RKStorage");
            if (dbFile != null && dbFile.exists()) {
                SQLiteDatabase db = SQLiteDatabase.openDatabase(dbFile.getPath(), null, SQLiteDatabase.OPEN_READONLY);
                Cursor cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", new String[]{"@family_ledger_widget_snapshot"});
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        String jsonString = cursor.getString(0);
                        JSONObject json = new JSONObject(jsonString);
                        if (json.has("ledgerName")) {
                            ledgerName = json.getString("ledgerName");
                        }
                    }
                    cursor.close();
                }
                db.close();
            }
        } catch (Exception ignored) {
        }

        views.setTextViewText(R.id.quick_widget_badge, ledgerName);

        // 綁定各快捷按鈕的 Deep Link
        setupClick(context, views, R.id.btn_expense, "familyledger://quick-action?mode=expense", 101);
        setupClick(context, views, R.id.btn_scan, "familyledger://quick-action?mode=scan", 102);
        setupClick(context, views, R.id.btn_income, "familyledger://quick-action?mode=income", 103);
        setupClick(context, views, R.id.btn_memo, "familyledger://quick-action?mode=memo", 104);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static void setupClick(Context context, RemoteViews views, int viewId, String uriString, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uriString));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(viewId, pendingIntent);
    }
}
`;
      fs.writeFileSync(path.join(androidJavaDir, 'QuickActionsWidgetProvider.java'), quickActionsJava, 'utf8');

      // 2.7 注入 Java 類別 MemoTodayWidgetProvider.java
      const memoTodayJava = `package ${packageName};

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;

public class MemoTodayWidgetProvider extends AppWidgetProvider {

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent != null ? intent.getAction() : null;
        if ("com.mattyu.familyledger.ACTION_UPDATE_WIDGETS".equals(action) ||
            "com.mattyu.familyledger.ACTION_REFRESH_MEMO".equals(action)) {
            try {
                AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
                android.content.ComponentName thisAppWidget = new android.content.ComponentName(context, MemoTodayWidgetProvider.class);
                int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisAppWidget);
                if (appWidgetIds != null && appWidgetIds.length > 0) {
                    for (int appWidgetId : appWidgetIds) {
                        updateAppWidget(context, appWidgetManager, appWidgetId);
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_memo_today);

        // 嘗試讀取本地快照
        String ledgerName = "家庭記帳本";
        String title1 = null, badge1 = null; int color1 = 0xFF94A3B8;
        String title2 = null, badge2 = null; int color2 = 0xFF94A3B8;
        String title3 = null, badge3 = null; int color3 = 0xFF94A3B8;

        try {
            File dbFile = context.getDatabasePath("RKStorage");
            if (dbFile != null && dbFile.exists()) {
                SQLiteDatabase db = SQLiteDatabase.openDatabase(dbFile.getPath(), null, SQLiteDatabase.OPEN_READONLY);
                Cursor cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", new String[]{"@family_ledger_widget_snapshot"});
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        String jsonString = cursor.getString(0);
                        JSONObject json = new JSONObject(jsonString);
                        if (json.has("ledgerName")) {
                            ledgerName = json.getString("ledgerName");
                        }
                        if (json.has("pendingMemos")) {
                            JSONArray memos = json.getJSONArray("pendingMemos");
                            if (memos.length() > 0) {
                                JSONObject m = memos.getJSONObject(0);
                                boolean isOverdue = m.optBoolean("isOverdue", false);
                                String cleanTitle = m.has("rawTitle") ? m.getString("rawTitle") : m.optString("title", "");
                                title1 = (isOverdue ? "⚠️ " : "⭕ ") + cleanTitle;
                                String date = m.optString("reminderDate", "");
                                String assignee = m.optString("assigneeName", "");
                                if (isOverdue) {
                                    badge1 = "已逾期";
                                    color1 = 0xFFF87171;
                                } else if (!date.isEmpty()) {
                                    badge1 = date.length() >= 5 ? date.substring(date.length() - 5) : date;
                                    if (!assignee.isEmpty()) badge1 += " · " + assignee;
                                    color1 = 0xFF94A3B8;
                                } else {
                                    badge1 = "日常";
                                    if (!assignee.isEmpty()) badge1 += " · " + assignee;
                                    color1 = 0xFF94A3B8;
                                }
                            }
                            if (memos.length() > 1) {
                                JSONObject m = memos.getJSONObject(1);
                                boolean isOverdue = m.optBoolean("isOverdue", false);
                                String cleanTitle = m.has("rawTitle") ? m.getString("rawTitle") : m.optString("title", "");
                                title2 = (isOverdue ? "⚠️ " : "⭕ ") + cleanTitle;
                                String date = m.optString("reminderDate", "");
                                String assignee = m.optString("assigneeName", "");
                                if (isOverdue) {
                                    badge2 = "已逾期";
                                    color2 = 0xFFF87171;
                                } else if (!date.isEmpty()) {
                                    badge2 = date.length() >= 5 ? date.substring(date.length() - 5) : date;
                                    if (!assignee.isEmpty()) badge2 += " · " + assignee;
                                    color2 = 0xFF94A3B8;
                                } else {
                                    badge2 = "日常";
                                    if (!assignee.isEmpty()) badge2 += " · " + assignee;
                                    color2 = 0xFF94A3B8;
                                }
                            }
                            if (memos.length() > 2) {
                                JSONObject m = memos.getJSONObject(2);
                                boolean isOverdue = m.optBoolean("isOverdue", false);
                                String cleanTitle = m.has("rawTitle") ? m.getString("rawTitle") : m.optString("title", "");
                                title3 = (isOverdue ? "⚠️ " : "⭕ ") + cleanTitle;
                                String date = m.optString("reminderDate", "");
                                String assignee = m.optString("assigneeName", "");
                                if (isOverdue) {
                                    badge3 = "已逾期";
                                    color3 = 0xFFF87171;
                                } else if (!date.isEmpty()) {
                                    badge3 = date.length() >= 5 ? date.substring(date.length() - 5) : date;
                                    if (!assignee.isEmpty()) badge3 += " · " + assignee;
                                    color3 = 0xFF94A3B8;
                                } else {
                                    badge3 = "日常";
                                    if (!assignee.isEmpty()) badge3 += " · " + assignee;
                                    color3 = 0xFF94A3B8;
                                }
                            }
                        }
                    }
                    cursor.close();
                }
                db.close();
            }
        } catch (Exception ignored) {
        }

        views.setTextViewText(R.id.memo_widget_badge, ledgerName);

        if (title1 != null) {
            views.setTextViewText(R.id.memo_item_1, title1);
            views.setTextViewText(R.id.memo_badge_1, badge1 != null ? badge1 : "");
            views.setTextColor(R.id.memo_badge_1, color1);
            views.setViewVisibility(R.id.memo_badge_1, badge1 != null ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.memo_row_1, View.VISIBLE);
        } else {
            views.setTextViewText(R.id.memo_item_1, "🎉 今日尚無未辦妥之備忘事項");
            views.setViewVisibility(R.id.memo_badge_1, View.GONE);
            views.setViewVisibility(R.id.memo_row_1, View.VISIBLE);
        }

        if (title2 != null) {
            views.setTextViewText(R.id.memo_item_2, title2);
            views.setTextViewText(R.id.memo_badge_2, badge2 != null ? badge2 : "");
            views.setTextColor(R.id.memo_badge_2, color2);
            views.setViewVisibility(R.id.memo_badge_2, badge2 != null ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.memo_row_2, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.memo_row_2, View.GONE);
        }

        if (title3 != null) {
            views.setTextViewText(R.id.memo_item_3, title3);
            views.setTextViewText(R.id.memo_badge_3, badge3 != null ? badge3 : "");
            views.setTextColor(R.id.memo_badge_3, color3);
            views.setViewVisibility(R.id.memo_badge_3, badge3 != null ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.memo_row_3, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.memo_row_3, View.GONE);
        }

        // 綁定右上角 🔄 手動刷新按鈕 (發送廣播直達 Provider 本身，免開 App 即刻重繪)
        Intent refreshIntent = new Intent(context, MemoTodayWidgetProvider.class);
        refreshIntent.setAction("com.mattyu.familyledger.ACTION_REFRESH_MEMO");
        PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(
            context,
            301,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.btn_memo_refresh, refreshPendingIntent);

        // 綁定按鈕動作
        setupClick(context, views, R.id.btn_memo_add_expense, "familyledger://quick-action?mode=expense", 201);
        setupClick(context, views, R.id.btn_memo_scan, "familyledger://quick-action?mode=scan", 202);
        setupClick(context, views, R.id.btn_memo_view_all, "familyledger://quick-action?mode=memo", 203);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static void setupClick(Context context, RemoteViews views, int viewId, String uriString, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uriString));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(viewId, pendingIntent);
    }
}
`;
      fs.writeFileSync(path.join(androidJavaDir, 'MemoTodayWidgetProvider.java'), memoTodayJava, 'utf8');

      return config;
    },
  ]);

  return config;
}

module.exports = withAndroidWidgets;

