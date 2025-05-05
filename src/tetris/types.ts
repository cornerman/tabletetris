import { BOARD_WIDTH, BOARD_HEIGHT } from './constants';
import { TetrominoType } from './constants';

// Define a type for the shape matrix explicitly
export type ShapeMatrix = ReadonlyArray<ReadonlyArray<0 | 1>>;

export type CellState = 0 | TetrominoType; // 0 represents an empty cell
export type BoardState = CellState[][];

export interface PlayerState {
    pos: { x: number; y: number };
    tetrominoType: TetrominoType;
    shape: ShapeMatrix;
    rotationIndex: number; // Add rotation index (0, 1, 2, 3)
}

export interface GameState {
    board: BoardState;
    player: PlayerState;
    score: number;
    level: number;
    linesCleared: number;
    gameOver: boolean;
}