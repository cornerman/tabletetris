import GLPKFactory from 'glpk.js';
import { solveSitting } from './solve_sitting.mjs'; // Import the solver
import { extractTablesFromMatrix } from './matrix_to_table.mjs'; // Import the table extractor

// --- Simple Example Usage ---
const simplePreferences = [
    [0, 10, 0, 5], // Preferences of person 0
    [10, 0, 1, 0], // Preferences of person 1
    [0, 1, 0, 8],  // Preferences of person 2
    [5, 0, 8, 0]   // Preferences of person 3
];
const n = simplePreferences.length; // Number of people

// Asynchronous IIFE (Immediately Invoked Function Expression) to handle await
(async () => {
    const glpk = await GLPKFactory(); // Initialize glpk asynchronously
    const simpleResult = await solveSitting(glpk, simplePreferences);
    console.log("Simple Example Result Matrix:");
    console.log(simpleResult.map(row => row.join(' ')).join('\n'));

    // Extract the tables (groups of indices) from the result matrix
    const tablesIndices = extractTablesFromMatrix(simpleResult, n);
    console.log("\nExtracted Tables (Indices):");
    console.log(JSON.stringify(tablesIndices)); // Print the array of arrays of indices
})(); 
