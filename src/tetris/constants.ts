export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

// Define the possible types first
const TETROMINO_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export type TetrominoType = typeof TETROMINO_TYPES[number];

// Explicit type for shapes array (containing 4 rotations)
import { ShapeMatrix } from './types'; // Import the ShapeMatrix type

// Define shapes for all 4 rotations (0, 90, 180, 270 degrees clockwise)
// Using Readonly for safety
export const TETROMINOS: {
    [key in TetrominoType]: {
        // Represents the 4 rotation states for the piece
        shapes: Readonly<[ShapeMatrix, ShapeMatrix, ShapeMatrix, ShapeMatrix]>;
    }
} = {
    'I': {
        shapes: [
            // 0 deg
            [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
            // 90 deg
            [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
            // 180 deg
            [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]], // Adjusted from simple rotate for SRS-like feel
            // 270 deg
            [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]], // Adjusted
        ]
    },
    'O': {
        // O piece doesn't rotate visually
        shapes: [
            [[1, 1], [1, 1]],
            [[1, 1], [1, 1]],
            [[1, 1], [1, 1]],
            [[1, 1], [1, 1]],
        ]
    },
    'T': {
        shapes: [
            // 0 deg
            [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
            // 90 deg
            [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
            // 180 deg
            [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
            // 270 deg
            [[0, 1, 0], [1, 1, 0], [0, 1, 0]],
        ]
    },
    'S': {
        shapes: [
            // 0 deg
            [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
            // 90 deg
            [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
            // 180 deg (same as 0 deg visually in basic bounding box)
            [[0, 0, 0], [0, 1, 1], [1, 1, 0]], // Adjusted
            // 270 deg (same as 90 deg visually)
            [[1, 0, 0], [1, 1, 0], [0, 1, 0]], // Adjusted
        ]
    },
    'Z': {
        shapes: [
            // 0 deg
            [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
            // 90 deg
            [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
            // 180 deg (same as 0 deg visually)
            [[0, 0, 0], [1, 1, 0], [0, 1, 1]], // Adjusted
            // 270 deg (same as 90 deg visually)
            [[0, 1, 0], [1, 1, 0], [1, 0, 0]], // Adjusted
        ]
    },
    'J': {
        shapes: [
            // 0 deg
            [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
            // 90 deg
            [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
            // 180 deg
            [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
            // 270 deg
            [[1, 1, 0], [0, 1, 0], [0, 1, 0]],
        ]
    },
    'L': {
        shapes: [
            // 0 deg
            [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
            // 90 deg
            [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
            // 180 deg
            [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
            // 270 deg
            [[0, 1, 0], [0, 1, 0], [1, 1, 0]],
        ]
    },
};

// Scoring based on lines cleared at once
export const LINE_CLEAR_SCORES: { [key: number]: number } = {
    1: 40,    // Single
    2: 100,   // Double
    3: 300,   // Triple
    4: 1200,  // Tetris
};

// Lines needed to advance to the next level
export const LINES_PER_LEVEL = 10;

