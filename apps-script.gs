// ============================================================
// HPNBHS Apps Script - 里長回覆寫入 Google Sheets
// 部署方式：Google Apps Script → 部署 → 管理部署 → 更新至最新版本
//           部署類型：Web App，執行身分：我，存取：所有人
// ============================================================

var SHEET_ID   = '1SDwkiqi2EJoW0ICZLeBVRC7IM5ridvHgxS-tFoh_BWE';
var SHEET_NAME = '案件清單';

// ── 允許跨來源請求（CORS） ──
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'updateReply') {
      return updateReply(data);
    }

    return output({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return output({ success: false, error: err.toString() });
  }
}

// ── 里長回覆更新 ──
// 欄位對照（1-based column index）：
//   C=3(狀態) P=16(回覆時間) Q=17(最後更新) R=18(回覆內容)
//   S=19(處理照片1) T=20(處理照片2) U=21(處理照片3)
//   V=22(承辦人) W=23(備註)
//   X=24(公開) Y=25(公開主旨) Z=26(公開類別) AA=27(公開地點) AB=28(公開摘要)
function updateReply(data) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return output({ success: false, error: '找不到工作表: ' + SHEET_NAME });

  var allData = sheet.getDataRange().getValues();
  var rowIndex = -1;

  // 從第二列開始找（第一列是標頭）
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.caseId)) {
      rowIndex = i + 1; // 轉為 1-based
      break;
    }
  }

  if (rowIndex === -1) {
    return output({ success: false, error: '找不到案件: ' + data.caseId });
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  var existingReplyTime = allData[rowIndex - 1][15]; // P 欄（0-based: 15）

  // 寫入回覆欄位
  sheet.getRange(rowIndex, 3).setValue(data.status || '');                           // C: 案件狀態
  sheet.getRange(rowIndex, 16).setValue(existingReplyTime ? existingReplyTime : now); // P: 首次回覆時間
  sheet.getRange(rowIndex, 17).setValue(now);                                         // Q: 最後更新
  sheet.getRange(rowIndex, 18).setValue(data.reply_content || '');                   // R: 完整回覆內容
  sheet.getRange(rowIndex, 19).setValue(data.reply_photo1 || '');                    // S: 處理照片1
  sheet.getRange(rowIndex, 20).setValue(data.reply_photo2 || '');                    // T: 處理照片2
  sheet.getRange(rowIndex, 21).setValue(data.reply_photo3 || '');                    // U: 處理照片3
  sheet.getRange(rowIndex, 22).setValue(data.handler || '');                         // V: 承辦人
  sheet.getRange(rowIndex, 23).setValue(data.PS || '');                              // W: 備註
  sheet.getRange(rowIndex, 24).setValue(data.public ? '是' : '否');                 // X: 公開
  sheet.getRange(rowIndex, 25).setValue(data.public_title || '');                    // Y: 公開主旨
  sheet.getRange(rowIndex, 26).setValue(data.public_category || '');                 // Z: 公開類別
  sheet.getRange(rowIndex, 27).setValue(data.public_location || '');                 // AA: 公開地點
  sheet.getRange(rowIndex, 28).setValue(data.public_content || '');                  // AB: 公開摘要

  return output({ success: true });
}

function output(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
