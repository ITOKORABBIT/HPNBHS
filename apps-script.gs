// ============================================================
// HPNBHS + 特約商店 合併版 Apps Script
// 部署方式：Google Apps Script → 部署 → 管理部署 → 更新至最新版本
//           部署類型：Web App，執行身分：我，存取：所有人
// ============================================================

var SHEET_ID       = '1SDwkiqi2EJoW0ICZLeBVRC7IM5ridvHgxS-tFoh_BWE';
var SHEET_CASES    = '案件清單';
var SHEET_STORES   = '商店清單';
var SHEET_ADMINS   = '管理員名單';
var SHEET_BULLETIN = '公佈欄';

var GOOGLE_CLIENT_ID = '998009736888-v0hng93jchshicessbc6pjf4e6eiolju.apps.googleusercontent.com';
var API_KEY          = 'hpnbhs_sk_Qm7Kp2Xa9Wv8Ld5Rn6Yf4Jb';
var REPORT_WEBHOOK_URL = 'https://hook.us2.make.com/wa9jtsqq171jf7yoycpb7upnpii30m5g';
var STORE_NOTIFY_WEBHOOK_URL = 'https://hook.us2.make.com/h9dkeqo7b1brd8fmqgjrcq73n1yqiu7c';
var DETAIL_BASE_URL   = 'https://itokorabbit.github.io/HPNBHS/detail.html?id=';
var DEFAULT_REPORT_IMAGE_URL = 'https://itokorabbit.github.io/HPNBHS/assets/no-photo.svg';
var NBH_FOLDER_ID    = '10M_y9gRB3FIGILLi4Dq-wxTqjHqNSC_o'; // Photos/NBH — 里民通報照片
var STOR_FOLDER_ID   = '1QQh4QOfxCIag46YhiW8riUgjwp7tj_6Z';  // Photos/STOR — 特約商店照片
var BULLETIN_FOLDER_ID = '1rvGsrZt6WYh1DpkU5BMUH_XdwJt2_jOX'; // Photos/BULLETIN — 公佈欄公告圖片
var SESSION_TTL      = 2592000;
var PUBLIC_FORM_MIN_MS      = 3000;
var PUBLIC_FORM_MAX_MS      = 2 * 60 * 60 * 1000;
var PUBLIC_SUBMIT_COOLDOWN  = 300;
var UPLOAD_RATE_LIMIT = 10;
var UPLOAD_RATE_WINDOW = 60;

// ── 路由 ──
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    switch (data.action) {
      // ── 通用 ──
      case 'login':             return handleLogin(data);
      case 'refreshSession':    return handleRefreshSession(data);
      case 'submitReport':      return handleSubmitReport(data);
      case 'submitStore':       return handleSubmitStore(data);
      // ── 里民通報系統 ──
      case 'getCases':          return requireAdmin(data, handleGetCases);
      case 'getCase':           return requireAdmin(data, handleGetCase);
      case 'updateReply':       return requireAdmin(data, handleUpdateReply);
      case 'uploadAdminPhoto':  return requireAdmin(data, handleUploadPhoto);
      case 'uploadBulletinImage': return requireAdmin(data, handleUploadBulletinImage);
      case 'uploadPublicPhoto': return jsonOut({ success: false, error: 'uploadPublicPhoto 已停用，請改用 submitReport' });
      case 'uploadStorePhoto':  return handleStorePublicUpload(data, e);
      case 'getPublicCases':    return handleGetPublicCases(data);
      case 'getPublicCase':     return handleGetPublicCase(data);
      // ── 特約商店系統 ──
      case 'getStores':         return requireAdmin(data, handleGetStores);
      case 'getStore':          return requireAdmin(data, handleGetStore);
      case 'updateStore':       return requireAdmin(data, handleUpdateStore);
      case 'setPinStore':       return requireAdmin(data, handleSetPinStore);
      case 'getPublicStores':    return handleGetPublicStores(data);
      case 'getPublicStore':     return handleGetPublicStore(data);
      // ── 公佈欄 ──
      case 'getPublicBulletins': return handleGetPublicBulletins(data);
      case 'getBulletins':       return requireAdmin(data, handleGetBulletins);
      case 'addBulletin':        return requireAdmin(data, handleAddBulletin);
      case 'updateBulletin':     return requireAdmin(data, handleUpdateBulletin);
      case 'deleteBulletin':     return requireAdmin(data, handleDeleteBulletin);
      // ── 置頂功能 ──
      case 'pinCase':           return requireAdmin(data, handlePinCase);
      case 'getAdmins':         return requireSuperAdmin(data, handleGetAdmins);
      case 'addAdmin':          return requireSuperAdmin(data, handleAddAdmin);
      case 'updateAdmin':       return requireSuperAdmin(data, handleUpdateAdmin);
      case 'deleteAdmin':       return requireSuperAdmin(data, handleDeleteAdmin);
      default:
        return jsonOut({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[doPost error]', err.toString());
    return jsonOut({ success: false, error: '伺服器錯誤，請稍後再試' });
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

  var payload = verifyGoogleToken(idToken);
  if (!payload) return jsonOut({ success: false, error: 'Invalid token' });

  var email = (payload.email || '').toLowerCase().trim();
  var admin = checkAdmin(email);
  if (!admin.valid) return jsonOut({ success: false, error: 'Not authorized' });

  var sessionToken = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sess_' + sessionToken,
    JSON.stringify({ email: email, name: admin.name, role: admin.role || '' }),
    SESSION_TTL
  );

  return jsonOut({ success: true, sessionToken: sessionToken, name: admin.name, email: email, role: admin.role || '' });
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
  } catch (e) { return null; }
}

