// @ts-check
/**
 * Web app entry point and the thin API called from the browser with google.script.run.
 * Each Api_* function: check permission → Domain validation → Repo → Result. Never throws (constitution IX).
 */

/** Serve the single-page app. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
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
    nowText: function () {
      return Utilities.formatDate(new Date(), Config.TZ, 'd/M/yyyy HH:mm:ss');
    },
    makeDate: function (y, m, d) {
      return new Date(y, m - 1, d); // script time zone is Asia/Bangkok (appsscript.json)
    },
  });
  return { ok: true, ss: ss, repo: repo, email: Session.getActiveUser().getEmail() };
}

/** Sheet owner's email ('' when unavailable). @param {any} ctx */
function owner_(ctx) {
  try {
    return ctx.ss.getOwner().getEmail();
  } catch (err) {
    console.warn('getOwner failed (shared drive or no access)', err);
    return '';
  }
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
        var access = editAccess_(ctx);
        return {
          email: ctx.email,
          name: ctx.repo.getUserName(ctx.email),
          canEdit: access.canEdit,
          editReason: access.reason,
          isAdmin: ctx.repo.isAdmin(ctx.email, owner_(ctx)),
        };
      })(),
      schema: { ok: data.missing.length === 0, missing: data.missing },
      options: ctx.repo.options(data.rows),
      rows: data.rows,
      spreadsheetName: ctx.ss.getName(),
    });
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

/** A signed-in person asks for edit access (pending until an admin allows it). @param {{name?:string, note?:string}} input */
function Api_requestAccess(input) {
  return guard_(function (ctx) {
    return ctx.repo.requestAccess(ctx.email, (input && input.name) || '', (input && input.note) || '');
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

/** @param {string} name */
function Api_setMyName(name) {
  return guard_(function (ctx) {
    var options = ctx.repo.options();
    if (options.person.indexOf(String(name)) === -1) {
      return Config.fail('VALIDATION', { fields: { name: 'กรุณาเลือกชื่อจากรายการ' } });
    }
    var denied = denied_(ctx);
    if (denied) return denied;
    return ctx.repo.setUserName(ctx.email, String(name));
  });
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
