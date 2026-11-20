'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareStudent, propertyBodies } = require('./coverage');

const requirements = [
 { id: 'ordering', title: 'Output', hint: ['How can you tell if a list is in ascending order?', 'Compare each pair of adjacent elements.', 'Try isSorted (sort xs).'] },
 { id: 'length', title: 'Size', hint: ['Should sorting add or remove elements?', 'Compare input and output lengths.', 'Try length (sort xs) == length xs.'] },
 { id: 'permutation', title: 'Items', hint: ['Can sorting lose duplicates or introduce new values?', 'Think about comparing counts of each value, or sorting both lists.', 'Try count x (sort xs) == count x xs, or sort xs `elem` permutations xs with Data.List.permutations.'] }
];
const correct = `module Reference (sort) where
import qualified Data.List as List
sort :: [Int] -> [Int]
sort = List.sort
`;
const mutants = {
 ordering: `module Reference (sort) where
sort :: [Int] -> [Int]
sort = id
`,
 length: `module Reference (sort) where
import qualified Data.List as List
sort :: [Int] -> [Int]
sort xs = case List.sort xs of { [] -> [0]; ys -> head ys : ys }
`,
 permutation: `module Reference (sort) where
import qualified Data.List as List
sort :: [Int] -> [Int]
sort xs = List.sort (map (const 0) xs)
`
};
function evidenceFor(body) {
 const b = body.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
 const call = /\bsort\s+(?:\(?\s*)?\w+/.test(b) || /\b(?:sort|f)\s*`permutes`/.test(b);
 const permutation = /\bpermut(?:es|ations|ation)\b|\bcount\b|\bfrequency\b|\bmultiset\b/.test(b) || /\bData\.List\.sort\b/.test(b);
 return {
  ordering: call && /\bisSorted\b|\bordered\b|\bascending\b/.test(b),
  length: call && /\blength\b/.test(b) && /==|===/.test(b),
  permutation: call && permutation
 };
}
async function runSortCoverage({folder,source,execute,signal}) {
 const {names,student,runner} = prepareStudent(source);
 await fs.writeFile(path.join(folder,'Student.hs'),student);
 await fs.writeFile(path.join(folder,'Main.hs'),runner);
 const run = async ref => {
  await fs.writeFile(path.join(folder,'Reference.hs'),ref);
  const result = await execute(folder,'quickcheck',signal);
  const matches = [...result.output.matchAll(/^QLE_RESULT\|([^|\n]+)\|(PASS|FAIL)$/gm)];
  return {...result,statuses:Object.fromEntries(matches.map(m=>[m[1],m[2]]))};
 };
 const baseline = await run(correct);
 if (Object.keys(baseline.statuses).length !== names.length) return {ok:false,error:'Could not compile or evaluate all QuickCheck properties.',output:baseline.output};
 const failing=names.filter(n=>baseline.statuses[n]!=='PASS');
 if(failing.length) return {ok:false,error:'Some properties fail against the correct sorting implementation.',failing,output:baseline.output};
 const bodies=propertyBodies(source,names);
 const evidence=Object.fromEntries(names.map(n=>[n,evidenceFor(bodies[n])]));
 const checks=[];
 for(const requirement of requirements) {
  if(signal.aborted) return {ok:false,error:'Request cancelled.'};
  const matching=names.filter(n=>evidence[n][requirement.id]);
  if(!matching.length) {
   checks.push({...requirement,status:'not-demonstrated',message:'No recognized property formulation for this requirement. Equivalent alternatives may need instructor review.',detail:''});
   continue;
  }
  const result=await run(mutants[requirement.id]);
  const complete=Object.keys(result.statuses).length===names.length;
  const witnessed=matching.filter(n=>result.statuses[n]==='FAIL');
  checks.push({...requirement,status:!complete?'inconclusive':witnessed.length?'detected':'not-demonstrated',detail:!complete?result.output.slice(-1800):'',message:!complete?'The fault probe could not be evaluated.':witnessed.length?'Recognized property pattern and confirmed a relevant fault was rejected.':'A relevant property pattern was found, but this fault was not rejected.'});
 }
 const generatorCandidate=/\bforAll\b/.test(source)&&/\bGen\s*\[\s*Int\s*\]/.test(source);
 return {ok:true,properties:names,checks,generator:{candidate:generatorCandidate,message:generatorCandidate?'A custom list generator appears to be used; instructor review is needed for bonus credit.':'No custom list generator usage was recognized. A generator is optional.'},note:'Conservative source-pattern recognition plus targeted faults, not proof of coverage. Equivalent formulations may require instructor review.'};
}
module.exports={runSortCoverage,evidenceFor};
