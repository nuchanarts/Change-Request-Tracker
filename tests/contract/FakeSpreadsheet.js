// In-memory stand-in for the subset of SpreadsheetApp / LockService / CacheService the Repo uses.
// It records every write so tests can prove "write only the changed cells" (constitution V).

const pad = (v) => (v === undefined ? '' : v);

/** Display a cell value the way the real sheet shows it (d/m/yyyy for dates). */
export function display(v) {
  if (v instanceof Date) return `${v.getDate()}/${v.getMonth() + 1}/${v.getFullYear()}`;
  if (v === null || v === undefined) return '';
  return String(v);
}

export class FakeValidation {
  constructor(type, values) {
    this.type = type;
    this.values = values;
  }
  getCriteriaType() {
    return this.type;
  }
  getCriteriaValues() {
    return this.values;
  }
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  _matrix(fn) {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(fn(this.sheet._get(this.row + r, this.col + c)));
      out.push(line);
    }
    return out;
  }
  getValues() {
    return this._matrix((v) => (v === undefined ? '' : v));
  }
  getDisplayValues() {
    return this._matrix(display);
  }
  getValue() {
    return pad(this.sheet._get(this.row, this.col));
  }
  getDisplayValue() {
    return display(this.sheet._get(this.row, this.col));
  }
  setValue(v) {
    this.sheet._set(this.row, this.col, v);
    return this;
  }
  setValues(m) {
    m.forEach((line, r) => line.forEach((v, c) => this.sheet._set(this.row + r, this.col + c, v)));
    return this;
  }
  getDataValidation() {
    return this.sheet.validations[`${this.row}:${this.col}`] || null;
  }
}

export class FakeSheet {
  constructor(name, rows = []) {
    this.name = name;
    this.cells = rows.map((r) => r.slice());
    this.writes = [];
    this.validations = {};
    this.hidden = false;
  }
  _get(row, col) {
    const line = this.cells[row - 1];
    return line ? line[col - 1] : undefined;
  }
  _set(row, col, v) {
    while (this.cells.length < row) this.cells.push([]);
    this.cells[row - 1][col - 1] = v;
    this.writes.push({ row, col, value: v });
  }
  getName() {
    return this.name;
  }
  getLastRow() {
    return this.cells.length;
  }
  getLastColumn() {
    return this.cells.reduce((m, r) => Math.max(m, r.length), 0);
  }
  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols);
  }
  appendRow(values) {
    const row = this.cells.length + 1;
    values.forEach((v, i) => this._set(row, i + 1, v));
    return this;
  }
  hideSheet() {
    this.hidden = true;
    return this;
  }
  setValidation(row, col, validation) {
    this.validations[`${row}:${col}`] = validation;
  }
}

export class FakeSpreadsheet {
  constructor(sheets = [], { editors = [], name = '[TEST] fake' } = {}) {
    this.sheets = Object.fromEntries(sheets.map((s) => [s.name, s]));
    this.editors = editors;
    this.name = name;
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  insertSheet(name) {
    this.sheets[name] = new FakeSheet(name);
    return this.sheets[name];
  }
  getName() {
    return this.name;
  }
  getEditors() {
    if (this.editors === 'throw') throw new Error('Access denied');
    return this.editors.map((e) => ({ getEmail: () => e }));
  }
}

export class FakeLock {
  constructor({ available = true } = {}) {
    this.available = available;
    this.held = false;
    this.acquired = 0;
  }
  tryLock() {
    if (!this.available) return false;
    this.held = true;
    this.acquired++;
    return true;
  }
  releaseLock() {
    this.held = false;
  }
}

export class FakeCache {
  constructor() {
    this.map = new Map();
  }
  get(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  put(k, v) {
    this.map.set(k, v);
  }
  remove(k) {
    this.map.delete(k);
  }
}