function checkAdmin(email) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ADMINS);
  if (!sheet) return { valid: false };
  var data = sheet.getDataRange().getValues();
  // 管理員名單欄位（刪除 username/password 後）:
  // A(0)=display_name, B(1)=role, C(2)=active, D(3)=email
  for (var i = 1; i < data.length; i++) {
    var rowEmail = String(data[i][3] || '').toLowerCase().trim();
    var active   = String(data[i][2] || '').toUpperCase();
    if (rowEmail === email && active === 'TRUE') {
      return { valid: true, name: String(data[i][0] || ''), role: String(data[i][1] || '') };
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

function handleRefreshSession(data) {
  var sess = getSession(data.sessionToken);
  if (!sess) return jsonOut({ success: false, error: 'Unauthorized', code: 401 });
  // 延長 TTL：重新寫入同一個 sessionToken
  CacheService.getScriptCache().put(
    'sess_' + data.sessionToken,
    JSON.stringify(sess),
    SESSION_TTL
  );
  return jsonOut({ success: true });
}

function requireAdmin(data, handler) {
  var sess = getSession(data.sessionToken);
  if (!sess) return jsonOut({ success: false, error: 'Unauthorized', code: 401 });
  data._session = sess;
  return handler(data);
}

function requireSuperAdmin(data, handler) {
  var sess = getSession(data.sessionToken);
  if (!sess) return jsonOut({ success: false, error: 'Unauthorized', code: 401 });
  if (!isSuperAdminRole(sess.role)) return jsonOut({ success: false, error: 'Forbidden', code: 403 });
  data._session = sess;
  return handler(data);
}

function isSuperAdminRole(role) {
  var text = String(role || '').toLowerCase();
  return text.indexOf('super') !== -1 ||
         text.indexOf('owner') !== -1 ||
         text.indexOf('root')  !== -1 ||
         text.indexOf('超級')  !== -1;
}

// ══════════════════════════════════════════════
// 里民通報系統 — 公開送出通報
// ══════════════════════════════════════════════

function handleSubmitReport(data) {
  var validationError = validatePublicReport_(data);
  if (validationError) return jsonOut({ success: false, error: validationError });

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });

  var now = new Date();
  var nowText = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  var caseId = nextCaseId_(sheet, 'HP');
  var replyUrl = buildDetailUrl_(caseId);
  var photos = uploadPublicReportPhotos_(data.photos, caseId);
  var phoneText = toSheetText_(data.phone);
  var lineIdText = toSheetText_(data.lineId);

  sheet.appendRow([
    caseId, nowText, '新案件',
    String(data.cate    || '').trim(),
    String(data.name    || '').trim(),
    phoneText,
    lineIdText,
    String(data.title   || '').trim(),
    String(data.desc    || '').trim(),
    String(data.addr    || '').trim(),
    String(data.map     || '').trim(),
    String(data.case1999 || data['1999'] || '').trim(),
    photos[0], photos[1], photos[2],
    '', nowText, '', '', '', '', '', '', 'FALSE', '', '', '', '', replyUrl, 0
  ]);

  notifyNewReport_({
    caseId: caseId, reportTime: nowText, status: '新案件',
    cate:  String(data.cate  || '').trim(),
    name:  String(data.name  || '').trim(),
    phone: String(data.phone || '').trim(),
    lineId: String(data.lineId || '').trim(),
    title: String(data.title || '').trim(),
    desc:  String(data.desc  || '').trim(),
    addr:  String(data.addr  || '').trim(),
    map:   String(data.map   || '').trim(),
    case1999: String(data.case1999 || data['1999'] || '').trim(),
    photo1: photos[0] || DEFAULT_REPORT_IMAGE_URL, photo2: photos[1], photo3: photos[2],
    replyUrl: replyUrl, detailUrl: replyUrl
  });

  return jsonOut({ success: true, caseId: caseId });
}

