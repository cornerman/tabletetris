/**
 * Traces the single cycle present in the adjacency matrix representing a table arrangement.
 * Assumes the matrix represents a single Hamiltonian cycle for n >= 3.
 * @param {number[][]} resultMatrix - The n x n adjacency matrix from the solver where 1 indicates connection.
 *                                   Assumed to represent a single cycle involving all nodes for n >= 3.
 * @returns {number[]} An array containing the indices of people in the order they appear in the cycle.
 *                     Returns an empty array for n=0, [0] for n=1, [0, 1] for n=2.
 * @throws {Error} If the matrix dimensions are invalid or assumptions (degree 2 for n>=3, single cycle) are violated.
 */
export function extractTableCycle(resultMatrix) {
    const n = resultMatrix.length;

    // Handle base cases
    if (n === 0) {
        return [];
    }
    // For n=1, solveSitting returns [[0]]. Cycle is just [0].
    if (n === 1) {
        // Basic validation for n=1
        console.assert(Array.isArray(resultMatrix[0]) && resultMatrix[0].length === 1, "Expected 1x1 matrix for n=1");
        // console.assert(resultMatrix[0][0] === 0, "Expected matrix[[0]] for n=1"); // Self-loops aren't used
        return [0];
    }
    // For n=2, solveSitting returns [[0, 1], [1, 0]]. Cycle is [0, 1].
    if (n === 2) {
        // Basic validation for n=2
        console.assert(Array.isArray(resultMatrix[0]) && resultMatrix[0].length === 2, "Expected 2x2 matrix for n=2");
        console.assert(resultMatrix[0][1] === 1 && resultMatrix[1][0] === 1, "Expected connection between 0 and 1 for n=2");
        return [0, 1]; // Return a consistent order
    }

    // Validate dimensions for n >= 3
    if (!Array.isArray(resultMatrix[0]) || resultMatrix[0].length !== n) {
        throw new Error(`Invalid resultMatrix dimensions. Expected ${n}x${n}.`);
    }

    // --- Cycle Tracing for n >= 3 ---
    const path = [];
    let currentNode = 0; // Start arbitrarily at node 0
    let prevNode = -1;   // Represents the node visited just before currentNode

    console.log(`[DEBUG] [extractTableCycle] Starting cycle trace for n=${n} from node 0.`);

    for (let step = 0; step < n; step++) {
        console.assert(currentNode >= 0 && currentNode < n, `[extractTableCycle] Invalid currentNode: ${currentNode}`);
        path.push(currentNode);
        console.log(`[DEBUG] [extractTableCycle] Step ${step}: Added ${currentNode} to path. Path: [${path.join(', ')}]`);

        // Find neighbors of currentNode
        const neighbors = [];
        for (let neighborIdx = 0; neighborIdx < n; neighborIdx++) {
            console.assert(resultMatrix[currentNode] !== undefined && resultMatrix[currentNode][neighborIdx] !== undefined, `[extractTableCycle] Invalid matrix access at [${currentNode}][${neighborIdx}]`);
            if (resultMatrix[currentNode][neighborIdx] === 1) {
                neighbors.push(neighborIdx);
            }
        }

        // Verify degree is 2 (as expected for a cycle with n >= 3)
        console.assert(neighbors.length === 2, `[extractTableCycle] Node ${currentNode} should have degree 2 for n=${n}. Found ${neighbors.length}. Neighbors: [${neighbors.join(', ')}]. Matrix row: ${resultMatrix[currentNode]}`);
        if (neighbors.length !== 2) {
            throw new Error(`[extractTableCycle] Assumption failed: Node ${currentNode} has degree ${neighbors.length} (expected 2) for n=${n}. Matrix may not represent a single cycle.`);
        }

        // Determine the next node in the cycle
        const nextNode = neighbors[0] === prevNode ? neighbors[1] : neighbors[0];
        console.assert(nextNode >= 0 && nextNode < n, `[extractTableCycle] Invalid nextNode calculated: ${nextNode}`);

        console.log(`[DEBUG] [extractTableCycle] Step ${step}: Current ${currentNode}, Prev ${prevNode}, Neighbors [${neighbors.join(', ')}], Next ${nextNode}`);

        // Move to the next node
        prevNode = currentNode;
        currentNode = nextNode;
    }

    // --- Final Validation ---
    // 1. Check if we completed the cycle and returned to the start node
    console.assert(currentNode === 0, `[extractTableCycle] Cycle trace did not end at the starting node (0). Ended at ${currentNode}. Path: [${path.join(', ')}]`);
    if (currentNode !== 0) {
        throw new Error(`[extractTableCycle] Cycle trace failed: Did not return to start node 0 after ${n} steps. Ended at ${currentNode}.`);
    }

    // 2. Check if the path contains exactly n unique nodes
    console.assert(path.length === n, `[extractTableCycle] Final path length is ${path.length}, expected ${n}. Path: [${path.join(', ')}]`);
    // Check uniqueness (optional, as degree-2 assertion should prevent revisiting early)
    const uniqueNodes = new Set(path);
    console.assert(uniqueNodes.size === n, `[extractTableCycle] Path does not contain unique nodes. Path: [${path.join(', ')}], Unique count: ${uniqueNodes.size}`);
    if (path.length !== n || uniqueNodes.size !== n) {
        throw new Error(`[extractTableCycle] Cycle trace failed: Path length (${path.length}) or unique node count (${uniqueNodes.size}) is incorrect for n=${n}.`);
    }

    console.log(`[DEBUG] [extractTableCycle] Successfully traced cycle for n=${n}. Path: [${path.join(', ')}]`);
    // *** REMOVE DEBUG LOGS after testing ***
    return path;
} 
