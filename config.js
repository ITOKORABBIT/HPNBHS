// ============================================================
// HPNBHS 系統設定
// 複製給新客戶時只需修改這個檔案
// ============================================================

const CONFIG = {
  // 里別資訊
  VILLAGE_NAME: '北屯區和平里',
  SYSTEM_NAME: '里民通報系統',

  // Make Webhook URLs
  REPORT_WEBHOOK_URL: 'https://hook.us2.make.com/oc4n647j4vih73h7trgeh8ebf2mkfjje',
  REPLY_WEBHOOK_URL:  'https://hook.us2.make.com/o49yw5kbwp8p9111abdy5acexftr8ql6',

  // Google Apps Script（公開照片上傳，里民通報用）
  UPLOAD_URL: 'https://script.google.com/macros/s/AKfycbx-cXnsVlLf1uHObO4V8tym6hK68O5MRriEY-aF_19HRN346IxDZ9vI2tL_qxwgh5Kl0Q/exec',

  // Google Apps Script（管理後台，需登入）
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzrkTqHoddzXyCj5dlRlmZL2eAFrr8zeqJ9IiVIJnc59g7ibZjZ8wAxxGdrJnyQkaatTw/exec',

  // GitHub Pages 基底網址
  BASE_URL: 'https://itokorabbit.github.io/HPNBHS',

  // Google OAuth Client ID（用於里長回覆頁自動帶入承辦人姓名）
  // 設定方式: Google Cloud Console → 憑證 → 建立 OAuth 2.0 用戶端 ID
  //          已授權的 JavaScript 來源加入 https://itokorabbit.github.io
  GOOGLE_CLIENT_ID: '',
};