function handleSubmitStore(data) {
  // 蜜罐防機器人
  if (String(data.website || '').trim()) return jsonOut({ success: false, error: 'bot_rejected' });

  // 表單時間戳防止過舊/過快送出
  var formTs = parseInt(data.formTs || '0', 10);
  var elapsed = Date.now() - formTs;
  if (!formTs || elapsed < PUBLIC_FORM_MIN_MS || elapsed > PUBLIC_FORM_MAX_MS)
    return jsonOut({ success: false, error: 'form_expired' });

  // 必填欄位檢查
  var required = ['name', 'phone', 'cate', 'title', 'addr'];
  for (var i = 0; i < required.length; i++) {
    if (!String(data[required[i]] || '').trim())
      return jsonOut({ success: false, error: 'missing_required_fields' });
  }

  // 電話格式
  var phone = normalizePhone_(data.phone);
  if (!phone || phone.length < 8) return jsonOut({ success: false, error: 'invalid_phone' });

  // 防重複送出（同電話+店名 5 分鐘冷卻）
  var dedupeKey = 'store_' + Utilities.base64EncodeWebSafe(
    phone + '|' + String(data.title || '').trim()
  ).substring(0, 120);
  var cache = CacheService.getScriptCache();
  if (cache.get(dedupeKey)) return jsonOut({ success: false, error: 'too_many_requests' });
  cache.put(dedupeKey, '1', PUBLIC_SUBMIT_COOLDOWN);

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });

  var now = new Date();
  var nowText = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  var storeId = nextStoreId_(sheet);
  var planType = ['免費', '精選', '優選'].indexOf(String(data.planType || '')) !== -1
    ? String(data.planType) : '免費';

  sheet.appendRow([
    storeId,                                    // A: 商店ID
    nowText,                                    // B: 申請時間
    '申請審核中',                               // C: 狀態
    String(data.cate      || '').trim(),        // D: 商家類別
    String(data.name      || '').trim(),        // E: 申請人姓名
    toSheetText_(data.phone),                   // F: 申請人電話
    toSheetText_(data.lineId),                  // G: 申請人LineID
    String(data.title     || '').trim(),        // H: 店家名稱
    String(data.storephone|| '').trim(),        // I: 店家電話
    String(data.taxid     || '').trim(),        // J: 統一編號
    String(data.desc      || '').trim(),        // K: 經營內容
    String(data.offer     || '').trim(),        // L: 優惠方案
    String(data.opentime  || '').trim(),        // M: 營業時間
    String(data.addr      || '').trim(),        // N: 店家地址
    String(data.map       || '').trim(),        // O: 地圖網址
    String(data.photo1    || ''),               // P: 照片1
    String(data.photo2    || ''),               // Q: 照片2
    String(data.photo3    || ''),               // R: 照片3
    '',                                         // S: 管理員備註
    nowText,                                    // T: 最後更新
    '',                                         // U: 審核人
    '', '', '', '', '', '', '', '', '',          // V-AD: 公開欄位（審核後填）
    planType,                                   // AE: 方案類型
    0,                                          // AF: 置頂順序
  ]);

  notifyNewStore_({
    storeId:  storeId,
    planType: planType,
    cate:     String(data.cate      || '').trim(),
    name:     String(data.name      || '').trim(),
    phone:    String(data.phone     || '').trim(),
    title:    String(data.title     || '').trim(),
    addr:     String(data.addr      || '').trim(),
    offer:    String(data.offer     || '').trim(),
    photo1:   String(data.photo1    || ''),
    photo2:   String(data.photo2    || ''),
    photo3:   String(data.photo3    || ''),
  });

  return jsonOut({ success: true, storeId: storeId });
}

function nextStoreId_(sheet) {
  var all = sheet.getDataRange().getValues();
  var datePart = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyMMdd');
  var monthPart = datePart.substring(0, 4);
  var maxNum = 0;
  var idPattern = new RegExp('^STOR' + monthPart + '\\d{2}(\\d{3})$');
  for (var i = 1; i < all.length; i++) {
    var match = String(all[i][0] || '').match(idPattern);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
  }
  return 'STOR' + datePart + Utilities.formatString('%03d', maxNum + 1);
}

