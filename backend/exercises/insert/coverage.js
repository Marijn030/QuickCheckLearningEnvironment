'use strict';
const requirements = [
  { id: 'ordering', title: 'Ordering', hint: ['If the input is sorted, what must be true of the output?', 'Think about neighboring elements in the resulting list.', 'Try a property involving isSorted xs and isSorted (insert x xs).'] },
  { id: 'length', title: 'Size', hint: ['How many elements should insertion add?', 'Compare the length before and after insertion.', 'Try length (insert x xs) == length xs + 1.'] },
  { id: 'inserted', title: 'Inserting', hint: ['How can you check that a value appears in a list?', 'The elem function may help.', 'Try x `elem` insert x xs.'] },
  { id: 'elements', title: 'Original elements', hint: ['Could an implementation lose an existing element?', 'Remember to consider duplicate values.', 'Consider comparing element counts or sorted copies of both lists.'] },
  { id: 'relative', title: 'Original order', hint: ['Could insertion rearrange existing elements?', 'Think about the original list as a subsequence of the output.', 'A subsequence helper can test whether elements retain their relative order.'] }
];

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


module.exports = { requirements, mutants, evidenceFor, skipUnrecognized: false, generatorMessage: "A custom list generator appears to be used. Review its sortedness and input diversity before awarding bonus points.", note: 'Conservative pattern recognition plus targeted faults; not proof of coverage. Equivalent formulations may require instructor review.' };
