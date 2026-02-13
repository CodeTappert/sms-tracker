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
    excludedShines: new Set(),
    collectedBlueCoins: new Set(),
    collapsedElements: new Set(), // IDs of collapsed rows
    autoTrackEnabled: false
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
    initAutoTracker(); // Do it once on load and then we will see in the response if it will be enabled
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

            // Prepare Blue Coin Metadata Map
            window.blueCoinMetadata = new Map();
            if (data.blue_coins) {
                data.blue_coins.forEach(bc => {
                    window.blueCoinMetadata.set(bc.id, bc);
                });
            }

            // Set default corona entrance if missing
            if (!appState.globalAssignments["enter_corona"]) {
                appState.globalAssignments["enter_corona"] = "coro_ex6";
            }

            // Collapse corona by default
            appState.collapsedElements.add("corona-main");

            // Pre-build dropdown options
            const sortedZones = Object.values(worldData.zones)
                .filter(z => z.id !== 'coro_ex6' && z.id !== 'coronaBoss' && z.id !== 'dolpic_base') // Exclude special zones
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

// Helper to generate stable IDs from group names
function getSafeGroupID(groupName) {
    if (!groupName) return "group-stat-unknown";
    return "group-stat-" + groupName.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function renderTable() {
    stats.shinesPossible = new Set();
    stats.visibleBC.clear();

    const tbody = document.getElementById('table-body');
    let htmlBuffer = "";

    // --- Group: Delfino Plaza (The Hub) ---
    // We hardcode the ID to match the safe ID generator: "group-stat-delfino_plaza"
    const hubName = "Delfino Plaza";
    const hubID = getSafeGroupID(hubName);
    const isHubCollapsed = appState.collapsedElements.has(hubID);

    htmlBuffer += `
    <tr class="group-header-row ${isHubCollapsed ? 'collapsed' : ''}" 
        data-action="toggle-collapse" 
        data-target-class=".${hubID}-rows" 
        data-storage-key="${hubID}">
        <td colspan="3" class="group-header">
            <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
                <span style="pointer-events: auto;">
                    <span class="collapse-icon">${isHubCollapsed ? '▶' : '▼'}</span> Main Hub
                </span>
                <div class="group-stats-summary" id="${hubID}" style="pointer-events: auto;"></div>
            </div>
        </td>
    </tr>`;

    // 1. Render Hub Locals (Dolpic Base)
    htmlBuffer += buildRecursiveZoneRows("dolpic_base", ["plaza_root"], 0, `${hubID}-rows`, "plaza-hub-entry");

    // 2. Render Corona (Inside Hub)
    const coronaEntrance = worldData.plaza_entrances.find(e => e.id === "enter_corona");
    if (coronaEntrance) {
        htmlBuffer += buildCoronaRow(coronaEntrance, `${hubID}-rows`);
    }

    // --- All other Groups ---
    let lastGroup = "";

    worldData.plaza_entrances.forEach((entrance, index) => {
        // Skip Corona (handled above) and static non-warps (handled implicitly or ignored for main rows)
        if (entrance.id === "enter_corona") return;
        if (entrance.is_warp === false && entrance.group_name !== "Delfino Plaza") return; // Keep plaza statics if they exist, skip others

        // Determine if we need a new Group Header
        if (entrance.group_name !== lastGroup) {
            // Only render header if it's NOT Delfino Plaza (already rendered)
            if (entrance.group_name !== "Delfino Plaza") {
                const groupID = getSafeGroupID(entrance.group_name);
                const isCollapsed = appState.collapsedElements.has(groupID);

                htmlBuffer += `
                <tr class="group-header-row ${isCollapsed ? 'collapsed' : ''}" 
                    data-action="toggle-collapse" 
                    data-target-class=".${groupID}-rows" 
                    data-storage-key="${groupID}">
                    <td colspan="3" class="group-header">
                        <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
                            <span style="pointer-events: auto;">
                                <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span> 
                                ${entrance.group_name}
                            </span>
                            <div class="group-stats-summary" id="${groupID}" style="pointer-events: auto;"></div>
                        </div>
                    </td>
                </tr>`;
            }
            lastGroup = entrance.group_name;
        }

        // Calculate classes
        const currentGroupID = getSafeGroupID(entrance.group_name);
        const groupRowClass = `${currentGroupID}-rows`;
        const entryID = `entry-${index}`;

        // Pass the safe class to the row builder
        htmlBuffer += buildMainEntryRow(entrance, entryID, groupRowClass);
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
        const isChecked = appState.collectedShines.has(entrance.id);
        const isExcluded = appState.excludedShines.has(entrance.id);

        // State-based CSS class
        const statusClass = isChecked ? 'checked' : (isExcluded ? 'excluded' : '');

            stats.shinesPossible.add(entrance.id);

        targetCellContent = `<span style="color: #888; font-style: italic;">Plaza Collectible</span>`;
        statsCellContent = `
        <div class="shine-container">
            <div class="shine-check ${statusClass}" 
                 data-action="toggle-shine" 
                 data-id="${entrance.id}">
                <img src="images/shine_sprite.webp" style="width:16px; margin-right:4px;" alt="Shine">
                ${isExcluded ? 'Skipped' : 'Collect'}
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

function buildRecursiveZoneRows(zoneID, chainHistory, depth, groupClass, parentID, countStats = true, isLocked = false) {
    const zone = worldData.zones[zoneID];
    if (!zone) return "";

    const zoneGroup = getZoneGroup(zoneID);
    const indent = depth === 0 ? "" : "│   ".repeat(depth);
    const prefix = depth === 0 ? "" : "└── ";

    const isEntryCollapsed = appState.collapsedElements.has(parentID);
    const isParentGroupCollapsed = appState.collapsedElements.has(groupClass);
    const shouldHide = (depth > 0 && isEntryCollapsed) || isParentGroupCollapsed;
    const displayStyle = shouldHide ? 'style="display:none"' : '';

    // VISUAL: Propagate the locked look to children
    const lockedRowClass = isLocked ? "row-locked" : "";

    // INTERACTION: Disable inner actions if locked
    const shineAction = isLocked ? '' : 'data-action="toggle-shine"';
    const bcAction = isLocked ? '' : 'data-action="toggle-bc"';
    const lockedStyle = isLocked ? 'style="pointer-events: none; opacity: 0.6;"' : '';

    // COLLAPSE LOGIC: Apply to the TR only if there are exits to collapse
    const hasExits = zone.exits && zone.exits.length > 0;
    const trAction = hasExits ? 'data-action="toggle-collapse"' : '';
    const trTarget = hasExits ? `data-target-selector="[data-parent='${parentID}-sub']"` : '';
    const trKey    = hasExits ? `data-storage-key="${parentID}"` : '';
    // Optional: Add a pointer cursor to the whole row if it is collapsible
    const trStyle  = hasExits ? 'style="cursor:pointer"' : '';

    // Combine display:none with cursor:pointer if needed
    const finalStyle = shouldHide ? 'style="display:none"' : (hasExits ? 'style="cursor:pointer"' : '');

    let rowHTML = `
    <tr class="${groupClass} ${lockedRowClass} ${depth === 0 ? 'entry-main-row' : 'child-row'}" 
        data-parent="${parentID}" 
        ${trAction} 
        ${trTarget} 
        ${trKey}
        ${finalStyle}>
        <td>
            <span class="tree-line">${indent}${prefix}</span>
            <span class="zone-wrapper">
                <span class="collapse-icon-sub">${hasExits ? (isEntryCollapsed ? '▶' : '▼') : ''}</span>
                <span class="zone-name" style="${depth === 0 ? 'color:#fff' : 'color:#f39c12'}">${depth === 0 ? '' : '↳ '}${zone.name}</span>
            </span>
        </td>
        <td>${depth === 0 ? '<span style="color: #666; font-style: italic;">Local Area</span>' : ''}</td>
        <td>`;

    if (zone.shines_available?.length > 0) {
        rowHTML += `<div class="shine-container">`;
        zone.shines_available.forEach(shine => {
            const isChecked = appState.collectedShines.has(shine.id);
            const isExcluded = appState.excludedShines.has(shine.id);

            if (countStats) {
                stats.shinesPossible.add(shine.id);
            }

            const statusClass = isChecked ? 'checked' : (isExcluded ? 'excluded' : '');

            rowHTML += `
                <div class="shine-check ${statusClass}" 
                     ${shineAction} 
                     data-id="${shine.id}"
                     ${lockedStyle}>
                    <img src="images/shine_sprite.webp" style="width:16px; margin-right:4px;" alt="Shine">${shine.name}
                </div>`;
        });
        rowHTML += `</div>`;
    }

    if (zone.blue_coin_ids) {
        rowHTML += `<div class="bc-grid-container" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">`;
        const sortedCoins = zone.blue_coin_ids.map(bcID => {
            const info = blueCoinMetadata.get(bcID) || { mariopartylegacylink: "" };
            let sortOrder = 999;
            const match = info.mariopartylegacylink.match(/#coin-(\d+)$/);
            if (match) sortOrder = parseInt(match[1], 10);
            return { bcID, sortOrder, info };
        }).sort((a, b) => a.sortOrder - b.sortOrder);

        sortedCoins.forEach(({ bcID, info }) => {

            if (countStats) stats.visibleBC.add(bcID);

            const isCollected = appState.collectedBlueCoins.has(bcID);
            let coinNumber = "🔵";
            const match = info.mariopartylegacylink.match(/#coin-(\d+)$/);
            if (match) coinNumber = match[1];

            rowHTML += `
            <div class="bc-item-wrapper">
                <div class="bc-box ${isCollected ? 'collected' : ''}" 
                     ${bcAction} 
                     data-id="${bcID}"
                     ${lockedStyle}>
                    ${coinNumber}
                    <a href="${info.mariopartylegacylink}" target="_blank" class="bc-info-link" style="pointer-events: auto;" onclick="event.stopPropagation();">?</a>
                </div>
                <div class="bc-tooltip">
                    <strong>${info.title || "Blue Coin"}</strong><br>
                    <small>${info.episodeString || ""}</small>
                </div>
            </div>`;
        });
        rowHTML += `</div>`;
    }
    rowHTML += `</td></tr>`;

    if (zone.exits) {
        const subParentID = parentID + '-sub';
        zone.exits.forEach(exit => {
            const assignmentKey = `${zoneGroup}::${exit.id}`;
            const target = appState.globalAssignments[assignmentKey];
            let dropdownHTML = cachedZoneOptionsHTML;
            if (target) dropdownHTML = dropdownHTML.replace(`value="${target}"`, `value="${target}" selected`);
            const selectClass = target ? "filled" : "";

            const disabledAttr = isLocked ? 'disabled style="opacity:0.6; pointer-events:none;"' : '';

            rowHTML += `
            <tr class="${groupClass} ${lockedRowClass} child-row" data-parent="${subParentID}" ${displayStyle}>
                <td><span class="tree-line">${indent}│   └── </span><span class="exit-name">Exit: ${exit.name}</span></td>
                <td>
                    <select class="${selectClass}" data-assign-key="${assignmentKey}" ${disabledAttr}>
                        ${dropdownHTML}
                    </select>
                </td>
                <td></td>
            </tr>`;

            if (target && !chainHistory.includes(target)) {
                rowHTML += buildRecursiveZoneRows(target, [...chainHistory, target], depth + 1, groupClass, subParentID, countStats, isLocked);
            } else if (target) {
                const targetZone = worldData.zones[target];
                const targetName = targetZone ? targetZone.name : "Unknown";
                rowHTML += `
                    <tr class="${groupClass} child-row loop-row" data-parent="${parentID}" ${displayStyle}>
                        <td></td>
                        <td style="padding-top: 0;">
                            <div style="color: #e74c3c; font-size: 0.75rem; margin-top: -4px; display: flex; align-items: center; gap: 4px;">
                                <span>⤴</span> <span>Already in chain: ${targetName}</span>
                            </div>
                        </td>
                        <td></td>
                    </tr>`;
            }
        });
    }

    return rowHTML;
}
function buildCoronaRow(entrance, groupClass) {
    const isUnlocked = checkCoronaUnlock();
    const lockedClass = isUnlocked ? "" : "row-locked";

    const zoneID = "coro_ex6";
    const zone = worldData.zones[zoneID];

    if (!zone) return "";

    // --- 1. Collapse Configuration ---
    const entryID = "corona-main";
    const isCollapsed = appState.collapsedElements.has(entryID);

    // If collapsed, children should be hidden
    const childStyle = isCollapsed ? 'style="display:none"' : '';

    const col2Content = isUnlocked
        ? `<span style="color: #666; font-style: italic;">Local Area</span>`
        : `<div style="font-size:0.8em; color:#e74c3c;">🔒 Locked (Defeat all 7 Shadow Marios)</div>`;

    // Add collapse attributes to the main row
    let html = `
    <tr class="${groupClass} ${lockedClass}"
        data-action="toggle-collapse" 
        data-target-selector="[data-parent='${entryID}']" 
        data-storage-key="${entryID}">
        <td>
            <span class="collapse-icon-sub">${isCollapsed ? '▶' : '▼'}</span>
            <span class="zone-name">${entrance.name}</span>
        </td>
        <td>${col2Content}</td>
        <td>`;

    // Render Blue Coins
    if (zone.blue_coin_ids) {
        html += `<div class="bc-grid-container" style="display: flex; flex-wrap: wrap; gap: 8px;">`;

        const zoneGroup = getZoneGroup(zoneID);
        const sortedCoins = zone.blue_coin_ids.map(bcID => {
            const info = blueCoinMetadata.get(bcID) || { mariopartylegacylink: "" };
            let sortOrder = 999;
            const match = info.mariopartylegacylink.match(/#coin-(\d+)$/);
            if (match) sortOrder = parseInt(match[1], 10);
            return { bcID, sortOrder, info };
        }).sort((a, b) => a.sortOrder - b.sortOrder);

        const bcAction = isUnlocked ? 'data-action="toggle-bc"' : '';
        const lockedStyle = isUnlocked ? '' : 'style="pointer-events: none; opacity: 0.6;"';

        sortedCoins.forEach(({ bcID, info }) => {
            if (isUnlocked) stats.visibleBC.add(bcID);

            const isCollected = appState.collectedBlueCoins.has(bcID);
            let coinNumber = "🔵";
            const match = info.mariopartylegacylink.match(/#coin-(\d+)$/);
            if (match) coinNumber = match[1];

            html += `
            <div class="bc-item-wrapper">
                <div class="bc-box ${isCollected ? 'collected' : ''}" 
                     ${bcAction} 
                     data-id="${bcID}" 
                     ${lockedStyle}>
                    ${coinNumber}
                    <a href="${info.mariopartylegacylink}" target="_blank" class="bc-info-link" style="pointer-events: auto;" onclick="event.stopPropagation();">?</a>
                </div>
                <div class="bc-tooltip">
                    <strong>${info.title || "Blue Coin"}</strong><br>
                    <small>${info.episodeString || ""}</small>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    html += `</td></tr>`;

    // --- 3. Exit Row  ---
    if (zone.exits) {
        zone.exits.forEach(exit => {
            const targetID = "coronaBoss";
            const displayTargetName = "Corona Mountain (Boss)";

            // A. Draw the Exit Row
            html += `
            <tr class="${groupClass} ${lockedClass} child-row" 
                data-parent="${entryID}" 
                ${childStyle}>
                <td><span class="tree-line">└── </span><span class="exit-name">Exit: ${exit.name}</span></td>
                <td>
                    <select class="filled" disabled style="opacity: ${isUnlocked ? '1' : '0.6'}; cursor: not-allowed; color: #fff; font-weight: bold;">
                        <option selected>${displayTargetName}</option>
                    </select>
                </td>
                <td></td>
            </tr>`;

            // B. Recursively render the boss zone
            html += buildRecursiveZoneRows(
                targetID,
                [entrance.id, zoneID, targetID],
                2,
                groupClass,
                entryID,
                isUnlocked,
                !isUnlocked
            );
        });
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
        // Prevent toggling if clicking on interactive elements like shines, blue coins, links, or selects
        const isInteractive =
            event.target.closest('.shine-check') ||
            event.target.closest('.bc-box') ||
            event.target.closest('a') ||
            event.target.tagName === 'SELECT';

        if (!isInteractive) {
            const selector = toggleRow.dataset.targetClass || toggleRow.dataset.targetSelector;
            const storageKey = toggleRow.dataset.storageKey;
            handleCollapse(selector, toggleRow, storageKey);
            return; // Stop here only if we actually collapsed
        }
    }

    // 2. Check for Shine clicks
    const shineDiv = event.target.closest('[data-action="toggle-shine"]');
    if (shineDiv) {
        const id = shineDiv.dataset.id;
        const wasCoronaUnlocked = checkCoronaUnlock();

        // Cycle Logic
        if (appState.collectedShines.has(id)) {
            // State 1 -> 2: Collected -> Excluded
            appState.collectedShines.delete(id);
            appState.excludedShines.add(id);
        } else if (appState.excludedShines.has(id)) {
            // State 2 -> 0: Excluded -> None
            appState.excludedShines.delete(id);
        } else {
            // State 0 -> 1: None -> Collected
            appState.collectedShines.add(id);
        }

        const isCoronaUnlocked = checkCoronaUnlock();
        if (wasCoronaUnlocked !== isCoronaUnlocked) {
            if (isCoronaUnlocked) appState.collapsedElements.delete("corona-main");
            renderTable();
            return;
        }

        // UI Sync for all instances
        document.querySelectorAll(`[data-action="toggle-shine"][data-id="${id}"]`).forEach(el => {
            el.classList.remove('checked', 'excluded');
            if (appState.collectedShines.has(id)) el.classList.add('checked');
            if (appState.excludedShines.has(id)) el.classList.add('excluded');
        });

        updateAllStatsUI();
        return;
    }

    // 3. Check for Blue Coin clicks
    const bcDiv = event.target.closest('[data-action="toggle-bc"]');
    if (bcDiv) {
        const id = bcDiv.dataset.id;

        if (appState.collectedBlueCoins.has(id)) {
            appState.collectedBlueCoins.delete(id);
        } else {
            appState.collectedBlueCoins.add(id);
        }

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
    // 1. Global Totals
    document.getElementById('stat-shines').innerText = `${appState.collectedShines.size} / ${stats.shinesPossible.size}`;

    let bcFound = 0;
    stats.visibleBC.forEach(key => {
        if (appState.collectedBlueCoins.has(key)) bcFound++;
    });
    document.getElementById('stat-bc').innerText = `${bcFound} / ${stats.visibleBC.size}`;

    updateShadowMarioBar();

    // 2. Helper to merge stats results
    const mergeStats = (target, source) => {
        source.sFound.forEach(x => target.sFound.add(x));
        source.sTotal.forEach(x => target.sTotal.add(x));
        source.uniqueBCsFound.forEach(x => target.uniqueBCsFound.add(x));
        source.uniqueBCsTotal.forEach(x => target.uniqueBCsTotal.add(x));
    };

    // 3. Identify all Unique Groups
    const uniqueGroups = new Set();
    uniqueGroups.add("Delfino Plaza");
    worldData.plaza_entrances.forEach(e => uniqueGroups.add(e.group_name));

    // 4. Calculate and Render per Group
    uniqueGroups.forEach(groupName => {
        const safeID = getSafeGroupID(groupName);
        const container = document.getElementById(safeID);
        if (!container) return;

        const groupStats = {
            sFound: new Set(),
            sTotal: new Set(),
            uniqueBCsFound: new Set(),
            uniqueBCsTotal: new Set()
        };

        // A: Special Logic for Main Hub (Delfino Plaza)
        if (groupName === "Delfino Plaza") {
            // 1. Hub Locals
            const hubLocalRes = calculateBranchStatsForZone("dolpic_base");
            mergeStats(groupStats, hubLocalRes);

            // 2. Hub Exits (Physical warps inside dolpic_base)
            const hubZone = worldData.zones["dolpic_base"];
            if (hubZone && hubZone.exits) {
                const hubGroup = getZoneGroup("dolpic_base");
                hubZone.exits.forEach(exit => {
                    const key = `${hubGroup}::${exit.id}`;
                    const exitRes = calculateBranchStats(key, ["dolpic_base"]);
                    mergeStats(groupStats, exitRes);
                });
            }

            // 3. Corona - ONLY if Unlocked
            if (checkCoronaUnlock()) {
                // coro_ex6 zone has the blue coins for corona
                const coronaRes = calculateBranchStatsForZone("coro_ex6");
                mergeStats(groupStats, coronaRes);
            }
        }

        // B: Process Entrances belonging to this group
        const groupEntrances = worldData.plaza_entrances.filter(e => e.group_name === groupName);

        groupEntrances.forEach(e => {
            if (e.id === "enter_corona") return; // Handled explicitly above

            if (e.is_warp === false) {
                groupStats.sTotal.add(e.id);
                if (appState.collectedShines.has(e.id)) groupStats.sFound.add(e.id);
            } else {
                const routeRes = calculateBranchStats(e.id, []);
                mergeStats(groupStats, routeRes);
            }
        });

        // Render Group Stats
        if (groupStats.sTotal.size > 0 || groupStats.uniqueBCsTotal.size > 0) {
            const sDone = groupStats.sFound.size === groupStats.sTotal.size;
            const bDone = groupStats.uniqueBCsFound.size === groupStats.uniqueBCsTotal.size;

            container.innerHTML = `
                <span class="g-stat ${sDone ? 'done' : ''}">
                    <img src="images/shine_sprite.webp" style="width:14px; vertical-align:middle;"> 
                    ${groupStats.sFound.size}/${groupStats.sTotal.size}
                </span>
                <span class="g-stat ${bDone ? 'done' : ''}" style="margin-left: 8px;">
                    <span style="font-size:0.9em">🔵</span> 
                    ${groupStats.uniqueBCsFound.size}/${groupStats.uniqueBCsTotal.size}
                </span>`;
            container.style.display = "block";
        } else {
            container.style.display = "none";
        }
    });

    // 5. Update Individual Route Stats
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
            container.innerHTML = '';
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
                result.sTotal.add(shine.id);
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
        excludedShines: Array.from(appState.excludedShines),
        collectedBlueCoins: Array.from(appState.collectedBlueCoins),
        collapsedElements: Array.from(appState.collapsedElements),
        timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms-tracker-save-${new Date().getTime()}.json`;
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

            // Convert Arrays back to Sets
            appState.unlocks = new Set(importedData.unlocks || []);
            appState.collectedShines = new Set(importedData.collectedShines || []);
            appState.excludedShines = new Set(importedData.excludedShines || []);
            appState.collectedBlueCoins = new Set(importedData.collectedBlueCoins || []);
            appState.collapsedElements = new Set(importedData.collapsedElements || []);
            appState.globalAssignments = importedData.globalAssignments || {};

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
    inputElement.value = '';
}

// --- Auto-Tracker Logic ---

let autoTrackInterval = null;
let countdownInterval = null;
let currentTrackingInterval = 5; // Will be updated by API
let nextUpdateIn = 5.0;
let isFirstLoad = true;

// Handle UI interaction
document.getElementById('chk-auto-track').addEventListener('change', (e) => {
    appState.autoTrackEnabled = e.target.checked;
    if (appState.autoTrackEnabled) {
        startAutoTracking();
    } else {
        stopAutoTracking();
    }
});

/**
 * Called on page load or when settings change
 */
function initAutoTracker() {
    fetchMemoryData().then(() => {
        isFirstLoad = false;
    });
}

function startAutoTracking(isSilentUpdate = false) {
    if (!isSilentUpdate) {
        console.log(`Auto-Tracking started at ${currentTrackingInterval}s interval...`);
    }

    // Clear existing to prevent duplicates
    if (autoTrackInterval) clearInterval(autoTrackInterval);
    if (countdownInterval) clearInterval(countdownInterval);

    // Initial fetch if not already in a loop
    if (!isSilentUpdate) fetchMemoryData();

    autoTrackInterval = setInterval(fetchMemoryData, currentTrackingInterval * 1000);

    nextUpdateIn = currentTrackingInterval;
    countdownInterval = setInterval(() => {
        nextUpdateIn -= 0.1;
        if (nextUpdateIn <= 0) nextUpdateIn = currentTrackingInterval;

        const countdownEl = document.getElementById('api-countdown');
        if (countdownEl) {
            countdownEl.innerText = `(Next: ${Math.max(0, nextUpdateIn).toFixed(1)}s)`;
        }
    }, 100);
}

function stopAutoTracking() {
    clearInterval(autoTrackInterval);
    clearInterval(countdownInterval);
    autoTrackInterval = null;
    countdownInterval = null;

    // UI Reset
    document.getElementById('dolphin-indicator').style.background = "#555";
    document.getElementById('dolphin-indicator').style.boxShadow = "none";
    document.getElementById('dolphin-text').innerText = "Disconnected";
    document.getElementById('dolphin-text').style.color = "#888";
    document.getElementById('current-seed').innerText = "---";
    document.getElementById('api-countdown').innerText = "(Next: 0.0s)";
    document.querySelectorAll('.unlock-icon').forEach(img => img.classList.remove('auto-active'));
}

async function fetchMemoryData() {
    // Only fetch if enabled OR if we are doing the initial boot check
    if (!appState.autoTrackEnabled && !isFirstLoad) return;

    try {
        const r = await fetch('/api/memory');
        const data = await r.json();

        // 1. Initial Setup from Config
        if (isFirstLoad) {
            currentTrackingInterval = data.interval || 5;
            appState.autoTrackEnabled = data.auto_track;
            document.getElementById('chk-auto-track').checked = data.auto_track;

            if (appState.autoTrackEnabled) {
                startAutoTracking(true);
            }
        }

        // 2. Handle Dynamic Interval updates from Backend
        if (!isFirstLoad && data.interval && data.interval !== currentTrackingInterval) {
            console.log(`Interval changed from ${currentTrackingInterval} to ${data.interval}`);
            currentTrackingInterval = data.interval;
            startAutoTracking(true);
            return;
        }

        updateDolphinStatusUI(data.is_hooked);

        if (!data.is_hooked) {
            document.getElementById('current-location').innerText = "SEARCHING...";
            document.getElementById('current-seed').innerText = "Searching..."; // Updated
            document.getElementById('current-episode').innerText = "---";
            return;
        }

        // 3. Update UI Data
        document.getElementById('current-location').innerText = data.current_level || "---";
        document.getElementById('current-seed').innerText = data.seed || "---"; // Updated
        document.getElementById('current-episode').innerText = data.current_episode || "---";

        let changed = false;
        if (data.unlocks) {
            for (let [skill, isUnlocked] of Object.entries(data.unlocks)) {
                const skillId = skill.toLowerCase();
                if (isUnlocked && !appState.unlocks.has(skillId)) {
                    appState.unlocks.add(skillId);
                    changed = true;
                } else if (!isUnlocked && appState.unlocks.has(skillId)) {
                    appState.unlocks.delete(skillId);
                    changed = true;
                }
            }
        }

        if (changed) {
            renderUnlocks();
            renderTable();
        }
        syncUnlockIconsVisuals(data.unlocks);

    } catch (err) {
        console.error("Memory API Error:", err);
        updateDolphinStatusUI(false);
    }
}

function updateDolphinStatusUI(isHooked) {
    const indicator = document.getElementById('dolphin-indicator');
    const text = document.getElementById('dolphin-text');
    if (!indicator || !text) return;

    if (isHooked) {
        indicator.style.background = "#2ecc71";
        indicator.style.boxShadow = "0 0 8px #2ecc71";
        text.innerText = "Connected";
        text.style.color = "#2ecc71";
    } else {
        indicator.style.background = "#e74c3c";
        indicator.style.boxShadow = "none";
        text.innerText = "Dolphin Not Found";
        text.style.color = "#e74c3c";
    }
}

function syncUnlockIconsVisuals(memoryUnlocks) {
    const icons = document.querySelectorAll('.unlock-icon');
    icons.forEach(img => {
        const id = img.dataset.unlockId;
        const isCurrentlyActive = Object.entries(memoryUnlocks || {}).some(
            ([key, val]) => key.toLowerCase() === id && val === true
        );
        if (isCurrentlyActive) img.classList.add('auto-active');
        else img.classList.remove('auto-active');
    });
}

// Logic to prevent manual override while auto-tracking
const originalToggleUnlock = toggleUnlock;
toggleUnlock = function(id) {
    if (appState.autoTrackEnabled) {
        console.log("Manual toggle disabled while Auto-Track is active.");
        // Also show a brief message to the user
        alert("Cannot manually toggle unlocks while Auto-Track is active.");
        return;
    }
    if (appState.unlocks.has(id)) appState.unlocks.delete(id);
    else appState.unlocks.add(id);
    renderUnlocks();
};

function calculateBranchStatsForZone(zoneID) {
    const zone = worldData.zones[zoneID];
    const zoneGroup = getZoneGroup(zoneID);
    let res = {
        sFound: new Set(),
        sTotal: new Set(),
        uniqueBCsTotal: new Set(),
        uniqueBCsFound: new Set()
    };

    if (!zone) return res;

    if (zone.shines_available) {
        zone.shines_available.forEach(shine => {
            // Only count toward total if NOT excluded
                res.sTotal.add(shine.id);
                if (appState.collectedShines.has(shine.id)) {
                    res.sFound.add(shine.id);
                }

        });
    }

    if (zone.blue_coin_ids) {
        zone.blue_coin_ids.forEach(bcID => {
            const key = `${zoneGroup}::${bcID}`;
            res.uniqueBCsTotal.add(key);
            if (appState.collectedBlueCoins.has(key)) res.uniqueBCsFound.add(key);
        });
    }

    return res;
}

