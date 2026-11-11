/* Browser mock of google.script.run for the local preview and Playwright E2E.
 * Mirrors the server contract (contracts/server-api.md) using the same Domain rules.
 * URL options: ?viewer=1 (view-only user), ?latency=ms, ?fail=bootstrap (simulate a server error).
 */
(function () {
  'use strict';
  var fx = window.__FIXTURE__;
  var D = window.Domain;
  var params = new URLSearchParams(location.search);
  var rows = fx.rows.map(function (r) {
    return Object.assign({}, r);
  });
  var options = Object.assign({ status: D.WORKFLOW.slice() }, fx.options);
  var reason =
    params.get('viewer') === '1'
      ? 'SHEET_VIEW_ONLY'
      : params.get('notallowed') === '1'
        ? 'NOT_ALLOWED'
        : 'OK';
  var user = {
    email: 'tester@example.com',
    name: null,
    canEdit: reason === 'OK',
    editReason: reason,
    isAdmin: reason === 'OK',
  };
  var ROLES = ['ผู้ดูแล', 'ผู้แก้ไข'];
  var STATES = { allowed: 'อนุญาต', pending: 'รออนุมัติ', suspended: 'ระงับ' };
  var members = [
    { email: 'tester@example.com', name: 'ผู้ทดสอบ', note: '', role: 'ผู้ดูแล', status: 'อนุญาต' },
    { email: 'dev1@example.com', name: 'นักพัฒนา แดง', note: '', role: 'ผู้แก้ไข', status: 'อนุญาต' },
    { email: 'newbie@example.com', name: 'คนใหม่', note: 'ทีมทดสอบ', role: 'ผู้แก้ไข', status: 'รออนุมัติ' },
  ];
  window.__mockAccess = members;
  var latency = Number(params.get('latency') || 250);
  var MSG = {
    FORBIDDEN: 'บัญชีของคุณมีสิทธิ์ดูอย่างเดียว จึงเพิ่มหรือแก้ไขรายการไม่ได้',
    VALIDATION: 'กรุณาตรวจสอบข้อมูลที่กรอกอีกครั้ง',
    NOT_FOUND: 'ไม่พบรายการนี้ในชีตแล้ว กรุณาโหลดข้อมูลใหม่',
    SEQ_MISMATCH:
      'แถวนี้ถูกย้ายหรือมีการเรียงข้อมูลใหม่ในชีต (เลขลำดับไม่ตรง) ระบบจึงไม่บันทึกทับ กรุณาโหลดข้อมูลใหม่แล้วแก้ไขอีกครั้ง',
    CONFLICT: 'มีคนแก้ไขรายการนี้ไปก่อนหน้าคุณ ระบบจึงไม่บันทึกทับ กรุณาโหลดข้อมูลใหม่แล้วตรวจสอบอีกครั้ง',
    SEQ_INVALID: 'รายการนี้ไม่มีเลขลำดับหรือเลขลำดับซ้ำกับแถวอื่น กรุณาแก้เลขลำดับในชีตก่อน',
    ERROR: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่',
  };
  var ok = function (data) {
    return { ok: true, data: data };
  };
  var fail = function (code, details) {
    return { ok: false, code: code, message: MSG[code], details: details };
  };
  var pad = function (n) {
    return n < 10 ? '0' + n : String(n);
  };
  var now = function () {
    var t = new Date();
    return (
      t.getDate() +
      '/' +
      (t.getMonth() + 1) +
      '/' +
      t.getFullYear() +
      ' ' +
      pad(t.getHours()) +
      ':' +
      pad(t.getMinutes())
    );
  };

  // Expose for tests: simulate someone editing the sheet directly.
  window.__mockSheet = {
    rows: rows,
    edit: function (seq, key, value) {
      rows.filter(function (r) {
        return r.seq === String(seq);
      })[0][key] = value;
    },
    sort: function () {
      rows.reverse();
      rows.forEach(function (r, i) {
        r.rowNumber = i + 2;
      });
    },
  };

  var handlers = {
    Api_bootstrap: function () {
      if (params.get('fail') === 'bootstrap')
        return {
          ok: false,
          code: 'NO_ACCESS',
          message: 'บัญชีนี้ไม่มีสิทธิ์เปิดชีตข้อมูล กรุณาขอสิทธิ์จาก PM เจ้าของชีต แล้วเปิดแอปใหม่',
        };
      return ok({
        loadedAt: now(),
        today: fx.today,
        user: user,
        schema: { ok: true, missing: [] },
        options: options,
        rows: rows.filter(function (r) {
          return String(r.detail || '').trim();
        }),
        spreadsheetName: '[ตัวอย่าง] ข้อมูลจำลอง ไม่ใช่ข้อมูลจริง',
      });
    },
    Api_createRequest: function (input) {
      if (!user.canEdit) return fail('FORBIDDEN');
      var v = D.validateCreate(input, options);
      if (!v.ok) return fail('VALIDATION', { fields: v.errors });
      var seq = D.nextSeq(
        rows.map(function (r) {
          return { seq: parseInt(r.seq, 10) || null };
        }),
      );
      var row = Object.assign({ rowNumber: rows.length + 2, seq: String(seq) }, input);
      rows.push(row);
      return ok({ rowNumber: row.rowNumber, seq: seq });
    },
    Api_updateRequest: function (req) {
      if (!user.canEdit) return fail('FORBIDDEN');
      var row = rows.filter(function (r) {
        return r.rowNumber === req.rowNumber;
      })[0];
      if (!row) return fail('NOT_FOUND');
      if (String(row.seq) !== String(req.seq)) return fail('SEQ_MISMATCH');
      if (
        rows.filter(function (r) {
          return String(r.seq) === String(req.seq);
        }).length > 1
      )
        return fail('SEQ_INVALID');
      var conflicts = {};
      Object.keys(req.changes).forEach(function (k) {
        if (String(row[k] || '').trim() !== String(req.changes[k].from || '').trim())
          conflicts[k] = { expected: req.changes[k].from, actual: row[k] };
      });
      if (Object.keys(conflicts).length) return fail('CONFLICT', conflicts);
      var v = D.validateUpdate(req.changes, row, options);
      if (!v.ok) return fail('VALIDATION', { fields: v.errors });
      Object.keys(req.changes).forEach(function (k) {
        row[k] = req.changes[k].to;
      });
      return ok({ rowNumber: row.rowNumber, seq: Number(row.seq), written: Object.keys(req.changes) });
    },
    Api_requestAccess: function () {
      user.editReason = 'PENDING';
      return ok({ status: STATES.pending });
    },
    Api_listAccess: function () {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      return ok({
        members: members.map(function (m) {
          return Object.assign({}, m);
        }),
        owner: 'owner@example.com',
        roles: ROLES,
        states: STATES,
      });
    },
    Api_saveAccess: function (input) {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email || ''))
        return {
          ok: false,
          code: 'VALIDATION',
          message: 'กรุณาตรวจสอบข้อมูลที่กรอกอีกครั้ง',
          details: { fields: { email: 'อีเมลไม่ถูกต้อง' } },
        };
      var m = members.filter(function (x) {
        return x.email === input.email.toLowerCase();
      })[0];
      if (!m) {
        m = {
          email: input.email.toLowerCase(),
          name: '',
          note: '',
          role: 'ผู้แก้ไข',
          status: STATES.allowed,
        };
        members.push(m);
      }
      ['name', 'note', 'role', 'status'].forEach(function (k) {
        if (input[k] !== undefined) m[k] = input[k];
      });
      return ok(Object.assign({}, m));
    },
    Api_repairChips: function () {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      return ok({ repaired: 3, skipped: 1 });
    },
    Api_setMyName: function (name) {
      user.name = name;
      return ok({ name: name });
    },
  };

  function runner(success, failure) {
    return new Proxy(
      {},
      {
        get: function (_, prop) {
          if (prop === 'withSuccessHandler')
            return function (fn) {
              return runner(fn, failure);
            };
          if (prop === 'withFailureHandler')
            return function (fn) {
              return runner(success, fn);
            };
          return function (arg) {
            setTimeout(function () {
              try {
                var res = JSON.parse(JSON.stringify(handlers[prop](arg)));
                if (success) success(res);
              } catch (e) {
                if (failure) failure(e);
              }
            }, latency);
          };
        },
      },
    );
  }

  window.google = { script: { run: runner(null, null) } };

  // ?gas=1 simulates the real Apps Script sandbox: the app lives in an iframe, the visible URL belongs to
  // the outer page, and navigation must go through google.script.history / google.script.url.
  if (params.get('gas') === '1') {
    var changeHandler = null;
    window.__gasHistory = [];
    window.google.script.history = {
      push: function (state, query, hash) {
        window.__gasHistory.push(hash);
      },
      replace: function (state, query, hash) {
        window.__gasHistory.push(hash);
      },
      setChangeHandler: function (fn) {
        changeHandler = fn;
      },
    };
    window.google.script.url = {
      getLocation: function (cb) {
        setTimeout(function () {
          cb({ hash: params.get('hash') || '', parameter: {}, parameters: {} });
        }, 0);
      },
    };
    window.__gasBack = function (hash) {
      if (changeHandler)
        changeHandler({ state: null, location: { hash: hash, parameter: {}, parameters: {} } });
    };
    // In the sandbox, a link to "#/…" with <base target="_top"> would leave the iframe: treat that as a failure.
    window.__leftIframe = false;
    window.addEventListener('beforeunload', function () {
      window.__leftIframe = true;
    });
  }
})();
