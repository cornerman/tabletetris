import GLPK from 'glpk.js'; // Import from installed package
// Import the solver function from the external module
import { solveSitting } from './solve_sitting.ts'; // Changed extension
// Import the table extraction function
import { extractTableCycle } from './matrix_to_table.ts'; // Changed extension

// --- Constants ---
const DEBOUNCE_DELAY = 500; // ms
const STORAGE_KEY_PEOPLE = 'tabletetris_people';
const STORAGE_KEY_PREFS = 'tabletetris_prefs';
const PREFERENCE_VALUE_CHECKED = 1;  // Value for "Want"
const PREFERENCE_VALUE_DISLIKE = -1; // Value for "Don't Want"

// --- Enhanced SVG Constants ---
const TABLE_RADIUS = 80;         // px - Radius of the table circle
const TABLE_PADDING = 50;        // px - Space between table visualization edges
const PERSON_FONT_SIZE = 12;     // px - Smaller font for names
const PERSON_CIRCLE_RADIUS = 8; // px - Radius of the circle representing a person
const PERSON_TEXT_OFFSET = 10;   // px - Distance from person circle edge to text start
const TOP_PADDING = 30;          // px - Increased space above the tables

// --- Color Palette ---
const TABLE_STROKE_COLOR = '#4a4a4a'; // Darker grey for table outline
const TABLE_FILL_COLOR = '#f0f0f0';   // Light grey fill for table
const PERSON_FILL_COLOR = '#5b9bd5';  // A pleasant blue for person markers
const TEXT_COLOR = '#333';          // Dark grey text for better readability

// --- Global State ---
// TODO: Add types
let people: Person[] = []; // Array to store person objects { id: number, name: string }
let nextPersonId = 0;
// Store want/dislike states { 'pref_want_A_B': true/false, 'pref_dislike_A_B': true/false }
let preferencesState: Record<string, boolean> = {}; // Give it an explicit type
let glpk: any = null; // To store the initialized GLPK instance - Added basic type
let solveTimeoutId: any = null; // For debouncing - Added basic type

// --- DOM Elements ---
// TODO: Add types
const personNameInput = document.getElementById('personName') as HTMLInputElement | null;
const addPersonBtn = document.getElementById('addPersonBtn');
const peopleContainer = document.getElementById('peopleContainer');
const resultsContainer = document.getElementById('resultsContainer');
const clearAllBtn = document.getElementById('clearAllBtn');

// --- Assertions for DOM Elements ---
if (!personNameInput) throw new Error("DOM element #personName not found!");
if (!addPersonBtn) throw new Error("DOM element #addPersonBtn not found!");
if (!peopleContainer) throw new Error("DOM element #peopleContainer not found!");
if (!resultsContainer) throw new Error("DOM element #resultsContainer not found!");
if (!clearAllBtn) throw new Error("DOM element #clearAllBtn not found!");

// --- Utility Functions ---
// TODO: Add types
function debounce(func: Function, delay: number) {
    return function (this: any, ...args: any[]) {
        clearTimeout(solveTimeoutId);
        solveTimeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- LocalStorage ---
// TODO: Add types
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY_PEOPLE, JSON.stringify(people));
        // Need to gather state from potentially unchecked boxes too now
        const newPreferencesState: Record<string, boolean> = {}; // Initialize with type
        // Add null check for peopleContainer
        if (peopleContainer) {
            const allCheckboxes = peopleContainer.querySelectorAll('input[type="checkbox"]');
            allCheckboxes.forEach(checkbox => {
                if (checkbox instanceof HTMLInputElement) { // Type guard
                    newPreferencesState[checkbox.name] = checkbox.checked;
                }
            });
        } else {
            console.error("Could not find peopleContainer to save state.");
        }
        preferencesState = newPreferencesState; // Assign the typed object

        localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(preferencesState));
        console.log("[DEBUG] State saved to localStorage:", preferencesState);

    } catch (e) {
        console.error("Failed to save state to localStorage:", e);
    }
}

