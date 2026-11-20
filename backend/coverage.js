'use strict';

// Local teaching checker: execute ordinary QuickCheck submissions with a
// backend-provided Reference module. These are fault probes, not proofs.
const fs = require('node:fs/promises');
const path = require('node:path');

const requirements = [
  { id: 'ordering', title: 'Ordering', hint: ['If the input is sorted, what must be true of the output?', 'Think about neighboring elements in the resulting list.', 'Try a property involving isSorted xs and isSorted (insert x xs).'] },
  { id: 'length', title: 'Length', hint: ['How many elements should insertion add?', 'Compare the length before and after insertion.', 'Try length (insert x xs) == length xs + 1.'] },
  { id: 'inserted', title: 'Inserting', hint: ['How can you check that a value appears in a list?', 'The elem function may help.', 'Try x `elem` insert x xs.'] },
  { id: 'elements', title: 'Original elements', hint: ['Could an implementation lose an existing element?', 'Remember to consider duplicate values.', 'Consider comparing element counts or sorted copies of both lists.'] },
  { id: 'relative', title: 'Original order', hint: ['Could insertion rearrange existing elements?', 'Think about the original list as a subsequence of the output.', 'A subsequence helper can test whether elements retain their relative order.'] }
];

const correct = `module Reference (insert) where
insert :: Int -> [Int] -> [Int]
insert x [] = [x]
insert x ys@(y:rest) | x <= y = x : ys | otherwise = y : insert x rest
`;
const mutants = {
  ordering: `module Reference (insert) where
insert :: Int -> [Int] -> [Int]
insert x xs = xs ++ [x]
`,
  length: `module Reference (insert) where
insert :: Int -> [Int] -> [Int]
insert x xs = x : x : xs
`,
  inserted: `module Reference (insert) where
insert :: Int -> [Int] -> [Int]
insert x xs = let y = x + 1 in go y xs where
  go a [] = [a]
  go a ys@(b:bs) | a <= b = a:ys | otherwise = b:go a bs
`,
  elements: `module Reference (insert) where
insert :: Int -> [Int] -> [Int]
insert x [] = [x]
insert x (_:ys) = x : ys
`,
  relative: `module Reference (insert) where
insert :: Int -> [Int] -> [Int]
insert x xs = x : reverse xs
`
};

