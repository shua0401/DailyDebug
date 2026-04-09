// Google Apps Script for Daily Debug
// 再デプロイしてください（IT/英語/筋トレごとの最低限・ボーナス列）

const SHEET_NAME = 'DailyDebug';
const NEW_HEADERS = [
  '日付', 'IT', '英語', '筋トレ',
  'IT最低限', 'ITボーナス', '英語最低限', '英語ボーナス', '筋トレ最低限', '筋トレボーナス',
  'タイムスタンプ'
];

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    writeNewHeader(sheet);
    return sheet;
  }

  migrateSheetIfLegacy(sheet);
  return sheet;
}

function writeNewHeader(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, NEW_HEADERS.length).setValues([NEW_HEADERS]);
  styleHeader(sheet);
}

function styleHeader(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, NEW_HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#00d4ff');
  headerRange.setFontColor('#ffffff');
}

function isV3Header(sheet) {
  return sheet.getRange(1, 5).getValue() === 'IT最低限';
}

/**
 * 空シート・旧スコア列・旧7列(IT+単一最低限/ボーナス)を v3 に揃える
 */
function migrateSheetIfLegacy(sheet) {
  if (sheet.getLastRow() === 0) {
    writeNewHeader(sheet);
    return;
  }

  if (isV3Header(sheet)) return;

  var secondHeader = sheet.getRange(1, 2).getValue();

  if (secondHeader === 'IT') {
    migrateItSevenColToV3(sheet);
    return;
  }

  if (secondHeader === 'スコア') {
    migrateScoreToV3(sheet);
    return;
  }

  writeNewHeader(sheet);
}

function migrateItSevenColToV3(sheet) {
  if (isV3Header(sheet)) return;

  var values = sheet.getDataRange().getValues();
  var body = values.slice(1);
  writeNewHeader(sheet);
  if (body.length === 0) return;

  var newRows = body.map(function (row) {
    var min = cellToBool(row[4]);
    var bonus = cellToBool(row[5]);
    return [
      row[0],
      row[1] != null ? String(row[1]) : '',
      row[2] != null ? String(row[2]) : '',
      row[3] != null ? String(row[3]) : '',
      min, bonus, min, bonus, min, bonus,
      row[6] || ''
    ];
  });
  sheet.getRange(2, 1, 1 + newRows.length, NEW_HEADERS.length).setValues(newRows);
  sheet.autoResizeColumns(1, NEW_HEADERS.length);
}

function migrateScoreToV3(sheet) {
  var values = sheet.getDataRange().getValues();
  var body = values.slice(1);
  writeNewHeader(sheet);
  if (body.length === 0) return;

  var newRows = body.map(function (row) {
    return [
      row[0],
      row[2] || '',
      '',
      '',
      false, false, false, false, false, false,
      row[3] || ''
    ];
  });
  sheet.getRange(2, 1, 1 + newRows.length, NEW_HEADERS.length).setValues(newRows);
  sheet.autoResizeColumns(1, NEW_HEADERS.length);
}

/** 日付列: スクリプトのタイムゾーン設定に依存させず日本の暦日に統一 */
function formatDateCellForApi(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/M/d');
  }
  return v;
}

function formatTimestampCellForApi(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  }
  return v != null ? String(v) : '';
}

