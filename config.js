// ============================================================
// HPNBHS 系統設定
// 複製給新客戶時只需修改這個檔案
// ⚠️ 此 repo 必須設為 Private，以保護以下金鑰
// ============================================================

const CONFIG = {
  // 里別資訊
  VILLAGE_NAME: '北屯區和平里',
  SYSTEM_NAME: '里民通報系統',

  // Make Webhook URLs
  REPORT_WEBHOOK_URL: 'https://hook.us2.make.com/wa9jtsqq171jf7yoycpb7upnpii30m5g', // Scenario A 案件通報推播
  REPLY_WEBHOOK_URL:  '',  // Scenario B 官方LINE回覆推播（填入 Make Scenario B webhook URL）
  STORE_WEBHOOK_URL:  '',  // Scenario C 特約商店申請推播（填入 Make Scenario C webhook URL）

  // Google Apps Script（統一 API 端點，所有資料讀寫都經過此處驗證）
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzrkTqHoddzXyCj5dlRlmZL2eAFrr8zeqJ9IiVIJnc59g7ibZjZ8wAxxGdrJnyQkaatTw/exec',

  // GitHub Pages 基底網址
  BASE_URL: 'https://itokorabbit.github.io/HPNBHS',

  // Google OAuth Client ID（用於 Google 登入）
  GOOGLE_CLIENT_ID: '998009736888-v0hng93jchshicessbc6pjf4e6eiolju.apps.googleusercontent.com',

  // API Key（公開端點基本保護，搭配 Private repo 使用）
  API_KEY: 'hpnbhs_sk_Qm7Kp2Xa9Wv8Ld5Rn6Yf4Jb',
};