function notifyNewStore_(payload) {
  if (!STORE_NOTIFY_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(STORE_NOTIFY_WEBHOOK_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (err) { console.error('[notifyNewStore_]', err.toString()); }
}

function validatePublicReport_(data) {
  if (String(data.website || '').trim()) return 'bot_rejected';

  var formTs = parseInt(data.formTs || '0', 10);
  var elapsed = Date.now() - formTs;
  if (!formTs || elapsed < PUBLIC_FORM_MIN_MS || elapsed > PUBLIC_FORM_MAX_MS) return 'form_expired';

  var requiredFields = ['name', 'phone', 'cate', 'title', 'desc', 'addr'];
  for (var i = 0; i < requiredFields.length; i++) {
    if (!String(data[requiredFields[i]] || '').trim()) return 'missing_required_fields';
  }

  var photos = Array.isArray(data.photos) ? data.photos : [];
  if (photos.length > 3) return 'too_many_photos';

  var phone = normalizePhone_(data.phone);
  if (!phone || phone.length < 8) return 'invalid_phone';

  var title = String(data.title || '').trim();
  var addr  = String(data.addr  || '').trim();
  var dedupeKey = 'report_' + Utilities.base64EncodeWebSafe(phone + '|' + title + '|' + addr).substring(0, 120);
  var cache = CacheService.getScriptCache();
  if (cache.get(dedupeKey)) return 'too_many_requests';
  cache.put(dedupeKey, '1', PUBLIC_SUBMIT_COOLDOWN);

  return '';
}

function normalizePhone_(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

function toSheetText_(value) {
  var text = String(value || '').trim();
  return text ? ("'" + text) : '';
}

function nextCaseId_(sheet, prefix) {
  var all = sheet.getDataRange().getValues();
  var datePart = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyMMdd');
  var monthPart = datePart.substring(0, 4);
  var maxNum = 0;
  var idPattern = new RegExp('^' + String(prefix || 'HP') + '-?' + monthPart + '\\d{2}(\\d{3})$');
  for (var i = 1; i < all.length; i++) {
    var candidates = [all[i][0], all[i][28]];
    for (var j = 0; j < candidates.length; j++) {
      var match = String(candidates[j] || '').match(idPattern);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    }
  }
  return String(prefix || 'HP') + datePart + Utilities.formatString('%03d', maxNum + 1);
}

function buildDetailUrl_(caseId) {
  return DETAIL_BASE_URL + encodeURIComponent(String(caseId || ''));
}

function uploadPublicReportPhotos_(photos, caseId) {
  var result = ['', '', ''];
  var items = Array.isArray(photos) ? photos.slice(0, 3) : [];
  for (var i = 0; i < items.length; i++) {
    if (!items[i] || !items[i].base64) continue;
    try {
      result[i] = createUploadedFileUrl_(
        items[i].base64, items[i].mimeType || 'image/jpeg',
        NBH_FOLDER_ID, String(caseId || 'report') + '_' + (i + 1)
      );
    } catch (e) { console.error('[uploadPublicReportPhotos_]', e.toString()); }
  }
  return result;
}

function notifyNewReport_(payload) {
  if (!REPORT_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(REPORT_WEBHOOK_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (err) { console.error('[notifyNewReport_]', err.toString()); }
}

function createUploadedFileUrl_(base64, mimeType, folderId, fileNamePrefix) {
  if (!folderId) throw new Error('Folder ID not configured');
  var normalizedMime = String(mimeType || 'image/jpeg').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME[normalizedMime]) throw new Error('不支援的檔案類型');
  var ext = ALLOWED_MIME[normalizedMime];
  var safePrefix = String(fileNamePrefix || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_');
  var fileName = safePrefix + '_' + new Date().getTime() + '.' + ext;
  var b64 = String(base64 || '').replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), normalizedMime, fileName);
  if (blob.getBytes().length > 5 * 1024 * 1024) throw new Error('檔案太大（上限 5MB）');
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

// ══════════════════════════════════════════════
// 里民通報系統 — 案件讀取
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
  // 分頁支援：傳入 limit/offset 時只回傳該段，未傳則回傳全部（向下相容）
  var limit  = parseInt(data.limit  || '0', 10);
  var offset = parseInt(data.offset || '0', 10);
  var total  = cases.length;
  if (limit > 0) {
    cases = cases.slice(offset, offset + limit);
    return jsonOut({ success: true, cases: cases, total: total, offset: offset, limit: limit });
  }
  return jsonOut({ success: true, cases: cases, total: total });
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
    replyUrl:      String(r[28] || ''),
    pinOrder:      Number(r[29]  || 0)   // AD欄：置頂順序（0=不置頂）
  };
}

// ══════════════════════════════════════════════
// 里民通報系統 — 里長回覆更新
// ══════════════════════════════════════════════

function handleUpdateReply(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });

  var all = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) === String(data.caseId)) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return jsonOut({ success: false, error: '找不到案件: ' + data.caseId });

  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  var existingReplyTime = all[rowIndex - 1][15];

  sheet.getRange(rowIndex,  3).setValue(data.status || '');
  sheet.getRange(rowIndex, 16).setValue(existingReplyTime ? existingReplyTime : now);
  sheet.getRange(rowIndex, 17).setValue(now);
  sheet.getRange(rowIndex, 18).setValue(data.reply_content || '');
  sheet.getRange(rowIndex, 19).setValue(data.reply_photo1 || '');
  sheet.getRange(rowIndex, 20).setValue(data.reply_photo2 || '');
  sheet.getRange(rowIndex, 21).setValue(data.reply_photo3 || '');
  sheet.getRange(rowIndex, 22).setValue(data.handler || '');
  sheet.getRange(rowIndex, 23).setValue(data.PS || '');
  sheet.getRange(rowIndex, 24).setValue(data.public ? '是' : '否');
  sheet.getRange(rowIndex, 25).setValue(data.public_title || '');
  sheet.getRange(rowIndex, 26).setValue(data.public_category || '');
  sheet.getRange(rowIndex, 27).setValue(data.public_location || '');
  sheet.getRange(rowIndex, 28).setValue(data.public_content || '');

  return jsonOut({ success: true });
}

// ══════════════════════════════════════════════
// 照片上傳
// ══════════════════════════════════════════════

function handleUploadPhoto(data) { return doUpload(data, NBH_FOLDER_ID); }
function handleUploadBulletinImage(data) { return doUpload(data, BULLETIN_FOLDER_ID, 'bulletin'); }

var ALLOWED_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
var ALLOWED_REFERERS = ['https://itokorabbit.github.io', 'https://ommichi.github.io'];
var UPLOAD_RATE_LIMIT = 10; // 每個 IP 每分鐘最多上傳次數（以 API Key 為單位）
var UPLOAD_RATE_WINDOW = 60; // 秒

function checkPublicUploadAccess(data, e) {
  if (data.apiKey !== API_KEY) return '無效的 API Key';
  // Referer 來源驗證（GAS 沒有原生取 header 的方式，透過前端帶入 origin 參數）
  var origin = String(data.origin || '');
  if (origin) {
    var allowed = false;
    for (var i = 0; i < ALLOWED_REFERERS.length; i++) {
      if (origin.indexOf(ALLOWED_REFERERS[i]) === 0) { allowed = true; break; }
    }
    if (!allowed) return '不允許的來源網域';
  }
  // Rate Limiting：每分鐘最多 UPLOAD_RATE_LIMIT 次
  var rateKey = 'rate_upload_' + data.apiKey;
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(rateKey) || '0', 10);
  if (count >= UPLOAD_RATE_LIMIT) return '上傳次數過多，請稍後再試';
  cache.put(rateKey, String(count + 1), UPLOAD_RATE_WINDOW);
  return null;
}

function handlePublicUpload(data, e) {
  var err = checkPublicUploadAccess(data, e);
  if (err) return jsonOut({ success: false, error: err });
  return doUpload(data, NBH_FOLDER_ID);
}

function handleStorePublicUpload(data, e) {
  var err = checkPublicUploadAccess(data, e);
  if (err) return jsonOut({ success: false, error: err });
  return doUpload(data, STOR_FOLDER_ID);
}