function prepareStudent(source) {
  // Support ordinary QuickCheck submissions with top-level `quickCheck name`
  // calls in main. No requirement for FitSpec's `properties f` interface.
  const names = [...source.matchAll(/^\s*quickCheck\s+([a-zA-Z_][\w']*)\s*(?:--.*)?$/gm)].map(m => m[1]);
  const unique = [...new Set(names)];
  if (!unique.length) throw new Error('Add a main function with lines such as `quickCheck insertIncrLen` so the checker knows which properties to evaluate.');
  if (unique.length > 20) throw new Error('Maximum 20 QuickCheck properties per coverage check.');
  let student = source.replace(/^\s*module\s+\w+(?:\.\w+)*\s+where\s*$/m, '');
  // Remove the original main definition; the checker supplies its own runner.
  const lines = student.split('\n');
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    if (/^main\s*(?:::|=)/.test(line)) { skipping = true; continue; }
    if (skipping && line.trim() && !/^[ \t]/.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  student = kept.join('\n');
  student = 'module Student where\n' + student;
  const calls = unique.map((name, index) => `  check ${JSON.stringify(name)} (property Student.${name})`).join('\n');
  const runner = `module Main where
import qualified Student
import Test.QuickCheck
import Test.QuickCheck.Test (isSuccess)
import System.Exit (exitFailure)
import Control.Monad (unless)
check :: String -> Property -> IO ()
check name p = do
  result <- quickCheckWithResult stdArgs { maxSuccess = 100, maxDiscardRatio = 20, chatty = False } p
  putStrLn ("QLE_RESULT|" ++ name ++ "|" ++ if isSuccess result then "PASS" else "FAIL")
main :: IO ()
main = do
${calls}
`;
  return { names: unique, student, runner };
}

// Conservative source-level evidence, cross-checked with mutation tests.
// This is NOT a general Haskell theorem prover: unrecognized equivalent
// formulations are reported as unverified rather than awarded credit.
function propertyBodies(source, names) {
  const lines = source.split(/\r?\n/);
  const result = {};
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const def = new RegExp('^' + escaped + '\\s+[^\\n=]*=');
    let start = lines.findIndex(line => def.test(line));
    if (start < 0) { result[name] = ''; continue; }
    const parts = [lines[start]];
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() && !/^\s/.test(line) && !/^--/.test(line)) break;
      parts.push(line);
    }
    result[name] = parts.join('\n').replace(/--[^\n]*/g, ' ');
  }
  return result;
}

function evidenceFor(body) {
  // Patterns are deliberately strict. If a student writes an equivalent but
  // unfamiliar formulation, the checker should say 'not yet verified'.
  const b = body.replace(/\s+/g, ' ');
  const call = /\binsert\s+\w+\s+\w+/.test(b);
  const multiset = call && /\bsort\b/.test(b) && /(?:==|\bcount\b|\bpermutation\b)/.test(b);
  return {
    ordering: call && /\bisSorted\b/.test(b) && (/\bimplies\b|==>|\bnot\b|\bforAll\b/.test(b)),
    length: call && ((/\blength\b/.test(b) && /(?:\+\s*1|1\s*\+|\-\s*1)/.test(b)) || multiset),
    inserted: call && (/\belem\b/.test(b) || multiset),
    elements: call && (/\bcount\b/.test(b) || multiset || /\ball\b/.test(b) && /\belem\b/.test(b)),
    relative: call && /\bisSubsequenceOf\b/.test(b)
  };
}

async function runCoverage({ folder, source, execute, signal }) {
  const { names, student, runner } = prepareStudent(source);
  await fs.writeFile(path.join(folder, 'Student.hs'), student);
  await fs.writeFile(path.join(folder, 'Main.hs'), runner);
  const run = async (refSource) => {
    await fs.writeFile(path.join(folder, 'Reference.hs'), refSource);
    const result = await execute(folder, 'quickcheck', signal);
    const matches = [...result.output.matchAll(/^QLE_RESULT\|([^|\n]+)\|(PASS|FAIL)$/gm)];
    const statuses = Object.fromEntries(matches.map(m => [m[1], m[2]]));
    return { ...result, statuses };
  };
  const baseline = await run(correct);
  if (Object.keys(baseline.statuses).length !== names.length) {
    return { ok: false, error: 'Could not compile or evaluate all QuickCheck properties. Check the compiler output.', output: baseline.output };
  }
  const failing = names.filter(n => baseline.statuses[n] !== 'PASS');
  if (failing.length) return { ok: false, error: 'Some properties fail against the correct reference implementation. Fix them before checking coverage.', failing, output: baseline.output };
  const bodies = propertyBodies(source, names);
  const evidence = Object.fromEntries(names.map(n => [n, evidenceFor(bodies[n])]));
  const checks = [];
  for (const requirement of requirements) {
    if (signal.aborted) return { ok: false, error: 'Request cancelled.' };
    const result = await run(mutants[requirement.id]);
    const complete = Object.keys(result.statuses).length === names.length;
    const matching = names.filter(n => evidence[n][requirement.id]);
    const witnessed = matching.filter(n => result.statuses[n] === 'FAIL');
    checks.push({ id: requirement.id, title: requirement.title,
      status: !complete ? 'inconclusive' : witnessed.length ? 'detected' : 'not-demonstrated',
      hint: requirement.hint,
      detail: !complete ? result.output.slice(-1800) : '',
      evidence: witnessed,
      message: !complete ? 'The fault probe could not be evaluated.' : witnessed.length
        ? 'Recognized property pattern and confirmed a relevant fault was rejected.'
        : matching.length ? 'A relevant property pattern was found, but this fault was not rejected; review the property.'
        : 'No recognized property formulation for this requirement. Equivalent alternatives may need instructor review.' });
  }
  const generatorCandidate = /\bforAll\b/.test(source) && /\bGen\s*\[\s*Int\s*\]/.test(source);
  return { ok: true, properties: names, checks, generator: { candidate: generatorCandidate,
    message: generatorCandidate ? 'A custom list generator appears to be used. Review its sortedness and input diversity before awarding bonus points.' : 'No custom list generator usage was recognized. A generator is optional.' },
    note: 'Conservative pattern recognition plus fault probes; not a proof of coverage. Unrecognized equivalent properties require instructor review. Mutants rejected by unrelated properties do not earn requirement credit.' };
}

module.exports = { runCoverage, prepareStudent, propertyBodies, evidenceFor };
