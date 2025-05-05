import React from 'react';
import { TetrominoType, TETROMINOS } from './constants';
import { CellState, ShapeMatrix } from './types';

// Re-use cell colors from Cell.tsx (consider moving to a shared file/constants later)
const cellColors: Record<CellState, string> = {
    0: 'transparent', // Use transparent background for empty cells in preview
    'I': '#00FFFF', 'O': '#FFFF00', 'T': '#800080', 'S': '#00FF00',
    'Z': '#FF0000', 'J': '#0000FF', 'L': '#FFA500',
};

interface NextPiecePreviewProps {
    pieceType: TetrominoType;
}

const NextPiecePreview: React.FC<NextPiecePreviewProps> = ({ pieceType }) => {
    // Get the base shape (rotation 0) for the piece type
    const shape: ShapeMatrix = TETROMINOS[pieceType]?.shapes[0] || [[0]]; // Use shapes[0]
    const shapeHeight = shape.length;
    const shapeWidth = shape[0]?.length || 0; // Add safe access for width

    // Simple container styling
    const containerStyle: React.CSSProperties = {
        width: '80px', // Fixed width for the preview area
        height: '80px', // Fixed height
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111', // Slightly lighter than game bg
        borderRadius: '5px',
        padding: '5px',
        border: '1px solid #555',
    };

    // Grid styling within the container
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateRows: `repeat(${shapeHeight}, 1fr)`,
        gridTemplateColumns: `repeat(${shapeWidth}, 1fr)`,
        width: `${shapeWidth * 15}px`, // Calculate width based on shape
        height: `${shapeHeight * 15}px`, // Calculate height based on shape
        gap: '1px',
    };

    // Cell styling within the preview grid
    const cellStyle = (cell: 0 | 1): React.CSSProperties => ({
        backgroundColor: cell === 1 ? cellColors[pieceType] : cellColors[0],
        border: cell === 1 ? '1px solid #777' : 'none',
        boxSizing: 'border-box',
    });

    return (
        <div style={containerStyle} className="next-piece-preview">
            <p style={{ margin: '0 0 5px 0', fontSize: '0.8em', color: '#ccc' }}>Next:</p>
            <div style={gridStyle}>
                {shape.map((row: ReadonlyArray<0 | 1>, y: number) =>
                    row.map((cell: 0 | 1, x: number) => (
                        <div key={`${y}-${x}`} style={cellStyle(cell)}></div>
                    ))
                )}
            </div>
        </div>
    );
};

export default NextPiecePreview; 