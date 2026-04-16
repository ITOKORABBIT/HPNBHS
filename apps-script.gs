// ============================================================
// HPNBHS Apps Script — 安全版本
// 所有資料讀寫均經過 server-side 身份驗證
// 部署方式：Google Apps Script → 部署 → 管理部署 → 更新至最新版本
//           部署類型：Web App，執行身分：我，存取：所有人
// ============================================================

var SHEET_ID    = '1SDwkiqi2EJoW0ICZLeBVRC7IM5ridvHgxS-tFoh_BWE';
var SHEET_CASES = '案件清單';
var SHEET_ADMINS = '管理員名單';

// Google OAuth Client ID（驗證 ID token 用）
var GOOGLE_CLIENT_ID = '998009736888-v0hng93jchshicessbc6pjf4e6eiolju.apps.googleusercontent.com';

// API Key（公開端點基本保護，例如里民通報照片上傳）
var API_KEY = 'hpnbhs_sk_Qm7Kp2Xa9Wv8Ld5Rn6Yf4Jb';

// Session TTL: 6 小時（CacheService 上限）
var SESSION_TTL = 21600;

// ── 路由 ──
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'login':             return handleLogin(data);
      case 'getCases':          return requireAdmin(data, handleGetCases);
      case 'getCase':           return requireAdmin(data, handleGetCase);
      case 'updateReply':       return requireAdmin(data, handleUpdateReply);
      case 'uploadAdminPhoto':  return requireAdmin(data, handleUploadPhoto);
      case 'uploadPublicPhoto': return handlePublicUpload(data);
      default:
        return jsonOut({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  return jsonOut({ success: false, error: 'POST only' });
}

// ══════════════════════════════════════════════
// AUTH — 登入 & Session 管理
// ══════════════════════════════════════════════

function handleLogin(data) {
  var idToken = data.id_token;
  if (!idToken) return jsonOut({ success: false, error: 'Missing id_token' });

  // 1. 向 Google 驗證 ID token
  var payload = verifyGoogleToken(idToken);
  if (!payload) return jsonOut({ success: false, error: 'Invalid token' });

  var email = (payload.email || '').toLowerCase().trim();

  // 2. 比對管理員名單
  var admin = checkAdmin(email);
  if (!admin.valid) return jsonOut({ success: false, error: 'Not authorized' });

  // 3. 產生 session token，存入 CacheService
  var sessionToken = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sess_' + sessionToken,
    JSON.stringify({ email: email, name: admin.name }),
    SESSION_TTL
  );

  return jsonOut({
    success: true,
    sessionToken: sessionToken,
    name: admin.name,
    email: email
  });
}

function verifyGoogleToken(idToken) {
  try {
    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;

    var p = JSON.parse(res.getContentText());
    if (p.aud !== GOOGLE_CLIENT_ID) return null;
    if (p.email_verified === 'false') return null;
    return p;
  } catch (e) {
    return null;
  }
}

function checkAdmin(email) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ADMINS);
  if (!sheet) return { valid: false };
  var data = sheet.getDataRange().getValues();
  // 欄位：username(0) password(1) display_name(2) role(3) active(4) email(5)
  for (var i = 1; i < data.length; i++) {
    var rowEmail = String(data[i][5] || '').toLowerCase().trim();
    var active   = String(data[i][4] || '').toUpperCase();
    if (rowEmail === email && active === 'TRUE') {
      return { valid: true, name: String(data[i][2] || '') };
    }
  }
  return { valid: false };
}

function getSession(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function requireAdmin(data, handler) {
  var sess = getSession(data.sessionToken);
  if (!sess) return jsonOut({ success: false, error: 'Unauthorized', code: 401 });
  data._session = sess;
  return handler(data);
}

// ══════════════════════════════════════════════
// DATA — 資料讀取
// ══════════════════════════════════════════════

function handleGetCases(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  var cases = [];
  for (var i = 1; i < all.length; i++) {
    if (!all[i][0]) continue;
    cases.push(rowToCase(all[i]));
  }
  return jsonOut({ success: true, cases: cases });
}

function handleGetCase(data) {
  var caseId = String(data.caseId || '');
  if (!caseId) return jsonOut({ success: false, error: 'Missing caseId' });

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();

  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) === caseId) {
      return jsonOut({ success: true, caseData: rowToCase(all[i]) });
    }
  }
  return jsonOut({ success: false, error: '找不到案件: ' + caseId });
}

