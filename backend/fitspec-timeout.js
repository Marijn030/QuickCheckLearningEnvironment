'use strict';
// FitSpec's own timeout controls analysis. The independent Docker deadline
// allows a little compilation/printing overhead, never exceeding five minutes.
function timeoutMs(source) {
  const clean = source.replace(/\{-[\s\S]*?-\}/g, '').replace(/--[^\n]*/g, '');
  const fields = [...clean.matchAll(/\btimeout\s*=\s*([^,}\n]+)/g)];
  if (!fields.length) return 300000;
  if (fields.length !== 1 || !/^\d+$/.test(fields[0][1].trim())) throw Error('Use a literal FitSpec timeout from 0 to 300 seconds.');
  const seconds = Number(fields[0][1].trim());
  if (seconds > 300) throw Error('FitSpec timeout must be between 0 and 300 seconds.');
  return seconds === 0 ? 300000 : Math.min(300000, (seconds + 15) * 1000);
}
module.exports = { timeoutMs };
