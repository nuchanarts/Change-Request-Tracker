// @ts-check
/**
 * Web app entry point and the thin API called from the browser with google.script.run.
 * Each Api_* function: check permission → Domain validation → Repo → Result. Never throws (constitution IX).
 */

/** Serve the single-page app. */
function doGet() {
  var page = HtmlService.createTemplateFromFile('Index');
  // who opened the page: a remembered copy of the data is shown only to the same account (security review 2026-11-20)
  page.viewer = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  return page
    .evaluate()
    .setTitle('ติดตามรายการขอแก้ไขโปรแกรม')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Include another HTML file's content (used by Index.html templates). @param {string} name */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Today in Asia/Bangkok as a date-only value. */
function today_() {
  var p = Utilities.formatDate(new Date(), Config.TZ, 'yyyy-M-d').split('-').map(Number);
  return { y: p[0], m: p[1], d: p[2] };
}

/** Open the configured spreadsheet and build a Repo; returns a Result on configuration/access errors. */
function context_() {
  var id = PropertiesService.getScriptProperties().getProperty(Config.PROP_SPREADSHEET_ID);
  if (!id) return Config.fail('CONFIG');
  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (err) {
    console.warn('openById failed', err);
    return Config.fail('NO_ACCESS');
  }
  var repo = makeRepo({
    ss: ss,
    getLock: function () {
      return LockService.getScriptLock();
    },
    cache: CacheService.getScriptCache(),
    userCache: CacheService.getUserCache(),
    effectiveEmail: function () {
      return Session.getEffectiveUser().getEmail();
    },
    nowMs: function () {
      return Date.now();
    },
    nowText: function () {
      return Utilities.formatDate(new Date(), Config.TZ, 'd/M/yyyy HH:mm:ss');
    },
    makeDate: function (y, m, d) {
      return new Date(y, m - 1, d); // script time zone is Asia/Bangkok (appsscript.json)
    },
  });
  return { ok: true, ss: ss, repo: repo, email: Session.getActiveUser().getEmail() };
}

/**
 * Sheet owner's email ('' when unavailable). getOwner() is a slow Drive call and the owner never changes,
 * so it is kept per request and in the script cache for 6 hours (speed, 2026-11-20). @param {any} ctx
 */
function owner_(ctx) {
  if (ctx.owner !== undefined) return ctx.owner;
  var cache = CacheService.getScriptCache();
  var key = 'bgs_owner:' + ctx.ss.getId();
  var hit = cache.get(key);
  if (hit !== null) return (ctx.owner = hit);
  try {
    ctx.owner = ctx.ss.getOwner().getEmail();
    if (ctx.owner) cache.put(key, ctx.owner, 21600);
  } catch (err) {
    console.warn('getOwner failed (shared drive or no access)', err);
    ctx.owner = '';
  }
  return ctx.owner;
}

/** Sheet edit right + team allowlist (_app_allowed). @param {any} ctx */
function editAccess_(ctx) {
  return ctx.repo.editAccess(ctx.email, owner_(ctx));
}

/** Result to return when the caller may not write, or null when they may. @param {any} ctx */
function denied_(ctx) {
  var access = editAccess_(ctx);
  if (access.canEdit) return null;
  return Config.fail(access.reason === 'SHEET_VIEW_ONLY' ? 'FORBIDDEN' : 'NOT_ALLOWED');
}

/** Run fn with a context; any unexpected error is logged and returned as a Thai message. @param {(ctx:any)=>any} fn */
function guard_(fn) {
  try {
    var ctx = context_();
    if (!ctx.ok) return ctx;
    return fn(ctx);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return Config.fail('ERROR');
  }
}

/** Load everything the page needs in one round trip (constitution XIV). */
function Api_bootstrap() {
  return guard_(function (ctx) {
    var data = ctx.repo.readAll();
    return Config.ok({
      loadedAt: Utilities.formatDate(new Date(), Config.TZ, 'd/M/yyyy HH:mm'),
      today: today_(),
      user: (function () {
        var access = ctx.repo.bootstrapAccess(ctx.email, owner_(ctx));
        return {
          email: ctx.email,
          name: ctx.repo.getUserName(ctx.email),
          canEdit: access.canEdit,
          editReason: access.reason,
          isAdmin: access.isAdmin,
        };
      })(),
      schema: { ok: data.missing.length === 0, missing: data.missing, absent: data.absent || [] },
      options: ctx.repo.options(data.rows),
      rows: data.rows,
      spreadsheetName: ctx.ss.getName(),
    });
  });
}

/**
 * Presence heartbeat (2026-11-18): records what the caller is doing and returns who is online.
 * The email always comes from the session, never from the client. Writes no sheet.
 * @param {{view?: string, seq?: any}} input
 */
function Api_heartbeat(input) {
  return guard_(function (ctx) {
    var view = String((input && input.view) || '').slice(0, 20);
    var seq = input && input.seq !== undefined && input.seq !== null ? Domain.toInt(input.seq) : null;
    return Config.ok(ctx.repo.heartbeat(ctx.email, view, typeof seq === 'number' ? seq : null));
  });
}

/** @param {any} input */
function Api_createRequest(input) {
  return guard_(function (ctx) {
    var denied = denied_(ctx);
    if (denied) return denied;
    var options = ctx.repo.options();
    var v = Domain.validateCreate(input || {}, options);
    if (!v.ok) return Config.fail('VALIDATION', { fields: v.errors });
    return ctx.repo.create(input, ctx.email);
  });
}

/** @param {{rowNumber:number, seq:number, changes:any}} req */
function Api_updateRequest(req) {
  return guard_(function (ctx) {
    var denied = denied_(ctx);
    if (denied) return denied;
    var current = ctx.repo.readRow(Number(req && req.rowNumber));
    if (!current) return Config.fail('NOT_FOUND');
    var options = ctx.repo.options();
    var v = Domain.validateUpdate(req.changes || {}, current, options);
    if (!v.ok) return Config.fail('VALIDATION', { fields: v.errors });
    return ctx.repo.update(req, ctx.email);
  });
}

/**
 * Delete one item row (any editor, user decision 2026-11-11). Repo.remove re-checks ลำดับ and the whole row
 * under the lock and logs a full snapshot to _app_log.
 * @param {{rowNumber:number, seq:number, snapshot:Object<string,string>}} req
 */
function Api_deleteRequest(req) {
  return guard_(function (ctx) {
    var denied = denied_(ctx);
    if (denied) return denied;
    return ctx.repo.remove(req || {}, ctx.email);
  });
}

/** A signed-in person asks for edit access (pending until an admin allows it). @param {{name?:string, note?:string}} input */
function Api_requestAccess(input) {
  return guard_(function (ctx) {
    return ctx.repo.requestAccess(ctx.email, (input && input.name) || '', (input && input.note) || '');
  });
}

/** Latest Taiga statuses from the bot's log (read only) and the status map; same audience as the item list. */
function Api_taiga() {
  return guard_(function (ctx) {
    return Config.ok(ctx.repo.taiga());
  });
}

/** Pair a Taiga status with an app status (admins only; enforced in Repo). @param {any} input */
function Api_saveTaigaMap(input) {
  return guard_(function (ctx) {
    return ctx.repo.saveTaigaMap(ctx.email, owner_(ctx), input || {});
  });
}

/** Pair a sheet status with a Taiga status (admins only; enforced in Repo). @param {any} input */
function Api_saveStatusTaiga(input) {
  return guard_(function (ctx) {
    return ctx.repo.saveStatusTaiga(ctx.email, owner_(ctx), input || {});
  });
}

/** Team list for the admin screen (admins only). */
function Api_listAccess() {
  return guard_(function (ctx) {
    if (!ctx.repo.isAdmin(ctx.email, owner_(ctx))) return Config.fail('NOT_ADMIN');
    return Config.ok({
      members: ctx.repo.listAccess(),
      owner: owner_(ctx),
      roles: [Config.ROLE.admin, Config.ROLE.editor],
      states: Config.ACCESS,
    });
  });
}

/** Add a person or change their role/status (admins only; enforced in Repo). @param {any} input */
function Api_saveAccess(input) {
  return guard_(function (ctx) {
    return ctx.repo.saveAccess(ctx.email, owner_(ctx), input || {});
  });
}

/** Share the sheet with every active member who is not a named editor yet (admins only, 2026-11-18). */
function Api_shareAll() {
  return guard_(function (ctx) {
    return ctx.repo.shareAll(ctx.email, owner_(ctx));
  });
}

/** Admin repair: rewrite dropdown cells written with a leading apostrophe so their chips show colours. */
function Api_repairChips() {
  return guard_(function (ctx) {
    var chips = ctx.repo.repairQuotedOptions(ctx.email, owner_(ctx));
    if (!chips.ok) return chips;
    var look = ctx.repo.repairRowLook(ctx.email, owner_(ctx)); // rows added without colours (2026-11-20)
    if (!look.ok) return look;
    return Config.ok({ repaired: chips.data.repaired, skipped: chips.data.skipped, rows: look.data.rows });
  });
}

/** @param {string} name */
/**
 * Closed (user decision 2026-11-20): people could pick someone else's name. Names are set by an admin in
 * จัดการสิทธิ์. Kept so an old open page gets a clear answer instead of a missing-function error.
 */
function Api_setMyName() {
  return Config.fail('NAME_BY_ADMIN');
}

/**
 * T0 probes (research R6, R8). Run from the Apps Script editor of the TEST project; read-only.
 */
function runProbes() {
  var ctx = context_();
  if (!ctx.ok) return console.log(JSON.stringify(ctx));
  var sh = ctx.ss.getSheetByName(Config.SHEETS.main);
  var range = sh.getDataRange();
  var values = range.getValues();
  var headers = values[0].map(String);
  var report = {
    spreadsheet: ctx.ss.getName(),
    locale: ctx.ss.getSpreadsheetLocale(),
    timeZone: ctx.ss.getSpreadsheetTimeZone(),
    rows: values.length - 1,
    dateColumns: /** @type {any} */ ({}),
    editorsCheck: '',
    me: ctx.email,
  };
  Domain.DATE_KEYS.forEach(function (key) {
    var i = headers.indexOf(Domain.COLUMN_BY_KEY[key].header);
    var counts = { date: 0, text: 0, number: 0, empty: 0 };
    for (var r = 1; r < values.length; r++) {
      var v = values[r][i];
      if (v instanceof Date) counts.date++;
      else if (v === '') counts.empty++;
      else if (typeof v === 'number') counts.number++;
      else counts.text++;
    }
    report.dateColumns[key] = counts;
  });
  try {
    report.editorsCheck =
      'ok: ' +
      ctx.ss.getEditors().length +
      ' editors; canEdit(me)=' +
      ctx.repo.canEdit(ctx.email) +
      '; editAccess=' +
      JSON.stringify(editAccess_(ctx));
  } catch (err) {
    report.editorsCheck = 'getEditors threw: ' + err;
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// ------------------------------------------------------------------ history, restore, LINE digest (2026-11-11)

/** Display name for a log entry: team-list name, else the part before @ (emails are not shown to viewers). @param {any} ctx */
function whoNamer_(ctx) {
  /** @type {Object<string,string>} */
  var names = {};
  (ctx.repo.listAccess() || []).forEach(function (/** @type {any} */ m) {
    if (m.name) names[String(m.email).toLowerCase()] = m.name;
  });
  return function (/** @type {string} */ email) {
    var e = String(email || '').toLowerCase();
    return names[e] || e.split('@')[0] || '–';
  };
}

/** Change history of one item for its detail page (anyone signed in). @param {number} seq */
function Api_itemHistory(seq) {
  return guard_(function (ctx) {
    var name = whoNamer_(ctx);
    return Config.ok(
      ctx.repo.history(Number(seq)).map(function (e) {
        return { time: e.time, who: name(e.who), action: e.action, column: e.column, from: e.from, to: e.to };
      }),
    );
  });
}

/** Deleted items that can be restored (admins only). */
function Api_listDeleted() {
  return guard_(function (ctx) {
    if (!ctx.repo.isAdmin(ctx.email, owner_(ctx))) return Config.fail('NOT_ADMIN');
    var name = whoNamer_(ctx);
    return Config.ok(
      ctx.repo.listDeleted().map(function (/** @type {any} */ d) {
        return Object.assign({}, d, { who: name(d.who) });
      }),
    );
  });
}

/** Restore one deleted item from its _app_log snapshot (admins only). @param {number} logRow */
function Api_restoreRequest(logRow) {
  return guard_(function (ctx) {
    if (!ctx.repo.isAdmin(ctx.email, owner_(ctx))) return Config.fail('NOT_ADMIN');
    var denied = denied_(ctx);
    if (denied) return denied;
    return ctx.repo.restore(Number(logRow), ctx.email);
  });
}

/** Build this week's digest messages from the sheet. @param {any} ctx */
function digestMessages_(ctx) {
  var t = today_();
  var rows = ctx.repo.readAll().rows.map(function (/** @type {any} */ r) {
    return Domain.enrich(r, t);
  });
  return { today: t, messages: Domain.buildDigest(rows, t, { appUrl: Config.APP_URL }) };
}

/**
 * Time-driven job (set up once in the Apps Script editor: Triggers → weeklyDigest → Week timer → Monday, 8–9am).
 * Queues the Monday digest in _app_notify; แมวส้ม sends it to LINE. Safe to run twice: one digest per week.
 */
function weeklyDigest() {
  var res = guard_(function (ctx) {
    var d = digestMessages_(ctx);
    var week = Domain.weekRange(d.today).from;
    return ctx.repo.enqueueNotify(
      'digest:' + week.y + '-' + week.m + '-' + week.d,
      'สรุปรายสัปดาห์',
      d.messages,
    );
  });
  console.log('weeklyDigest', JSON.stringify(res));
  return res;
}

/** Admin button: queue the digest now (to try แมวส้ม without waiting for Monday). */
function Api_queueDigestNow() {
  return guard_(function (ctx) {
    if (!ctx.repo.isAdmin(ctx.email, owner_(ctx))) return Config.fail('NOT_ADMIN');
    var d = digestMessages_(ctx);
    var stamp = Utilities.formatDate(new Date(), Config.TZ, 'yyyy-MM-dd HH:mm:ss');
    return ctx.repo.enqueueNotify('digest-now:' + stamp, 'สรุป (กดส่งเอง)', d.messages);
  });
}
