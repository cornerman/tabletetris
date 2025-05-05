// Removed import GLPKFactory from 'glpk.js';

/**
 * Solves the table seating arrangement problem using GLPK.
 *
 * @param {object} glpk - The initialized GLPK.js instance (contains constants like GLP_MAX).
 * @param {number[][]} pref - The preference matrix where pref[i][j] is the
 *                            preference score of person i sitting next to person j.
 * @returns {Promise<number[][]>} A promise that resolves to a binary adjacency matrix
 *                       where matrix[i][j] = 1 if person i sits next to person j,
 *                       0 otherwise. Represents a single table arrangement.
 * @throws {Error} If the solver fails, finds no feasible solution, the
 *                 problem is unbounded, or n < 3 and specific handling fails.
 */
export async function solveSitting(glpk, pref) {
    const EPSILON = 0.001; // Small incentive for pairing up

    const n = pref.length;

    // Handle trivial cases explicitly
    if (n === 0) {
        return [];
    }
    if (n === 1) {
        return [[0]]; // One person sits alone
    }
    if (n === 2) {
        // Two people must sit together
        // Note: The LP formulation with equality constraints = 2 won't work here.
        return [[0, 1], [1, 0]];
    }
    // For n >= 3, we proceed with the LP solver aiming for a cycle (degree 2 for all)

    console.assert(pref.every(row => row.length === n), "Preference matrix must be square.");
    console.assert(n >= 3, "Solver logic assumes n >= 3 after initial checks."); // Add assertion

    // Helper to get variable name (e.g., "x_0_1")
    function getVarName(i, j) {
        return `x_${i}_${j}`;
    }

    // Create an array of indices [0, 1, ..., n-1] for mapping
    const indices = Array.from({ length: n }, (_, k) => k);

    // --- Define GLPK Problem Object Declaratively ---
    const lpProblem = {
        name: 'TableSitting',
        objective: {
            direction: glpk.GLP_MAX, // Maximize
            name: 'TotalPreference',
            // Generate objective variables: { name: x_i_j, coef: pref[i][j] + EPSILON } for i != j
            vars: indices.flatMap(i =>
                indices
                    .filter(j => i !== j)
                    .map(j => ({
                        name: getVarName(i, j),
                        // Add assertion for preference value safety
                        coef: typeof pref[i][j] === 'number' ? pref[i][j] + EPSILON : EPSILON
                    }))
            )
        },
        subjectTo: [
            // 1. Row Sum Constraints: sum(x_i_j for j != i) = 2 (Each person has exactly 2 neighbors)
            ...indices.map(i => ({
                name: `RowSum_${i}`,
                vars: indices
                    .filter(j => i !== j)
                    .map(j => ({ name: getVarName(i, j), coef: 1.0 })),
                // Change to Fixed Bound (Equality Constraint)
                bnds: { type: glpk.GLP_FX, ub: 2.0, lb: 2.0 }
            })),

            // 2. Column Sum Constraints: sum(x_i_j for i != j) = 2 (Redundant due to symmetry, but good practice)
            ...indices.map(j => ({
                name: `ColSum_${j}`,
                vars: indices
                    .filter(i => i !== j)
                    .map(i => ({ name: getVarName(i, j), coef: 1.0 })),
                // Change to Fixed Bound (Equality Constraint)
                bnds: { type: glpk.GLP_FX, ub: 2.0, lb: 2.0 }
            })),

            // 3. Symmetry Constraints: x_i_j - x_j_i = 0 for i < j
            ...indices.flatMap(i =>
                indices
                    .filter(j => i < j) // Ensure i < j to define constraint only once
                    .map(j => ({
                        name: `Symm_${i}_${j}`,
                        vars: [
                            { name: getVarName(i, j), coef: 1.0 },
                            { name: getVarName(j, i), coef: -1.0 }
                        ],
                        bnds: { type: glpk.GLP_FX, ub: 0.0, lb: 0.0 }
                    }))
            )
        ],
        // Generate binary variables: x_i_j for i != j
        binaries: indices.flatMap(i =>
            indices
                .filter(j => i !== j)
                .map(j => getVarName(i, j))
        )
    };

    // --- Solve the Problem ---
    const options = {
        msglev: glpk.GLP_MSG_OFF, // Turn off solver messages
        presol: true, // Use presolver (recommended)
    };

    const result = await glpk.solve(lpProblem, options); // Let errors propagate

    // --- Process and Check Results ---
    const statusMap = {
        [glpk.GLP_UNDEF]: 'Undefined', [glpk.GLP_FEAS]: 'Feasible',
        [glpk.GLP_INFEAS]: 'Infeasible', [glpk.GLP_NOFEAS]: 'No Feasible Solution',
        [glpk.GLP_OPT]: 'Optimal', [glpk.GLP_UNBND]: 'Unbounded'
    };
    const statusText = statusMap[result.result.status] || 'Unknown';

    // Check if the solution is optimal or feasible
    if (result.result.status !== glpk.GLP_OPT && result.result.status !== glpk.GLP_FEAS) {
        // Provide more context in the error for n >= 3 scenarios
        throw new Error(`Solver failed for n=${n}. Status: ${statusText} (${result.result.status}). Could not ensure exactly two neighbors per person.`);
    }
    // If feasible but not optimal (might happen with certain objectives/constraints), log a warning.
    if (result.result.status === glpk.GLP_FEAS) {
        console.warn(`[WARN] Solver found a feasible but not optimal solution for n=${n}. Status: ${statusText}`);
    }


    // --- Construct the Result Matrix ---
    const varMatrix = Array(n).fill(0).map(() => Array(n).fill(0)); // Initialize with 0s

    for (const varName in result.result.vars) {
        if (varName.startsWith('x_')) {
            const parts = varName.split('_');
            // Use assertions for robust parsing
            console.assert(parts.length === 3, `Invalid variable name format: ${varName}`);
            const i = parseInt(parts[1], 10);
            const j = parseInt(parts[2], 10);
            console.assert(!isNaN(i) && !isNaN(j), `Failed to parse indices from: ${varName}`);

            // Ensure indices are valid before accessing matrix
            if (i >= 0 && i < n && j >= 0 && j < n) {
                // Round the result, as GLPK might return values very close to 0 or 1
                varMatrix[i][j] = Math.round(result.result.vars[varName]);
                // Assert that the value is indeed binary after rounding
                console.assert(varMatrix[i][j] === 0 || varMatrix[i][j] === 1, `Non-binary value found for ${varName}: ${result.result.vars[varName]}`);
            } else {
                // This case should ideally not happen if input is correct and parsing works
                console.warn(`[WARN] Parsed indices [${i}, ${j}] from ${varName} are out of bounds for size ${n}.`);
            }
        }
    }

    // Add final assertions: Check symmetry and degree constraints on the result matrix
    // Since we handled n=1, n=2 explicitly, these checks apply for n >= 3
    for (let i = 0; i < n; ++i) {
        let rowSum = 0;
        // let colSum = 0; // Column sum check is redundant due to symmetry and row sum check
        for (let j = 0; j < n; ++j) {
            if (i !== j) {
                console.assert(varMatrix[i][j] === varMatrix[j][i], `Symmetry broken: varMatrix[${i}][${j}] (${varMatrix[i][j]}) !== varMatrix[${j}][${i}] (${varMatrix[j][i]})`);
                rowSum += varMatrix[i][j];
                // colSum += varMatrix[j][i]; // Use symmetry for colSum check here
            } else {
                console.assert(varMatrix[i][i] === 0, `Diagonal element varMatrix[${i}][${i}] is not 0`);
            }
        }
        // For n >= 3, every person MUST have exactly 2 neighbors
        console.assert(rowSum === 2, `Person ${i} has degree ${rowSum} (expected 2 for n=${n})`);
        // Column sum check is implicitly covered by row sum and symmetry check
    }


    return varMatrix;
}
