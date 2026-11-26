'use strict';
const requirements = [
 { id: 'ordering', title: 'Output', hint: ['How can you tell if a list is in ascending order?', 'Compare each pair of adjacent elements.', 'Try isSorted (sort xs).'] },
 { id: 'length', title: 'Size', hint: ['Should sorting add or remove elements?', 'Compare input and output lengths.', 'Try length (sort xs) == length xs.'] },
 { id: 'permutation', title: 'Items', hint: ['Can sorting lose duplicates or introduce new values?', 'Think about comparing counts of each value, or sorting both lists.', 'Try count x (sort xs) == count x xs, or sort xs `elem` permutations xs with Data.List.permutations.'] }
];
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

module.exports = { requirements, mutants, evidenceFor, skipUnrecognized: true, generatorMessage: "A custom list generator appears to be used; instructor review is needed for bonus credit.", note: 'Conservative pattern recognition plus targeted faults; not proof of coverage. Equivalent formulations may require instructor review.' };
