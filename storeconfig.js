// ============================================================
// NeighborhoodSystem 特約商店系統設定
// 複製給新客戶時只需修改這個檔案
// ⚠️ 此 repo 必須設為 Private，以保護以下金鑰
// ============================================================

const CONFIG = {
  // 里別資訊
  VILLAGE_NAME: '北屯區和平里',
  SYSTEM_NAME: '特約商店系統',

  // Make Webhook URL（已改為純 LINE 通知用，資料寫入由 Apps Script 直接處理）
  // STORE_WEBHOOK_URL: 'https://hook.us2.make.com/h9dkeqo7b1brd8fmqgjrcq73n1yqiu7c',

  // Google Apps Script（照片上傳，公開，無需登入）
  UPLOAD_URL: 'https://script.google.com/macros/s/AKfycbx-cXnsVlLf1uHObO4V8tym6hK68O5MRriEY-aF_19HRN346IxDZ9vI2tL_qxwgh5Kl0Q/exec',

  // Google Apps Script（統一 API 端點，所有資料讀寫都經過此處驗證）
  // ⚠️ 部署後填入
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzrkTqHoddzXyCj5dlRlmZL2eAFrr8zeqJ9IiVIJnc59g7ibZjZ8wAxxGdrJnyQkaatTw/exec',

  // GitHub Pages 基底網址
  BASE_URL: 'https://itokorabbit.github.io/HPNBHS',

  // Google OAuth Client ID（用於管理員 Google 登入）
  // ⚠️ 填入與 HPNBHS 相同的 Client ID 或另建新的
  GOOGLE_CLIENT_ID: '998009736888-v0hng93jchshicessbc6pjf4e6eiolju.apps.googleusercontent.com',

  // API Key（公開端點基本保護）
  API_KEY: 'hpnbhs_sk_Qm7Kp2Xa9Wv8Ld5Rn6Yf4Jb',
};
