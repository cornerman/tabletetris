import { BOARD_WIDTH, BOARD_HEIGHT, TETROMINOS, TetrominoType } from './constants';
import { BoardState, CellState, PlayerState } from './types';

/**
 * Creates a new game board filled with empty cells.
 * @returns A new BoardState.
 */
export const createEmptyBoard = (): BoardState => {
    const board = Array.from({ length: BOARD_HEIGHT }, () =>
        Array(BOARD_WIDTH).fill(0 as CellState)
    );
    console.assert(board.length === BOARD_HEIGHT, '[ASSERT] createEmptyBoard height is wrong');
    console.assert(board[0].length === BOARD_WIDTH, '[ASSERT] createEmptyBoard width is wrong');
    return board;
};

/**
 * Selects a random Tetromino type.
 * @returns A random TetrominoType (I, O, T, S, Z, J, L).
 */
export const getRandomTetrominoType = (): TetrominoType => {
    const types = Object.keys(TETROMINOS) as TetrominoType[];
    const randomIndex = Math.floor(Math.random() * types.length);
    const randomType = types[randomIndex];
    console.assert(!!randomType, '[ASSERT] getRandomTetrominoType failed to return a type');
    return randomType;
};

/**
 * Checks for collision between the player's piece and the board boundaries or other pieces.
 * @param player The current player state (piece shape, type, position).
 * @param board The current board state.
 * @param move Optional: The intended move ({ dx: number, dy: number }) to check collision for.
 * @returns True if collision occurs, False otherwise.
 */
export const checkCollision = (
    player: PlayerState,
    board: BoardState,
    move: { dx: number; dy: number } = { dx: 0, dy: 0 } // Default to check current position
): boolean => {
    for (let y = 0; y < player.shape.length; y++) {
        for (let x = 0; x < player.shape[y].length; x++) {
            // 1. Check only filled cells of the tetromino shape
            if (player.shape[y][x] !== 1) {
                continue;
            }

            // 2. Calculate the projected cell position on the board
            const nextX = player.pos.x + x + move.dx;
            const nextY = player.pos.y + y + move.dy;

            // 3. Check for boundary collisions
            if (
                nextX < 0 || // Collision with left wall
                nextX >= BOARD_WIDTH || // Collision with right wall
                nextY >= BOARD_HEIGHT // Collision with bottom wall
                // Note: We don't check top boundary (nextY < 0) because pieces spawn from top
            ) {
                console.log(`[DEBUG] Collision: Boundary Hit at (${nextX}, ${nextY})`);
                return true; // Collision detected
            }

            // 4. Check for collision with existing pieces on the board
            // Ensure nextY is within board height before accessing board[nextY]
            if (nextY >= 0 && board[nextY][nextX] !== 0) {
                console.log(`[DEBUG] Collision: Piece Hit at (${nextX}, ${nextY}), existing: ${board[nextY][nextX]}`);
                return true; // Collision detected
            }
        }
    }

    // 5. No collisions found for any filled cell of the shape
    return false;
};

/**
 * Clears completed lines from the board and returns the new board and score delta.
 * @param board The board state after a piece has locked.
 * @returns An object containing the new board state and the number of lines cleared.
 */
export const clearLines = (board: BoardState): { newBoard: BoardState; linesCleared: number } => {
    let linesClearedCount = 0;
    const newBoard: BoardState = [];

    // Iterate bottom-up to make row removal easier
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        const row = board[y];
        // Check if the row is full (no cells contain 0)
        if (row.every(cell => cell !== 0)) {
            linesClearedCount++;
            console.log(`[DEBUG] Clearing line ${y}`);
        } else {
            // If the row is not full, keep it by adding it to the top of our newBoard array
            newBoard.unshift(row);
        }
    }

    // Add new empty rows at the top for each cleared line
    const emptyRow: CellState[] = Array(BOARD_WIDTH).fill(0);
    for (let i = 0; i < linesClearedCount; i++) {
        newBoard.unshift([...emptyRow]); // Add copies
    }

    console.assert(newBoard.length === BOARD_HEIGHT, "[ASSERT] clearLines resulted in incorrect board height");

    return { newBoard, linesCleared: linesClearedCount };
};

// More game logic functions (collision detection, tetromino definitions, rotation, line clearing) will be added here. 