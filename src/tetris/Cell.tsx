import React from 'react';
import { BoardState, CellState } from './types';

// Define colors for each Tetromino type (and empty cells)
// Using magic numbers for now, will move to constants later if needed
const cellColors: Record<CellState, string> = {
    0: '#111',      // Empty cell color
    'I': '#00FFFF',  // Cyan
    'O': '#FFFF00',  // Yellow
    'T': '#800080',  // Purple
    'S': '#00FF00',  // Green
    'Z': '#FF0000',  // Red
    'J': '#0000FF',  // Blue
    'L': '#FFA500',  // Orange
};

interface CellProps {
    type: CellState;
}

const Cell: React.FC<CellProps> = ({ type }) => {
    // Basic styling for a cell
    const style: React.CSSProperties = {
        width: 'auto', // Cells will expand to fill grid column
        aspectRatio: '1 / 1', // Make cells square
        backgroundColor: cellColors[type],
        border: type === 0 ? 'none' : '1px solid #555', // Border for non-empty cells
        boxSizing: 'border-box', // Include border in size calculation
    };

    return <div style={style} data-testid={`cell-${type}`}></div>;
};

export default React.memo(Cell); // Memoize to prevent unnecessary re-renders 