// TODO: Add types
function loadState() {
    try {
        const storedPeople = localStorage.getItem(STORAGE_KEY_PEOPLE);
        const storedPrefs = localStorage.getItem(STORAGE_KEY_PREFS);

        if (storedPeople) {
            people = JSON.parse(storedPeople);
            // Add explicit type for reduce accumulator
            nextPersonId = people.reduce((maxId: number, p: Person) => Math.max(maxId, p.id), -1) + 1;
            console.log("[DEBUG] Loaded people:", people);
        } else {
            people = [];
            nextPersonId = 0;
        }

        if (storedPrefs) {
            preferencesState = JSON.parse(storedPrefs);
            // Remove migration logic - incompatible format change
            console.log("[DEBUG] Loaded preferences state:", preferencesState);
        } else {
            preferencesState = {};
        }

        rebuildUI();

        // Add null checks
        if (!peopleContainer || !resultsContainer) {
            console.error("Missing critical container elements during state load.");
            return;
        }

        if (people.length > 0) {
            console.log("[DEBUG] Triggering initial solve after loading state.");
            debouncedTriggerSolutionUpdate();
        }

    } catch (e) {
        console.error("Failed to load state from localStorage:", e);
        people = [];
        preferencesState = {};
        nextPersonId = 0;
        // Add null checks before accessing innerHTML
        if (peopleContainer) peopleContainer.innerHTML = '';
        if (resultsContainer) resultsContainer.innerHTML = '<p style="color: red;">Error loading saved state. Starting fresh.</p>';
        localStorage.removeItem(STORAGE_KEY_PEOPLE);
        localStorage.removeItem(STORAGE_KEY_PREFS);
    }
}

// --- UI Rendering ---
// TODO: Define Person type
interface Person {
    id: number;
    name: string;
}

// TODO: Add return type
function renderPersonSection(person: Person) {
    const personDiv = document.createElement('div');
    personDiv.classList.add('person-section');
    personDiv.dataset.personId = person.id.toString(); // Ensure dataset values are strings
    // Add Remove button next to the name
    personDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <h3>${person.name} (ID: ${person.id})</h3>
            <button type="button" class="remove-person-btn" data-remove-id="${person.id}" style="padding: 2px 5px; font-size: 0.8em; cursor: pointer;">Remove</button>
        </div>`;

    const prefsDiv = document.createElement('div');
    prefsDiv.classList.add('preference-list');
    prefsDiv.innerHTML = `<strong>Preferences towards:</strong>`; // Changed wording

    people.forEach((otherPerson: Person) => { // Add type
        if (otherPerson.id !== person.id) {
            // Replace addPreferenceCheckbox with addPreferenceControls
            addPreferenceControls(prefsDiv, person, otherPerson);
        }
    });

    personDiv.appendChild(prefsDiv);
    return personDiv;
}

// Renamed function and added two checkboxes
// TODO: Add types
function addPreferenceControls(container: HTMLElement, personA: Person, personB: Person) {
    const wantKey = `pref_want_${personA.id}_${personB.id}`;
    const dislikeKey = `pref_dislike_${personA.id}_${personB.id}`;
    const wantId = `cb_want_${personA.id}_${personB.id}`;
    const dislikeId = `cb_dislike_${personA.id}_${personB.id}`;

    const neighborDiv = document.createElement('div'); // Container for this neighbor's controls

    // Display Neighbor Name
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('neighbor-name');
    nameSpan.textContent = `${personB.name} (ID: ${personB.id}): `;
    neighborDiv.appendChild(nameSpan);

    // Controls (Want/Dislike)
    const controlsSpan = document.createElement('span');
    controlsSpan.classList.add('pref-controls');

    // "Want" Checkbox
    const wantLabel = document.createElement('label');
    wantLabel.setAttribute('for', wantId);
    const wantCheckbox = document.createElement('input');
    wantCheckbox.type = 'checkbox';
    wantCheckbox.id = wantId;
    wantCheckbox.name = wantKey;
    wantCheckbox.dataset.personAId = personA.id.toString(); // Ensure dataset values are strings
    wantCheckbox.dataset.personBId = personB.id.toString(); // Ensure dataset values are strings
    wantCheckbox.dataset.prefType = 'want'; // Store type
    wantCheckbox.checked = preferencesState[wantKey] || false;
    wantLabel.appendChild(wantCheckbox);
    wantLabel.appendChild(document.createTextNode(` Want`));
    controlsSpan.appendChild(wantLabel);

    // "Don't Want" Checkbox
    const dislikeLabel = document.createElement('label');
    dislikeLabel.setAttribute('for', dislikeId);
    const dislikeCheckbox = document.createElement('input');
    dislikeCheckbox.type = 'checkbox';
    dislikeCheckbox.id = dislikeId;
    dislikeCheckbox.name = dislikeKey;
    dislikeCheckbox.dataset.personAId = personA.id.toString(); // Ensure dataset values are strings
    dislikeCheckbox.dataset.personBId = personB.id.toString(); // Ensure dataset values are strings
    dislikeCheckbox.dataset.prefType = 'dislike'; // Store type
    dislikeCheckbox.checked = preferencesState[dislikeKey] || false;
    dislikeLabel.appendChild(dislikeCheckbox);
    dislikeLabel.appendChild(document.createTextNode(` Don't Want`));
    controlsSpan.appendChild(dislikeLabel);

    neighborDiv.appendChild(controlsSpan);
    container.appendChild(neighborDiv);
}


