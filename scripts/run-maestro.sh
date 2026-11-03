#!/bin/bash
# ==============================================================================
# 家庭記帳本 - Maestro 原生移動端自動化測試執行腳本
# 用途：在已連接的 Android 手機或模擬器上，自動執行宣告式 E2E 流程
# ==============================================================================

set -e

echo "📱 正在檢測 Maestro 與 Android ADB 連線狀態..."

if ! command -v maestro &> /dev/null; then
  echo "⚠️ 未檢測到 maestro CLI。如需安裝，請執行："
  echo "   curl -FsSL 'https://get.maestro.mobile.dev' | bash"
  echo "   export PATH=\"\$PATH:\$HOME/.maestro/bin\""
  exit 1
fi

if ! command -v adb &> /dev/null; then
  echo "⚠️ 未檢測到 adb 工具，請確認 Android SDK Platform-tools 已安裝且加入 PATH。"
  exit 1
fi

DEVICES=$(adb devices | grep -v "List" | grep "device$" || true)
if [ -z "$DEVICES" ]; then
  echo "⚠️ 尚未偵測到任何連線的手機或 Android 模擬器。"
  echo "請先透過 USB 啟用偵錯連線，或啟動 Android Studio 模擬器。"
  exit 1
fi

echo "✅ 偵測到連線裝置："
echo "$DEVICES"

echo ""
echo "🚀 開始執行 Maestro 自動化 E2E 測試流程..."
echo "----------------------------------------------------"

maestro test e2e/mobile/app_launch_and_tabs.yaml
maestro test e2e/mobile/quick_action_expense.yaml
maestro test e2e/mobile/quick_action_memo.yaml
maestro test e2e/mobile/daily_accounting_flow.yaml

echo "----------------------------------------------------"
echo "🎉 所有 Maestro 原生移動端測試流程全數通過！"