function doUpload(data, folderId, fileNamePrefix) {
  if (!folderId) return jsonOut({ success: false, error: 'Folder ID not configured' });
  var base64   = data.base64 || '';
  // MIME 類型白名單驗證（伺服器端，不信任客戶端傳入）
  var mimeType = String(data.mimeType || 'image/jpeg').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME[mimeType]) return jsonOut({ success: false, error: '不支援的檔案類型' });
  var ext      = ALLOWED_MIME[mimeType];
  var prefix = String(fileNamePrefix || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_');
  var fileName = (prefix + '_' + new Date().getTime() + '.' + ext);
  var b64  = base64.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
  if (blob.getBytes().length > 5 * 1024 * 1024) {
    return jsonOut({ success: false, error: '檔案太大（上限 5MB）' });
  }
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return jsonOut({ success: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() });
}

// ══════════════════════════════════════════════
// 里民通報系統 — 公開端點
// ══════════════════════════════════════════════

function handleGetPublicCases(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  var cases = [];
  for (var i = 1; i < all.length; i++) {
    if (!all[i][0]) continue;
    var r = all[i];
    var pub = String(r[23] || '');
    if (pub !== '是' && pub.toUpperCase() !== 'TRUE') continue;
    cases.push({
      caseId: String(r[0] || ''), status: String(r[2] || ''),
      replyTime: fmtDate(r[15]), publicTitle: String(r[24] || ''),
      publicCate: String(r[25] || ''), publicLoc: String(r[26] || ''),
      publicSummary: String(r[27] || ''), repPhoto1: String(r[18] || ''),
    });
  }
  cases.sort(function(a, b) { return b.caseId.localeCompare(a.caseId); });
  return jsonOut({ success: true, cases: cases });
}

