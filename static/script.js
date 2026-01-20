/**
 * SMS Randomizer Tracker
 * Logic for tracking progress, unlocks, and recursive path rendering.
 */

// --- Configuration & State ---

const SHADOW_MARIO_LEVELS = [
    { id: "bianco6", name: "Bianco" },
    { id: "ricco6", name: "Ricco" },
    { id: "mamma6", name: "Gelato" },
    { id: "pinnaParco4", name: "Pinna" },
    { id: "delfino3", name: "Sirena" },
    { id: "mare6", name: "Noki" },
    { id: "monte6", name: "Pianta" }
];

let worldData = {};

let appState = {
    unlocks: new Set(),
    globalAssignments: {}, // Map<SourceID, TargetZoneID>
    collectedShines: new Set(),
    collectedBlueCoins: new Set(),
    collapsedElements: new Set() // IDs of collapsed rows
};

// Caches for performance
let cachedZoneOptionsHTML = "";
let stats = {
    shinesPossible: 0,
    visibleBC: new Set()
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchData();
});

function initEventListeners() {
    // Header Buttons
    document.getElementById('btn-save').addEventListener('click', saveState);

    const loadBtn = document.getElementById('btn-load');
    const fileInput = document.getElementById('file-input');

    loadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => loadState(e.target));

    // Global Event Delegation for the Tracker Table
    // This replaces individual onclick attributes
    document.getElementById('tracker-table').addEventListener('click', handleTableClick);
    document.getElementById('tracker-table').addEventListener('change', handleTableChange);
}

function fetchData() {
    fetch('/api/data')
        .then(r => r.json())
        .then(data => {
            worldData = data;

            // Set default corona entrance if missing
            if (!appState.globalAssignments["enter_corona"]) {
                appState.globalAssignments["enter_corona"] = "coro_ex6";
            }

            // Pre-build dropdown options
            const sortedZones = Object.values(worldData.zones)
                .filter(z => z.id !== 'coro_ex6' && z.id !== 'coronaBoss')
                .sort((a, b) => a.name.localeCompare(b.name));

            cachedZoneOptionsHTML = '<option value="">-- Select Target --</option>' +
                sortedZones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');

            renderUnlocks();
            renderTable();
        })
        .catch(err => console.error("Failed to load world data:", err));
}

// --- Rendering Logic ---

