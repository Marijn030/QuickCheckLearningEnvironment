const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const registry=require('../exercise-registry');
const {runCoverage,fingerprints,prepareStudent}=require('../coverage-engine');
async function check(id,source,fail=[]) {
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'qle-test-'));
 let runs=0;
 try {
  const selected=registry.get(id);
  const execute=async()=>{runs++;return {ok:true,output:prepareStudent(source).names.map(n=>`QLE_RESULT|${n}|${fail.includes(n)?'FAIL':'PASS'}`).join('\n')};};
  const result=await runCoverage({folder,source,execute,signal:new AbortController().signal,definition:selected.definition});
  assert.equal(runs,1);return result;
 } finally {await fs.rm(folder,{recursive:true,force:true});}
}
const length='p a bs = length (insert a bs) == length bs + 1\nmain = do\n  quickCheck p';
test('renamed length property matches only length',async()=>{const r=await check('insert',length);assert.deepEqual(r.checks.filter(c=>c.status==='detected').map(c=>c.id),['1']);assert.equal(r.hintBudget,2);});
test('failed property does not earn credit or hint',async()=>{const r=await check('insert',length,['p']);assert.equal(r.checks.filter(c=>c.status==='detected').length,0);assert.equal(r.hintBudget,1);});
test('duplicate properties do not unlock extra hints',async()=>{const r=await check('insert',length.replace('main = do','q x xs = length (insert x xs) == length xs + 1\nmain = do')+'\n  quickCheck q');assert.equal(r.hintBudget,2);});
test('placeholder earns no credit',async()=>{const r=await check('sort','placeholder xs = True\nmain = do\n  quickCheck placeholder');assert.equal(r.hintBudget,1);assert.equal(r.properties.length,0);});
test('renamed helpers and variables match',()=>{const a='ordered [] = True\nordered (x:y:xs) = x <= y && ordered (y:xs)\np xs = ordered (sort xs)';const b='sorted [] = True\nsorted (a:b:bs) = a <= b && sorted (b:bs)\nq ys = sorted (sort ys)';assert.equal(fingerprints(a,['p']).p,fingerprints(b,['q']).q);});
test('all configured teacher properties match themselves',async()=>{for(const [id,selected] of registry){const source=selected.model;const r=await check(id,source);assert.ok(r.checks.every(c=>c.status==='detected'));}});
test('local guarded subsequence matches teacher alternative',async()=>{const r=await check('insert',`isSubsequenceOf :: Eq a => [a] -> [a] -> Bool
isSubsequenceOf [] _ = True
isSubsequenceOf _ [] = False
isSubsequenceOf (x:xs) (y:ys)
  | x == y = isSubsequenceOf xs ys
  | otherwise = isSubsequenceOf (x:xs) ys
insertPresSubsequence x xs = isSubsequenceOf xs (insert x xs)
main = do
  quickCheck insertPresSubsequence`);assert.deepEqual(r.checks.filter(c=>c.status==='detected').map(c=>c.id),['4']);});
test('multiset helper and occurrence count match same model group',async()=>{const r=await check('sort',`import qualified Data.List as List
sameMultiset xs ys = List.sort xs == List.sort ys
sortPresMultiset xs = sameMultiset (sort xs) xs
count x = length . filter (== x)
sortPresCount x xs = count x (sort xs) == count x xs
main = do
  quickCheck sortPresMultiset
  quickCheck sortPresCount`);assert.deepEqual(r.checks[2].evidence,['sortPresMultiset','sortPresCount']);});
test('custom hint titles are independent of model property identifiers',async()=>{const r=await check('insert',length);assert.equal(r.checks[0].title,'Ordering');assert.equal(r.checks[0].hint.length,3);assert.equal(r.checks[1].title,'p');const s=await check('sort','p xs = length (sort xs) == length xs\nmain = do\n  quickCheck p');assert.equal(s.checks[2].title,'Multiset');});