function rebuildUI(): void {
    console.log("[DEBUG] Rebuilding UI from state.");
    // Add null check
    if (!peopleContainer) {
        console.error("Cannot rebuild UI: peopleContainer not found.");
        return;
    }
    peopleContainer.innerHTML = '';
    people.forEach((person: Person) => { // Add type
        const personDiv = renderPersonSection(person);
        peopleContainer.appendChild(personDiv);
    });
    console.log("[DEBUG] UI Rebuilt.");
}


// --- Event Handlers ---
function handleNameInputKeydown(event: KeyboardEvent): void { // Add type
    if (event.key === 'Enter') {
        event.preventDefault();
        handleAddPerson();
    }
}

function handleAddPerson(): void {
    // Add null check
    if (!personNameInput) {
        console.error("Cannot add person: personNameInput not found.");
        return;
    }
    const name = personNameInput.value.trim();
    if (name === "") {
        console.log("[DEBUG] handleAddPerson called with empty name.");
        return;
    }
    if (people.some((p: Person) => p.name === name)) { // Add type
        alert(`Person with name "${name}" already exists.`);
        return;
    }

    const newPerson: Person = { id: nextPersonId++, name: name }; // Add type
    people.push(newPerson);
    console.log(`[DEBUG] Added person: ${JSON.stringify(newPerson)}`);
    rebuildUI(); // Rebuilds with new controls for everyone
    personNameInput.value = '';
    personNameInput.focus();
    debouncedTriggerSolutionUpdate();
}

// --- NEW: Handler for Remove Person Button Click (using event delegation) ---
function handleContainerClick(event: MouseEvent): void { // Add type
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.classList.contains('remove-person-btn')) { // Type guard
        const personIdToRemoveStr = target.dataset.removeId;
        if (personIdToRemoveStr) {
            const personIdToRemove = parseInt(personIdToRemoveStr, 10);
            console.log(`[DEBUG] Remove button clicked for person ID: ${personIdToRemove}`);
            handleRemovePerson(personIdToRemove);
        } else {
            console.warn("[DEBUG] Remove button clicked, but data-remove-id attribute is missing or invalid.");
        }
    }
}

