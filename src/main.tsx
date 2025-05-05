import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import GLPK from 'glpk.js';
import { solveSitting } from './solve_sitting';
import { GLPKInstance } from './glpk_facade';
import { extractTableCycle } from './matrix_to_table';

// --- Constants ---
const DEBOUNCE_DELAY = 500; // ms
const STORAGE_KEY_PEOPLE = 'tabletetris_people';
const STORAGE_KEY_PREFS = 'tabletetris_prefs';
const PREFERENCE_VALUE_WANT = 1;
const PREFERENCE_VALUE_DISLIKE = -1;

// --- SVG Constants ---
const TABLE_RADIUS = 80;         // px
const TABLE_PADDING = 50;        // px
const PERSON_FONT_SIZE = 12;     // px
const PERSON_CIRCLE_RADIUS = 8; // px
const PERSON_TEXT_OFFSET = 10;   // px
const TOP_PADDING = 30;          // px
const TABLE_STROKE_COLOR = '#4a4a4a';
const TABLE_FILL_COLOR = '#f0f0f0';
const PERSON_FILL_COLOR = '#5b9bd5';
const TEXT_COLOR = '#333';

// --- Types ---
interface Person {
    id: number;
    name: string;
}

type PreferencesState = Record<string, boolean>; // Key: pref_want/dislike_A_B
type SolverStatus = 'idle' | 'loading' | 'error' | 'success';

// Result type: Array of person objects representing the seating arrangement
type SeatingResult = Person[] | null;

