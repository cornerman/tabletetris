import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import GLPK from 'glpk.js';
import { FaHeart, FaSkullCrossbones } from 'react-icons/fa';
import { solveSitting } from './solve_sitting';
import { GLPKInstance } from './glpk_facade';
import { extractTableCycle } from './matrix_to_table';
import './index.css'; // <-- Import global CSS

// --- Constants ---
const DEBOUNCE_DELAY = 500; // ms
const STORAGE_KEY_PEOPLE = 'tabletetris_people';
const STORAGE_KEY_PREFS = 'tabletetris_prefs';
const PREFERENCE_VALUE_WANT = 1;
const PREFERENCE_VALUE_DISLIKE = -1;

// --- SVG Constants (moved to component later if needed) ---
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
type ActiveTab = 'people' | 'preferences' | 'results'; // <-- New Type

// Result type: Array of person objects representing the seating arrangement
type SeatingResult = Person[] | null;

// --- Main App Component ---
function App() {
    // Existing State
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

    // --- New State ---
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('people');
    // State for Preferences Tab (will be used later)
    const [editingPrefsForPersonId, setEditingPrefsForPersonId] = useState<number | null>(null);

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
            // --- Load People ---
            const storedPeople = localStorage.getItem(STORAGE_KEY_PEOPLE);
            if (storedPeople) { // Check if not null/undefined
                try {
                    const parsedPeople = JSON.parse(storedPeople);
                    // **Enhanced Validation**
                    if (
                        Array.isArray(parsedPeople) &&
                        parsedPeople.every(p =>
                            typeof p === 'object' &&
                            p !== null &&
                            typeof p.id === 'number' &&
                            typeof p.name === 'string'
                        )
                    ) {
                        loadedPeople = parsedPeople;
                    } else {
                        console.warn("Stored people data is invalid or malformed, resetting.");
                        localStorage.removeItem(STORAGE_KEY_PEOPLE); // Clear invalid data
                    }
                } catch (parseError) {
                    console.error("Failed to parse stored people, resetting.", parseError);
                    localStorage.removeItem(STORAGE_KEY_PEOPLE); // Clear corrupted data
                }
            }

            // --- Load Preferences ---
            const storedPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
            if (storedPrefs) { // Check if not null/undefined
                try {
                    const parsedPrefs = JSON.parse(storedPrefs);
                    // **Enhanced Validation**
                    if (typeof parsedPrefs === 'object' && parsedPrefs !== null && !Array.isArray(parsedPrefs)) {
                        let validPrefs: PreferencesState = {};
                        let isValid = true;
                        for (const key in parsedPrefs) {
                            if (Object.prototype.hasOwnProperty.call(parsedPrefs, key)) {
                                // Validate key format (basic) and value type
                                const parts = key.split('_');
                                if (
                                    parts.length === 4 &&
                                    parts[0] === 'pref' &&
                                    (parts[1] === 'want' || parts[1] === 'dislike') &&
                                    !isNaN(parseInt(parts[2], 10)) && // Check if IDs are numbers
                                    !isNaN(parseInt(parts[3], 10)) &&
                                    typeof parsedPrefs[key] === 'boolean'
                                ) {
                                    validPrefs[key] = parsedPrefs[key];
                                } else {
                                    console.warn(`Invalid preference key/value found: ${key}=${parsedPrefs[key]}, skipping.`);
                                    isValid = false; // Mark as invalid if any entry is bad
                                }
                            }
                        }
                        if (isValid) {
                            loadedPrefs = validPrefs;
                        } else {
                            console.warn("Stored preferences contain invalid entries, resetting all preferences.");
                            localStorage.removeItem(STORAGE_KEY_PREFS); // Clear data with invalid entries
                        }
                    } else {
                        console.warn("Stored preferences data is not a valid object, resetting.");
                        localStorage.removeItem(STORAGE_KEY_PREFS); // Clear invalid data
                    }
                } catch (parseError) {
                    console.error("Failed to parse stored preferences, resetting.", parseError);
                    localStorage.removeItem(STORAGE_KEY_PREFS); // Clear corrupted data
                }
            }

        } catch (e) {
            console.error("Error accessing localStorage during load:", e);
            // Attempt to clear potentially problematic storage if access fails
            // This might fail if localStorage access is completely blocked (e.g., private mode)
            try {
                localStorage.removeItem(STORAGE_KEY_PEOPLE);
                localStorage.removeItem(STORAGE_KEY_PREFS);
                console.warn("Attempted to clear localStorage due to access error.");
            } catch (clearError) {
                console.error("Failed to clear localStorage after access error:", clearError);
            }
        }

        // Update state with loaded (and validated) data
        setPeople(loadedPeople);
        const maxId = loadedPeople.reduce((max: number, p: Person) => Math.max(max, p.id), -1);
        setNextPersonId(maxId + 1);
        setPreferences(loadedPrefs);

        console.log("[DEBUG] Loaded people:", loadedPeople, "Next ID:", maxId + 1);
        console.log("[DEBUG] Loaded preferences:", loadedPrefs);

        // Signal that initial loading and state setting is done
        console.log("[DEBUG] Setting isInitialLoadComplete to true.");
        setIsInitialLoadComplete(true);

        // Determine the starting tab based on the URL hash
        const hash = window.location.hash;
        const initialTab = getTabFromHash(hash);
        setActiveTab(initialTab);

    }, []); // Empty dependency array means run only once on mount

    // Save state to localStorage whenever people or preferences change
    useEffect(() => {
        console.log("[DEBUG] useEffect: Checking if should save state to localStorage...");

        // --- Prevent saving during initial load sequence ---
        if (!isInitialLoadComplete) {
            console.log("[DEBUG] Initial load not complete, skipping save.");
            return;
        }

        console.log("[DEBUG] Initial load complete, proceeding with save.");
        try {
            localStorage.setItem(STORAGE_KEY_PEOPLE, JSON.stringify(people));
            localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(preferences));
            console.log("[DEBUG] State saved.");
        } catch (e) {
            console.error("Failed to save state to localStorage:", e);
        }
    }, [people, preferences, isInitialLoadComplete]);

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

    // Effect to reset/set initial preferences editor person when tab changes or people change
    useEffect(() => {
        console.log("[DEBUG] useEffect: Updating editingPrefsForPersonId due to tab/people change.");
        if (activeTab === 'preferences') {
            if (people.length > 0) {
                // If current ID is invalid or null, set to the first person
                const currentPersonExists = people.some(p => p.id === editingPrefsForPersonId);
                if (!currentPersonExists) {
                    const firstPersonId = people[0].id;
                    console.log(`[DEBUG] Setting editingPrefsForPersonId to first person: ${firstPersonId}`);
                    setEditingPrefsForPersonId(firstPersonId);
                } else {
                    console.log(`[DEBUG] Keeping existing editingPrefsForPersonId: ${editingPrefsForPersonId}`);
                }
            } else {
                // No people, clear the editing ID
                if (editingPrefsForPersonId !== null) {
                    console.log("[DEBUG] No people, clearing editingPrefsForPersonId.");
                    setEditingPrefsForPersonId(null);
                }
            }
        }
        // No need for else, only care when preferences tab is active
    }, [activeTab, people, editingPrefsForPersonId]); // Re-run if tab changes, people list changes, or the ID itself changes

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

    const handlePreferenceChange = (personAId: number, personBId: number, prefType: 'want' | 'dislike' | 'neutral', isChecked?: boolean /* isChecked is now less relevant for icons */) => {
        const wantKey = `pref_want_${personAId}_${personBId}`;
        const dislikeKey = `pref_dislike_${personAId}_${personBId}`;

        console.log(`[DEBUG] Pref change: ${prefType} ${personAId}->${personBId}`);

        // Create a mutable copy of the current preferences state
        const newPreferences = { ...preferences };

        // Set the values based on the clicked icon (prefType)
        if (prefType === 'want') {
            newPreferences[wantKey] = true;
            newPreferences[dislikeKey] = false;
            console.log(`[DEBUG] Setting ${wantKey}=true, ${dislikeKey}=false`);
        } else if (prefType === 'dislike') {
            newPreferences[wantKey] = false;
            newPreferences[dislikeKey] = true;
            console.log(`[DEBUG] Setting ${wantKey}=false, ${dislikeKey}=true`);
        } else { // neutral
            newPreferences[wantKey] = false;
            newPreferences[dislikeKey] = false;
            console.log(`[DEBUG] Setting ${wantKey}=false, ${dislikeKey}=false`);
        }

        // Update the state immutably
        setPreferences(newPreferences);

        // TODO: Trigger solver update (debounced) - This is already handled by the useEffect dependency
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

        // If the removed person was the one being edited for prefs, reset it
        if (editingPrefsForPersonId === personIdToRemove) {
            console.log("[DEBUG] Removed person was being edited for preferences, resetting selection.");
            // If there are still people left, set to the first one, otherwise null
            const remainingPeople = updatedPeople; // Use the already filtered list
            setEditingPrefsForPersonId(remainingPeople.length > 0 ? remainingPeople[0].id : null);
        }

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
        setEditingPrefsForPersonId(null); // Clear preference editing state too
    };

    // --- Render ---

    // Helper to get the currently selected person for preference editing
    const personBeingEdited = people.find(p => p.id === editingPrefsForPersonId);

    return (
        <div style={{ fontFamily: 'sans-serif' }}>
            {/* Tab Navigation */}
            <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid #ccc' }}>
                <button
                    type="button"
                    onClick={() => { setActiveTab('people'); window.location.hash = '#people'; }}
                    style={getTabStyle('people', activeTab)}
                >
                    People ({people.length})
                </button>
                <button
                    type="button"
                    onClick={() => { setActiveTab('preferences'); window.location.hash = '#preferences'; }}
                    style={getTabStyle('preferences', activeTab)}
                    disabled={people.length < 2} // Disable if fewer than 2 people
                >
                    Preferences
                </button>
                <button
                    type="button"
                    onClick={() => { setActiveTab('results'); window.location.hash = '#results'; }}
                    style={getTabStyle('results', activeTab)}
                    disabled={people.length === 0} // <-- Disable if no people
                >
                    Table
                </button>
            </div>

            {/* Tab Content */}
            <div>
                {/* People Tab */}
                {activeTab === 'people' && (
                    <div>
                        {/* Input Section */}
                        <div style={{ padding: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                id="personName"
                                name="personName"
                                value={personNameInput}
                                onChange={(e) => setPersonNameInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { handleAddPerson(); e.preventDefault(); } }}
                                style={{ padding: '8px', flexGrow: 1, minWidth: '150px' }}
                                placeholder="Add person name..."
                            />
                            <button type="button" onClick={handleAddPerson} style={getButtonStyle()}>Add Person</button>
                        </div>

                        {/* People List */}
                        <div style={{ padding: '0 15px 60px 15px' }}>
                            {people.length === 0 ? (
                                null
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    {people.map((person) => (
                                        <li key={person.id} style={{ border: '1px solid #eee', padding: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>{person.name}</span>
                                            <button
                                                type="button"
                                                style={getSmallButtonStyle()}
                                                onClick={() => handleRemovePerson(person.id)}
                                            >
                                                Remove
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {/* Clear All Button - End of List */}
                            {people.length > 0 && ( // Only show if there are people to clear
                                <div style={{ textAlign: 'right', padding: '15px' }}>
                                    <button
                                        type="button"
                                        onClick={handleClearAll}
                                        style={getButtonStyle('secondary')}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Preferences Tab */}
                {activeTab === 'preferences' && (
                    <div>
                        {/* Person Selector Buttons */}
                        <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '5px', borderBottom: '1px solid #eee', marginBottom: '15px' }}>
                            {people.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setEditingPrefsForPersonId(p.id)}
                                    style={getPersonButtonStyle(p.id, editingPrefsForPersonId)}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>

                        {/* Preferences for selected person */}
                        {personBeingEdited ? (
                            <div>
                                {people
                                    .filter((otherPerson) => otherPerson.id !== personBeingEdited.id)
                                    .map((otherPerson) => {
                                        const wantKey = `pref_want_${personBeingEdited.id}_${otherPerson.id}`;
                                        const dislikeKey = `pref_dislike_${personBeingEdited.id}_${otherPerson.id}`;
                                        const isWantChecked = preferences[wantKey] || false;
                                        const isDislikeChecked = preferences[dislikeKey] || false;
                                        const isNeutral = !isWantChecked && !isDislikeChecked;

                                        // Determine background color based on state
                                        let rowStyle: React.CSSProperties = {
                                            border: '1px solid #eee',
                                            padding: '10px 15px', // Adjusted padding
                                            marginBottom: '10px',
                                            display: 'flex', // Use flexbox for layout
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            borderRadius: '4px', // Rounded corners
                                            transition: 'background-color 0.2s ease-in-out', // Smooth transition
                                        };
                                        if (isWantChecked) {
                                            rowStyle.backgroundColor = '#e6ffed'; // Light green
                                            rowStyle.borderColor = '#b7ebc2';
                                        } else if (isDislikeChecked) {
                                            rowStyle.backgroundColor = '#ffebee'; // Light red
                                            rowStyle.borderColor = '#ffcdd2';
                                        } else {
                                            rowStyle.backgroundColor = '#ffffff'; // Default white/transparent
                                        }

                                        // Style for icons (will be passive indicators now)
                                        const iconBaseStyle: React.CSSProperties = {
                                            cursor: 'pointer',
                                            fontSize: '1.5em',
                                            margin: '0 8px', // Keep margin for spacing
                                            color: '#aaa',    // Dim color as they are passive
                                            verticalAlign: 'middle', // Align with switch
                                        };
                                        // No activeIconStyle needed for these icons anymore

                                        // --- Switch Styles ---
                                        const switchWidth = 60; // px
                                        const switchHeight = 20; // px
                                        const knobSize = 16;     // px (slightly smaller than height)
                                        const knobPadding = (switchHeight - knobSize) / 2; // Center knob vertically

                                        const switchTrackStyle: React.CSSProperties = {
                                            display: 'inline-block',
                                            position: 'relative', // For knob positioning
                                            width: `${switchWidth}px`,
                                            height: `${switchHeight}px`,
                                            backgroundColor: '#e0e0e0',
                                            borderRadius: `${switchHeight / 2}px`, // Pill shape
                                            cursor: 'pointer',
                                            verticalAlign: 'middle', // Align with icons
                                        };

                                        const getKnobPosition = (): React.CSSProperties => {
                                            let left = knobPadding; // Default to neutral (middle)
                                            if (isWantChecked) {
                                                left = knobPadding; // Position for Want (Left)
                                            } else if (isDislikeChecked) {
                                                left = switchWidth - knobSize - knobPadding; // Position for Dislike (Right)
                                            } else { // Neutral
                                                left = (switchWidth - knobSize) / 2; // Position for Neutral (Center)
                                            }
                                            return {
                                                position: 'absolute',
                                                top: `${knobPadding}px`,
                                                left: `${left}px`,
                                                width: `${knobSize}px`,
                                                height: `${knobSize}px`,
                                                backgroundColor: isWantChecked ? '#4CAF50' : isDislikeChecked ? '#f44336' : '#9e9e9e', // Color reflects state
                                                borderRadius: '50%', // Circular knob
                                                transition: 'left 0.2s ease-in-out, background-color 0.2s ease-in-out',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                            };
                                        };
                                        // --- End Switch Styles ---

                                        // Click handler for the switch track - NOW ONLY SETS TO NEUTRAL
                                        const handleSwitchClick = (/*event: React.MouseEvent<HTMLDivElement>*/) => { // Event no longer needed
                                            // const trackRect = event.currentTarget.getBoundingClientRect();
                                            // const clickX = event.clientX - trackRect.left;
                                            // const thirdWidth = switchWidth / 3;

                                            // let newState: 'want' | 'neutral' | 'dislike';
                                            // if (clickX < thirdWidth) {
                                            //     newState = 'want';
                                            // } else if (clickX > switchWidth - thirdWidth) {
                                            //     newState = 'dislike';
                                            // } else {
                                            //     newState = 'neutral';
                                            // }
                                            // handlePreferenceChange(personBeingEdited.id, otherPerson.id, newState);
                                            // Simplify: Always set to neutral when clicking the switch track itself
                                            handlePreferenceChange(personBeingEdited.id, otherPerson.id, 'neutral');
                                        };

                                        return (
                                            <div key={otherPerson.id} style={rowStyle}>
                                                {/* Simplified text */}
                                                <span style={{ marginRight: 'auto', fontWeight: 'bold' /* Push icons to the right */ }}>
                                                    {otherPerson.name}
                                                </span>
                                                {/* Preference Control Area */}
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    {/* Heart Icon (Passive Indicator) */}
                                                    <FaHeart
                                                        style={{ ...iconBaseStyle, color: isWantChecked ? '#4CAF50' : iconBaseStyle.color }}
                                                        title={`Click to set preference: WANT to sit next to ${otherPerson.name}`}
                                                        onClick={() => handlePreferenceChange(personBeingEdited.id, otherPerson.id, 'want')}
                                                    />

                                                    {/* The Switch */}
                                                    <div
                                                        style={switchTrackStyle}
                                                        onClick={handleSwitchClick}
                                                        title={`Click to set preference: NEUTRAL towards ${otherPerson.name}`}
                                                    >
                                                        <div style={getKnobPosition()}></div> {/* The moving knob */}
                                                    </div>

                                                    {/* Skull Icon (Passive Indicator) */}
                                                    <FaSkullCrossbones
                                                        style={{ ...iconBaseStyle, color: isDislikeChecked ? '#f44336' : iconBaseStyle.color }}
                                                        title={`Click to set preference: DO NOT want to sit next to ${otherPerson.name}`}
                                                        onClick={() => handlePreferenceChange(personBeingEdited.id, otherPerson.id, 'dislike')}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        ) : (
                            <p>Select a person above to edit their preferences.</p>
                        )}
                    </div>
                )}

                {/* Results Tab */}
                {activeTab === 'results' && (
                    <div>
                        {solverStatus === 'idle' && people.length === 0 && <p>Add people and set preferences first.</p>}
                        {solverStatus === 'idle' && people.length > 0 && <p>Preferences set, ready to calculate (or calculation pending).</p>}
                        {solverStatus === 'loading' && <p style={{ fontStyle: 'italic' }}>Calculating optimal seating...</p>}
                        {solverStatus === 'error' && <p style={{ color: 'red' }}>Error: {solverError || 'Unknown error during solving'}</p>}
                        {solverStatus === 'success' && (
                            seatingResult ? (
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ color: 'green' }}>Optimal seating arrangement found:</p>
                                    <TableVisualization table={seatingResult} />
                                </div>
                            ) : (
                                <p style={{ color: 'orange' }}>Could not determine a seating arrangement based on preferences. Everyone might dislike everyone else, or there might be conflicting strong dislikes.</p>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Helper Functions for Styling ---

const getTabStyle = (tabName: ActiveTab, activeTab: ActiveTab): React.CSSProperties => ({
    padding: '10px 15px',
    cursor: 'pointer',
    border: 'none',
    borderBottom: activeTab === tabName ? '3px solid #5b9bd5' : '3px solid transparent',
    marginBottom: '-1px', // Overlap the container's bottom border
    background: activeTab === tabName ? '#f0f0f0' : 'none',
    fontWeight: activeTab === tabName ? 'bold' : 'normal',
    fontSize: '1em',
    flexGrow: 1,
    textAlign: 'center',
});

const getButtonStyle = (type: 'primary' | 'secondary' = 'primary'): React.CSSProperties => ({
    padding: '8px 15px',
    cursor: 'pointer',
    border: `1px solid ${type === 'primary' ? '#5b9bd5' : '#ccc'}`,
    backgroundColor: type === 'primary' ? '#5b9bd5' : '#f0f0f0',
    color: type === 'primary' ? 'white' : '#333',
    borderRadius: '4px',
    fontSize: '1em',
});

const getPersonButtonStyle = (personId: number, selectedPersonId: number | null): React.CSSProperties => ({
    padding: '8px 12px',
    marginRight: '8px',
    cursor: 'pointer',
    border: `1px solid ${personId === selectedPersonId ? '#5b9bd5' : '#ccc'}`,
    backgroundColor: personId === selectedPersonId ? '#5b9bd5' : '#f0f0f0',
    color: personId === selectedPersonId ? 'white' : '#333',
    borderRadius: '4px',
    fontSize: '0.9em',
    whiteSpace: 'nowrap', // Prevent button text wrapping
});

const getSmallButtonStyle = (): React.CSSProperties => ({
    padding: '3px 8px',
    fontSize: '0.8em',
    cursor: 'pointer',
    border: '1px solid #ccc',
    backgroundColor: '#f8f8f8',
    color: '#555',
    borderRadius: '3px',
});

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

// Function to safely parse the hash
const getTabFromHash = (hash: string): ActiveTab => {
    const validTabs: ActiveTab[] = ['people', 'preferences', 'results'];
    const tabName = hash.substring(1); // Remove '#'
    if ((validTabs as string[]).includes(tabName)) {
        return tabName as ActiveTab;
    }
    return 'people'; // Default
};

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