function renderUnlocks() {
    const container = document.getElementById('unlocks-bar');
    container.innerHTML = '';

    worldData.unlocks.forEach(u => {
        const wrapper = document.createElement('div');
        wrapper.className = 'unlock-wrapper';

        const img = document.createElement('img');
        img.src = u.icon;
        img.className = `unlock-icon ${appState.unlocks.has(u.id) ? 'active' : ''}`;
        img.title = u.name;

        // Add interaction data
        img.dataset.unlockId = u.id;
        img.addEventListener('click', () => toggleUnlock(u.id));

        const label = document.createElement('div');
        label.className = 'unlock-label';
        label.innerText = u.name;

        wrapper.appendChild(img);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
}

function renderTable() {
    stats.shinesPossible = new Set();
    stats.visibleBC.clear();

    const tbody = document.getElementById('table-body');
    let htmlBuffer = "";
    let lastGroup = "";
    let groupIndex = 0;

    worldData.plaza_entrances.forEach((entrance, index) => {
        if (entrance.group_name !== lastGroup) {
            groupIndex++;
            const groupKey = `group-${groupIndex}`;
            const isCollapsed = appState.collapsedElements.has(groupKey);

            const groupEntrances = worldData.plaza_entrances.filter(e => e.group_name === entrance.group_name);

            const gShinesFound = new Set();
            const gShinesTotal = new Set();
            const gBCsFound = new Set();
            const gBCsTotal = new Set();

            groupEntrances.forEach(e => {
                // If it's not a warp, count the single shine directly
                if (e.is_warp === false) {
                    gShinesTotal.add(e.id);
                    if (appState.collectedShines.has(e.id)) gShinesFound.add(e.id);
                } else {
                    const res = calculateBranchStats(e.id, []);
                    res.sFound.forEach(id => gShinesFound.add(id));
                    res.sTotal.forEach(id => gShinesTotal.add(id));
                    res.uniqueBCsFound.forEach(bc => gBCsFound.add(bc));
                    res.uniqueBCsTotal.forEach(bc => gBCsTotal.add(bc));
                }
            });

            let groupStatsHTML = "";
            if (gShinesTotal.size > 0 || gBCsTotal.size > 0) {
                const sDone = gShinesFound.size === gShinesTotal.size;
                const bDone = gBCsFound.size === gBCsTotal.size;

                groupStatsHTML = `
                <div class="group-stats-summary" id="group-stats-${groupIndex}">
                    <span class="g-stat ${sDone ? 'done' : ''}">
                        <img src="images/shine_sprite.webp" style="width:14px; vertical-align:middle;"> 
                        ${gShinesFound.size}/${gShinesTotal.size}
                    </span>
                    <span class="g-stat ${bDone ? 'done' : ''}" style="margin-left: 8px;">
                        <span style="font-size:0.9em">🔵</span> 
                        ${gBCsFound.size}/${gBCsTotal.size}
                    </span>
                </div>`;
            } else {
                groupStatsHTML = `<div class="group-stats-summary" id="group-stats-${groupIndex}"></div>`;
            }

            htmlBuffer += `
            <tr class="group-header-row ${isCollapsed ? 'collapsed' : ''}" 
                data-action="toggle-collapse" 
                data-target-class=".group-${groupIndex}" 
                data-storage-key="${groupKey}">
                <td colspan="3" class="group-header">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>
                            <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span> 
                            ${entrance.group_name}
                        </span>
                        ${groupStatsHTML}
                    </div>
                </td>
            </tr>`;

            lastGroup = entrance.group_name;
        }

        const entryID = `entry-${index}`;
        const groupClass = `group-${groupIndex}`;

        if (entrance.id === "enter_corona") {
            htmlBuffer += buildCoronaRow(entrance, groupClass);
        } else {
            htmlBuffer += buildMainEntryRow(entrance, entryID, groupClass);
        }
    });

    tbody.innerHTML = htmlBuffer;
    updateAllStatsUI();
}

function buildMainEntryRow(entrance, entryID, groupClass) {
    const assignmentKey = entrance.id;
    const isWarp = entrance.is_warp !== false; // Default to true if missing

    // Parent row visibility
    const isEntryCollapsed = appState.collapsedElements.has(entryID);
    const isParentGroupCollapsed = appState.collapsedElements.has(groupClass);
    const rowStyle = isParentGroupCollapsed ? 'style="display:none"' : '';

    let targetCellContent = "";
    let statsCellContent = "";

    if (isWarp) {
        // Render Dropdown for warps
        const targetZoneID = appState.globalAssignments[assignmentKey];
        let dropdownHTML = cachedZoneOptionsHTML;
        if (targetZoneID) {
            dropdownHTML = dropdownHTML.replace(`value="${targetZoneID}"`, `value="${targetZoneID}" selected`);
        }
        const selectClass = targetZoneID ? "filled" : "";
        targetCellContent = `<select class="${selectClass}" data-assign-key="${assignmentKey}">${dropdownHTML}</select>`;
        statsCellContent = `<div class="route-stats" id="stats-${assignmentKey}"></div>`;
    } else {
        // Render a simple Shine button for static Plaza Shines
        stats.shinesPossible.add(entrance.id);
        const isChecked = appState.collectedShines.has(entrance.id);
        targetCellContent = `<span style="color: #888; font-style: italic;">Plaza Collectible</span>`;
        statsCellContent = `
            <div class="shine-container">
                <div class="shine-check ${isChecked ? 'checked' : ''}" 
                     data-action="toggle-shine" 
                     data-id="${entrance.id}">
                    <img src="images/shine_sprite.webp" style="width:16px; margin-right:4px;" alt="Shine">Collect
                </div>
            </div>`;
    }

    const mainRow = `
    <tr class="${groupClass} entry-main-row ${isEntryCollapsed ? 'collapsed' : ''}"
        ${rowStyle}
        data-action="${isWarp ? 'toggle-collapse' : ''}"
        data-target-selector="[data-parent=${entryID}]"
        data-storage-key="${entryID}">
        <td>
            <span class="collapse-icon-sub">${isWarp && appState.globalAssignments[assignmentKey] ? (isEntryCollapsed ? '▶' : '▼') : ''}</span>
            <span class="zone-name">${entrance.name}</span>
        </td>
        <td>${targetCellContent}</td>
        <td>${statsCellContent}</td>
    </tr>`;

    let childrenRows = "";
    if (isWarp && appState.globalAssignments[assignmentKey]) {
        childrenRows = buildRecursiveZoneRows(appState.globalAssignments[assignmentKey], [appState.globalAssignments[assignmentKey]], 1, groupClass, entryID);
    }

    return mainRow + childrenRows;
}

function buildRecursiveZoneRows(zoneID, chainHistory, depth, groupClass, parentID) {
    const zone = worldData.zones[zoneID];
    if (!zone) return "";

    const zoneGroup = getZoneGroup(zoneID);
    const indent = "│   ".repeat(depth);

    // Visibility logic
    const isEntryCollapsed = appState.collapsedElements.has(parentID);
    const isParentGroupCollapsed = appState.collapsedElements.has(groupClass);
    const shouldHide = isEntryCollapsed || isParentGroupCollapsed;
    const displayStyle = shouldHide ? 'style="display:none"' : '';

    let rowHTML = `
    <tr class="${groupClass} child-row" data-parent="${parentID}" ${displayStyle}>
        <td>
            <span class="tree-line">${indent}</span>
            <span class="zone-name" style="color:#f39c12">↳ ${zone.name}</span>
        </td>
        <td></td>
        <td>`;

    // Collectibles: Shines
    if (zone.shines_available?.length > 0) {
        // CHANGED: Add to Set instead of incrementing number
        zone.shines_available.forEach(s => stats.shinesPossible.add(s.id));

        rowHTML += `<div class="shine-container">`;
        zone.shines_available.forEach(shine => {
            const isChecked = appState.collectedShines.has(shine.id);
            rowHTML += `
                <div class="shine-check ${isChecked ? 'checked' : ''}" 
                     data-action="toggle-shine" 
                     data-id="${shine.id}">
                    <img src="images/shine_sprite.webp" style="width:16px; margin-right:4px;" alt="Shine">${shine.name}
                </div>`;
        });
        rowHTML += `</div>`;
    }

    // Collectibles: Blue Coins
    if (zone.blue_coin_ids) {
        rowHTML += `<div class="bc-list">`;
        zone.blue_coin_ids.forEach(bcID => {
            const uniqueKey = `${zoneGroup}::${bcID}`;
            stats.visibleBC.add(uniqueKey);
            const isCollected = appState.collectedBlueCoins.has(uniqueKey);
            rowHTML += `
                <div class="bc-box ${isCollected ? 'collected' : ''}" 
                     data-action="toggle-bc" 
                     data-id="${uniqueKey}">
                    ${bcID}
                </div>`;
        });
        rowHTML += `</div>`;
    }

    rowHTML += `</td></tr>`;

    // Recursive Exits
    let exitsHTML = "";
    if (zone.exits) {
        zone.exits.forEach(exit => {
            const assignmentKey = `${zoneGroup}::${exit.id}`;
            const target = appState.globalAssignments[assignmentKey];

            let dropdownHTML = cachedZoneOptionsHTML;
            if (target) dropdownHTML = dropdownHTML.replace(`value="${target}"`, `value="${target}" selected`);
            const selectClass = target ? "filled" : "";

            exitsHTML += `
            <tr class="${groupClass} child-row" data-parent="${parentID}" ${displayStyle}>
                <td><span class="tree-line">${indent}└── </span><span class="exit-name">Exit: ${exit.name}</span></td>
                <td>
                    <select class="${selectClass}" data-assign-key="${assignmentKey}">
                        ${dropdownHTML}
                    </select>
                </td>
                <td></td>
            </tr>`;

            if (target && !chainHistory.includes(target)) {
                exitsHTML += buildRecursiveZoneRows(target, [...chainHistory, target], depth + 1, groupClass, parentID);
            }
        });
    }

    return rowHTML + exitsHTML;
}

function buildCoronaRow(entrance, groupClass) {
    const isUnlocked = checkCoronaUnlock();
    const lockedClass = isUnlocked ? "" : "row-locked";

    let targetCol = isUnlocked
        ? `<div style="color:#e74c3c; font-weight:bold;">➜ Corona Mountain (Boss)</div>`
        : `<div class="locked-text">🔒 Locked (Defeat all 7 Shadow Marios)</div>`;

    let html = `
    <tr class="${groupClass} ${lockedClass}">
        <td><span class="zone-name">${entrance.name}</span></td>
        <td>${targetCol}</td>
        <td></td>
    </tr>`;

    if (isUnlocked) {
        // Hardcoded mapping for corona
        html += buildRecursiveZoneRows("coro_ex6", [entrance.id, "coro_ex6"], 1, groupClass, "corona-root");
    }
    return html;
}

// --- Interaction Handlers (Event Delegation) ---

function handleTableChange(event) {
    const target = event.target;
    if (target.tagName === 'SELECT') {
        const key = target.dataset.assignKey;
        if (key) {
            appState.globalAssignments[key] = target.value;
            renderTable();
        }
    }
}

function handleTableClick(event) {
    // 1. Check for collapse toggles (Row click)
    const toggleRow = event.target.closest('[data-action="toggle-collapse"]');
    if (toggleRow) {
        if (event.target.tagName === 'SELECT') return;

        const selector = toggleRow.dataset.targetClass || toggleRow.dataset.targetSelector;
        const storageKey = toggleRow.dataset.storageKey;
        handleCollapse(selector, toggleRow, storageKey);
        return;
    }

    // 2. Check for Shine clicks
    const shineDiv = event.target.closest('[data-action="toggle-shine"]');
    if (shineDiv) {
        const id = shineDiv.dataset.id;

        // Toggle State
        if (appState.collectedShines.has(id)) {
            appState.collectedShines.delete(id);
        } else {
            appState.collectedShines.add(id);
        }

        // SYNC UI: Find ALL instances of this shine ID and update them
        const allInstances = document.querySelectorAll(`[data-action="toggle-shine"][data-id="${id}"]`);
        allInstances.forEach(el => {
            // Force class based on the new state (safer than toggle)
            if (appState.collectedShines.has(id)) {
                el.classList.add('checked');
            } else {
                el.classList.remove('checked');
            }
        });

        updateAllStatsUI();
        return;
    }

    // 3. Check for Blue Coin clicks
    const bcDiv = event.target.closest('[data-action="toggle-bc"]');
    if (bcDiv) {
        const id = bcDiv.dataset.id;

        // Toggle State
        if (appState.collectedBlueCoins.has(id)) {
            appState.collectedBlueCoins.delete(id);
        } else {
            appState.collectedBlueCoins.add(id);
        }

        // SYNC UI: Find ALL instances of this Blue Coin ID and update them
        const allInstances = document.querySelectorAll(`[data-action="toggle-bc"][data-id="${id}"]`);
        allInstances.forEach(el => {
            if (appState.collectedBlueCoins.has(id)) {
                el.classList.add('collected');
            } else {
                el.classList.remove('collected');
            }
        });

        updateAllStatsUI();
    }
}

function toggleUnlock(id) {
    if (appState.unlocks.has(id)) appState.unlocks.delete(id);
    else appState.unlocks.add(id);
    renderUnlocks();
}

function handleCollapse(selector, element, storageKey) {
    const targets = document.querySelectorAll(selector);
    if (targets.length === 0) return;

    const isCurrentlyVisible = targets[0].style.display !== 'none';

    if (isCurrentlyVisible) {
        appState.collapsedElements.add(storageKey);
    } else {
        appState.collapsedElements.delete(storageKey);
    }

    // Update visuals
    const shouldHide = appState.collapsedElements.has(storageKey);
    targets.forEach(t => t.style.display = shouldHide ? 'none' : 'table-row');

    const icon = element.querySelector('.collapse-icon, .collapse-icon-sub');
    if (icon) icon.innerText = shouldHide ? '▶' : '▼';

    element.classList.toggle('collapsed', shouldHide);
}

// --- Stats & Helpers ---

function updateAllStatsUI() {
    // A. Header Stats
    // CHANGED: Use .size for shinesPossible
    document.getElementById('stat-shines').innerText = `${appState.collectedShines.size} / ${stats.shinesPossible.size}`;

    let bcFound = 0;
    stats.visibleBC.forEach(key => {
        if(appState.collectedBlueCoins.has(key)) bcFound++;
    });
    document.getElementById('stat-bc').innerText = `${bcFound} / ${stats.visibleBC.size}`;

    // B. Shadow Mario Bar
    updateShadowMarioBar();

    // C. Route Stats (Individual Rows)
    worldData.plaza_entrances.forEach(entrance => {
        if (entrance.id === "enter_corona") return;

        const container = document.getElementById(`stats-${entrance.id}`);
        if (!container) return;

        const res = calculateBranchStats(entrance.id, []);

        if (res.sTotal.size > 0 || res.uniqueBCsTotal.size > 0) {
            const sDone = res.sFound.size === res.sTotal.size;
            const bDone = res.uniqueBCsFound.size === res.uniqueBCsTotal.size;

            container.innerHTML = `
                <div class="route-stat-item ${sDone ? 'rs-done' : ''}">
                    <img src="images/shine_sprite.webp" style="width:16px;" alt="Shine">
                    ${res.sFound.size}/${res.sTotal.size}
                </div>
                <div class="route-stat-item ${bDone ? 'rs-done' : ''}">
                    <span>🔵</span>
                    ${res.uniqueBCsFound.size}/${res.uniqueBCsTotal.size}
                </div>`;
        } else {
            container.innerHTML = "";
        }
    });

    // D. Check Corona Unlock Refresh
    const lockedRow = document.querySelector(".row-locked");
    if (lockedRow && checkCoronaUnlock()) {
        renderTable();
        return;
    }

    // E. Group Headers
    let currentGroup = "";
    let groupIndex = 0;

// Inside updateAllStatsUI, update the updateGroupDisplay sub-function:
    const updateGroupDisplay = (groupName, index) => {
        const container = document.getElementById(`group-stats-${index}`);
        if (!container) return;

        const groupEntrances = worldData.plaza_entrances.filter(e => e.group_name === groupName);

        const gShinesFound = new Set();
        const gShinesTotal = new Set();
        const gBCsFound = new Set();
        const gBCsTotal = new Set();

        groupEntrances.forEach(e => {
            if (e.is_warp === false) {
                // Static Plaza Shine
                gShinesTotal.add(e.id);
                if (appState.collectedShines.has(e.id)) gShinesFound.add(e.id);
            } else {
                // Randomized Warp Path
                const res = calculateBranchStats(e.id, []);
                res.sFound.forEach(id => gShinesFound.add(id));
                res.sTotal.forEach(id => gShinesTotal.add(id));
                res.uniqueBCsFound.forEach(bc => gBCsFound.add(bc));
                res.uniqueBCsTotal.forEach(bc => gBCsTotal.add(bc));
            }
        });

        if (gShinesTotal.size > 0 || gBCsTotal.size > 0) {
            const sDone = gShinesFound.size === gShinesTotal.size;
            const bDone = gBCsFound.size === gBCsTotal.size;

            container.innerHTML = `
            <span class="g-stat ${sDone ? 'done' : ''}">
                <img src="images/shine_sprite.webp" style="width:14px; vertical-align:middle;"> 
                ${gShinesFound.size}/${gShinesTotal.size}
            </span>
            <span class="g-stat ${bDone ? 'done' : ''}" style="margin-left: 8px;">
                <span style="font-size:0.9em">🔵</span> 
                ${gBCsFound.size}/${gBCsTotal.size}
            </span>`;
            container.style.display = "block";
        } else {
            container.style.display = "none";
        }
    };

    worldData.plaza_entrances.forEach(entrance => {
        if (entrance.group_name !== currentGroup) {
            groupIndex++;
            currentGroup = entrance.group_name;
            updateGroupDisplay(currentGroup, groupIndex);
        }
    });
}

function updateShadowMarioBar() {
    const container = document.getElementById('shadow-mario-bar');
    let html = '<span class="shadow-label">Corona Access:</span>';
    let doneCount = 0;

    SHADOW_MARIO_LEVELS.forEach(lvl => {
        const zone = worldData.zones[lvl.id];
        let isDone = false;

        // Assumes the first shine in the list is the Shadow Mario shine
        if (zone && zone.shines_available?.length > 0) {
            const mainShineID = zone.shines_available[0].id;
            isDone = appState.collectedShines.has(mainShineID);
        }

        if (isDone) doneCount++;
        html += `<div class="shadow-check ${isDone ? 'done' : ''}">${lvl.name}</div>`;
    });

    if (doneCount === 7) {
        html += `<span class="corona-unlocked-msg" style="display:inline">🔥 UNLOCKED 🔥</span>`;
    }

    container.innerHTML = html;
}

function calculateBranchStats(assignmentKey, chainHistory) {
    // CHANGED: sFound and sTotal are now Sets to prevent double counting
    let result = {
        sFound: new Set(),
        sTotal: new Set(),
        uniqueBCsTotal: new Set(),
        uniqueBCsFound: new Set()
    };

    const targetZoneID = appState.globalAssignments[assignmentKey];

    if (!targetZoneID || chainHistory.includes(targetZoneID)) return result;

    const zone = worldData.zones[targetZoneID];
    if (!zone) return result;

    const zoneGroup = getZoneGroup(targetZoneID);

    // Shines
    if (zone.shines_available) {
        zone.shines_available.forEach(shine => {
            // Add ID to total set
            result.sTotal.add(shine.id);
            // Add ID to found set if collected
            if (appState.collectedShines.has(shine.id)) {
                result.sFound.add(shine.id);
            }
        });
    }

    // Blue Coins
    if (zone.blue_coin_ids) {
        zone.blue_coin_ids.forEach(bcID => {
            const uniqueKey = `${zoneGroup}::${bcID}`;
            result.uniqueBCsTotal.add(uniqueKey);
            if (appState.collectedBlueCoins.has(uniqueKey)) result.uniqueBCsFound.add(uniqueKey);
        });
    }

    // Recursion
    if (zone.exits) {
        const newHistory = [...chainHistory, targetZoneID];
        zone.exits.forEach(exit => {
            const nextKey = `${zoneGroup}::${exit.id}`;
            const sub = calculateBranchStats(nextKey, newHistory);

            // CHANGED: Merge Sets instead of adding numbers
            sub.sTotal.forEach(id => result.sTotal.add(id));
            sub.sFound.forEach(id => result.sFound.add(id));

            sub.uniqueBCsTotal.forEach(x => result.uniqueBCsTotal.add(x));
            sub.uniqueBCsFound.forEach(x => result.uniqueBCsFound.add(x));
        });
    }
    return result;
}

function checkCoronaUnlock() {
    for (let lvl of SHADOW_MARIO_LEVELS) {
        const zone = worldData.zones[lvl.id];
        if (zone && zone.shines_available.length > 0) {
            const shadowShineID = zone.shines_available[0].id;
            if (!appState.collectedShines.has(shadowShineID)) return false;
        }
    }
    return true;
}

function getZoneGroup(zoneID) {
    return zoneID.replace(/[0-9]+$/, '');
}

// --- Persistence ---

function saveState() {
    const exportData = {
        unlocks: Array.from(appState.unlocks),
        globalAssignments: appState.globalAssignments,
        collectedShines: Array.from(appState.collectedShines),
        collectedBlueCoins: Array.from(appState.collectedBlueCoins),
        timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sms-tracker-save.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadState(inputElement) {
    const file = inputElement.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            appState.unlocks = new Set(importedData.unlocks || []);
            appState.collectedShines = new Set(importedData.collectedShines || []);
            appState.collectedBlueCoins = new Set(importedData.collectedBlueCoins || []);
            appState.globalAssignments = importedData.globalAssignments || {};

            // Legacy fix
            if(!appState.globalAssignments["enter_corona"]) {
                appState.globalAssignments["enter_corona"] = "coro_ex6";
            }

            renderUnlocks();
            renderTable();
            updateAllStatsUI();

            alert("Save loaded successfully!");
        } catch (err) {
            console.error(err);
            alert("Error loading save file: Invalid JSON.");
        }
    };
    reader.readAsText(file);
    inputElement.value = ''; // Reset
}