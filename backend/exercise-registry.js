const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../frontend/exercises.json');
const registry = new Map();
for (const item of catalog) {
  if (!/^[a-z][a-z0-9-]*$/.test(item.id) || registry.has(item.id)) throw new Error('Invalid or duplicate exercise ID');
  const folder = path.join(__dirname, 'exercises', item.id);
  const reference = path.join(folder, 'Reference.hs');
  const definition = require(path.join(folder, 'coverage.js'));
  fs.accessSync(reference, fs.constants.R_OK);
  if (!Array.isArray(definition.requirements) || typeof definition.evidenceFor !== 'function' || definition.requirements.some(r => typeof definition.mutants?.[r.id] !== 'string')) throw new Error('Invalid coverage definition: ' + item.id);
  registry.set(item.id, { reference, definition });
}
module.exports = registry;
