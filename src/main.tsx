import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import GLPK from 'glpk.js';
import { FaHeart, FaSkullCrossbones } from 'react-icons/fa';
import Game from './tetris/Game'; // <-- CORRECTED Import path
import TableIcon from '../public/table.svg?react';
import PeopleIcon from '../public/people.svg?react';
import PreferencesIcon from '../public/preferences.svg?react';
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
const TABLE_RX = 70;         // px - Horizontal radius for oval table (swapped)
const TABLE_RY = 120;        // px - Vertical radius for oval table (swapped)
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
type TabId = 'people' | 'preferences' | 'table';

interface TabDefinition {
    id: TabId;
    label: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
}

const TABS: TabDefinition[] = [
    { id: 'people', label: 'People', icon: PeopleIcon },
    { id: 'preferences', label: 'Preferences', icon: PreferencesIcon },
    { id: 'table', label: 'Table', icon: TableIcon },
];

// Result type: Array of person objects representing the seating arrangement
type SeatingResult = Person[] | null;

// --- Main App Component ---
function App() {
    // Existing State
    const [personNameInput, setPersonNameInput] = useState<string>('');
    const [people, setPeople] = useState<Person[]>([]);
    const [nextPersonId, setNextPersonId] = useState<number>(0);
    const [preferences, setPreferences] = useState<PreferencesState>({});
    const personNameInputRef = useRef<HTMLInputElement>(null);

    // Solver State
    const [solverStatus, setSolverStatus] = useState<SolverStatus>('idle');
    const [solverError, setSolverError] = useState<string | null>(null);
    const [seatingResult, setSeatingResult] = useState<SeatingResult>(null);
    const glpkInstance = useRef<GLPKInstance | null>(null);
    const solveTimeoutId = useRef<NodeJS.Timeout | null>(null);

    // --- New State ---
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>(TABS[0].id);
    // State for Preferences Tab (will be used later)
    const [editingPrefsForPersonId, setEditingPrefsForPersonId] = useState<number | null>(null);

    // --- Easter Egg State (Using this for Tetris) ---
    const [isTetrisMode, setIsTetrisMode] = useState(false);

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

    // Effect to sync isTetrisMode state with URL hash
    useEffect(() => {
        const checkHash = () => {
            const isTetris = window.location.hash === '#tetris';
            console.log(`[DEBUG] Hash changed. Hash: "${window.location.hash}", IsTetris: ${isTetris}`);
            setIsTetrisMode(isTetris);
        };

        checkHash(); // Check hash on initial load

        window.addEventListener('hashchange', checkHash);
        console.log("[DEBUG] Added hashchange listener.");

        // Cleanup listener on component unmount
        return () => {
            window.removeEventListener('hashchange', checkHash);
            console.log("[DEBUG] Removed hashchange listener.");
        };
    }, []); // Empty dependency array ensures this runs only on mount and unmount

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
        let initialTab = getTabFromHash(hash); // Use let instead of const

        // --- Add check for disabled tabs on initial load ---
        if ((initialTab === 'preferences' || initialTab === 'table') && loadedPeople.length === 0) {
            console.log(`[DEBUG] Initial hash '${hash}' points to a disabled tab (${initialTab}) with no people. Redirecting to 'people'.`);
            initialTab = 'people';
            // Optionally, update the hash in the URL bar to reflect the change
            // Be careful with history updates if not desired
            window.location.hash = 'people';
        }
        // --- End check ---

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

    // Update hash change listener to use TabId
    useEffect(() => {
        const handleHashChange = () => {
            const newTab = getTabFromHash(window.location.hash);

            // --- Add guard against navigating to disabled tabs via URL --- 
            if ((newTab === 'preferences' || newTab === 'table') && people.length === 0) {
                console.log(`[DEBUG] Hash change to '${newTab}' blocked because people list is empty. Redirecting to 'people'.`);
                // Force hash back to people if trying to access disabled tabs directly
                if (window.location.hash !== '#people') { // Avoid infinite loop if already #people
                    window.location.hash = 'people';
                }
                // If the *current* active tab is already people, we don't need to trigger a state update
                // If the *current* active tab is NOT people, the hash change above will trigger this handler again,
                // and it will correctly set the state to 'people' on the next run.
                return; // Stop processing this hash change event
            }
            // --- End guard ---

            // Original logic: Only update state if the (now validated) tab is different
            if (newTab !== activeTab) {
                console.log(`[DEBUG] Hash changed, switching tab to: ${newTab}`);
                setActiveTab(newTab);
            }
        };

        window.addEventListener('hashchange', handleHashChange);

        return () => {
            window.removeEventListener('hashchange', handleHashChange);
        };
    }, [activeTab, people]); // Re-run if activeTab changes programmatically

    // --- Event Handlers ---
    const handleAddPerson = () => {
        const trimmedName = personNameInput.trim();
        if (trimmedName) {
            // Easter Egg: Trigger Tetris game
            if (trimmedName.toLowerCase() === 'tetris') {
                console.log("[DEBUG] Tetris easter egg triggered! Setting hash.");
                window.location.hash = 'tetris'; // Set hash to trigger game
                setPersonNameInput(''); // Clear input
                return;
            }

            // Prevent adding duplicates (case-insensitive)
            if (people.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
                alert(`Person "${trimmedName}" already exists.`);
                return; // Don't add other duplicates
            }

            const newPerson: Person = { id: nextPersonId, name: trimmedName };
            const updatedPeople = [...people, newPerson];
            setPeople(updatedPeople);
            setNextPersonId(prevId => prevId + 1);
            setPersonNameInput(''); // Clear input
            personNameInputRef.current?.focus();
        } else {
            personNameInputRef.current?.focus();
        }
    };

    const handleTetrisClose = () => {
        console.log("[DEBUG] Closing Tetris game. Resetting hash.");
        window.location.hash = ''; // Reset hash to close game
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

    // If Tetris mode is active, render ONLY the fullscreen game
    if (isTetrisMode) {
        return <Game onClose={handleTetrisClose} />;
    }

    // --- Default Render (Table Planner) ---
    // Otherwise, render the main planner application
    return (
        <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Tab Navigation - Modified style */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid #ccc',
                flexShrink: 0
            }}>
                {TABS.map(tab => {
                    // Determine if the tab should be disabled
                    const isDisabled = (tab.id === 'preferences' || tab.id === 'table') && people.length === 0;
                    // Get base style and apply disabled modifications
                    const baseStyle = getTabStyle(tab.id, activeTab);
                    const finalStyle: React.CSSProperties = {
                        ...baseStyle,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.5 : 1, // Example: Dim disabled tabs
                    };

                    return (
                        <button
                            key={tab.id}
                            style={finalStyle} // Apply potentially modified style
                            onClick={() => {
                                // Only allow click if not disabled
                                if (!isDisabled) {
                                    setActiveTab(tab.id);
                                    window.location.hash = tab.id; // Update hash on click
                                }
                            }}
                            disabled={isDisabled} // Add disabled attribute for accessibility
                        >
                            <tab.icon width="18" height="18" /> {/* Render the icon */}
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Area - Make it flexible */}
            <div style={{
                flexGrow: 1,
                overflowY: 'auto',
                padding: '20px'
            }}>

                {/* Conditional Content Based on Active Tab */}
                {activeTab === 'people' && (
                    <div>
                        {/* Input Section */}
                        <div style={{ padding: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <input
                                ref={personNameInputRef}
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
                        <div style={{ padding: '0 5px 0px 5px' }}>
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

                {activeTab === 'table' && (
                    <div style={{ height: '100%' }}>
                        {solverStatus === 'idle' && people.length === 0 && <p>Add people and set preferences first.</p>}
                        {solverStatus === 'idle' && people.length > 0 && <p>Preferences set, ready to calculate (or calculation pending).</p>}
                        {solverStatus === 'loading' && <p style={{ fontStyle: 'italic' }}>Calculating optimal seating...</p>}
                        {solverStatus === 'error' && <p style={{ color: 'red' }}>Error: {solverError || 'Unknown error during solving'}</p>}
                        {solverStatus === 'success' && (
                            seatingResult ? (
                                <div style={{
                                    textAlign: 'center',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
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

const getTabStyle = (tabId: TabId, currentActiveTab: TabId): React.CSSProperties => ({
    padding: '10px 15px',
    cursor: 'pointer',
    border: 'none', // Remove default button border
    background: 'none', // Remove default button background
    fontWeight: 'normal', // Keep normal to prevent width jumps
    color: tabId === currentActiveTab ? '#5b9bd5' : '#666', // Active color blue
    borderBottom: tabId === currentActiveTab ? '3px solid #5b9bd5' : '3px solid transparent', // Blue active line, transparent placeholder
    marginBottom: '-1px', // Pull border up slightly to cover container border
    display: 'inline-flex', // Use flex to align icon and text
    alignItems: 'center',    // Center items vertically
    justifyContent: 'center', // Center content within the tab
    gap: '8px',             // Add space between icon and text
    userSelect: 'none',     // Prevent text selection
    flex: 1,                // Make tabs expand equally
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
    const outerRadiusX = TABLE_RX + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET + PERSON_FONT_SIZE;
    const outerRadiusY = TABLE_RY + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET + PERSON_FONT_SIZE;
    const svgHeight = TOP_PADDING + (outerRadiusY * 2) + TOP_PADDING;
    const svgWidth = TABLE_PADDING + (outerRadiusX * 2) + TABLE_PADDING;
    const tableCenterX = svgWidth / 2;
    const tableCenterY = svgHeight / 2;

    const angleStep = (2 * Math.PI) / numPeople;

    return (
        <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: '100%' }}
        >
            <g> {/* Table Group */}
                {/* Draw Table Ellipse */}
                <ellipse
                    cx={tableCenterX}
                    cy={tableCenterY}
                    rx={TABLE_RX}
                    ry={TABLE_RY}
                    stroke={TABLE_STROKE_COLOR}
                    strokeWidth="3"
                    fill={TABLE_FILL_COLOR}
                />

                {/* Place People around the Table */}
                {table.map((person, personIndex) => {
                    const angle = -Math.PI / 2 + personIndex * angleStep;
                    const cosAngle = Math.cos(angle);
                    const sinAngle = Math.sin(angle);

                    // Person Circle Position (on the ellipse perimeter)
                    const personX = tableCenterX + TABLE_RX * cosAngle;
                    const personY = tableCenterY + TABLE_RY * sinAngle;

                    // Text Position (slightly outside the ellipse)
                    // Calculate an effective radius for text placement at this angle
                    const textRadiusX = TABLE_RX + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET;
                    const textRadiusY = TABLE_RY + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET;
                    const textX = tableCenterX + textRadiusX * cosAngle;
                    const textY = tableCenterY + textRadiusY * sinAngle;

                    // Determine text anchor (simplified approach)
                    let textAnchor = 'middle';
                    if (Math.abs(cosAngle) > 0.1) { // Avoid pure vertical
                        textAnchor = cosAngle > 0 ? 'start' : 'end';
                    }
                    // A more refined text anchor might be needed for better positioning on ovals

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
const getTabFromHash = (hash: string): TabId => {
    const tabId = hash.substring(1); // Remove #
    // Find the tab definition with the matching id
    const foundTab = TABS.find(tab => tab.id === tabId);
    // Return the found tab's id or the default tab's id if not found
    return foundTab ? foundTab.id : TABS[0].id;
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