function rowToJson(row) {
  if (row[0] === '' || row[0] == null) return null;

  if (row.length >= 11) {
    return {
      date: formatDateCellForApi(row[0]),
      backlog_it: row[1] != null ? String(row[1]) : '',
      backlog_en: row[2] != null ? String(row[2]) : '',
      backlog_training: row[3] != null ? String(row[3]) : '',
      min_it: cellToBool(row[4]),
      bonus_it: cellToBool(row[5]),
      min_en: cellToBool(row[6]),
      bonus_en: cellToBool(row[7]),
      min_training: cellToBool(row[8]),
      bonus_training: cellToBool(row[9]),
      timestamp: formatTimestampCellForApi(row[10])
    };
  }

  if (row.length >= 7) {
    var min = cellToBool(row[4]);
    var bonus = cellToBool(row[5]);
    return {
      date: formatDateCellForApi(row[0]),
      backlog_it: row[1] != null ? String(row[1]) : '',
      backlog_en: row[2] != null ? String(row[2]) : '',
      backlog_training: row[3] != null ? String(row[3]) : '',
      min_it: min,
      bonus_it: bonus,
      min_en: min,
      bonus_en: bonus,
      min_training: min,
      bonus_training: bonus,
      timestamp: formatTimestampCellForApi(row[6])
    };
  }

  if (row.length >= 4) {
    return {
      date: formatDateCellForApi(row[0]),
      backlog_it: row[2] || '',
      backlog_en: '',
      backlog_training: '',
      min_it: false,
      bonus_it: false,
      min_en: false,
      bonus_en: false,
      min_training: false,
      bonus_training: false,
      timestamp: formatTimestampCellForApi(row[3])
    };
  }

  return null;
}

function cellToBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === 'string') {
    var t = v.toUpperCase();
    return t === 'TRUE' || t === '1' || t === 'はい';
  }
  return false;
}

function doGet(e) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return jsonOut({ success: true, data: [] });
    }

    const rows = data.slice(1);
    const jsonData = rows
      .map(rowToJson)
      .filter(function (x) { return x != null; });

    jsonData.reverse();

    return jsonOut({ success: true, data: jsonData });
  } catch (error) {
    return jsonOut({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    if (!e.postData || e.postData.contents === undefined || e.postData.contents === '') {
      throw new Error('POST本文がありません（WebアプリのURL・POSTメソッドを確認してください）');
    }
    var requestData = JSON.parse(e.postData.contents);
    var date = requestData.date;
    var backlog_it = requestData.backlog_it != null ? String(requestData.backlog_it) : '';
    var backlog_en = requestData.backlog_en != null ? String(requestData.backlog_en) : '';
    var backlog_training = requestData.backlog_training != null ? String(requestData.backlog_training) : '';
    var min_it = !!requestData.min_it;
    var bonus_it = !!requestData.bonus_it;
    var min_en = !!requestData.min_en;
    var bonus_en = !!requestData.bonus_en;
    var min_training = !!requestData.min_training;
    var bonus_training = !!requestData.bonus_training;

    if (!date) {
      throw new Error('日付が必要です');
    }

    var hasText = backlog_it.trim() !== '' || backlog_en.trim() !== '' || backlog_training.trim() !== '';
    var hasMark = min_it || bonus_it || min_en || bonus_en || min_training || bonus_training;
    if (!hasText && !hasMark) {
      throw new Error('入力内容がありません');
    }

    const sheet = getSheet();
    var timestamp = new Date().toLocaleString('ja-JP');

    sheet.appendRow([
      date,
      backlog_it,
      backlog_en,
      backlog_training,
      min_it,
      bonus_it,
      min_en,
      bonus_en,
      min_training,
      bonus_training,
      timestamp
    ]);

    if (sheet.getLastRow() === 2) {
      sheet.autoResizeColumns(1, NEW_HEADERS.length);
    }

    return jsonOut({
      success: true,
      message: 'データを保存しました',
      data: {
        date: date,
        backlog_it: backlog_it,
        backlog_en: backlog_en,
        backlog_training: backlog_training,
        min_it: min_it,
        bonus_it: bonus_it,
        min_en: min_en,
        bonus_en: bonus_en,
        min_training: min_training,
        bonus_training: bonus_training,
        timestamp: timestamp
      }
    });
  } catch (error) {
    return jsonOut({ success: false, error: error.toString() });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testGetData() {
  Logger.log(doGet({}).getContent());
}

function testPostData() {
  var testData = {
    postData: {
      contents: JSON.stringify({
        date: '2026/4/7',
        backlog_it: 'コード',
        backlog_en: 'リーディング',
        backlog_training: 'スクワット',
        min_it: true,
        bonus_it: false,
        min_en: false,
        bonus_en: true,
        min_training: true,
        bonus_training: false
      })
    }
  };
  Logger.log(doPost(testData).getContent());
}
