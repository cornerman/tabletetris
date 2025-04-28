Table sitting problem.

People (A,B,C,D) sitting around a table. People have preferences to who they want sit next to:

- A: B
- B: -
- C: A,D
- D: -


Solve with linear programming:

objective =
sum_j<n sum_i<n pref_i,j * x_i,j

pref =
? 1 0 0
0 ? 0 0
1 0 ? 1
0 0 0 ?

solve for variable x.

constraints on x:
jede row sum = 2
jede col sum = 2
jeder wert = 0 oder 1

Write down the constraints as formulas

