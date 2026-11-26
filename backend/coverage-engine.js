'use strict';

// Local teaching checker: execute ordinary QuickCheck submissions with a
// backend-provided Reference module. These are fault probes, not proofs.
const fs = require('node:fs/promises');
const path = require('node:path');

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

async function runCoverage({ folder, source, execute, signal, definition, referenceSource }) {
  const { requirements, mutants, evidenceFor, generatorMessage, note, skipUnrecognized = false } = definition;
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
  const baseline = await run(referenceSource);
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
    const matching = names.filter(n => evidence[n][requirement.id]);
    if (skipUnrecognized && !matching.length) {
      checks.push({ ...requirement, status: 'not-demonstrated', message: 'No recognized property formulation for this requirement. Equivalent alternatives may need instructor review.', detail: '' });
      continue;
    }
    const result = await run(mutants[requirement.id]);
    const complete = Object.keys(result.statuses).length === names.length;
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
    message: generatorCandidate ? generatorMessage : 'No custom list generator usage was recognized. A generator is optional.' },
    note };
}

module.exports = { runCoverage, prepareStudent, propertyBodies };
