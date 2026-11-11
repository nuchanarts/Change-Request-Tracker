// @ts-check
/**
 * Integration tests that run INSIDE Apps Script against a [TEST] copy of the spreadsheet (constitution X).
 * Pushed only by `npm run push:test` (build --with-integration); never part of the production build.
 * Run `runIntegrationTests` from the TEST project's editor and read the execution log.
 */
function runIntegrationTests() {
  var ctx = context_();
  if (!ctx.ok) throw new Error('context: ' + JSON.stringify(ctx));
  var name = ctx.ss.getName();
  if (name.indexOf('[TEST]') !== 0) {
    throw new Error(
      'หยุด: ชีต "' + name + '" ไม่ได้ขึ้นต้นด้วย [TEST] — integration test รันได้กับสำเนาเท่านั้น',
    );
  }
  var repo = ctx.repo;
  var email = ctx.email || 'integration-test';
  var results = [];
  var check = function (label, cond, detail) {
    results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : ' → ' + JSON.stringify(detail)));
  };
  var sheet = ctx.ss.getSheetByName(Config.SHEETS.main);
  var logRows = function () {
    var log = ctx.ss.getSheetByName(Config.SHEETS.log);
    return log ? log.getLastRow() : 0;
  };

  // 1. read
  var data = repo.readAll();
  check('อ่านชีตได้และหัวคอลัมน์ครบ', data.missing.length === 0 && data.rows.length > 0, data.missing);
  var options = repo.options(data.rows);
  check(
    'มีตัวเลือกทุกช่อง',
    options.platform.length && options.issueType.length && options.person.length,
    options,
  );

  // 2. create
  var input = {
    platform: options.platform[0],
    issueType: options.issueType[0],
    urgency: options.urgency[options.urgency.length - 1],
    status: Domain.DEFAULT_STATUS,
    system: options.system[0],
    detail: '[TEST] integration ' + new Date().toISOString(),
    pm: options.pm[0],
    dueDate: '31/12/2026',
  };
  var v = Domain.validateCreate(input, options);
  check('ข้อมูลทดสอบผ่าน validation', v.ok, v.errors);
  var logBefore = logRows();
  var maxSeq =
    Domain.nextSeq(
      data.rows.map(function (r) {
        return { seq: parseInt(r.seq, 10) || null };
      }),
    ) - 1;
  var created = repo.create(input, email);
  check('สร้างรายการได้', created.ok, created);
  if (!created.ok) return finish_(results);
  var rowNumber = created.data.rowNumber;
  var seq = created.data.seq;
  check('ลำดับ = ค่าสูงสุด + 1', seq >= maxSeq + 1, { seq: seq, maxSeq: maxSeq });
  var saved = repo.readRow(rowNumber);
  check(
    'ค่าที่บันทึกตรงทุกตัวอักษร',
    saved.platform === input.platform && saved.detail === input.detail && saved.pm === input.pm,
    saved,
  );
  check('วันที่แสดงเป็น d/m/yyyy', saved.dueDate === '31/12/2026', saved.dueDate);
  check(
    'มี log ทุกช่องที่สร้าง',
    logRows() - logBefore === Object.keys(input).length + 1,
    logRows() - logBefore,
  );

  // 3. update writes only the changed cell
  var width = sheet.getLastColumn();
  var before = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  var dev = options.developer[0];
  var upd = repo.update(
    { rowNumber: rowNumber, seq: seq, changes: { developer: { from: saved.developer, to: dev } } },
    email,
  );
  check('แก้ไขได้', upd.ok, upd);
  var after = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  var changedCols = before.filter(function (b, i) {
    return b !== after[i];
  }).length;
  check('เขียนเฉพาะช่องที่แก้ (1 ช่อง)', changedCols === 1, { before: before, after: after });

  // 4. guards
  var mismatch = repo.update(
    { rowNumber: rowNumber, seq: seq + 999, changes: { developer: { from: dev, to: '' } } },
    email,
  );
  check('ลำดับไม่ตรง → SEQ_MISMATCH', !mismatch.ok && mismatch.code === 'SEQ_MISMATCH', mismatch);
  var conflict = repo.update(
    { rowNumber: rowNumber, seq: seq, changes: { developer: { from: 'ค่าเก่าที่ไม่ใช่', to: '' } } },
    email,
  );
  check('ค่าเดิมไม่ตรง → CONFLICT', !conflict.ok && conflict.code === 'CONFLICT', conflict);

  // 5. date keeps the column's cell type
  var dateUpd = repo.update(
    { rowNumber: rowNumber, seq: seq, changes: { dueDate: { from: '31/12/2026', to: '30/12/2026' } } },
    email,
  );
  check(
    'แก้วันที่ได้และยังแสดง d/m/yyyy',
    dateUpd.ok && repo.readRow(rowNumber).dueDate === '30/12/2026',
    repo.readRow(rowNumber).dueDate,
  );

  // 6. cleanup: cancel (never delete rows)
  var cancel = repo.update(
    {
      rowNumber: rowNumber,
      seq: seq,
      changes: { status: { from: Domain.DEFAULT_STATUS, to: Domain.CANCELLED } },
    },
    email,
  );
  check('ยกเลิกรายการทดสอบ (สถานะ 0.ยกเลิก)', cancel.ok, cancel);

  return finish_(results);
}

/** @param {string[]} results */
function finish_(results) {
  var failed = results.filter(function (r) {
    return r.indexOf('FAIL') === 0;
  });
  console.log(results.join('\n'));
  console.log(
    failed.length
      ? 'FAILED ' + failed.length + ' / ' + results.length
      : 'ALL PASSED (' + results.length + ')',
  );
  return { passed: results.length - failed.length, failed: failed.length };
}
