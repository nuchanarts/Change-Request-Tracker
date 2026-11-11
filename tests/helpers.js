import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @returns {any} the shared Domain module (same file Apps Script and the browser run) */
export const loadDomain = () => require('../src/shared/Domain.js');

export const d = (y, m, day) => ({ y, m, d: day });