// --- Main App Component ---
function App() {
    const [personNameInput, setPersonNameInput] = useState<string>('');
    const [people, setPeople] = useState<Person[]>([]);
    const [nextPersonId, setNextPersonId] = useState<number>(0);
    const [preferences, setPreferences] = useState<PreferencesState>({});

    // Solver State
    const [solverStatus, setSolverStatus] = useState<SolverStatus>('idle');
    const [solverError, setSolverError] = useState<string | null>(null);
    const [seatingResult, setSeatingResult] = useState<SeatingResult>(null);
    const glpkInstance = useRef<GLPKInstance | null>(null);
    const solveTimeoutId = useRef<NodeJS.Timeout | null>(null);

    // --- GLPK Initialization ---
    const initializeGlpk = async () => {
        if (glpkInstance.current) return; // Already initialized
        console.log("[DEBUG] Initializing GLPK...");
        try {
            const GLPKFactory = (await import('glpk.js')).default;
            glpkInstance.current = await GLPKFactory() as unknown as GLPKInstance;
            console.log("[DEBUG] GLPK Initialized.");
        } catch (err) {
            console.error("Failed to initialize GLPK:", err);
            setSolverStatus('error');
            setSolverError('Failed to initialize solver library.');
            glpkInstance.current = null; // Ensure it's null on failure
        }
    };

    // --- Solver Function ---
    const runSolver = async () => {
        console.log("[DEBUG] runSolver triggered.");
        if (people.length === 0) {
            console.log("[DEBUG] No people, resetting solver state.");
            setSolverStatus('idle');
            setSeatingResult(null);
            setSolverError(null);
            return;
        }

        setSolverStatus('loading');
        setSolverError(null);
        setSeatingResult(null);

        // Ensure GLPK is initialized
        if (!glpkInstance.current) {
            await initializeGlpk();
            if (!glpkInstance.current) { // Check again after initialization attempt
                console.error("[DEBUG] GLPK not initialized after attempt, aborting solve.");
                // Status/error already set by initializeGlpk on failure
                return;
            }
        }

        // Build preference matrix
        const n = people.length;
        const preferencesMatrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
        const personIdToIndex = new Map<number, number>(people.map((p, index) => [p.id, index]));

        for (const key in preferences) {
            if (Object.prototype.hasOwnProperty.call(preferences, key)) {
                const parts = key.split('_'); // pref_want_A_B or pref_dislike_A_B
                if (parts.length === 4 && parts[0] === 'pref') {
                    const type = parts[1];
                    const idA = parseInt(parts[2], 10);
                    const idB = parseInt(parts[3], 10);
                    const indexA = personIdToIndex.get(idA);
                    const indexB = personIdToIndex.get(idB);

                    if (indexA !== undefined && indexB !== undefined && preferences[key]) {
                        preferencesMatrix[indexA][indexB] = (type === 'want') ? PREFERENCE_VALUE_WANT : PREFERENCE_VALUE_DISLIKE;
                    }
                }
            }
        }
        console.log("[DEBUG] Constructed Preference Matrix:", preferencesMatrix);

        // Solve
        try {
            console.log("[DEBUG] Calling solveSitting...");
            const resultMatrix = await solveSitting(glpkInstance.current, preferencesMatrix);
            console.log("[DEBUG] Solver Result Matrix:", resultMatrix);

            const tableIndices = extractTableCycle(resultMatrix);
            console.log(`[DEBUG] Extracted table cycle indices: [${tableIndices ? tableIndices.join(', ') : 'None'}]`);

            if (tableIndices && tableIndices.length > 0) {
                const indexToPerson = new Map<number, Person>(people.map((p, index) => [index, p]));
                const resultTable = tableIndices.map(index => indexToPerson.get(index)).filter((p): p is Person => !!p);
                if (resultTable.length === tableIndices.length) {
                    setSeatingResult(resultTable);
                    setSolverStatus('success');
                    console.log("[DEBUG] Successfully extracted table:", resultTable);
                } else {
                    console.error("[DEBUG] Mismatch between table indices and found people. Setting result to null.");
                    setSeatingResult(null);
                    setSolverStatus('success'); // Still success, but no valid table found
                }
            } else {
                setSeatingResult(null);
                setSolverStatus('success'); // Success, but no cycle found
                console.log("[DEBUG] No seating cycle found by extractTableCycle.");
            }
        } catch (error: unknown) {
            console.error("Error during solving:", error);
            setSolverStatus('error');
            setSolverError(error instanceof Error ? error.message : String(error));
            setSeatingResult(null);
        }
    };

    // --- Effects ---

    // Load initial state from localStorage on mount
    useEffect(() => {
        console.log("[DEBUG] useEffect: Loading state from localStorage...");
        let loadedPeople: Person[] = [];
        let loadedPrefs: PreferencesState = {};

        try {
            const storedPeople = localStorage.getItem(STORAGE_KEY_PEOPLE);
            if (storedPeople) {
                try {
                    const parsedPeople = JSON.parse(storedPeople);
                    if (Array.isArray(parsedPeople)) { // Basic validation
                        // TODO: Deeper validation of Person structure?
                        loadedPeople = parsedPeople;
                    } else {
                        console.warn("Stored people data is not an array, resetting.");
                    }
                } catch (parseError) {
                    console.error("Failed to parse stored people, resetting.", parseError);
                }
            }

            const storedPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
            if (storedPrefs) {
                try {
                    const parsedPrefs = JSON.parse(storedPrefs);
                    if (typeof parsedPrefs === 'object' && parsedPrefs !== null) {
                        // TODO: Deeper validation of prefs structure/keys?
                        loadedPrefs = parsedPrefs;
                    } else {
                        console.warn("Stored preferences data is not an object, resetting.");
                    }
                } catch (parseError) {
                    console.error("Failed to parse stored preferences, resetting.", parseError);
                }
            }

        } catch (e) {
            console.error("Error accessing localStorage during load:", e);
            // Clear potentially corrupted storage if access fails
            localStorage.removeItem(STORAGE_KEY_PEOPLE);
            localStorage.removeItem(STORAGE_KEY_PREFS);
        }

        setPeople(loadedPeople);
        const maxId = loadedPeople.reduce((max: number, p: Person) => Math.max(max, p.id), -1);
        setNextPersonId(maxId + 1);
        setPreferences(loadedPrefs);

        console.log("[DEBUG] Loaded people:", loadedPeople, "Next ID:", maxId + 1);
        console.log("[DEBUG] Loaded preferences:", loadedPrefs);

        // TODO: Trigger initial solve if needed (depends on solver integration)

    }, []); // Empty dependency array means run only once on mount

    // Save state to localStorage whenever people or preferences change
    useEffect(() => {
        console.log("[DEBUG] useEffect: Saving state to localStorage...");
        try {
            localStorage.setItem(STORAGE_KEY_PEOPLE, JSON.stringify(people));
            localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(preferences));
            console.log("[DEBUG] State saved.");
        } catch (e) {
            console.error("Failed to save state to localStorage:", e);
        }
    }, [people, preferences]); // Rerun effect if people or preferences change

    // Debounced Solver Trigger Effect
    useEffect(() => {
        console.log("[DEBUG] useEffect: Debounced trigger activated due to change in people or preferences.");
        // Clear any existing timeout
        if (solveTimeoutId.current !== null) {
            clearTimeout(solveTimeoutId.current);
        }
        // Set a new timeout
        solveTimeoutId.current = setTimeout(() => {
            runSolver();
        }, DEBOUNCE_DELAY);

        // Cleanup function to clear timeout if component unmounts or dependencies change again
        return () => {
            if (solveTimeoutId.current !== null) {
                clearTimeout(solveTimeoutId.current);
            }
        };
    }, [people, preferences]); // Rerun when people or preferences change

    // Trigger initial solve after loading state if people exist
    useEffect(() => {
        if (people.length > 0 && solverStatus === 'idle') {
            console.log("[DEBUG] useEffect: Triggering initial solve after load.");
            runSolver(); // Run directly, no need to debounce initial run
        }
        // We only want this to run based on the initial load, people length check prevents
        // it running every time solverStatus changes. But we need solverStatus to avoid race
        // conditions with the main solver effect.
    }, [people, solverStatus]);

    // --- Event Handlers ---
    const handleAddPerson = () => {
        const name = personNameInput.trim();
        if (name === "") {
            console.log("[DEBUG] handleAddPerson called with empty name.");
            return; // Don't add empty names
        }
        if (people.some((p) => p.name === name)) {
            alert(`Person with name "${name}" already exists.`);
            return;
        }

        const newPerson: Person = { id: nextPersonId, name: name };
        console.log(`[DEBUG] Adding person: ${JSON.stringify(newPerson)}`);

        // Update state immutably
        setPeople([...people, newPerson]);
        setNextPersonId(nextPersonId + 1);
        setPersonNameInput(''); // Clear input field

        // TODO: Trigger solver update? Might want debounce here.
    };

    const handlePreferenceChange = (personAId: number, personBId: number, prefType: 'want' | 'dislike', isChecked: boolean) => {
        const wantKey = `pref_want_${personAId}_${personBId}`;
        const dislikeKey = `pref_dislike_${personAId}_${personBId}`;

        console.log(`[DEBUG] Pref change: ${prefType} ${personAId}->${personBId} set to ${isChecked}`);

        // Create a mutable copy of the current preferences state
        const newPreferences = { ...preferences };

        // Set the value for the changed checkbox
        if (prefType === 'want') {
            newPreferences[wantKey] = isChecked;
        } else { // dislike
            newPreferences[dislikeKey] = isChecked;
        }

        // If a box was CHECKED, ensure its sibling is UNCHECKED
        if (isChecked) {
            if (prefType === 'want') {
                if (newPreferences[dislikeKey]) {
                    console.log(`[DEBUG] Unchecking sibling preference: ${dislikeKey}`);
                    newPreferences[dislikeKey] = false;
                }
            } else { // dislike was checked
                if (newPreferences[wantKey]) {
                    console.log(`[DEBUG] Unchecking sibling preference: ${wantKey}`);
                    newPreferences[wantKey] = false;
                }
            }
        }

        // Update the state immutably
        setPreferences(newPreferences);

        // TODO: Trigger solver update (debounced)
    };

    const handleRemovePerson = (personIdToRemove: number) => {
        const personToRemove = people.find(p => p.id === personIdToRemove);
        if (!personToRemove) return; // Should not happen normally

        console.log(`[DEBUG] Removing person ID: ${personIdToRemove} Name: ${personToRemove.name}`);

        // Update people list
        const updatedPeople = people.filter(p => p.id !== personIdToRemove);
        setPeople(updatedPeople);

        // Clean up preferences
        const updatedPreferences: PreferencesState = {};
        const idStringPart = `_${personIdToRemove}_`;
        for (const key in preferences) {
            if (Object.prototype.hasOwnProperty.call(preferences, key)) {
                if (!key.includes(idStringPart)) {
                    updatedPreferences[key] = preferences[key];
                } else {
                    console.log(`[DEBUG] Removing preference key related to removed person: ${key}`);
                }
            }
        }
        setPreferences(updatedPreferences);

        // TODO: Trigger solver update (debounced)
    };

    const handleClearAll = () => {
        if (!confirm("Are you sure you want to remove all people and preferences?")) {
            return;
        }
        console.log("[DEBUG] Clearing all state.");
        setPeople([]);
        setPreferences({});
        setNextPersonId(0);
        setPersonNameInput('');
        // No need to clear localStorage directly, useEffect will save empty state.
        // TODO: Clear results state
        setSolverStatus('idle'); // Reset solver state as well
        setSeatingResult(null);
        setSolverError(null);
    };

    // --- Render ---
    return (
        <div>
            <h1>Table Sitting Solver</h1>

            {/* Input Section */}
            <div>
                <label htmlFor="personName">Person Name:</label>
                <input
                    type="text"
                    id="personName"
                    name="personName"
                    value={personNameInput}
                    onChange={(e) => setPersonNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleAddPerson(); e.preventDefault(); } }} // Add person on Enter key
                />
                <button type="button" onClick={handleAddPerson}>Add Person</button>
                <button type="button" style={{ marginLeft: '10px' }} onClick={handleClearAll}>Clear All</button> {/* Use handler */}
            </div>

            <hr />

            {/* People & Preferences Section */}
            <div>
                <h2>People & Preferences</h2>
                {people.length === 0 ? (
                    <p>Add some people to define preferences.</p>
                ) : (
                    people.map((person) => (
                        <div key={person.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <h3>{person.name} (ID: {person.id})</h3>
                                <button
                                    type="button"
                                    style={{ padding: '2px 5px', fontSize: '0.8em', cursor: 'pointer' }}
                                    onClick={() => handleRemovePerson(person.id)} // Use handler
                                >
                                    Remove
                                </button>
                            </div>
                            <div>
                                <strong>Preferences towards:</strong>
                                {people
                                    .filter((otherPerson) => otherPerson.id !== person.id)
                                    .map((otherPerson) => {
                                        const wantKey = `pref_want_${person.id}_${otherPerson.id}`;
                                        const dislikeKey = `pref_dislike_${person.id}_${otherPerson.id}`;
                                        const wantId = `cb_want_${person.id}_${otherPerson.id}`;
                                        const dislikeId = `cb_dislike_${person.id}_${otherPerson.id}`;
                                        const isWantChecked = preferences[wantKey] || false;
                                        const isDislikeChecked = preferences[dislikeKey] || false;

                                        return (
                                            <div key={otherPerson.id} style={{ marginLeft: '20px', marginBottom: '5px' }}>
                                                <span style={{ display: 'inline-block', minWidth: '100px' }}>
                                                    {otherPerson.name} (ID: {otherPerson.id}):
                                                </span>
                                                <span style={{ display: 'inline-block', marginLeft: '15px' }}>
                                                    <label htmlFor={wantId} style={{ marginRight: '5px', fontSize: '0.9em' }}>
                                                        <input
                                                            type="checkbox"
                                                            id={wantId}
                                                            checked={isWantChecked}
                                                            onChange={(e) => handlePreferenceChange(person.id, otherPerson.id, 'want', e.target.checked)}
                                                        /> Want
                                                    </label>
                                                    <label htmlFor={dislikeId} style={{ fontSize: '0.9em' }}>
                                                        <input
                                                            type="checkbox"
                                                            id={dislikeId}
                                                            checked={isDislikeChecked}
                                                            onChange={(e) => handlePreferenceChange(person.id, otherPerson.id, 'dislike', e.target.checked)}
                                                        /> Don't Want
                                                    </label>
                                                </span>
                                            </div>
                                        );
                                    })}
                                {people.length === 1 && <em style={{ marginLeft: '20px' }}>(Add more people to set preferences)</em>}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <hr />

            {/* Results Section */}
            <div>
                <h2>Results</h2>
                {/* TODO: Render results (loading, error, success/table) */}
                {solverStatus === 'idle' && <p>Add people and preferences to see results.</p>}
                {solverStatus === 'loading' && <p><i>Calculating...</i></p>}
                {solverStatus === 'error' && <p style={{ color: 'red' }}>Error: {solverError || 'Unknown error during solving'}</p>}
                {solverStatus === 'success' && (
                    seatingResult ?
                        <div>
                            {/* Use the TableVisualization component */}
                            <TableVisualization table={seatingResult} />
                        </div>
                        : <p style={{ color: 'orange' }}>Could not determine a seating arrangement.</p>
                )}
            </div>
        </div>
    );
}

// --- Table Visualization Component ---
interface TableVisualizationProps {
    table: Person[];
}

function TableVisualization({ table }: TableVisualizationProps) {
    if (!table || table.length === 0) {
        return null; // Don't render if no table data
    }

    const numPeople = table.length;

    // Calculate SVG dimensions based on constants
    const outerRadius = TABLE_RADIUS + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET + PERSON_FONT_SIZE;
    const svgHeight = TOP_PADDING + (outerRadius * 2) + TOP_PADDING;
    const svgWidth = TABLE_PADDING + (outerRadius * 2) + TABLE_PADDING;
    const tableCenterX = svgWidth / 2;
    const tableCenterY = svgHeight / 2;

    const angleStep = (2 * Math.PI) / numPeople;

    return (
        <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: 'inline-block', verticalAlign: 'top', margin: '10px', maxWidth: '100%' }}
        >
            <g> {/* Table Group */}
                {/* Draw Table Circle */}
                <circle
                    cx={tableCenterX}
                    cy={tableCenterY}
                    r={TABLE_RADIUS}
                    stroke={TABLE_STROKE_COLOR}
                    strokeWidth="3"
                    fill={TABLE_FILL_COLOR}
                />

                {/* Place People around the Table */}
                {table.map((person, personIndex) => {
                    const angle = -Math.PI / 2 + personIndex * angleStep;
                    const cosAngle = Math.cos(angle);
                    const sinAngle = Math.sin(angle);

                    // Person Circle Position
                    const personX = tableCenterX + TABLE_RADIUS * cosAngle;
                    const personY = tableCenterY + TABLE_RADIUS * sinAngle;

                    // Text Position
                    const textRadius = TABLE_RADIUS + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET;
                    const textX = tableCenterX + textRadius * cosAngle;
                    const textY = tableCenterY + textRadius * sinAngle;

                    // Determine text anchor
                    let textAnchor = 'middle';
                    if (Math.abs(cosAngle) > 0.1) { // Avoid pure vertical
                        textAnchor = cosAngle > 0 ? 'start' : 'end';
                    }

                    return (
                        <g key={person.id}>
                            {/* Person Circle */}
                            <circle
                                cx={personX}
                                cy={personY}
                                r={PERSON_CIRCLE_RADIUS}
                                fill={PERSON_FILL_COLOR}
                            />
                            {/* Person Name Text */}
                            <text
                                x={textX}
                                y={textY}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                fontSize={`${PERSON_FONT_SIZE}px`}
                                fontFamily="sans-serif"
                                fill={TEXT_COLOR}
                            >
                                {person.name}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Failed to find the root element");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
); 