// --- NEW: Logic to Remove a Person ---
function handleRemovePerson(personIdToRemove: number): void { // Add type
    const personIndex = people.findIndex((p: Person) => p.id === personIdToRemove); // Add type
    if (personIndex === -1) {
        console.warn(`[DEBUG] handleRemovePerson: Person ID ${personIdToRemove} not found.`);
        return;
    }

    const removedPersonName = people[personIndex].name;
    people.splice(personIndex, 1); // Remove from people array
    console.log(`[DEBUG] Removed person: ${removedPersonName} (ID: ${personIdToRemove})`);

    // Clean up preferences involving the removed person
    const newPreferencesState: Record<string, boolean> = {}; // Use typed object
    const idString = `_${personIdToRemove}_`;
    for (const key in preferencesState) {
        // Check own properties to satisfy potential linter rules
        if (Object.prototype.hasOwnProperty.call(preferencesState, key)) {
            // Keep preference if it DOES NOT contain _personIdToRemove_
            if (!key.includes(idString)) {
                newPreferencesState[key] = preferencesState[key];
            } else {
                console.log(`[DEBUG] Removing preference key related to removed person: ${key}`);
            }
        }
    }
    preferencesState = newPreferencesState; // Assign the typed object

    rebuildUI(); // Re-render the remaining people and their preferences
    debouncedTriggerSolutionUpdate(); // Recalculate solution
}

// --- NEW: Handler for Clear All Button Click ---
function handleClearAll(): void {
    if (!confirm("Are you sure you want to remove all people and preferences?")) {
        return;
    }
    console.log("[DEBUG] Clearing all people and preferences.");
    people = [];
    preferencesState = {};
    nextPersonId = 0;
    // Add null checks
    if (peopleContainer) peopleContainer.innerHTML = ''; // Clear UI
    if (resultsContainer) resultsContainer.innerHTML = '<p>Add people and select preferences to see the results.</p>'; // Reset results
    saveState(); // Save the empty state to localStorage
    // No need to trigger solve, as there's nothing to solve
}

// TODO: Add types
function handlePreferenceChange(event: Event): void { // Add type
    const targetCheckbox = event.target;

    // Type guard to ensure target is an HTMLInputElement and is inside the peopleContainer
    if (targetCheckbox instanceof HTMLInputElement && targetCheckbox.type === 'checkbox' && peopleContainer && peopleContainer.contains(targetCheckbox)) {
        const personAIdStr = targetCheckbox.dataset.personAId;
        const personBIdStr = targetCheckbox.dataset.personBId;
        const prefType = targetCheckbox.dataset.prefType; // 'want' or 'dislike'
        const isChecked = targetCheckbox.checked;

        if (!personAIdStr || !personBIdStr || !prefType) {
            console.warn("[DEBUG] Preference checkbox change detected, but dataset attributes are missing.");
            return;
        }
        const personAId = parseInt(personAIdStr, 10);
        const personBId = parseInt(personBIdStr, 10);


        console.log(`[DEBUG] Checkbox change: ${prefType} ${personAId}->${personBId} set to ${isChecked}`);

        // Update the state for the changed checkbox
        preferencesState[targetCheckbox.name] = isChecked;

        // If this box was CHECKED, uncheck its sibling
        if (isChecked) {
            let siblingCheckbox: HTMLInputElement | null = null;
            if (prefType === 'want') {
                const siblingId = `cb_dislike_${personAId}_${personBId}`;
                // Add null check for peopleContainer
                siblingCheckbox = peopleContainer?.querySelector(`#${siblingId}`) ?? null;
            } else { // prefType === 'dislike'
                const siblingId = `cb_want_${personAId}_${personBId}`;
                // Add null check for peopleContainer
                siblingCheckbox = peopleContainer?.querySelector(`#${siblingId}`) ?? null;
            }

            if (siblingCheckbox && siblingCheckbox.checked) {
                console.log(`[DEBUG] Unchecking sibling checkbox: ${siblingCheckbox.name}`);
                siblingCheckbox.checked = false;
                // Update sibling state as well
                preferencesState[siblingCheckbox.name] = false;
            }
        }
        // No 'else' needed: if a box is unchecked, we just update its state.

        debouncedTriggerSolutionUpdate();
    }
}

