import React, { useState, useEffect, useCallback, useRef } from 'react';
import Board from './Board';
import NextPiecePreview from './NextPiecePreview'; // Import the new component
import { createEmptyBoard, getRandomTetrominoType, checkCollision, clearLines } from './gameLogic';
import { BoardState, PlayerState, CellState, ShapeMatrix } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT, TETROMINOS, TetrominoType, LINE_CLEAR_SCORES, LINES_PER_LEVEL } from './constants';
import './Tetris.css'; // Import CSS (even if empty for now)

const GAME_LOOP_INTERVAL_MS = 1000; // Start with 1 second interval
const LOCK_DELAY_MS = 500; // Milliseconds for lock delay

// Define Props including onClose
interface GameProps {
    onClose: () => void;
}

const Game: React.FC<GameProps> = ({ onClose }) => {
    // Generate initial current and next piece types
    const initialPieceType = getRandomTetrominoType();
    const initialNextPieceType = getRandomTetrominoType();

    // Helper function to create player state from a type
    const createPlayerState = useCallback((type: TetrominoType): PlayerState => {
        // Get the shapes array for the type
        const rotationShapes = TETROMINOS[type].shapes;
        const initialShape = rotationShapes[0]; // Use the 0-degree shape
        return {
            pos: { x: Math.floor(BOARD_WIDTH / 2) - Math.floor(initialShape[0].length / 2), y: 0 },
            tetrominoType: type,
            shape: initialShape,
            rotationIndex: 0, // Start at rotation 0
        };
    }, []);

    // Initialize states
    const [board, setBoard] = useState<BoardState>(() => createEmptyBoard());
    const [player, setPlayer] = useState<PlayerState>(() => createPlayerState(initialPieceType));
    const [nextPieceType, setNextPieceType] = useState<TetrominoType>(initialNextPieceType);
    const [score, setScore] = useState<number>(0);
    const [level, setLevel] = useState<number>(0);
    const [linesCleared, setLinesCleared] = useState<number>(0);
    const [gameOver, setGameOver] = useState<boolean>(false);

    // Calculate game speed based on level
    const gameSpeed = Math.max(100, GAME_LOOP_INTERVAL_MS - level * 50);

    // Ref to store the gravity interval ID
    const gravityIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // Ref to store the lock delay timer ID
    const lockDelayTimerRef = useRef<NodeJS.Timeout | null>(null);

    // State to track if the lock delay is currently active
    const [isLockDelayActive, setIsLockDelayActive] = useState<boolean>(false);

    // --- Timer Management (Define these first) --- 
    const stopGravityTimer = useCallback(() => {
        if (gravityIntervalRef.current) {
            clearInterval(gravityIntervalRef.current);
            gravityIntervalRef.current = null;
            console.log("[DEBUG] Gravity timer stopped.");
        }
    }, []);

    const startGravityTimer = useCallback((callback: () => void) => {
        stopGravityTimer(); // Ensure no duplicates
        console.log(`[DEBUG] Starting gravity timer with speed: ${gameSpeed}ms`);
        gravityIntervalRef.current = setInterval(callback, gameSpeed);
    }, [gameSpeed, stopGravityTimer]); // Depends on gameSpeed and stop

    const resetGravityTimer = useCallback((callback: () => void) => {
        console.log("[DEBUG] Resetting gravity timer.");
        stopGravityTimer();
        startGravityTimer(callback);
    }, [stopGravityTimer, startGravityTimer]);

    // Helper to clear any active lock delay
    const clearLockDelay = useCallback(() => {
        if (lockDelayTimerRef.current) {
            clearTimeout(lockDelayTimerRef.current);
            lockDelayTimerRef.current = null;
            console.log("[DEBUG] clearLockDelay: Timer cleared.");
        }
        setIsLockDelayActive(false);
        console.log("[DEBUG] clearLockDelay: isLockDelayActive set to false.");
    }, []);

    // --- Core Game Actions (Define After Timers) --- 
    const lockPieceAndClearLines = useCallback(() => {
        let currentBoard = board; // Start with the current board

        // 1. Create the new board with the locked piece
        const newBoardWithPiece = currentBoard.map(row => [...row]);
        player.shape.forEach((row, y) => {
            row.forEach((cell, x) => {
                if (cell === 1) {
                    const boardX = player.pos.x + x;
                    const boardY = player.pos.y + y;
                    if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
                        if (newBoardWithPiece[boardY][boardX] !== 0) {
                            // This should ideally not happen if checkCollision is correct before locking
                            console.error(`[ERROR] Attempting to lock piece onto occupied cell (${boardX}, ${boardY})!`);
                            setGameOver(true); // Force game over if this assertion fails
                            return; // Stop processing this piece
                        }
                        newBoardWithPiece[boardY][boardX] = player.tetrominoType;
                    } else {
                        console.error(`[ERROR] Attempted to lock piece out of bounds at (${boardX}, ${boardY})`);
                        setGameOver(true); // Force game over if out of bounds
                        return; // Stop processing this piece
                    }
                }
            });
        });

        if (gameOver) return; // Don't continue if error above set game over

        // 2. Clear completed lines from the new board
        const { newBoard, linesCleared: clearedCount } = clearLines(newBoardWithPiece);

        // 3. Update state: board, score, lines, level
        setBoard(newBoard);
        if (clearedCount > 0) {
            console.log(`[DEBUG] Cleared ${clearedCount} lines.`);
            setScore(prev => prev + (LINE_CLEAR_SCORES[clearedCount] || 0) * (level + 1)); // Score increases with level
            setLinesCleared(prev => {
                const totalLines = prev + clearedCount;
                // Update level based on total lines cleared
                setLevel(Math.floor(totalLines / LINES_PER_LEVEL));
                return totalLines;
            });
        }

    }, [player, board, level, gameOver]);

    const advancePlayerFunctional = useCallback(() => {
        setPlayer(prevPlayer => {
            // Create the next player state based on nextPieceType
            const newPlayer = createPlayerState(nextPieceType);

            // Check collision for the NEW player against the CURRENT board
            if (checkCollision(newPlayer, board)) {
                console.log("[DEBUG] Game Over: Collision on spawn");
                setGameOver(true);
                stopGravityTimer(); // Stop timer on game over
                // If game over, technically we don't need to update player,
                // but returning prevPlayer is safe.
                return prevPlayer;
            } else {
                // Only update nextPieceType if spawn is successful
                const newNextPiece = getRandomTetrominoType();
                setNextPieceType(newNextPiece);
                return newPlayer; // Return the successfully spawned new player state
            }
        });
    }, [createPlayerState, nextPieceType, stopGravityTimer, board]);

    // Function ONLY for automatic gravity drops (called by timer)
    const autoMovePlayerDown = useCallback(() => {
        if (gameOver) {
            return;
        };

        if (!checkCollision(player, board, { dx: 0, dy: 1 })) {
            // No collision: move down and clear any potential lock delay
            clearLockDelay();
            setPlayer(prevPlayer => ({ ...prevPlayer, pos: { ...prevPlayer.pos, y: prevPlayer.pos.y + 1 } }));
        } else {
            // Collision detected below: Start lock delay if not already active
            if (!isLockDelayActive) {
                console.log("[DEBUG] Auto drop collided, starting lock delay.");
                setIsLockDelayActive(true);
                // Clear any previous timer just in case (shouldn't be necessary but safe)
                if (lockDelayTimerRef.current) clearTimeout(lockDelayTimerRef.current);

                console.log(`[DEBUG] autoMovePlayerDown: Starting lock delay timer (${LOCK_DELAY_MS}ms).`);
                lockDelayTimerRef.current = setTimeout(() => {
                    console.log("[DEBUG] Lock delay timer CALLBACK started.");
                    // Check collision *again* before locking,
                    // player might have moved horizontally since timer started.
                    if (checkCollision(player, board, { dx: 0, dy: 1 })) {
                        console.log("[DEBUG] Lock delay finished, collision still present, locking piece.");
                        lockPieceAndClearLines();
                        // Check game over *after* locking potentially sets it
                        const isGameOverAfterLock = gameOver; // Read state before potential advancePlayer modifies it? No, read after.
                        if (!isGameOverAfterLock) { // Check state *after* lockPiece potentially sets it
                            advancePlayerFunctional();
                        } else {
                            console.log("[DEBUG] Game over after lock, stopping timer.");
                            stopGravityTimer();
                        }
                    } else {
                        console.log("[DEBUG] Lock delay finished, but piece moved off ground. Lock cancelled.");
                    }
                    // Clear timer state regardless of lock outcome
                    setIsLockDelayActive(false);
                    lockDelayTimerRef.current = null;
                }, LOCK_DELAY_MS);
            } else {
                console.log(`[DEBUG] Auto drop collided, lock delay ALREADY active (isLockDelayActive=${isLockDelayActive}). Timer running.`);
            }
            // Don't lock immediately
        }
    }, [gameOver, lockPieceAndClearLines, advancePlayerFunctional, stopGravityTimer, clearLockDelay, isLockDelayActive, player, board]);

    // Function for MANUAL downward movement (called by keypress)
    const handleManualDrop = useCallback(() => {
        if (gameOver) return;

        if (!checkCollision(player, board, { dx: 0, dy: 1 })) {
            clearLockDelay(); // Clear any existing lock delay if we successfully move down
            setPlayer(prevPlayer => ({ ...prevPlayer, pos: { ...prevPlayer.pos, y: prevPlayer.pos.y + 1 } }));
        } else {
            // Collision below - Initiate lock delay if not already active
            if (!isLockDelayActive) {
                console.log("[DEBUG] Manual drop collided, starting lock delay.");
                // Start the lock timer (logic will be added to autoMovePlayerDown)
                // For now, just signal that lock *should* start
                setIsLockDelayActive(true); // Mark delay as potentially starting
                // Actual timer start happens in autoMovePlayerDown or a dedicated function
                // Let's trigger the lock sequence directly for now for manual drop collision
                // A more refined approach would consolidate timer logic
                if (lockDelayTimerRef.current === null) { // Prevent multiple timers
                    lockDelayTimerRef.current = setTimeout(() => {
                        console.log("[DEBUG] Lock delay finished (manual trigger), locking piece.");
                        lockPieceAndClearLines();
                        if (!gameOver) advancePlayerFunctional(); else stopGravityTimer();
                        setIsLockDelayActive(false);
                        lockDelayTimerRef.current = null;
                    }, LOCK_DELAY_MS);
                }
            } else {
                console.log("[DEBUG] Manual drop collided, lock delay already active.");
            }
            // Don't lock immediately anymore
        }
    }, [gameOver, lockPieceAndClearLines, advancePlayerFunctional, clearLockDelay, isLockDelayActive, stopGravityTimer, player, board]);

    // Function to move the player horizontally
    const movePlayerHorizontal = useCallback((dx: number) => {
        if (gameOver) return;

        if (!checkCollision(player, board, { dx, dy: 0 })) {
            clearLockDelay(); // Clear lock delay on successful horizontal move
            console.log(`[DEBUG] Moving horizontal: dx = ${dx}`);
            setPlayer(prevPlayer => ({
                ...prevPlayer,
                pos: { x: prevPlayer.pos.x + dx, y: prevPlayer.pos.y },
            }));
        } else {
            console.log(`[DEBUG] Collision detected horizontal: dx = ${dx}`);
        }
    }, [gameOver, clearLockDelay, player, board]);

    // Function to rotate the player's piece using pre-defined shapes
    const rotatePlayer = useCallback(() => {
        if (gameOver) return;

        // Wrap entire logic in functional update to ensure fresh state
        setPlayer(prevPlayer => {
            // Check collision based on PREVIOUS state BEFORE rotation attempt
            const wasCollidingBelow = checkCollision(prevPlayer, board, { dx: 0, dy: 1 });
            console.log(`[DEBUG] Rotate attempt: wasCollidingBelow = ${wasCollidingBelow}, isLockDelayActive = ${isLockDelayActive}`);

            const currentRotation = prevPlayer.rotationIndex;
            const nextRotation = (currentRotation + 1) % 4; // Assume 4 rotations always
            const nextShape = TETROMINOS[prevPlayer.tetrominoType].shapes[nextRotation];

            // Helper function NOW INSIDE the functional update
            const handleSuccessfulRotation = (rotatedPlayerState: PlayerState): PlayerState => {
                const isCollidingBelowAfter = checkCollision(rotatedPlayerState, board, { dx: 0, dy: 1 });
                console.log(`[DEBUG] Rotate success: isCollidingBelowAfter = ${isCollidingBelowAfter}`);

                // Logic for clearing lock delay (remains the same, operates on current calculation)
                if (wasCollidingBelow && !isCollidingBelowAfter) {
                    console.log("[DEBUG] Rotation moved piece off ground, clearing lock delay.");
                    // clearLockDelay(); // Still commented out based on previous findings - needs re-evaluation
                } else if (isCollidingBelowAfter) {
                    console.log("[DEBUG] Rotation successful but still colliding below, lock delay persists (if active).");
                } else if (wasCollidingBelow) {
                    console.log("[DEBUG] Rotation successful, was colliding below, outcome covered above.");
                } else {
                    console.log("[DEBUG] Rotation successful, wasn't colliding below before, still isn't. No lock delay change.");
                }
                return rotatedPlayerState; // Return the successfully rotated state
            };

            const tempPlayerBase: PlayerState = { // Create base using PREV state
                ...prevPlayer,
                shape: nextShape,
                rotationIndex: nextRotation,
            };

            // Try direct rotation
            if (!checkCollision(tempPlayerBase, board)) {
                console.log(`[DEBUG] Rotating piece directly from index ${currentRotation} to ${nextRotation}`);
                return handleSuccessfulRotation(tempPlayerBase); // Return the new state
            } else {
                // Try wall kicks
                console.log(`[DEBUG] Rotation collision (idx ${currentRotation} -> ${nextRotation}), attempting wall kicks...`);
                let kicked = false;
                const wallKickOffsets = [
                    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 2, dy: 0 }, { dx: -2, dy: 0 }
                ];

                for (const kick of wallKickOffsets) {
                    // Calculate kicked state based on PREV state + kick
                    const tempPlayerKicked: PlayerState = {
                        ...tempPlayerBase, // Use base rotation/shape
                        pos: { x: prevPlayer.pos.x + kick.dx, y: prevPlayer.pos.y + kick.dy },
                    };

                    if (!checkCollision(tempPlayerKicked, board)) {
                        console.log(`[DEBUG] Applying wall kick: dx=${kick.dx}, dy=${kick.dy}`);
                        kicked = true;
                        return handleSuccessfulRotation(tempPlayerKicked); // Return the new state
                        // No need for break, return exits the function
                    }
                }
                if (!kicked) {
                    console.log("[DEBUG] Rotation collision, no valid wall kick found.");
                    return prevPlayer; // No change, return the previous state
                }
            }
            // Should be unreachable due to returns above, but satisfy TS
            return prevPlayer;
        }); // End of setPlayer functional update
    }, [gameOver, clearLockDelay, isLockDelayActive, board]); // Added board back - needed for collision checks inside functional update

    // Function to reset the game state
    const restartGame = useCallback(() => {
        console.log("[DEBUG] Restarting game...");

        // Clear timers
        stopGravityTimer();
        clearLockDelay();

        // Reset game state variables
        setBoard(createEmptyBoard());
        const newStartPiece = getRandomTetrominoType();
        const newNextPiece = getRandomTetrominoType();
        setPlayer(createPlayerState(newStartPiece));
        setNextPieceType(newNextPiece);
        setScore(0);
        setLevel(0);
        setLinesCleared(0);
        setIsLockDelayActive(false);
        setGameOver(false); // Crucially, set gameOver to false

        // Gravity timer will be restarted by the useEffect watching gameOver
    }, [createPlayerState, stopGravityTimer, clearLockDelay]);

    // Ref to hold the latest version of the autoMovePlayerDown callback
    const latestAutoMovePlayerDownRef = useRef(autoMovePlayerDown);

    // Effect to keep the ref updated with the latest callback
    useEffect(() => {
        latestAutoMovePlayerDownRef.current = autoMovePlayerDown;
    }, [autoMovePlayerDown]);

    // Game Loop
    useEffect(() => {
        if (!gameOver) {
            console.log("[DEBUG] Game Loop Effect: Starting timer.");
            // Start the timer, the interval callback will use the ref to call the latest function
            startGravityTimer(() => {
                if (latestAutoMovePlayerDownRef.current) {
                    latestAutoMovePlayerDownRef.current();
                }
            });
        } else {
            console.log("[DEBUG] Game Loop Effect: Game Over, stopping timer.");
            stopGravityTimer();
        }
        return () => {
            console.log("[DEBUG] Game Loop Effect: Cleaning up timer.");
            stopGravityTimer();
        };
    }, [gameOver, gameSpeed, startGravityTimer, stopGravityTimer]); // Depends only on game over and speed (via startGravityTimer)

    // Keyboard Input Handler
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (gameOver) return;

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault(); // Prevent window scrolling
                    movePlayerHorizontal(-1); // Move left
                    break;
                case 'ArrowRight':
                    event.preventDefault(); // Prevent window scrolling
                    movePlayerHorizontal(1); // Move right
                    break;
                case 'ArrowDown':
                    event.preventDefault(); // Prevent window scrolling
                    handleManualDrop(); // Move down manually
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    rotatePlayer(); // Rotate
                    break;
                // TODO: Add Space for hard drop
            }
        };

        console.log("[DEBUG] Adding keyboard listener");
        window.addEventListener('keydown', handleKeyDown);

        // Cleanup function to remove listener
        return () => {
            console.log("[DEBUG] Removing keyboard listener");
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [gameOver, movePlayerHorizontal, handleManualDrop, rotatePlayer]); // Dependencies look correct here

    // Create the board view by merging static board and current player piece
    const boardWithPlayer = board.map((row, y) =>
        row.map((cell, x) => {
            const playerX = x - player.pos.x;
            const playerY = y - player.pos.y;

            if (
                playerX >= 0 && playerX < player.shape[0].length &&
                playerY >= 0 && playerY < player.shape.length &&
                player.shape[playerY][playerX] === 1
            ) {
                return player.tetrominoType;
            }
            return cell;
        })
    );

    // Function for HARD DROP (Instant drop and lock)
    const handleHardDrop = useCallback(() => {
        if (gameOver) return;

        let dropDistance = 0;
        // Find how far the piece can drop using the *current* player state
        // Make sure checkCollision is available in scope
        while (!checkCollision(player, board, { dx: 0, dy: dropDistance + 1 })) {
            dropDistance++;
        }

        clearLockDelay(); // Clear any pending lock delay regardless

        if (dropDistance >= 0) { // Always attempt to lock/advance, even if distance is 0
            // Move player instantly to the bottom position
            const finalY = player.pos.y + dropDistance;

            // Update player state immediately to the final position
            setPlayer(prevPlayer => ({ ...prevPlayer, pos: { ...prevPlayer.pos, y: finalY } }));

            console.log(`[DEBUG] Hard drop: Calculated finalY=${finalY}. Locking piece.`);

            // Relying on setPlayer completing before lockPiece runs.
            // If bugs occur here (piece locking at wrong place), consider refactoring lockPiece.
            lockPieceAndClearLines(); // Uses the component's 'player' state

            // Check gameOver *after* locking might have triggered it
            if (!gameOver) {
                advancePlayerFunctional();
            } else {
                console.log("[DEBUG] Hard drop caused game over, stopping timer.");
                stopGravityTimer();
            }
        }

    }, [gameOver, player, board, checkCollision, clearLockDelay, lockPieceAndClearLines, advancePlayerFunctional, stopGravityTimer]); // Added dependencies

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            backgroundColor: '#222',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center', // Center vertically overall
            position: 'relative',
            overflow: 'hidden' // Restore overflow hidden
        }}>
            {/* Close Button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '10px', // Closer to edge
                    right: '10px', // Closer to edge
                    width: '30px', // Smaller width
                    height: '30px', // Smaller height
                    padding: '0', // Remove padding
                    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Semi-transparent background
                    color: '#eee', // Light text
                    border: '1px solid #888', // Subtle border
                    borderRadius: '50%', // Make it round
                    cursor: 'pointer',
                    fontSize: '16px', // Adjust font size for 'X'
                    lineHeight: '30px', // Center 'X' vertically
                    textAlign: 'center', // Center 'X' horizontally
                    zIndex: 10
                }}
            >
                X
            </button>

            {/* Game Title - REMOVED */}
            {/* <h1 style={{ color: '#eee', marginBottom: '15px' }}>Tetris</h1> */}

            {/* Central Game Area Layout */}
            <div className="tetris-central-area">

                {/* NEW: Top Info Row */}
                <div className="tetris-info-row" style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '20px' // Gap between Preview and Stats
                }}>
                    {/* MOVED: Next Piece Preview */}
                    <NextPiecePreview pieceType={nextPieceType} />

                    {/* MOVED: Info Display (Score, Level, Lines) */}
                    <div className="stats-info" style={{ // className exists
                        // Inline styles for base appearance (CSS can refine)
                        color: '#eee',
                        backgroundColor: '#111',
                        padding: '10px 15px',
                        borderRadius: '5px',
                        border: '1px solid #555',
                        textAlign: 'left'
                        // Font size controlled by CSS
                    }}>
                        <div>Score: {score}</div>
                        <div>Level: {level}</div>
                        <div>Lines: {linesCleared}</div>
                    </div>
                </div>

                {/* Board Container */}
                <div className="board-container">
                    <Board board={boardWithPlayer} />
                </div>

                {/* NEW: Mobile Controls Container */}
                <div className="mobile-controls">
                    {/* Row 1: Up (Rotate) */}
                    <div className="controls-row controls-row-up">
                        <button className="control-button" onClick={rotatePlayer} aria-label="Rotate">🔄</button> {/* Changed back to Rotate emoji */}                    </div>
                    {/* Row 2: Left, Down, Right */}
                    <div className="controls-row controls-row-directional">
                        <button className="control-button" onClick={() => movePlayerHorizontal(-1)} aria-label="Move Left">⬅️</button>
                        <button className="control-button" onClick={handleManualDrop} aria-label="Move Down">⬇️</button>
                        <button className="control-button" onClick={() => movePlayerHorizontal(1)} aria-label="Move Right">➡️</button>
                        {/* Removed Hard Drop Button */}
                    </div>
                </div>

            </div>
            {/* Controls Info could go below the central area */}

            {/* Game Over Overlay */}
            {gameOver && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)', // Semi-transparent black background
                    color: 'white',
                    padding: '30px 40px',
                    borderRadius: '10px',
                    textAlign: 'center',
                    zIndex: 100, // Ensure it's above the game board/pieces
                    border: '2px solid #f44336' // Red border
                }}>
                    <h2 style={{ color: '#f44336', marginBottom: '20px' }}>GAME OVER</h2>
                    <p style={{ marginBottom: '10px' }}>Score: {score}</p>
                    <p style={{ marginBottom: '25px' }}>Level: {level}</p>
                    <button
                        onClick={restartGame}
                        style={{
                            padding: '10px 20px',
                            fontSize: '1.1em',
                            backgroundColor: '#555',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }}
                    >
                        Restart
                    </button>
                </div>
            )}
        </div>
    );
};

export default Game; 