/* Browser mock of google.script.run for the local preview and Playwright E2E.
 * Mirrors the server contract (contracts/server-api.md) using the same Domain rules.
 * URL options: ?viewer=1 (view-only user), ?latency=ms, ?fail=bootstrap (simulate a server error),
 * ?presence=editing (a fake teammate is editing item 1),
 * ?notester=1 (sheet without the optional ผู้ทดสอบ column), ?sharefail=1 (sharing the sheet fails),
 * ?notaiga=1 (the bot's Taiga log is missing).
 */
(function () {
  'use strict';
  var fx = window.__FIXTURE__;
  var D = window.Domain;
  var params = new URLSearchParams(location.search);
  var rows = fx.rows.map(function (r) {
    return Object.assign({}, r);
  });
  if (typeof window.__beforeMock === 'function') window.__beforeMock(rows); // tests can shape the data first
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
  // in-memory _app_log / _app_notify (history, restore, LINE queue)
  var log = [];
  var notify = [];
  window.__mockLog = log;
  window.__mockNotify = notify;
  var stamp = function () {
    return D.formatDate(fx.today) + ' 10:' + String(10 + log.length).slice(-2) + ':00'; // the fixture's today
  };
  var latency = Number(params.get('latency') || 250);
  // the remembered-copy start (App.html showSnapshot) is off unless a test asks for it
  window.__mockNoSnapshot = params.get('snapshot') !== '1';
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

  // Taiga events the bot would have logged; tests set window.__taigaEvents / __taigaMap in __beforeMock
  var taigaPairs = Object.keys(window.__taigaMap || {}).map(function (k) {
    return { taiga: k, app: window.__taigaMap[k] };
  });
  var taigaEvents =
    window.__taigaEvents ||
    rows
      .filter(function (r) {
        return D.isOpen(r.status) && D.taigaKey((r.ticketLinks || [])[0] || r.ticket);
      })
      .reverse() // the newest items are on the first page
      .slice(0, 12)
      .map(function (r, i) {
        return {
          kind: 'สถานะ',
          link: (r.ticketLinks || [])[0] || r.ticket,
          from: 'New',
          to: ['In progress', 'Ready for test', 'Done'][i % 3],
          by: 'ผู้ใช้ Taiga',
          at: Date.now() - i * 3600000,
        };
      });

  var statusTaiga = Object.assign({}, window.__statusTaiga);

  // A pretend Taiga server: requests to its host are answered here and never leave the browser.
  var TAIGA_HOST = 'taiga.example';
  window.__taigaLog = [];
  var taiga = (window.__taiga = {
    token: 'mock-token',
    denied: false,
    calls: [],
    items: {},
    statuses: Object.keys(D.TAIGA_DEFAULT_MAP).concat('Ready', 'Strange'),
  });
  taigaEvents.forEach(function (e, i) {
    var key = D.taigaKey(e.link);
    if (key) taiga.items[key.split('/').slice(1).join('/')] = { id: 100 + i, version: 1, status: e.to };
  });
  var realFetch = window.fetch;
  window.fetch = function (url, o) {
    var base = 'https://' + TAIGA_HOST + '/api/v1/';
    if (String(url).indexOf(base) !== 0) return realFetch.apply(window, arguments);
    var u = new URL(url);
    var path = u.pathname.replace('/api/v1/', '');
    var body = o.body ? JSON.parse(o.body) : {};
    taiga.calls.push({ method: o.method, path: path });
    var reply = function (status, data) {
      return Promise.resolve(new Response(JSON.stringify(data), { status: status }));
    };
    if (path === 'auth') {
      if (body.password === 'wrong') return reply(401, { _error_message: 'bad' });
      return reply(200, { auth_token: taiga.token, full_name_display: 'คนใช้ Taiga' });
    }
    if (o.headers.Authorization !== 'Bearer ' + taiga.token) return reply(401, {});
    if (taiga.denied) return reply(403, {});
    if (path === 'resolver') {
      var type = ['us', 'task', 'issue', 'epic'].filter(function (t) {
        return u.searchParams.get(t);
      })[0];
      var hit = taiga.items[u.searchParams.get('project') + '/' + type + '/' + u.searchParams.get(type)];
      if (!hit) return reply(404, {});
      var res = { project: 1 };
      res[type] = hit.id;
      return reply(200, res);
    }
    if (/-statuses$/.test(path))
      return reply(
        200,
        taiga.statuses.map(function (n, i) {
          return { id: i + 1, name: n, is_closed: n === 'Done' || n === 'Archived' };
        }),
      );
    var id = Number(path.split('/')[1]);
    var item = Object.keys(taiga.items)
      .map(function (k) {
        return taiga.items[k];
      })
      .filter(function (x) {
        return x.id === id;
      })[0];
    if (!item) return reply(404, {});
    if (o.method === 'PATCH') {
      if (body.version !== item.version)
        return reply(400, { version: ['The version parameter is not valid'] });
      item.status = taiga.statuses[body.status - 1];
      item.version++;
    }
    return reply(200, {
      id: item.id,
      project: 1,
      version: item.version,
      status: taiga.statuses.indexOf(item.status) + 1,
      status_extra_info: { name: item.status },
    });
  };

  var handlers = {
    Api_taiga: function () {
      if (params.get('notaiga')) return ok({ available: false, latest: {}, statuses: [], map: {} });
      var statuses = taigaEvents
        .map(function (e) {
          return e.to;
        })
        .filter(function (s, i, a) {
          return a.indexOf(s) === i;
        });
      return ok({
        available: true,
        latest: D.taigaLatest(taigaEvents),
        statuses: statuses,
        map: D.taigaEffectiveMap(statuses, taigaPairs),
        appMap: Object.assign({}, statusTaiga),
        host: TAIGA_HOST,
      });
    },
    Api_taigaPushCheck: function (req) {
      var r = rows.filter(function (x) {
        return x.rowNumber === req.rowNumber;
      })[0];
      if (!r) return fail('NOT_FOUND');
      if (Number(r.seq) !== Number(req.seq)) return fail('SEQ_MISMATCH');
      if (r.status !== req.status) return fail('CONFLICT');
      return ok({});
    },
    Api_logTaigaPush: function (req) {
      window.__taigaLog.push(req);
      return ok({});
    },
    Api_saveStatusTaiga: function (input) {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      if (D.WORKFLOW.indexOf(input.app) === -1) return fail('VALIDATION');
      if (input.taiga) statusTaiga[input.app] = input.taiga;
      else delete statusTaiga[input.app];
      return ok({ app: input.app, taiga: input.taiga });
    },
    Api_saveTaigaMap: function (input) {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      if (input.app && D.WORKFLOW.indexOf(input.app) === -1) return fail('VALIDATION');
      taigaPairs.push({ taiga: input.taiga, app: input.app });
      return ok({ taiga: input.taiga, app: input.app });
    },
    Api_heartbeat: function (input) {
      window.__heartbeats = (window.__heartbeats || 0) + 1;
      var me = {
        email: user.email,
        name: user.name || 'ผู้ทดสอบ',
        view: input.view,
        seq: input.seq === undefined ? null : input.seq,
      };
      var others = [
        { email: 'dev@example.com', name: 'นักพัฒนา แดง', view: 'kanban', seq: null },
        params.get('presence') === 'editing'
          ? { email: 'pm@example.com', name: 'พีเอ็ม สมใจ', view: 'edit', seq: 1 }
          : { email: 'pm@example.com', name: 'พีเอ็ม สมใจ', view: 'items', seq: null },
      ];
      return ok({ nowMs: Date.now(), online: [me].concat(others) });
    },
    Api_bootstrap: function () {
      if (params.get('fail') === 'bootstrap')
        return {
          ok: false,
          code: 'NO_ACCESS',
          message: 'บัญชีนี้ไม่มีสิทธิ์เปิดชีตข้อมูล กรุณาขอสิทธิ์จาก PM เจ้าของชีต แล้วเปิดแอปใหม่',
        };
      if (window.__mockUserName) user.name = window.__mockUserName; // name set by the admin (2026-11-20)
      return ok({
        loadedAt: now(),
        today: fx.today,
        user: user,
        schema: { ok: true, missing: [], absent: params.get('notester') ? ['tester'] : [] },
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
        log.push({
          time: stamp(),
          who: 'ผู้ทดสอบ',
          action: 'UPDATE',
          seq: Number(row.seq),
          column: D.COLUMN_BY_KEY[k].header,
          from: row[k] || '',
          to: req.changes[k].to,
        });
        row[k] = req.changes[k].to;
      });
      return ok({ rowNumber: row.rowNumber, seq: Number(row.seq), written: Object.keys(req.changes) });
    },
    Api_deleteRequest: function (req) {
      if (!user.canEdit) return fail('FORBIDDEN');
      var idx = rows.findIndex(function (r) {
        return r.rowNumber === req.rowNumber;
      });
      if (idx === -1) return fail('NOT_FOUND');
      var row = rows[idx];
      if (String(row.seq) !== String(req.seq)) return fail('SEQ_MISMATCH');
      var conflicts = {};
      Object.keys(req.snapshot || {}).forEach(function (k) {
        if (String(row[k] || '').trim() !== String(req.snapshot[k] || '').trim())
          conflicts[k] = { expected: req.snapshot[k], actual: row[k] };
      });
      if (Object.keys(conflicts).length) return fail('CONFLICT', conflicts);
      rows.splice(idx, 1);
      log.push({
        time: stamp(),
        who: 'ผู้ทดสอบ',
        action: 'DELETE',
        seq: Number(row.seq),
        column: '(ทั้งแถว)',
        from: '',
        to: '',
        saved: row,
      });
      rows.forEach(function (r) {
        if (r.rowNumber > req.rowNumber) r.rowNumber -= 1; // rows below move up, like Sheets
      });
      return ok({ rowNumber: req.rowNumber, seq: Number(req.seq) });
    },
    Api_itemHistory: function (seq) {
      return ok(
        log
          .filter(function (e) {
            return e.seq === Number(seq);
          })
          .slice()
          .reverse()
          .map(function (e) {
            return { time: e.time, who: e.who, action: e.action, column: e.column, from: e.from, to: e.to };
          }),
      );
    },
    Api_activity: function (input) {
      var day = D.parseDate(input && input.date).date;
      if (!day) return fail('VALIDATION');
      var range = { from: D.weekRange(day).from, to: day };
      return ok({
        log: log.filter(function (e) {
          var t = D.logTime(e.time);
          return t && D.inRange(t.date, range);
        }),
        taiga: taigaEvents.filter(function (e) {
          var t = D.bangkokTime(e.at);
          return t && D.inRange(t.date, range);
        }),
      });
    },
    Api_listDeleted: function () {
      if (!user.isAdmin) return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้น' };
      return ok(
        log
          .map(function (e, i) {
            return { e: e, logRow: i + 2 };
          })
          .filter(function (x) {
            return (
              x.e.action === 'DELETE' &&
              !rows.some(function (r) {
                return Number(r.seq) === x.e.seq;
              })
            );
          })
          .reverse()
          .map(function (x) {
            return {
              logRow: x.logRow,
              time: x.e.time,
              who: x.e.who,
              seq: x.e.seq,
              detail: x.e.saved.detail,
              status: x.e.saved.status,
            };
          }),
      );
    },
    Api_restoreRequest: function (logRow) {
      if (!user.isAdmin) return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้น' };
      var e = log[logRow - 2];
      if (!e || e.action !== 'DELETE') return fail('NOT_FOUND');
      if (
        rows.some(function (r) {
          return Number(r.seq) === e.seq;
        })
      )
        return { ok: false, code: 'SEQ_TAKEN', message: 'เลขลำดับนี้ถูกใช้แล้ว' };
      var back = Object.assign({}, e.saved, { rowNumber: rows.length + 2 });
      rows.push(back);
      log.push({
        time: stamp(),
        who: 'ผู้ทดสอบ',
        action: 'RESTORE',
        seq: e.seq,
        column: '(ทั้งแถว)',
        from: '',
        to: '',
      });
      return ok({ rowNumber: back.rowNumber, seq: e.seq });
    },
    Api_queueDigestNow: function () {
      if (!user.isAdmin) return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้น' };
      var t = fx.today;
      var msgs = D.buildDigest(
        rows.map(function (r) {
          return D.enrich(r, t);
        }),
        t,
        { appUrl: 'https://nuchanarts.github.io/Change-Request-Tracker/' },
      );
      msgs.forEach(function (m) {
        notify.push(m);
      });
      return ok({ added: msgs.length });
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
          isNew: true,
        };
        members.push(m);
      }
      var wasActive = m.status === STATES.allowed && !m.isNew;
      delete m.isNew;
      ['name', 'note', 'role', 'status'].forEach(function (k) {
        if (input[k] !== undefined) m[k] = input[k];
      });
      var out = Object.assign({}, m);
      var isActive = m.status === STATES.allowed;
      if (isActive !== wasActive)
        out.shared = params.get('sharefail') ? 'failed' : isActive ? 'added' : 'removed';
      return ok(out);
    },
    Api_shareAll: function () {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      return ok({ added: 1, already: 1, failed: [] });
    },
    Api_repairChips: function () {
      if (!user.isAdmin)
        return { ok: false, code: 'NOT_ADMIN', message: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการสิทธิ์ได้' };
      return ok({ repaired: 3, skipped: 1, rows: 2 });
    },
    Api_setMyName: function (name) {
      (window.__setMyNameCalls = window.__setMyNameCalls || []).push(name);
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