function handleGetPublicCase(data) {
  var caseId = String(data.caseId || '');
  if (!caseId) return jsonOut({ success: false, error: 'Missing caseId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) !== caseId) continue;
    var r = all[i];
    var pub = String(r[23] || '');
    if (pub !== '是' && pub.toUpperCase() !== 'TRUE') return jsonOut({ success: false, error: '此案件未公開' });
    return jsonOut({ success: true, caseData: {
      caseId: String(r[0] || ''), status: String(r[2] || ''),
      replyTime: fmtDate(r[15]),
      repPhoto1: String(r[18] || ''), repPhoto2: String(r[19] || ''), repPhoto3: String(r[20] || ''),
      publicTitle: String(r[24] || ''), publicCate: String(r[25] || ''),
      publicLoc: String(r[26] || ''), publicSummary: String(r[27] || ''),
    }});
  }
  return jsonOut({ success: false, error: '找不到案件' });
}

// ══════════════════════════════════════════════
// 特約商店系統 — 商店讀取
// ══════════════════════════════════════════════

// Google Sheet 欄位對照（1-based）:
//  1(A)=商店ID,      2(B)=申請時間,    3(C)=狀態,
//  4(D)=商家類別,    5(E)=申請人姓名,  6(F)=申請人電話,
//  7(G)=申請人LineID,8(H)=店家名稱,    9(I)=店家電話,
// 10(J)=統一編號,   11(K)=經營內容,   12(L)=優惠方案,
// 13(M)=營業時間,   14(N)=店家地址,   15(O)=地圖網址,
// 16(P)=照片1,      17(Q)=照片2,      18(R)=照片3,
// 19(S)=管理員備註, 20(T)=最後更新,   21(U)=審核人,
// 22(V)=公開店名,   23(W)=公開類別,   24(X)=公開電話,
// 25(Y)=公開地址,   26(Z)=公開地圖,   27(AA)=公開經營內容,
// 28(AB)=公開優惠,  29(AC)=公開營業時間, 30(AD)=公開統一編號

function handleGetStores(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found: ' + SHEET_STORES });
  var all = sheet.getDataRange().getValues();
  var stores = [];
  for (var i = 1; i < all.length; i++) {
    if (!all[i][0]) continue;
    stores.push(rowToStore(all[i]));
  }
  return jsonOut({ success: true, stores: stores });
}

function handleGetStore(data) {
  var storeId = String(data.storeId || '');
  if (!storeId) return jsonOut({ success: false, error: 'Missing storeId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) === storeId) {
      return jsonOut({ success: true, storeData: rowToStore(all[i]) });
    }
  }
  return jsonOut({ success: false, error: '找不到商店: ' + storeId });
}

function handleGetPublicStores(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  var stores = [];
  for (var i = 1; i < all.length; i++) {
    if (!all[i][0]) continue;
    if (String(all[i][2]) !== '已公開') continue;
    stores.push(rowToPublicStore(all[i]));
  }
  return jsonOut({ success: true, stores: stores });
}

function rowToStore(r) {
  return {
    storeId:    String(r[0]  || ''), applyTime:  fmtDate(r[1]),
    status:     String(r[2]  || ''), category:   String(r[3]  || ''),
    name:       String(r[4]  || ''), phone:      String(r[5]  || ''),
    lineId:     String(r[6]  || ''), storeName:  String(r[7]  || ''),
    storePhone: String(r[8]  || ''), storeNum:   String(r[9]  || ''),
    desc:       String(r[10] || ''), offer:      String(r[11] || ''),
    hours:      String(r[12] || ''), addr:       String(r[13] || ''),
    mapUrl:     String(r[14] || ''), photo1:     String(r[15] || ''),
    photo2:     String(r[16] || ''), photo3:     String(r[17] || ''),
    note:       String(r[18] || ''), lastUpdate: fmtDate(r[19]),
    reviewer:   String(r[20] || ''), pubName:    String(r[21] || ''),
    pubCate:    String(r[22] || ''), pubPhone:   String(r[23] || ''),
    pubAddr:    String(r[24] || ''), pubMapUrl:  String(r[25] || ''),
    pubDesc:    String(r[26] || ''), pubOffer:   String(r[27] || ''),
    pubHours:   String(r[28] || ''), pubStoreNum: String(r[29] || ''),
    planType:   String(r[30] || '免費'),          // AE欄：方案類型（免費/精選/優選）
    pinOrder:   Number(r[31]  || 0),               // AF欄：置頂順序（0=不置頂）
  };
}

function handleGetPublicStore(data) {
  var storeId = String(data.storeId || '');
  if (!storeId) return jsonOut({ success: false, error: 'Missing storeId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) !== storeId) continue;
    if (String(all[i][2]) !== '已公開') return jsonOut({ success: false, error: '此商店未公開' });
    return jsonOut({ success: true, storeData: rowToPublicStore(all[i]) });
  }
  return jsonOut({ success: false, error: '找不到商店' });
}

function rowToPublicStore(r) {
  return {
    storeId:     String(r[0]  || ''), photo1:      String(r[15] || ''),
    pubName:     String(r[21] || ''), pubCate:     String(r[22] || ''),
    pubPhone:    String(r[23] || ''), pubAddr:     String(r[24] || ''),
    pubMapUrl:   String(r[25] || ''), pubDesc:     String(r[26] || ''),
    pubOffer:    String(r[27] || ''), pubHours:    String(r[28] || ''),
    pubStoreNum: String(r[29] || ''),
    planType:    String(r[30] || '免費'),           // AE欄：方案類型
    pinOrder:    Number(r[31]  || 0),               // AF欄：置頂順序
  };
}

// ══════════════════════════════════════════════
// 特約商店系統 — 商店審核更新
// ══════════════════════════════════════════════

function handleUpdateStore(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });

  var all = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) === String(data.storeId)) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return jsonOut({ success: false, error: '找不到商店: ' + data.storeId });

  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');

  sheet.getRange(rowIndex,  3).setValue(data.status   || '');
  sheet.getRange(rowIndex, 19).setValue(data.note     || '');
  sheet.getRange(rowIndex, 20).setValue(now);
  sheet.getRange(rowIndex, 21).setValue(data.reviewer || '');

  if (data.status === '已公開') {
    sheet.getRange(rowIndex, 22).setValue(data.pubName   || '');
    sheet.getRange(rowIndex, 23).setValue(data.pubCate   || '');
    sheet.getRange(rowIndex, 24).setValue(data.pubPhone  || '');
    sheet.getRange(rowIndex, 25).setValue(data.pubAddr   || '');
    sheet.getRange(rowIndex, 26).setValue(data.pubMapUrl || '');
    sheet.getRange(rowIndex, 27).setValue(data.pubDesc     || '');
    sheet.getRange(rowIndex, 28).setValue(data.pubOffer    || '');
    sheet.getRange(rowIndex, 29).setValue(data.pubHours    || '');
    sheet.getRange(rowIndex, 30).setValue(data.pubStoreNum || '');
  }

  // 方案類型（AE欄）與置頂順序（AF欄）可隨時更新，不限狀態
  if (data.planType !== undefined) sheet.getRange(rowIndex, 31).setValue(data.planType || '免費');
  if (data.pinOrder !== undefined) sheet.getRange(rowIndex, 32).setValue(Number(data.pinOrder || 0));

  return jsonOut({ success: true });
}

// ══════════════════════════════════════════════
// 帳號管理
// ══════════════════════════════════════════════

function handleGetAdmins(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ADMINS);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found: ' + SHEET_ADMINS });
  var rows = sheet.getDataRange().getValues();
  var admins = [];
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0] && !rows[i][3]) continue;
    admins.push({
      display_name: String(rows[i][0] || ''),
      role:         String(rows[i][1] || ''),
      active:       String(rows[i][2] || '').toUpperCase() === 'TRUE',
      email:        String(rows[i][3] || ''),
    });
  }
  return jsonOut({ success: true, admins: admins });
}

function handleAddAdmin(data) {
  var email = (data.email || '').toLowerCase().trim();
  if (!email) return jsonOut({ success: false, error: '缺少 email' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ADMINS);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3] || '').toLowerCase() === email)
      return jsonOut({ success: false, error: '此 email 已存在' });
  }
  sheet.appendRow([
    data.display_name || '',
    data.role || '管理員',
    data.active === false ? 'FALSE' : 'TRUE',
    email,
  ]);
  return jsonOut({ success: true });
}

function handleUpdateAdmin(data) {
  var email = (data.target_email || data.email || '').toLowerCase().trim();
  if (!email) return jsonOut({ success: false, error: '缺少 email' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ADMINS);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][3] || '').toLowerCase() !== email) continue;
    var row = i + 1;
    if (data.display_name !== undefined) sheet.getRange(row, 1).setValue(data.display_name);
    if (data.role         !== undefined) sheet.getRange(row, 2).setValue(data.role);
    if (data.active       !== undefined) sheet.getRange(row, 3).setValue(data.active ? 'TRUE' : 'FALSE');
    return jsonOut({ success: true });
  }
  return jsonOut({ success: false, error: '找不到帳號: ' + email });
}

