#!/bin/bash
# ==============================================================================
# 家庭記帳本 - Google Firebase Test Lab 自動化真機爬蟲測試腳本
# 用途：將 EAS Build 產出之 Preview APK 上傳至 Google 雲端真機矩陣進行 Robo 爬蟲
# ==============================================================================

set -e

APK_PATH="${1:-family-ledger-preview.apk}"

if [ ! -f "$APK_PATH" ]; then
  echo "❌ 找不到 APK 檔案: $APK_PATH"
  echo "請先透過 'npm run build:android' 或從 EAS 下載 preview APK 後再執行："
  echo "   ./scripts/run-firebase-test-lab.sh <path_to_apk>"
  exit 1
fi

if ! command -v gcloud &> /dev/null; then
  echo "⚠️ 未檢測到 Google Cloud SDK (gcloud CLI)。"
  echo "如需雲端真機農場自動化測試，請先安裝 gcloud："
  echo "   https://cloud.google.com/sdk/docs/install"
  exit 1
fi

echo "🚀 正在將 $APK_PATH 上傳至 Firebase Test Lab 進行多真機隨機點擊與崩潰檢測..."

gcloud firebase test android run \
  --type robo \
  --app "$APK_PATH" \
  --device model=oriole,version=33,locale=zh_TW,orientation=portrait \
  --device model=husky,version=34,locale=zh_TW,orientation=portrait \
  --timeout 10m \
  --max-steps 100

echo "🎉 Firebase Test Lab 雲端真機測試完成！"

