import Test.QuickCheck
import Reference (sort)
import qualified Data.List as List
isSorted [] = True
isSorted [_] = True
isSorted (x:y:xs) = x <= y && isSorted (y:xs)
sortEnsuresSorted xs = isSorted (sort xs)
sortPresLen xs = length (sort xs) == length xs
sortPresMultiset xs = List.sort (sort xs) == List.sort xs
main = do
  quickCheck sortEnsuresSorted
  quickCheck sortPresLen
  quickCheck sortPresMultiset
