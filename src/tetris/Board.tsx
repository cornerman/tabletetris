import React from 'react';
import Cell from './Cell';
import { BoardState } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT } from './constants';

interface BoardProps {
    board: BoardState;
}

const Board: React.FC<BoardProps> = ({ board }) => {
    console.assert(board.length === BOARD_HEIGHT, `[ASSERT] Board height mismatch: expected ${BOARD_HEIGHT}, got ${board.length}`);
    if (board.length > 0) {
        console.assert(board[0].length === BOARD_WIDTH, `[ASSERT] Board width mismatch: expected ${BOARD_WIDTH}, got ${board[0].length}`);
    }

    // Calculate size based on viewport height, maintaining aspect ratio
    const boardHeightVh = 75; // Use 75% of viewport height for the board
    const boardPixelHeight = `calc(${boardHeightVh}vh - 4px)`; // Subtract border width
    const boardPixelWidth = `calc((${boardHeightVh}vh - 4px) * (${BOARD_WIDTH} / ${BOARD_HEIGHT}))`; // Calculate width based on height and aspect ratio

    const style: React.CSSProperties = {
        display: 'grid',
        gridTemplateRows: `repeat(${BOARD_HEIGHT}, 1fr)`,
        gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)`,
        gap: '1px',
        border: '2px solid #ddd',
        backgroundColor: '#222', // Background for the gaps/grid lines
        // width: 'auto', // Let calculated width take precedence
        // height: '100%', // Let calculated height take precedence
        width: boardPixelWidth,
        height: boardPixelHeight,
        maxWidth: '100%', // Prevent exceeding container width (though calculated width should dominate)
        maxHeight: '100%', // Prevent exceeding container height (if container has one)
        margin: '0 auto', // Center board horizontally if container is wider
    };

    return (
        <div style={style} data-testid="tetris-board">
            {board.map((row, y) =>
                row.map((cell, x) => (
                    <Cell key={`${y}-${x}`} type={cell} />
                ))
            )}
        </div>
    );
};

export default Board; 