function handleDeleteAdmin(data) {
  var email = (data.target_email || data.email || '').toLowerCase().trim();
  if (!email) return jsonOut({ success: false, error: '缺少 email' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ADMINS);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][3] || '').toLowerCase() === email) {
      sheet.deleteRow(i + 1);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: '找不到帳號: ' + email });
}

// ══════════════════════════════════════════════
// 置頂功能
// ══════════════════════════════════════════════

function handlePinCase(data) {
  var caseId = String(data.caseId || '');
  if (!caseId) return jsonOut({ success: false, error: 'Missing caseId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_CASES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) !== caseId) continue;
    sheet.getRange(i + 1, 30).setValue(Number(data.pinOrder || 0)); // AD欄
    return jsonOut({ success: true });
  }
  return jsonOut({ success: false, error: '找不到案件: ' + caseId });
}

function handleSetPinStore(data) {
  var storeId = String(data.storeId || '');
  if (!storeId) return jsonOut({ success: false, error: 'Missing storeId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_STORES);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) !== storeId) continue;
    if (data.planType !== undefined) sheet.getRange(i + 1, 31).setValue(data.planType || '免費'); // AE欄
    sheet.getRange(i + 1, 32).setValue(Number(data.pinOrder || 0)); // AF欄
    return jsonOut({ success: true });
  }
  return jsonOut({ success: false, error: '找不到商店: ' + storeId });
}

// ══════════════════════════════════════════════
// 【一次性執行】在 Google Apps Script 編輯器手動執行此函式，建立公佈欄 Sheet
// 執行後即可刪除或保留（重複執行不會覆蓋既有資料）
// ══════════════════════════════════════════════

function setupPinColumns() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // ── 案件清單：確保 AD 欄（第30欄）= 置頂順序 ──
  var caseSheet = ss.getSheetByName(SHEET_CASES);
  if (caseSheet) {
    var caseLastCol = caseSheet.getLastColumn();
    if (caseLastCol < 30) {
      // 補齊到第 30 欄
      for (var c = caseLastCol + 1; c <= 30; c++) {
        caseSheet.getRange(1, c).setValue(c === 30 ? '置頂順序' : '');
      }
    } else {
      caseSheet.getRange(1, 30).setValue('置頂順序');
    }
    // 設定欄寬與預設值 0
    caseSheet.setColumnWidth(30, 80);
    var caseRows = caseSheet.getLastRow();
    if (caseRows > 1) {
      var caseRange = caseSheet.getRange(2, 30, caseRows - 1, 1);
      var caseVals = caseRange.getValues().map(function(r) {
        return [r[0] === '' ? 0 : r[0]];
      });
      caseRange.setValues(caseVals);
    }
    // 標題列樣式
    caseSheet.getRange(1, 30).setBackground('#4A5568').setFontColor('#FFFFFF').setFontWeight('bold');
    Logger.log('案件清單 AD欄（置頂順序）設定完成');
  }

  // ── 商店清單：AE 欄（第31欄）= 方案類型，AF 欄（第32欄）= 置頂順序 ──
  var storeSheet = ss.getSheetByName(SHEET_STORES);
  if (storeSheet) {
    var storeLastCol = storeSheet.getLastColumn();
    // 補到第 32 欄
    for (var sc = storeLastCol + 1; sc <= 32; sc++) {
      if (sc === 31) storeSheet.getRange(1, sc).setValue('方案類型');
      else if (sc === 32) storeSheet.getRange(1, sc).setValue('置頂順序');
      else storeSheet.getRange(1, sc).setValue('');
    }
    if (storeLastCol >= 31) storeSheet.getRange(1, 31).setValue('方案類型');
    if (storeLastCol >= 32) storeSheet.getRange(1, 32).setValue('置頂順序');

    storeSheet.setColumnWidth(31, 90);
    storeSheet.setColumnWidth(32, 80);

    // 方案類型預設值「免費」
    var storeRows = storeSheet.getLastRow();
    if (storeRows > 1) {
      var planRange = storeSheet.getRange(2, 31, storeRows - 1, 1);
      var planVals = planRange.getValues().map(function(r) {
        return [r[0] === '' ? '免費' : r[0]];
      });
      planRange.setValues(planVals);

      var pinRange = storeSheet.getRange(2, 32, storeRows - 1, 1);
      var pinVals = pinRange.getValues().map(function(r) {
        return [r[0] === '' ? 0 : r[0]];
      });
      pinRange.setValues(pinVals);
    }

    // 資料驗證：方案類型下拉
    var planRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['免費', '精選', '優選'], true)
      .build();
    storeSheet.getRange(2, 31, 200, 1).setDataValidation(planRule);

    // 標題列樣式
    storeSheet.getRange(1, 31, 1, 2).setBackground('#4A5568').setFontColor('#FFFFFF').setFontWeight('bold');
    Logger.log('商店清單 AE欄（方案類型）、AF欄（置頂順序）設定完成');
  }

  SpreadsheetApp.getUi().alert('✅ 置頂欄位設定完成！\n\n案件清單：AD 欄（置頂順序）\n商店清單：AE 欄（方案類型）、AF 欄（置頂順序）');
}

function setupBulletinSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var existing = ss.getSheetByName(SHEET_BULLETIN);
  if (existing) {
    SpreadsheetApp.getUi().alert('「公佈欄」分頁已存在，略過建立。');
    return;
  }

  var sheet = ss.insertSheet(SHEET_BULLETIN);

  // 欄位標題
  var headers = ['公告ID', '建立時間', '標題', '內容', '圖片網址', '置頂', '狀態', '建立者'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // 標題列樣式
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#4B7A52');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);

  // 凍結標題列
  sheet.setFrozenRows(1);

  // 欄寬設定
  sheet.setColumnWidth(1, 100);  // 公告ID
  sheet.setColumnWidth(2, 140);  // 建立時間
  sheet.setColumnWidth(3, 220);  // 標題
  sheet.setColumnWidth(4, 300);  // 內容
  sheet.setColumnWidth(5, 200);  // 圖片網址
  sheet.setColumnWidth(6, 60);   // 置頂
  sheet.setColumnWidth(7, 80);   // 狀態
  sheet.setColumnWidth(8, 100);  // 建立者

  // 資料驗證：置頂欄 (F) → 核取方塊
  var pinRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  sheet.getRange(2, 6, 100, 1).setDataValidation(pinRule);

  // 資料驗證：狀態欄 (G) → 下拉選單
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['已發布', '草稿'], true)
    .build();
  sheet.getRange(2, 7, 100, 1).setDataValidation(statusRule);

  // 全部文字垂直置中
  sheet.getRange(1, 1, 1, headers.length).setVerticalAlignment('middle');

  SpreadsheetApp.getUi().alert('✅ 「公佈欄」分頁建立完成！');
}

// ══════════════════════════════════════════════
// 公佈欄
// Sheet 欄位：A=公告ID B=建立時間 C=標題 D=內容 E=圖片網址 F=置頂 G=狀態 H=建立者
// ══════════════════════════════════════════════

function nextBulletinId(sheet) {
  var all = sheet.getDataRange().getValues();
  var max = 0;
  for (var i = 1; i < all.length; i++) {
    var m = String(all[i][0]).match(/BULL-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'BULL-' + String(max + 1).padStart(3, '0');
}

function rowToBulletin(r) {
  return {
    bulletinId: String(r[0] || ''),
    createdAt:  fmtDate(r[1]),
    title:      String(r[2] || ''),
    content:    String(r[3] || ''),
    imageUrl:   String(r[4] || ''),
    pinned:     String(r[5] || '').toUpperCase() === 'TRUE',
    status:     String(r[6] || '草稿'),
    author:     String(r[7] || ''),
  };
}

function handleGetPublicBulletins(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_BULLETIN);
  if (!sheet) return jsonOut({ success: true, bulletins: [] });
  var all = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < all.length; i++) {
    if (!all[i][0]) continue;
    if (String(all[i][6]) !== '已發布') continue;
    list.push(rowToBulletin(all[i]));
  }
  list.sort(function(a, b) {
    if (b.pinned !== a.pinned) return b.pinned ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return jsonOut({ success: true, bulletins: list });
}

function handleGetBulletins(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_BULLETIN);
  if (!sheet) return jsonOut({ success: true, bulletins: [] });
  var all = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < all.length; i++) {
    if (!all[i][0]) continue;
    list.push(rowToBulletin(all[i]));
  }
  list.sort(function(a, b) {
    if (b.pinned !== a.pinned) return b.pinned ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return jsonOut({ success: true, bulletins: list });
}

function handleAddBulletin(data) {
  var title = String(data.title || '').trim();
  if (!title) return jsonOut({ success: false, error: '標題不能空白' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BULLETIN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BULLETIN);
    sheet.appendRow(['公告ID','建立時間','標題','內容','圖片網址','置頂','狀態','建立者']);
  }
  var id  = nextBulletinId(sheet);
  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  sheet.appendRow([
    id, now,
    title,
    String(data.content  || ''),
    String(data.imageUrl || ''),
    data.pinned ? 'TRUE' : 'FALSE',
    data.status || '草稿',
    data._session ? data._session.name : '',
  ]);
  return jsonOut({ success: true, bulletinId: id });
}

function handleUpdateBulletin(data) {
  var id = String(data.bulletinId || '');
  if (!id) return jsonOut({ success: false, error: '缺少 bulletinId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_BULLETIN);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (String(all[i][0]) !== id) continue;
    var row = i + 1;
    if (data.title    !== undefined) sheet.getRange(row, 3).setValue(data.title);
    if (data.content  !== undefined) sheet.getRange(row, 4).setValue(data.content);
    if (data.imageUrl !== undefined) sheet.getRange(row, 5).setValue(data.imageUrl);
    if (data.pinned   !== undefined) sheet.getRange(row, 6).setValue(data.pinned ? 'TRUE' : 'FALSE');
    if (data.status   !== undefined) sheet.getRange(row, 7).setValue(data.status);
    return jsonOut({ success: true });
  }
  return jsonOut({ success: false, error: '找不到公告: ' + id });
}

function handleDeleteBulletin(data) {
  var id = String(data.bulletinId || '');
  if (!id) return jsonOut({ success: false, error: '缺少 bulletinId' });
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_BULLETIN);
  if (!sheet) return jsonOut({ success: false, error: 'Sheet not found' });
  var all = sheet.getDataRange().getValues();
  for (var i = all.length - 1; i >= 1; i--) {
    if (String(all[i][0]) === id) { sheet.deleteRow(i + 1); return jsonOut({ success: true }); }
  }
  return jsonOut({ success: false, error: '找不到公告: ' + id });
}

// ── 共用輸出 ──
function fmtDate(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  return String(v);
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