// --- Solver Logic ---
// TODO: Add types for glpk result
async function triggerSolutionUpdate(): Promise<void> {
    console.log("[DEBUG] triggerSolutionUpdate called.");
    // Add null check
    if (!resultsContainer) {
        console.error("Cannot trigger update: resultsContainer not found.");
        return;
    }
    resultsContainer.innerHTML = '<p><i>Calculating...</i></p>';

    const n = people.length;
    if (n === 0) {
        resultsContainer.innerHTML = '<p>Add people to see results.</p>';
        saveState(); // Save empty state if needed
        return;
    }

    if (!glpk) {
        console.log("[DEBUG] Initializing GLPK...");
        try {
            // Use dynamic import for GLPK to potentially help with typing if types were available
            // For now, keep the CDN import and 'any' type
            // const GLPKFactory = (await import('https://cdn.jsdelivr.net/npm/glpk.js@4.0.2/dist/index.js')).default;
            // Import directly now
            const GLPKFactory = (await import('glpk.js')).default;
            glpk = await GLPKFactory();
            console.log("[DEBUG] GLPK Initialized.");
        } catch (err) {
            console.error("Failed to initialize GLPK:", err);
            // Add null checks
            if (!resultsContainer) {
                console.error("Cannot display GLPK initialization error: resultsContainer not found.");
                return; // Cannot update UI safely
            }
            resultsContainer.innerHTML = '<p style="color: red;">Error initializing solver. Please refresh.</p>';
            return;
        }
    }

    // Build the preference matrix with 0, 1, or -1
    const preferences: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    // Add type for Map keys and values
    const personIdToIndex = new Map<number, number>(people.map((p: Person, index: number) => [p.id, index]));

    // Use the current preferencesState
    for (const key in preferencesState) {
        // Check own properties
        if (Object.prototype.hasOwnProperty.call(preferencesState, key)) {
            const parts = key.split('_'); // "pref_want_A_B" or "pref_dislike_A_B"
            if (parts.length === 4 && parts[0] === 'pref') {
                const type = parts[1]; // 'want' or 'dislike'
                const idA = parseInt(parts[2], 10);
                const idB = parseInt(parts[3], 10);
                const indexA = personIdToIndex.get(idA);
                const indexB = personIdToIndex.get(idB);

                if (indexA !== undefined && indexB !== undefined) {
                    if (preferencesState[key]) { // If this specific preference is checked
                        if (type === 'want') {
                            preferences[indexA][indexB] = PREFERENCE_VALUE_CHECKED; // 1
                        } else if (type === 'dislike') {
                            preferences[indexA][indexB] = PREFERENCE_VALUE_DISLIKE; // -1
                        }
                    }
                } else {
                    console.warn(`[DEBUG] Could not find indices for preference key: ${key}`);
                }
            }
        }
    }


    console.log("Constructed Preference Matrix (0=Neutral, 1=Want, -1=Dislike):");
    const preferencesText = preferences.map(row => row.map(v => v.toString().padStart(3)).join(' ')).join("\n");
    console.log(preferencesText);

    console.log("Calling solveSitting...");
    try {
        // Add null check
        if (!resultsContainer) {
            console.error("Cannot proceed with solving: resultsContainer not found.");
            return;
        }
        resultsContainer.innerHTML = '';

        const inputMatrixDiv = document.createElement('div');
        inputMatrixDiv.innerHTML = '<h2>Input Preference Matrix:</h2><pre>' + preferencesText + '</pre>';
        resultsContainer.appendChild(inputMatrixDiv);


        // TODO: Add type for resultMatrix
        const resultMatrix = await solveSitting(glpk, preferences);
        console.log("Solver Result Matrix:");
        const resultText = resultMatrix.map((row: number[]) => row.join(' ')).join("\n"); // Add basic type
        console.log(resultText);

        const rawResultDiv = document.createElement('div');
        rawResultDiv.innerHTML = '<h2>Solver Result Matrix:</h2><pre>' + resultText + '</pre>';
        resultsContainer.appendChild(rawResultDiv);


        // --- Extract Single Table Cycle ---
        // TODO: Add type for tableIndices
        const tableIndices = extractTableCycle(resultMatrix);
        console.log(`[DEBUG] Extracted table cycle indices: [${tableIndices ? tableIndices.join(', ') : 'None'}]`);

        // --- Display The Table ---
        const tableDisplayContainer = document.createElement('div');
        tableDisplayContainer.innerHTML = '<h3>Sitting Arrangement (Table):</h3>';

        if (!tableIndices || tableIndices.length === 0) {
            if (people.length > 0) {
                tableDisplayContainer.innerHTML += '<p style="color: orange;">Could not determine a seating arrangement (maybe no one sits together, or solver failed?).</p>';
            } else {
                tableDisplayContainer.innerHTML += '<p>No people defined.</p>';
            }
        } else {
            console.log(`[DEBUG] Calling displayTable with indices: [${tableIndices.join(', ')}]`);
            displayTable(tableIndices, people, tableDisplayContainer);
        }
        resultsContainer.appendChild(tableDisplayContainer);
        // --- End Table Display ---


        saveState(); // Save state after successful solve and UI update

    } catch (error: any) { // Add type
        console.error("Error during solving:", error);
        // Add null check
        if (!resultsContainer) {
            console.error("Cannot display solving error: resultsContainer not found.");
            return;
        }
        resultsContainer.innerHTML = '';
        const inputMatrixDiv = document.createElement('div');
        inputMatrixDiv.innerHTML = '<h2>Input Preference Matrix (Solver Failed):</h2><pre>' + preferencesText + '</pre>';
        resultsContainer.appendChild(inputMatrixDiv);
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `<p style="color: red;">Error during solving: ${error.message || error}</p>`;
        resultsContainer.appendChild(errorDiv);
    }
}

