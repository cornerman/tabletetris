/**
 * Identifies connected components (tables) in the graph represented by the result matrix using Breadth-First Search (BFS).
 * @param {number[][]} resultMatrix - The n x n adjacency matrix from the solver where 1 indicates connection.
 * @param {number} n - The number of people (dimension of the matrix).
 * @returns {number[][]} An array of arrays, where each inner array contains the indices of people at a table.
 *                       Returns an empty array if n is 0. Indices within each table are sorted numerically.
 */
export function extractTablesFromMatrix(resultMatrix) {
    const n = resultMatrix.length;
    const tables = [];
    if (n === 0) {
        return tables;
    }
    if (n > 0 && (!Array.isArray(resultMatrix[0]) || resultMatrix[0].length !== n)) {
        throw new Error(`Invalid resultMatrix dimensions. Expected ${n}x${n}.`);
    }


    const visited = new Array(n).fill(false);

    for (let i = 0; i < n; i++) {
        if (visited[i]) {
            continue;
        }

        // Start BFS for a new table
        const currentTableIndices = [];
        const queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            const currentIdx = queue.shift();
            // Assertion: currentIdx should be a valid index
            console.assert(currentIdx >= 0 && currentIdx < n, `Invalid index dequeued: ${currentIdx}`);
            currentTableIndices.push(currentIdx);

            // Find neighbors
            for (let neighborIdx = 0; neighborIdx < n; neighborIdx++) {
                // Check for connection and avoid self-loops
                // Assertion: Check matrix access is valid
                console.assert(resultMatrix[currentIdx] !== undefined && resultMatrix[currentIdx][neighborIdx] !== undefined, `Invalid matrix access at [${currentIdx}][${neighborIdx}]`);
                if (currentIdx !== neighborIdx && resultMatrix[currentIdx][neighborIdx] === 1) {
                    if (!visited[neighborIdx]) {
                        visited[neighborIdx] = true;
                        queue.push(neighborIdx);
                    }
                }
            }
        }

        // BFS for this component is done
        if (currentTableIndices.length > 0) {
            // Sort indices for consistent output order
            currentTableIndices.sort((a, b) => a - b);
            tables.push(currentTableIndices);
        } else {
            // Assertion: This state should ideally be unreachable if logic is correct
            console.assert(false, `BFS started from unvisited index ${i} resulted in an empty table.`);
        }
    }
    // Assertion: All nodes should have been visited if n > 0
    console.assert(n === 0 || visited.every(v => v), "Not all nodes were visited during table extraction.");
    return tables;
} 
