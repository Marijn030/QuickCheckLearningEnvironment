const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const registry = require('../exercise-registry');
const {runCoverage} = require('../coverage-engine');
for (const [id, selected] of registry) {
 test(`${id}: ordering-only submission does not earn unrelated credit`, async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'qle-test-'));
  try {
   const source = id === 'insert' ? 'prop x xs = isSorted xs `implies` isSorted (insert x xs)\nmain = do\n  quickCheck prop' : 'prop xs = isSorted (sort xs)\nmain = do\n  quickCheck prop';
   const referenceSource = await fs.readFile(selected.reference,'utf8');
   const execute = async () => ({ok:true,output:'QLE_RESULT|prop|' + ((await fs.readFile(path.join(folder,'Reference.hs'),'utf8')) === referenceSource ? 'PASS' : 'FAIL')});
   const result = await runCoverage({folder,source,execute,signal:new AbortController().signal,definition:selected.definition,referenceSource});
   assert.equal(result.ok,true);
   assert.deepEqual(result.checks.filter(x=>x.status==='detected').map(x=>x.id),['ordering']);
  } finally {await fs.rm(folder,{recursive:true,force:true});}
 });
}
