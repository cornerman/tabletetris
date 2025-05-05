// Removed import GLPKFactory from 'glpk.js';
// Import GLPK types from the facade
import {
    GLPKInstance,
    GLPKProblem,
    GLPKSolverOptions,
    GLPKConstraint,
    GLPKVar,
    GLPKSolveResult,
    GLPKBound, // Import necessary types
    GLPKObjective
} from './glpk_facade.ts';

// Define common types specific to this module
type AdjacencyMatrix = number[][];
type PreferenceMatrix = number[][];
// Basic GLPK type definition based on usage -- REMOVED
// interface GLPKVar { ... }
// interface GLPKBound { ... }
// interface GLPKConstraint { ... }
// interface GLPKObjective { ... }
// interface GLPKProblem { ... }
// interface GLPKSolveResult { ... }
// interface GLPKSolverOptions { ... }
// export interface GLPKInstance { ... }

/**
 * Finds disjoint cycles (subtours) in a graph represented by an adjacency matrix.
 * Assumes the graph is a collection of disjoint cycles (degree of each node is 2).
 *
 * @param {number[][]} adjMatrix - A binary adjacency matrix where adjMatrix[i][j] = 1
 *                                if person i sits next to person j.
 * @returns {number[][]} An array of arrays, where each inner array contains the
 *                        node indices of a single cycle (subtour).
 */
function findSubtours(adjMatrix: AdjacencyMatrix): number[][] {
    const n: number = adjMatrix.length;
    if (n === 0) return [];
    const visited: boolean[] = Array(n).fill(false);
    const subtours: number[][] = [];

    // Helper to find neighbors (exactly two for n >= 3 based on LP constraints)
    function getNeighbors(node: number): number[] { // Added type annotation
        const neighbors: number[] = [];
        for (let j = 0; j < n; j++) {
            if (adjMatrix[node][j] === 1) {
                neighbors.push(j);
            }
        }
        // Assert degree 2 for n>=3, handle n=1, n=2 based on how solveSitting calls this
        if (n >= 3) {
            console.assert(neighbors.length === 2, `[findSubtours] Node ${node} should have degree 2 for n=${n}, found ${neighbors.length}. Matrix row: ${adjMatrix[node]}`);
        } else if (n === 2) {
            console.assert(neighbors.length === 1, `[findSubtours] Node ${node} should have degree 1 for n=2, found ${neighbors.length}. Matrix row: ${adjMatrix[node]}`);
        } else if (n === 1) {
            console.assert(neighbors.length === 0, `[findSubtours] Node ${node} should have degree 0 for n=1, found ${neighbors.length}. Matrix row: ${adjMatrix[node]}`);
            return []; // Special case for single node
        }
        // Return neighbors, handling potential assertion failures gracefully for loop logic
        return neighbors.length === 2 || neighbors.length === 1 ? neighbors : [];
    }

    for (let i = 0; i < n; i++) {
        if (!visited[i]) {
            const currentCycle: number[] = []; // Added type annotation
            let currentNode: number = i;
            let prevNode: number = -1; // To avoid immediate backtracking in the cycle trace

            console.log(`[DEBUG] [findSubtours] Starting DFS for new cycle from node ${i}`);

            // Trace the cycle
            while (!visited[currentNode]) {
                visited[currentNode] = true;
                currentCycle.push(currentNode);
                // console.log(`[DEBUG] [findSubtours] Visiting node ${currentNode}, cycle: [${currentCycle.join(', ')}]`); // Verbose

                const neighbors = getNeighbors(currentNode);

                // Determine the next node in the cycle path
                let nextNode: number = -1; // Added type annotation
                if (neighbors.length === 0 && n === 1) { // Single node 'cycle'
                    break;
                } else if (neighbors.length === 1 && n === 2) { // Two-node cycle
                    nextNode = neighbors[0];
                } else if (neighbors.length === 2) { // Standard case for n >= 3
                    // The next node is the neighbor that isn't the one we just came from
                    nextNode = neighbors[0] === prevNode ? neighbors[1] : neighbors[0];
                } else {
                    // This signifies an issue with the input matrix (not degree 2)
                    console.error(`[ERROR] [findSubtours] Node ${currentNode} has unexpected degree ${neighbors.length} for n=${n}. Cannot trace cycle reliably.`);
                    // Abort tracing this path to prevent potential infinite loops
                    currentCycle.length = 0; // Invalidate this cycle
                    break;
                }

                // Check if we've completed the cycle or hit an unexpected state
                if (visited[nextNode]) {
                    if (nextNode === i) {
                        // Successfully completed the cycle, returned to the start node
                        console.log(`[DEBUG] [findSubtours] Completed cycle, returned to start node ${i}`);
                        break; // Exit while loop
                    } else {
                        // This indicates we hit a node visited by *another* cycle's DFS,
                        // which contradicts the assumption of disjoint cycles (degree 2 constraint).
                        console.warn(`[WARN] [findSubtours] Cycle detection path hit an unexpected visited node ${nextNode} (not start ${i}) from node ${currentNode}. Matrix or LP solution might be flawed.`);
                        currentCycle.length = 0; // Invalidate this cycle
                        break; // Exit while loop
                    }
                }

                // Move to the next node
                prevNode = currentNode;
                currentNode = nextNode;
            } // End while(!visited[currentNode])

            // Add the found cycle if it's valid (not invalidated by errors)
            if (currentCycle.length > 0) {
                console.log(`[DEBUG] [findSubtours] Found cycle: [${currentCycle.join(', ')}]`);
                subtours.push(currentCycle);
            } else if (!visited[i] && n > 0) {
                // If we started DFS from i but ended up with an empty cycle (and i is still not marked visited somehow)
                console.error(`[ERROR] [findSubtours] Failed to trace cycle starting from node ${i}. Node remains unvisited.`);
                // Mark as visited to prevent infinite outer loop? Or throw?
                visited[i] = true; // Prevent re-attempting from this node
            }
        } // End if(!visited[i])
    } // End for loop

    // Final validation: Ensure all nodes are visited if n > 0
    if (n > 0 && !visited.every(v => v)) {
        // Fix: Define indices for filtering
        const allIndices = Array.from({ length: n }, (_, k) => k);
        const unvisitedNodes = allIndices.filter((idx: number) => !visited[idx]); // Added type annotation
        console.warn(`[WARN] [findSubtours] Not all nodes were visited after cycle detection. Unvisited: [${unvisitedNodes.join(', ')}]. This may indicate graph issues.`);
    }

    console.log(`[DEBUG] [findSubtours] Finished. Found ${subtours.length} subtours.`);
    return subtours;
}