function rowToCase(r) {
  return {
    caseId:        String(r[0]  || ''),
    reportTime:    fmtDate(r[1]),
    status:        String(r[2]  || ''),
    category:      String(r[3]  || ''),
    name:          String(r[4]  || ''),
    phone:         String(r[5]  || ''),
    lineId:        String(r[6]  || ''),
    title:         String(r[7]  || ''),
    desc:          String(r[8]  || ''),
    addr:          String(r[9]  || ''),
    mapUrl:        String(r[10] || ''),
    case1999:      String(r[11] || ''),
    photo1:        String(r[12] || ''),
    photo2:        String(r[13] || ''),
    photo3:        String(r[14] || ''),
    replyTime:     fmtDate(r[15]),
    lastUpdate:    fmtDate(r[16]),
    replyContent:  String(r[17] || ''),
    repPhoto1:     String(r[18] || ''),
    repPhoto2:     String(r[19] || ''),
    repPhoto3:     String(r[20] || ''),
    handler:       String(r[21] || ''),
    note:          String(r[22] || ''),
    publicFlag:    String(r[23] || ''),
    publicTitle:   String(r[24] || ''),
    publicCate:    String(r[25] || ''),
    publicLoc:     String(r[26] || ''),
    publicSummary: String(r[27] || ''),
    replyUrl:      String(r[28] || '')
  };
}

function fmtDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  }
  return String(v);
}

// ══════════════════════════════════════════════
// DATA — 里長回覆更新
// ══════════════════════════════════════════════

function handleUpdateReply(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });

  var all = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) === String(data.caseId)) {
      rowIndex = i + 1; // 轉為 1-based
      break;
    }
  }
  if (rowIndex === -1) {
    return jsonOut({ success: false, error: '找不到案件: ' + data.caseId });
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  var existingReplyTime = all[rowIndex - 1][15]; // P 欄（0-based: 15）

  sheet.getRange(rowIndex,  3).setValue(data.status || '');                            // C: 案件狀態
  sheet.getRange(rowIndex, 16).setValue(existingReplyTime ? existingReplyTime : now);  // P: 首次回覆時間
  sheet.getRange(rowIndex, 17).setValue(now);                                          // Q: 最後更新
  sheet.getRange(rowIndex, 18).setValue(data.reply_content || '');                     // R: 完整回覆內容
  sheet.getRange(rowIndex, 19).setValue(data.reply_photo1 || '');                      // S: 處理照片1
  sheet.getRange(rowIndex, 20).setValue(data.reply_photo2 || '');                      // T: 處理照片2
  sheet.getRange(rowIndex, 21).setValue(data.reply_photo3 || '');                      // U: 處理照片3
  sheet.getRange(rowIndex, 22).setValue(data.handler || '');                           // V: 承辦人
  sheet.getRange(rowIndex, 23).setValue(data.PS || '');                                // W: 備註
  sheet.getRange(rowIndex, 24).setValue(data.public ? '是' : '否');                   // X: 公開
  sheet.getRange(rowIndex, 25).setValue(data.public_title || '');                      // Y: 公開主旨
  sheet.getRange(rowIndex, 26).setValue(data.public_category || '');                   // Z: 公開類別
  sheet.getRange(rowIndex, 27).setValue(data.public_location || '');                   // AA: 公開地點
  sheet.getRange(rowIndex, 28).setValue(data.public_content || '');                    // AB: 公開摘要

  return jsonOut({ success: true });
}

// ══════════════════════════════════════════════
// PHOTO UPLOAD — 照片上傳至 Google Drive
// ══════════════════════════════════════════════

function handleUploadPhoto(data) {
  return doUpload(data);
}

function handlePublicUpload(data) {
  // 公開上傳需要 API Key
  if (data.apiKey !== API_KEY) {
    return jsonOut({ success: false, error: 'Invalid API key' });
  }
  return doUpload(data);
}

function doUpload(data) {
  var base64   = data.base64 || '';
  var mimeType = data.mimeType || 'image/jpeg';
  var fileName = (data.fileName || 'photo_' + new Date().getTime() + '.jpg')
                   .replace(/[^a-zA-Z0-9._-]/g, '_');

  // 移除 data URL 前綴
  var b64 = base64.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);

  // 限制 5MB
  if (blob.getBytes().length > 5 * 1024 * 1024) {
    return jsonOut({ success: false, error: 'File too large (max 5MB)' });
  }

  // 找到或建立 HPNBHS_Photos 資料夾
  var folders = DriveApp.getFoldersByName('HPNBHS_Photos');
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder('HPNBHS_Photos');

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonOut({
    success: true,
    url: 'https://drive.google.com/uc?id=' + file.getId()
  });
}

// ── 輸出 ──
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
