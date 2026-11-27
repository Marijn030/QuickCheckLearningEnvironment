'use strict';

// Local teaching checker: execute ordinary QuickCheck submissions with a
// backend-provided Reference module. Model matching is heuristic.
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
  const pragmas = [...student.matchAll(/^\s*\{-#\s*LANGUAGE[^]*?#-\}/gm)].map(m=>m[0]);
  student = student.replace(/^\s*\{-#\s*LANGUAGE[^]*?#-\}/gm,'');
  student = pragmas.join('\n') + '\nmodule Student where\n' + student;
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

// Lightweight structural fingerprints: preserve operators, constants and library
// identifiers; normalize parameter names and recursively fingerprint local helpers.
// Not a Haskell parser or equivalence prover.
function fingerprints(source,names) {
  const clean=source.replace(/\{-([\s\S]*?)-\}/g,'').replace(/--[^\n]*/g,'');
  const defs=new Map();
  let current=null;
  for(const line of clean.split(/\r?\n/)) {
    const m=/^([a-z_][\w']*)\s*(.*?)\s*=(?!=|>)\s*(.*)$/.exec(line);
    if(m && !m[2].includes('::') && !/^(import|module)$/.test(m[1])) {
      current={args:m[2],body:m[3]};
      if(!defs.has(m[1])) defs.set(m[1],[]);
      defs.get(m[1]).push(current);
    } else if(current && /^\s+\S/.test(line)) current.body+=' '+line.trim();
    else if(line.trim()) current=null;
  }
  const tokens=s=>s.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'|[A-Za-z_][\w']*(?:\.[A-Za-z_][\w']*)*|\d+|[!#$%&*+./<=>?@\\^|~:\-]+|[^\s]/g)||[];
  const aliases=Object.fromEntries([...clean.matchAll(/^import\s+qualified\s+([\w.]+)\s+as\s+(\w+)/gm)].map(m=>[m[2],m[1]]));
  function canonical(name,stack=[]) {
    if(stack.includes(name)) return '@recursive'+(stack.length-1-stack.indexOf(name));
    if(!defs.has(name)||stack.length>12) return null;
    return defs.get(name).map(({args,body})=>{
      const vars=new Map();
      const argTokens=tokens(args).map(t=>/^[a-z_][\w']*$/.test(t)&&t!=='_'?(vars.has(t)?vars.get(t):(vars.set(t,'@v'+vars.size),vars.get(t))):t);
      // Normalize simple lambda binders too.
      const bt=tokens(body); let lambda=false;
      const result=bt.map(t=>{
        if(t==='\\') {lambda=true;return t;} if(t==='->'){lambda=false;return t;}
        if(lambda && /^[a-z_][\w']*$/.test(t)&&!vars.has(t)) vars.set(t,'@v'+vars.size);
        if(vars.has(t)) return vars.get(t);
        if(defs.has(t)&&t!=='main') return canonical(t,[...stack,name]);
        const [prefix,...rest]=t.split('.'); return aliases[prefix]&&rest.length?aliases[prefix]+'.'+rest.join('.'):t;
      });
      return JSON.stringify([argTokens,result]);
    }).join(';');
  }
  return Object.fromEntries(names.map(n=>[n,canonical(n)]));
}
async function runCoverage({folder,source,execute,signal,definition}) {
  let prepared; try {prepared=prepareStudent(source);} catch(e){return {ok:false,error:e.message};}
  const {names,student,runner}=prepared;
  await fs.writeFile(path.join(folder,'Student.hs'),student);
  await fs.writeFile(path.join(folder,'Main.hs'),runner);
  const baseline=await execute(folder,'quickcheck',signal);
  const statuses=Object.fromEntries([...baseline.output.matchAll(/^QLE_RESULT\|([^|\r\n]+)\|(PASS|FAIL)\r?$/gm)].map(m=>[m[1],m[2]]));
  if(!baseline.ok || names.some(n=>!statuses[n])) return {ok:false,error:'Could not evaluate all properties.',output:baseline.output};
  const passing=names.filter(n=>statuses[n]==='PASS'&&n!=='placeholder');
  const patterns=fingerprints(source,passing);
  const checks=definition.names.map((n,i)=>{
    const evidence=passing.filter(s=>patterns[s]&&patterns[s]===definition.patterns[n]);
    return {id:String(i),title:evidence.length?evidence.join(', '):'Model property '+(i+1),status:evidence.length?'detected':'not-demonstrated',evidence,hint:evidence.length?[]:definition.hints[n],message:evidence.length?'Passing property structurally matches a teacher property.':'No structural match yet. Equivalent alternatives may need review.'};
  });
  const eligible=new Set(passing.filter(n=>patterns[n] && patterns[n].includes(JSON.stringify(definition.fn))).map(n=>patterns[n]));
  return {ok:true,properties:passing,failed:names.filter(n=>statuses[n]!=='PASS'),checks,hintBudget:1+eligible.size,generator:{message:/\bforAll\b/.test(source)?'Possible custom generator; instructor review needed.':'No custom generator recognized.'},note:'Structural matching only; no mutation testing in QuickCheck coverage. A match is not a proof of equivalence or completeness.'};
}
module.exports={runCoverage,prepareStudent,fingerprints};
