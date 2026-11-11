/**
 * ส่งข้อความจากแอป "Change Request Tracker" เข้า LINE — สำหรับวางเพิ่มในโปรเจกต์ของแมวส้ม
 * (สคริปต์ที่ผูกกับชีต) ไฟล์นี้ไม่มี token: แมวส้มใช้ token ของตัวเองจาก Script Properties
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ในโปรเจกต์แมวส้ม):
 *  1. Extensions → Apps Script ของชีต → เพิ่มไฟล์ใหม่ วางโค้ดนี้ทั้งไฟล์ → บันทึก
 *  2. Project Settings → Script Properties เพิ่ม 2 ค่า:
 *       LINE_CHANNEL_TOKEN = Channel access token ของแมวส้ม
 *       LINE_NOTIFY_TO     = ID กลุ่ม LINE ที่จะส่ง (ขึ้นต้นด้วย C) หรือ ID คน (ขึ้นต้นด้วย U)
 *  3. Triggers → Add Trigger → sendAppNotifications → Time-driven → Minutes timer → Every 15 minutes
 *     (หรือเรียก sendAppNotifications() ต่อท้ายฟังก์ชันที่แมวส้มรันทุก 15 นาทีอยู่แล้ว)
 *  4. ทดสอบ: ในแอปไปที่ "จัดการสิทธิ์" → "ส่งสรุปตอนนี้ (ทดสอบ)" แล้วรันฟังก์ชันนี้ 1 ครั้ง
 *
 * การทำงาน: อ่านชีต _app_notify แถวที่สถานะ "รอส่ง" → ส่งทีละข้อความ → เปลี่ยนเป็น "ส่งแล้ว"
 * พร้อมเวลา หรือ "ส่งไม่สำเร็จ" พร้อมสาเหตุ (ไม่ส่งซ้ำ) ส่งไม่เกิน 10 ข้อความต่อรอบ
 */
function sendAppNotifications() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_CHANNEL_TOKEN');
  var to = props.getProperty('LINE_NOTIFY_TO');
  if (!token || !to) {
    console.warn('sendAppNotifications: ยังไม่ได้ตั้ง LINE_CHANNEL_TOKEN / LINE_NOTIFY_TO ใน Script Properties');
    return;
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_app_notify');
  if (!sheet) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // another run is sending
  try {
    var data = sheet.getDataRange().getValues();
    var COL = { text: 3, status: 4, sentAt: 5, note: 6 }; // id, สร้างเมื่อ, ประเภท, ข้อความ, สถานะ, ส่งเมื่อ, หมายเหตุ
    var sent = 0;
    for (var i = 1; i < data.length && sent < 10; i++) {
      if (data[i][COL.status] !== 'รอส่ง') continue;
      // only messages the app itself queues (a hand-typed row in the sheet is not sent to LINE)
      if (!/^digest(-now)?:[\d -:]+#\d+$/.test(String(data[i][0]))) continue;
      var text = String(data[i][COL.text] || '').slice(0, 5000);
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true,
      });
      var ok = res.getResponseCode() === 200;
      var now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm:ss');
      sheet
        .getRange(i + 1, COL.status + 1, 1, 3)
        .setValues([[ok ? 'ส่งแล้ว' : 'ส่งไม่สำเร็จ', now, ok ? '' : 'LINE ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200)]]);
      sent++;
    }
  } finally {
    lock.releaseLock();
  }
}
