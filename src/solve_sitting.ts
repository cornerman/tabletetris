// Removed import GLPKFactory from 'glpk.js';

// Define common types
type AdjacencyMatrix = number[][];
type PreferenceMatrix = number[][];
// Basic GLPK type definition based on usage
interface GLPKVar {
    name: string;
    coef: number;
}
interface GLPKBound {
    type: number; // e.g., glpk.GLP_FX, glpk.GLP_UP
    ub: number;
    lb: number;
}
interface GLPKConstraint {
    name: string;
    vars: GLPKVar[];
    bnds: GLPKBound;
}
interface GLPKObjective {
    direction: number; // e.g., glpk.GLP_MAX
    name: string;
    vars: GLPKVar[];
}
interface GLPKProblem {
    name: string;
    objective: GLPKObjective;
    subjectTo: GLPKConstraint[];
    binaries?: string[]; // Optional based on usage
}
interface GLPKSolveResult {
    result: {
        status: number;
        vars: Record<string, number>; // Variable names map to values
        // ... other potential fields like z (objective value)
    };
}
interface GLPKInstance {
    GLP_MAX: number;
    GLP_FX: number;
    GLP_UP: number;
    GLP_MSG_OFF: number;
    GLP_UNDEF: number;
    GLP_FEAS: number;
    GLP_INFEAS: number;
    GLP_NOFEAS: number;
    GLP_OPT: number;
    GLP_UNBND: number;
    solve(problem: GLPKProblem, options?: any): Promise<GLPKSolveResult>;
}

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
    function getNeighbors(node: number): number[] { // Added type
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
            const currentCycle: number[] = []; // Added type
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
                let nextNode: number = -1; // Added type
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
        const unvisitedNodes = allIndices.filter((idx: number) => !visited[idx]); // Added type
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
export async function solveSitting(glpk: GLPKInstance, pref: PreferenceMatrix): Promise<AdjacencyMatrix> { // Added types
    const EPSILON = 0.001; // Small incentive for pairing up
    const n: number = pref.length;
    const MAX_SUBTOUR_ITERATIONS: number = n * 2; // Max iterations for subtour elimination

    // Handle trivial cases explicitly
    if (n === 0) return [];
    if (n === 1) return [[0]];
    if (n === 2) return [[0, 1], [1, 0]];

    console.assert(pref.every((row: number[]) => row.length === n), "Preference matrix must be square."); // Added type
    console.assert(n >= 3, "Solver logic assumes n >= 3 after initial checks.");

    function getVarName(i: number, j: number): string { return `x_${i}_${j}`; } // Added types
    const indices: number[] = Array.from({ length: n }, (_, k) => k);

    // --- Define BASE GLPK Problem Object ---
    const baseLpProblem: GLPKProblem = { // Added type
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
            ...indices.map((i: number) => ({
                name: `RowSum_${i}`,
                vars: indices.filter(j => i !== j).map(j => ({ name: getVarName(i, j), coef: 1.0 })),
                bnds: { type: glpk.GLP_FX, ub: 2.0, lb: 2.0 }
            })),
            // 2. Symmetry Constraints (x_i_j - x_j_i = 0 for i < j)
            ...indices.flatMap((i: number) =>
                indices.filter(j => i < j).map((j: number) => ({
                    name: `Symm_${i}_${j}`,
                    vars: [{ name: getVarName(i, j), coef: 1.0 }, { name: getVarName(j, i), coef: -1.0 }],
                    bnds: { type: glpk.GLP_FX, ub: 0.0, lb: 0.0 }
                }))
            )
            // Note: Column sum constraints are redundant due to degree and symmetry
        ],
        binaries: indices.flatMap(i => indices.filter(j => i !== j).map(j => getVarName(i, j)))
    };

    const solverOptions = {
        msglev: glpk.GLP_MSG_OFF,
        presol: true,
    };

    // --- Iterative Solving Loop with Subtour Elimination ---
    let currentSubtourConstraints: GLPKConstraint[] = []; // Store added constraints - Added type
    let lastVarMatrix: AdjacencyMatrix | null = null; // Keep track of the last matrix found - Added type

    for (let iter = 0; iter < MAX_SUBTOUR_ITERATIONS; iter++) {
        console.log(`[DEBUG] Starting solver iteration ${iter + 1}/${MAX_SUBTOUR_ITERATIONS}`);

        // Create the problem for this iteration by combining base and current subtour constraints
        const lpProblemForIter: GLPKProblem = { // Added type
            ...baseLpProblem,
            subjectTo: [
                ...baseLpProblem.subjectTo,
                ...currentSubtourConstraints // Add constraints from previous iterations
            ]
        };
        // console.log("[DEBUG] LP Problem for Iteration:", JSON.stringify(lpProblemForIter, null, 2)); // Very verbose

        let result: GLPKSolveResult; // Added type
        try {
            result = await glpk.solve(lpProblemForIter, solverOptions);
        } catch (error: unknown) { // Catch as unknown
            console.error(`[ERROR] glpk.solve threw an error in iteration ${iter + 1}:`, error);
            // Type check before accessing .message
            const errorMessage = (error instanceof Error) ? error.message : String(error);
            throw new Error(`GLPK solver encountered an error during iteration ${iter + 1}: ${errorMessage}`);
        }


        const statusMap: Record<number, string> = { // Added type
            [glpk.GLP_UNDEF]: 'Undefined', [glpk.GLP_FEAS]: 'Feasible',
            [glpk.GLP_INFEAS]: 'Infeasible', [glpk.GLP_NOFEAS]: 'No Feasible Solution',
            [glpk.GLP_OPT]: 'Optimal', [glpk.GLP_UNBND]: 'Unbounded'
        };
        const statusText: string = statusMap[result.result.status] || `Unknown (${result.result.status})`; // Added type

        // --- Process and Check Results ---
        if (result.result.status !== glpk.GLP_OPT && result.result.status !== glpk.GLP_FEAS) {
            // If it's infeasible *after* adding subtour constraints, it means no single cycle exists
            if (iter > 0 && (result.result.status === glpk.GLP_INFEAS || result.result.status === glpk.GLP_NOFEAS)) {
                console.error(`[ERROR] Solver became infeasible after ${iter + 1} iterations (added ${currentSubtourConstraints.length} subtour constraints). No single-cycle solution possible.`);
                throw new Error(`Solver failed after ${iter + 1} iterations. Status: ${statusText}. No single-cycle solution found satisfying all constraints.`);
            } else {
                // Failed on the first try or for other reasons
                console.error(`[ERROR] Solver failed. Iteration: ${iter + 1}, Status: ${statusText}`);
                throw new Error(`Solver failed. Status: ${statusText} (${result.result.status}).`);
            }
        }
        if (result.result.status === glpk.GLP_FEAS) {
            console.warn(`[WARN] Solver found a feasible but not guaranteed optimal solution in iteration ${iter + 1}. Status: ${statusText}`);
        }

        // --- Construct the Result Matrix ---
        const varMatrix: AdjacencyMatrix = Array(n).fill(0).map(() => Array(n).fill(0)); // Added type
        for (const varName in result.result.vars) {
            // Use hasOwnProperty check
            if (Object.prototype.hasOwnProperty.call(result.result.vars, varName) && varName.startsWith('x_')) {
                const parts = varName.split('_');
                console.assert(parts.length === 3, `Invalid variable name format: ${varName}`);
                const i = parseInt(parts[1], 10);
                const j = parseInt(parts[2], 10);
                console.assert(!isNaN(i) && !isNaN(j), `Failed to parse indices from: ${varName}`);
                if (i >= 0 && i < n && j >= 0 && j < n) {
                    varMatrix[i][j] = Math.round(result.result.vars[varName]);
                    console.assert(varMatrix[i][j] === 0 || varMatrix[i][j] === 1, `Non-binary value found for ${varName}: ${result.result.vars[varName]}`);
                } else {
                    console.warn(`[WARN] Parsed indices [${i}, ${j}] from ${varName} are out of bounds for size ${n}.`);
                }
            }
        }
        lastVarMatrix = varMatrix; // Store potentially multi-cycle matrix

        // --- Verify Constraints on Result Matrix (Optional but Recommended) ---
        try {
            for (let i = 0; i < n; ++i) {
                let rowSum = 0;
                for (let j = 0; j < n; ++j) {
                    if (i !== j) {
                        console.assert(varMatrix[i][j] === varMatrix[j][i], `Symmetry broken: varMatrix[${i}][${j}] !== varMatrix[${j}][${i}]`);
                        rowSum += varMatrix[i][j];
                    } else {
                        console.assert(varMatrix[i][i] === 0, `Diagonal element varMatrix[${i}][${i}] is not 0`);
                    }
                }
                console.assert(rowSum === 2, `Person ${i} has degree ${rowSum} (expected 2)`);
            }
        } catch (assertionError: unknown) { // Catch as unknown
            console.error("[ERROR] Assertion failed on solver result matrix:", assertionError);
            console.error("[ERROR] Matrix:", JSON.stringify(varMatrix));
            // Type check before accessing .message
            const errorMessage = (assertionError instanceof Error) ? assertionError.message : String(assertionError);
            throw new Error(`Solver returned an invalid matrix (failed assertions) in iteration ${iter + 1}. ${errorMessage}`);
        }


        // --- Check for Subtours ---
        const subtours = findSubtours(varMatrix); // Use the helper function
        console.log(`[DEBUG] Iteration ${iter + 1}: Found ${subtours.length} subtours.`);

        // Check if we found the solution
        if (subtours.length === 1 && subtours[0].length === n) {
            console.log(`[DEBUG] Found single cycle solution with ${n} nodes in iteration ${iter + 1}.`);
            // *** REMOVE DEBUG LOGS BEFORE RETURNING THE FINAL SOLUTION ***
            // This is the desired Hamiltonian cycle
            return varMatrix;
        }

        // If multiple subtours, add elimination constraints
        if (subtours.length > 1) {
            console.log(`[DEBUG] Iteration ${iter + 1}: Adding subtour elimination constraint(s).`);
            // Add a constraint for each found subtour that doesn't span all n nodes
            let addedConstraintsThisIteration = 0;
            for (const S of subtours) {
                if (S.length < n && S.length > 0) { // Only add constraints for *proper* subtours
                    const constraint: GLPKConstraint = { // Added type
                        name: `SubtourElim_${iter}_${S.slice(0, 5).join('_')}`, // Unique-ish name
                        vars: S.flatMap((i: number) => // Added type
                            S.filter((j: number) => i < j) // Added type
                                .map((j: number) => ({ name: getVarName(i, j), coef: 1.0 })) // Added type
                        ),
                        // Constraint: sum(x_ij for i,j in S, i<j) <= |S| - 1
                        bnds: { type: glpk.GLP_UP, ub: S.length - 1.0, lb: 0.0 }
                    };
                    console.log(`[DEBUG] Adding constraint: ${constraint.name}, Nodes: [${S.join(', ')}], UB = ${S.length - 1}`);
                    currentSubtourConstraints.push(constraint);
                    addedConstraintsThisIteration++;
                }
            }
            if (addedConstraintsThisIteration === 0 && subtours.length > 0) {
                // This might happen if findSubtours returns [[0, 1, ..., n-1]] erroneously when it should be multiple tours,
                // or if it returns empty arrays.
                console.warn(`[WARN] Found ${subtours.length} subtours, but none were suitable for adding an elimination constraint (length < n). Subtours: ${JSON.stringify(subtours)}`);
                // Avoid infinite loop if the state seems stuck
                if (iter > 0) { // Give it at least one chance to add constraints
                    console.error("[ERROR] Stuck in subtour elimination loop without progress. Aborting.");
                    throw new Error("Subtour elimination failed to progress. Potential issue with solver or cycle detection.");
                }
            }


        } else if (subtours.length === 0 && n > 0) {
            console.error(`[ERROR] findSubtours returned 0 cycles for n=${n}. Matrix:`, JSON.stringify(varMatrix));
            throw new Error(`Inconsistent state: findSubtours found no cycles for n=${n}.`);
        } else if (subtours.length === 1 && subtours[0].length !== n) {
            // This case should ideally not happen if degree constraints hold and findSubtours is correct.
            // It implies a single cycle exists but doesn't include everyone.
            console.error(`[ERROR] Found a single cycle, but it only includes ${subtours[0].length}/${n} nodes. Cycle: [${subtours[0].join(', ')}]. Matrix:`, JSON.stringify(varMatrix));
            throw new Error(`Inconsistent state: Found a single cycle of incorrect length ${subtours[0].length}. Expected ${n}.`);
        }

    } // End for loop (iterations)

    // If loop finishes, we didn't find a single cycle within MAX_SUBTOUR_ITERATIONS
    console.error(`[ERROR] Failed to find a single cycle solution within ${MAX_SUBTOUR_ITERATIONS} iterations.`);
    // Optionally return the last multi-cycle solution found if needed for diagnostics, but per requirement, throw error.
    // if (lastVarMatrix) {
    //     console.warn("[WARN] Last multi-cycle solution found:", JSON.stringify(lastVarMatrix));
    // }
    throw new Error(`Failed to find a single cycle solution within ${MAX_SUBTOUR_ITERATIONS} iterations.`);
}
