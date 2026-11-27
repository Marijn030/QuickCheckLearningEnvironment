import Test.QuickCheck
import Reference (insert)
import Data.List (isSubsequenceOf)
isSorted [] = True
isSorted [_] = True
isSorted (x:y:xs) = x <= y && isSorted (y:xs)
implies x y = not x || y
count x = length . filter (== x)
insertPresOrd x xs = isSorted xs `implies` isSorted (insert x xs)
insertIncrLen x xs = length (insert x xs) == length xs + 1
insertCount x xs = count x (insert x xs) == count x xs + 1
insertPresElems x xs = all (\y -> count y (insert x xs) >= count y xs) xs
insertPresSubsequence x xs = isSubsequenceOf xs (insert x xs)
main = do
  quickCheck insertPresOrd
  quickCheck insertIncrLen
  quickCheck insertCount
  quickCheck insertPresElems
  quickCheck insertPresSubsequence
