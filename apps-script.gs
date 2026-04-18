// ============================================================
// HPNBHS + 特約商店 合併版 Apps Script
// 部署方式：Google Apps Script → 部署 → 管理部署 → 更新至最新版本
//           部署類型：Web App，執行身分：我，存取：所有人
// ============================================================

var SHEET_ID     = '1SDwkiqi2EJoW0ICZLeBVRC7IM5ridvHgxS-tFoh_BWE';
var SHEET_CASES  = '案件清單';
var SHEET_STORES = '商店清單';
var SHEET_ADMINS = '管理員名單';

var GOOGLE_CLIENT_ID = '998009736888-v0hng93jchshicessbc6pjf4e6eiolju.apps.googleusercontent.com';
var API_KEY          = 'hpnbhs_sk_Qm7Kp2Xa9Wv8Ld5Rn6Yf4Jb';
var NBH_FOLDER_ID    = '10M_y9gRB3FIGILLi4Dq-wxTqjHqNSC_o'; // Photos/NBH — 里民通報照片
var STOR_FOLDER_ID   = '';                                     // Photos/STOR — 特約商店照片（待填入）
var SESSION_TTL      = 21600;

// ── 路由 ──
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    switch (data.action) {
      // ── 通用 ──
      case 'login':             return handleLogin(data);
      // ── 里民通報系統 ──
      case 'getCases':          return requireAdmin(data, handleGetCases);
      case 'getCase':           return requireAdmin(data, handleGetCase);
      case 'updateReply':       return requireAdmin(data, handleUpdateReply);
      case 'uploadAdminPhoto':  return requireAdmin(data, handleUploadPhoto);
      case 'uploadPublicPhoto': return handlePublicUpload(data);
      case 'uploadStorePhoto':  return handleStorePublicUpload(data);
      case 'getPublicCases':    return handleGetPublicCases(data);
      case 'getPublicCase':     return handleGetPublicCase(data);
      // ── 特約商店系統 ──
      case 'getStores':         return requireAdmin(data, handleGetStores);
      case 'getStore':          return requireAdmin(data, handleGetStore);
      case 'updateStore':       return requireAdmin(data, handleUpdateStore);
      case 'setPinStore':       return requireAdmin(data, handleSetPinStore);
      case 'getPublicStores':   return handleGetPublicStores(data);
      case 'getPublicStore':    return handleGetPublicStore(data);
      // ── 置頂功能 ──
      case 'pinCase':           return requireAdmin(data, handlePinCase);
      case 'getAdmins':         return requireAdmin(data, handleGetAdmins);
      case 'addAdmin':          return requireAdmin(data, handleAddAdmin);
      case 'updateAdmin':       return requireAdmin(data, handleUpdateAdmin);
      case 'deleteAdmin':       return requireAdmin(data, handleDeleteAdmin);
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

  var payload = verifyGoogleToken(idToken);
  if (!payload) return jsonOut({ success: false, error: 'Invalid token' });

  var email = (payload.email || '').toLowerCase().trim();
  var admin = checkAdmin(email);
  if (!admin.valid) return jsonOut({ success: false, error: 'Not authorized' });

  var sessionToken = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sess_' + sessionToken,
    JSON.stringify({ email: email, name: admin.name }),
    SESSION_TTL
  );

  return jsonOut({ success: true, sessionToken: sessionToken, name: admin.name, email: email });
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
      return { valid: true, name: String(data[i][0] || '') };
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

function handlePublicUpload(data) {
  if (data.apiKey !== API_KEY) return jsonOut({ success: false, error: 'Invalid API key' });
  return doUpload(data, NBH_FOLDER_ID);
}

function handleStorePublicUpload(data) {
  if (data.apiKey !== API_KEY) return jsonOut({ success: false, error: 'Invalid API key' });
  return doUpload(data, STOR_FOLDER_ID);
}

function doUpload(data, folderId) {
  if (!folderId) return jsonOut({ success: false, error: 'Folder ID not configured' });
  var base64   = data.base64 || '';
  var mimeType = data.mimeType || 'image/jpeg';
  var fileName = (data.fileName || 'photo_' + new Date().getTime() + '.jpg')
                   .replace(/[^a-zA-Z0-9._-]/g, '_');
  var b64  = base64.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
  if (blob.getBytes().length > 5 * 1024 * 1024) {
    return jsonOut({ success: false, error: 'File too large (max 5MB)' });
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