// Debounced version of the solver trigger
const debouncedTriggerSolutionUpdate = debounce(triggerSolutionUpdate, DEBOUNCE_DELAY);


// --- REFACTORED: Display a Single Table using Enhanced SVG ---
/**
 * Renders a single table as an SVG circle with people placed around it.
 * @param {number[]} tableIndices - An array of person indices for this table.
 * @param {Array<{id: number, name: string}>} people - The master array of person objects.
 * @param {HTMLElement} container - The DOM element to append the SVG to.
 */
function displayTable(tableIndices: number[], people: Person[], container: HTMLElement): void { // Add types

    if (!tableIndices || tableIndices.length === 0) {
        console.warn("[DEBUG] displayTable called with empty or invalid tableIndices.");
        return;
    }

    // Map indices to Person objects for easy lookup
    const indexToPerson = new Map<number, Person>(people.map((p: Person, index: number) => [index, p])); // Add types

    const numPeople = tableIndices.length;

    const currentTablePeople: Person[] = tableIndices.map(index => { // Add type
        const person = indexToPerson.get(index);
        if (!person) {
            console.error(`[DEBUG] displayTable: Could not find person object for index ${index}.`);
        }
        return person;
    }).filter((p): p is Person => !!p); // Filter out any undefined entries and assert type


    if (currentTablePeople.length !== numPeople) {
        console.error(`[DEBUG] displayTable: Mismatch between indices count (${numPeople}) and found people (${currentTablePeople.length}). Skipping render for this table.`);
        return; // Skip rendering this potentially broken table
    }
    console.log(`[DEBUG] displayTable: Rendering table with people: [${currentTablePeople.map(p => p.name).join(', ')}] (Indices: [${tableIndices.join(', ')}])`);


    // --- Create SVG Canvas for THIS table ---
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    // Calculate dimensions based on THIS table
    const outerRadius = TABLE_RADIUS + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET + PERSON_FONT_SIZE; // Approximate outer boundary
    const svgHeight = TOP_PADDING + (outerRadius * 2) + TOP_PADDING; // Height based on one table
    const svgWidth = TABLE_PADDING + (outerRadius * 2) + TABLE_PADDING; // Width based on one table

    svg.setAttribute("width", svgWidth.toString()); // Ensure attribute values are strings
    svg.setAttribute("height", svgHeight.toString()); // Ensure attribute values are strings
    svg.setAttribute("style", "display: inline-block; vertical-align: top; margin: 10px; max-width: 100%;");
    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);


    // Center calculation relative to this SVG's viewBox
    const tableCenterX = svgWidth / 2;
    const tableCenterY = svgHeight / 2; // Center vertically too

    // --- Create Group for this Table ---
    const tableGroup = document.createElementNS(svgNS, "g");

    // --- Draw Table Circle ---
    const tableCircle = document.createElementNS(svgNS, "circle");
    tableCircle.setAttribute("cx", tableCenterX.toString()); // Ensure attribute values are strings
    tableCircle.setAttribute("cy", tableCenterY.toString()); // Ensure attribute values are strings
    tableCircle.setAttribute("r", TABLE_RADIUS.toString()); // Ensure attribute values are strings
    tableCircle.setAttribute("stroke", TABLE_STROKE_COLOR);
    tableCircle.setAttribute("stroke-width", "3");
    tableCircle.setAttribute("fill", TABLE_FILL_COLOR);
    tableGroup.appendChild(tableCircle);

    // --- Place People around the Table ---
    const angleStep = (2 * Math.PI) / numPeople;

    currentTablePeople.forEach((person, personIndex) => {
        const personName = person.name;
        const angle = -Math.PI / 2 + personIndex * angleStep;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        // 1. Calculate Person Circle Position (on the table radius)
        const personX = tableCenterX + TABLE_RADIUS * cosAngle;
        const personY = tableCenterY + TABLE_RADIUS * sinAngle;

        // Draw Person Circle
        const personCircle = document.createElementNS(svgNS, "circle");
        personCircle.setAttribute("cx", personX.toString()); // Ensure attribute values are strings
        personCircle.setAttribute("cy", personY.toString()); // Ensure attribute values are strings
        personCircle.setAttribute("r", PERSON_CIRCLE_RADIUS.toString()); // Ensure attribute values are strings
        personCircle.setAttribute("fill", PERSON_FILL_COLOR);
        tableGroup.appendChild(personCircle);

        // 2. Calculate Text Position (outside the person circle)
        const textRadius = TABLE_RADIUS + PERSON_CIRCLE_RADIUS + PERSON_TEXT_OFFSET;
        const textX = tableCenterX + textRadius * cosAngle;
        const textY = tableCenterY + textRadius * sinAngle;

        // Draw Person Name Text
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", textX.toString()); // Ensure attribute values are strings
        text.setAttribute("y", textY.toString()); // Ensure attribute values are strings

        if (Math.abs(cosAngle) < 0.1) {
            text.setAttribute("text-anchor", "middle");
        } else if (cosAngle > 0) {
            text.setAttribute("text-anchor", "start");
        } else {
            text.setAttribute("text-anchor", "end");
        }
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", `${PERSON_FONT_SIZE}px`);
        text.setAttribute("font-family", "sans-serif");
        text.setAttribute("fill", TEXT_COLOR);
        text.textContent = personName;

        tableGroup.appendChild(text);
    });

    // Append the finished table group to the SVG
    svg.appendChild(tableGroup);

    // Append THIS SVG to the main container
    container.appendChild(svg);
} // End of displayTable


// --- Initialization ---
// Add null checks before adding event listeners
if (addPersonBtn) addPersonBtn.addEventListener('click', handleAddPerson);
if (personNameInput) personNameInput.addEventListener('keydown', handleNameInputKeydown);
if (peopleContainer) {
    peopleContainer.addEventListener('change', handlePreferenceChange);
    peopleContainer.addEventListener('click', handleContainerClick); // Listener for remove buttons
}
if (clearAllBtn) clearAllBtn.addEventListener('click', handleClearAll); // Listener for clear all button

// Add assertions *after* potential null checks and uses
if (!personNameInput) throw new Error("DOM element #personName not found!");
if (!addPersonBtn) throw new Error("DOM element #addPersonBtn not found!");
if (!peopleContainer) throw new Error("DOM element #peopleContainer not found!");
if (!resultsContainer) throw new Error("DOM element #resultsContainer not found!");
if (!clearAllBtn) throw new Error("DOM element #clearAllBtn not found!");

loadState();

// Add a simple console log to confirm the script is running
console.log("Tabletetris main.ts loaded via Vite."); 