/**
 * Solves the table seating arrangement problem using GLPK, ensuring a single table (Hamiltonian cycle).
 *
 * @param {object} glpk - The initialized GLPK.js instance (contains constants like GLP_MAX).
 * @param {number[][]} pref - The preference matrix where pref[i][j] is the
 *                            preference score of person i sitting next to person j.
 * @returns {Promise<number[][]>} A promise that resolves to a binary adjacency matrix
 *                       representing a single table arrangement (Hamiltonian cycle).
 * @throws {Error} If the solver fails, finds no feasible solution, the
 *                 problem is unbounded, or cannot find a single-cycle solution within iterations.
 */
export async function solveSitting(glpk: GLPKInstance, pref: PreferenceMatrix): Promise<AdjacencyMatrix> { // Added type annotations
    const EPSILON = 0.001; // Small incentive for pairing up
    const n: number = pref.length;
    const MAX_SUBTOUR_ITERATIONS: number = n * 2; // Max iterations for subtour elimination

    // Handle trivial cases explicitly
    if (n === 0) return [];
    if (n === 1) return [[0]];
    if (n === 2) return [[0, 1], [1, 0]];

    console.assert(pref.every((row: number[]) => row.length === n), "Preference matrix must be square."); // Added type annotation
    console.assert(n >= 3, "Solver logic assumes n >= 3 after initial checks.");

    function getVarName(i: number, j: number): string { return `x_${i}_${j}`; } // Added type annotations
    const indices: number[] = Array.from({ length: n }, (_, k) => k);

    // --- Define BASE GLPK Problem Object ---
    const baseLpProblem: GLPKProblem = { // Added type annotation
        name: 'TableSitting',
        objective: {
            direction: glpk.GLP_MAX,
            name: 'TotalPreference',
            vars: indices.flatMap(i =>
                indices.filter(j => i !== j).map(j => ({
                    name: getVarName(i, j),
                    coef: typeof pref[i][j] === 'number' ? pref[i][j] + EPSILON : EPSILON
                }))
            )
        },
        subjectTo: [
            // 1. Degree Constraints (Row Sum = 2)
            ...indices.map((i: number) => ({ // Added type annotation
                name: `RowSum_${i}`,
                vars: indices.filter(j => i !== j).map(j => ({ name: getVarName(i, j), coef: 1.0 })),
                bnds: { type: glpk.GLP_FX, ub: 2.0, lb: 2.0 }
            })),
            // 2. Symmetry Constraints (x_i_j - x_j_i = 0 for i < j)
            ...indices.flatMap((i: number) =>
                indices.filter(j => i < j).map((j: number) => ({ // Added type annotation
                    name: `Symm_${i}_${j}`,
                    vars: [{ name: getVarName(i, j), coef: 1.0 }, { name: getVarName(j, i), coef: -1.0 }],
                    bnds: { type: glpk.GLP_FX, ub: 0.0, lb: 0.0 }
                }))
            )
            // Note: Column sum constraints are redundant due to degree and symmetry
        ],
        binaries: indices.flatMap(i => indices.filter(j => i !== j).map(j => getVarName(i, j)))
    };

    const solverOptions: GLPKSolverOptions = { // Added type annotation
        msglev: glpk.GLP_MSG_OFF,
        presol: true,
    };

    // --- Iterative Solving Loop with Subtour Elimination ---
    let currentSubtourConstraints: GLPKConstraint[] = []; // Added type annotation
    let lastVarMatrix: AdjacencyMatrix | null = null; // Added type annotation

    for (let iter = 0; iter < MAX_SUBTOUR_ITERATIONS; iter++) {
        console.log(`[DEBUG] Starting solver iteration ${iter + 1}/${MAX_SUBTOUR_ITERATIONS}`);

        // Create the problem for this iteration by combining base and current subtour constraints
        const lpProblemForIter: GLPKProblem = { // Added type annotation
            ...baseLpProblem,
            subjectTo: [
                ...baseLpProblem.subjectTo,
                ...currentSubtourConstraints // Add constraints from previous iterations
            ]
        };
        // console.log("[DEBUG] LP Problem for Iteration:", JSON.stringify(lpProblemForIter, null, 2)); // Very verbose

        let result: GLPKSolveResult; // Added type annotation
        try {
            result = await glpk.solve(lpProblemForIter, solverOptions);
            // console.log("[DEBUG] GLPK Raw Result:", JSON.stringify(result, null, 2)); // Verbose

            // Check solver status immediately after solve call
            if (!result || !result.result) {
                throw new Error(`GLPK solver returned invalid result object.`);
            }
            console.log(`[DEBUG] GLPK Solve Status for Iter ${iter + 1}: ${result.result.status}`);

            // Interpret the result (convert var values to adjacency matrix)
            const varMatrix: AdjacencyMatrix = Array(n).fill(0).map(() => Array(n).fill(0)); // Added type
            for (const varName in result.result.vars) {
                if (varName.startsWith('x_') && result.result.vars[varName] > 0.5) { // Use 0.5 threshold for binaries
                    const [_, iStr, jStr] = varName.split('_');
                    const i: number = parseInt(iStr, 10);
                    const j: number = parseInt(jStr, 10);
                    varMatrix[i][j] = 1;
                }
            }
            // console.log("[DEBUG] Var Matrix from Iteration:", JSON.stringify(varMatrix, null, 2)); // Verbose
            lastVarMatrix = varMatrix; // Store the latest valid matrix

            // --- Subtour Detection and Constraint Addition ---
            const subtours = findSubtours(varMatrix);

            // Check if we have a single cycle (Hamiltonian cycle)
            if (subtours.length <= 1) {
                console.log(`[DEBUG] Found single cycle solution in iteration ${iter + 1}.`);
                // Validate status - should be OPTIMAL or FEASIBLE if single cycle found
                if (result.result.status !== glpk.GLP_OPT && result.result.status !== glpk.GLP_FEAS) {
                    // This case might indicate a problem if we expected optimality
                    console.warn(`[WARN] Solver status is ${result.result.status}, not OPT/FEAS, but found single cycle.`);
                }
                return varMatrix; // Success!
            }

            // If multiple subtours, add elimination constraints
            console.log(`[DEBUG] Found ${subtours.length} subtours in iteration ${iter + 1}. Adding constraints.`);
            subtours.forEach((subtour: number[], idx: number) => { // Add types
                if (subtour.length < n) {
                    console.log(`[DEBUG] Adding constraint for subtour ${idx + 1}: [${subtour.join(', ')}]`);
                    const subtourVars: GLPKVar[] = []; // Added type
                    for (let i = 0; i < subtour.length; i++) {
                        for (let j = i + 1; j < subtour.length; j++) {
                            const u = subtour[i];
                            const v = subtour[j];
                            subtourVars.push({ name: getVarName(u, v), coef: 1.0 });
                        }
                    }
                    // Constraint: Sum_{i,j in S} x_i_j <= |S| - 1
                    const newConstraint: GLPKConstraint = { // Added type
                        name: `SubtourElim_${iter}_${idx}`,
                        vars: subtourVars,
                        bnds: { type: glpk.GLP_UP, ub: subtour.length - 1.0, lb: 0.0 } // Upper bound
                    };
                    currentSubtourConstraints.push(newConstraint);
                    // console.log("[DEBUG] Added Constraint:", JSON.stringify(newConstraint, null, 2)); // Verbose
                }
            });

        } catch (err: any) { // Catch block error type
            console.error(`[ERROR] GLPK solver failed during iteration ${iter + 1}:`, err);
            // Attempt to provide more context based on the error type or status
            if (err instanceof Error) {
                throw new Error(`Solver error in iteration ${iter + 1}: ${err.message}`);
            }
            // If it was a status error from GLPK (though caught above ideally)
            // This might catch errors thrown by the GLPK library itself if it rejects.
            throw new Error(`Unhandled solver failure in iteration ${iter + 1}.`);
        }

    } // End of iteration loop

    // If loop finishes without returning, we failed to find a single cycle
    console.error(`[ERROR] Failed to find a single cycle solution after ${MAX_SUBTOUR_ITERATIONS} iterations.`);
    if (lastVarMatrix) {
        console.error("[ERROR] Last matrix found (may contain subtours):");
        console.error(JSON.stringify(lastVarMatrix, null, 2));
        const lastSubtours = findSubtours(lastVarMatrix);
        console.error(`[ERROR] Subtours in last matrix (${lastSubtours.length}): ${JSON.stringify(lastSubtours)}`);
    }
    throw new Error(`Failed to find a single cycle solution within ${MAX_SUBTOUR_ITERATIONS} iterations.`);
}
