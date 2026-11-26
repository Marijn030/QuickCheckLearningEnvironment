module Reference (insert) where

-- Reference behavior: insert a value into an already sorted ascending list.
insert :: Int -> [Int] -> [Int]
insert x [] = [x]
insert x ys@(y:rest)
  | x <= y    = x : ys
  | otherwise = y : insert x rest
