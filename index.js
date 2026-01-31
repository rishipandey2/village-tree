console.log("--- Family Tree Script Engine Starting ---");
// Reconstruct the tree from flat data
function buildTree(flatList) {
    if (!flatList || !Array.isArray(flatList) || flatList.length === 0) {
        console.error("buildTree: flatList is empty or invalid", flatList);
        return null;
    }
    const nodeMap = {};
    let root = null;
    
    flatList.forEach(p => { 
        if (p && p.id) {
            nodeMap[p.id] = Object.assign({}, p, { children: [] }); 
        }
    });

    flatList.forEach(p => {
        if (!p || !p.id) return;
        const node = nodeMap[p.id];
        if (p.parentId === null || p.parentId === undefined) {
            root = node;
        } else {
            const parent = nodeMap[p.parentId];
            if (parent) parent.children.push(node);
        }
    });
    
    // Fallback: If no root found (no parentId: null), use the first node
    if (!root && flatList.length > 0) {
        root = nodeMap[flatList[0].id];
    }
    
    return root || {};
}

// --- DATA LOADING STRATEGY ---
// 1. Check LocalStorage (User edits)
// 2. Fallback to data.js (Base data)
let flatFamilyData = [];
try {
    const localData = localStorage.getItem("familyTreeData");
    if (localData) {
        flatFamilyData = JSON.parse(localData);
        console.log("Loaded data from LocalStorage");
    } else {
        flatFamilyData = typeof familyMembers !== 'undefined' ? familyMembers : [];
    }
} catch(e) {
    console.error("Data loading error, falling back", e);
    flatFamilyData = typeof familyMembers !== 'undefined' ? familyMembers : [];
}

// Guarantee array
if (!Array.isArray(flatFamilyData)) {
    console.warn("flatFamilyData was not an array, resetting.");
    flatFamilyData = Array.from(flatFamilyData || []);
}

let familyData = buildTree(flatFamilyData);
let personIndex = {};
let currentFilter = "all";
let currentZoom = 1;
let totalMembers = 0;
let maxGeneration = 0;
let generationMap = {};

// VANSH MODE STATE
let isVanshMode = false;
let vanshTargetId = null;
let vanshRootId = null;
let vanshBranchRootId = null;
let vanshAncestryPathIds = new Set();
let showMarriedDaughters = false;

function indexPerson(person, parent = null) {
  if (!person || !person.id) return;
  // Create a new object with the parent reference
  const indexedPerson = { ...person, parent };
  personIndex[person.id] = indexedPerson;
  
  totalMembers++;
  if (person.generation > maxGeneration) maxGeneration = person.generation;
  if (!generationMap[person.generation]) generationMap[person.generation] = [];
  generationMap[person.generation].push(indexedPerson);

  if (person.children && person.children.length > 0) {
    // Pass the 'indexedPerson' as the parent for the children
    person.children.forEach((child) => indexPerson(child, indexedPerson));
  }
}

// --- VISUAL LOGGER FOR DEBUGGING ---
function logToUI(msg, isError = false) {
    console.log("UI LOG:", msg);
    const statsEl = document.getElementById("familyStats");
    if (statsEl) {
        if (isError) {
            statsEl.classList.add("error-msg-inline");
            statsEl.textContent = "Error: " + msg;
        } else {
            // Internal log for status tracking
        }
    }
}

// --- INITIALIZATION ---
function startup() {
    logToUI("Startup sequence initiated...");
    console.log("Startup Process Begin");
    
    // 1. Data Loading Strategy
    try {
        const localData = localStorage.getItem("familyTreeData");
        if (localData) {
            flatFamilyData = JSON.parse(localData);
            logToUI("Loaded data from LocalStorage (" + flatFamilyData.length + " members)");
        } else {
            flatFamilyData = (typeof familyMembers !== 'undefined') ? familyMembers : [];
            logToUI("Using base data.js (" + (flatFamilyData ? flatFamilyData.length : 0) + " members)");
        }
    } catch(e) {
        logToUI("Storage error: " + e.message, true);
        flatFamilyData = (typeof familyMembers !== 'undefined') ? familyMembers : [];
    }

    if (!Array.isArray(flatFamilyData) || flatFamilyData.length === 0) {
        logToUI("Critical Error: No family data found in data.js or LocalStorage", true);
        return;
    }

    // 2. Build Tree Structure
    familyData = buildTree(flatFamilyData);
    if (!familyData) {
        logToUI("Tree building failed (No root?)", true);
        return;
    }
    
    // 3. Populate Index
    personIndex = {};
    totalMembers = 0;
    maxGeneration = 0;
    generationMap = {};

    if (familyData && familyData.id) {
        indexPerson(familyData);
        logToUI("Tree ready. Total indexed: " + totalMembers);
    } else {
        logToUI("No root person found (Check parentId: null)", true);
    }

    // 4. Update UI Stats
    const statsEl = document.getElementById("familyStats");
    if (statsEl && totalMembers > 0) {
        statsEl.classList.remove("error-msg-inline"); // Reset color
        statsEl.textContent = `कुल: ${totalMembers} सदस्य | ${maxGeneration} पीढ़ियाँ`;
    }

    // HIDE LOADING SCREEN (Splash Screen)
    setTimeout(() => {
        const loader = document.getElementById("loadingScreen");
        if (loader) loader.classList.add("fade-out");
    }, 1000);
}


const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const clearBtn = document.getElementById("clearSearch");

clearBtn.addEventListener("click", function () {
  searchInput.value = "";
  searchResults.style.display = "none";
  clearBtn.style.display = "none";
});

searchInput.addEventListener("input", function (e) {
  const query = e.target.value.trim();
  if (query.length > 0) {
    clearBtn.style.display = "block";
  } else {
    clearBtn.style.display = "none";
  }

  if (query.length < 1) {
    searchResults.style.display = "none";
    return;
  }
  performSearch(query);
});

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    this.classList.add("active");
    currentFilter = this.dataset.filter;
    searchInput.placeholder = getPlaceholder(currentFilter);
    if (searchInput.value.trim()) {
      performSearch(searchInput.value.trim());
    }
  });
});

function getPlaceholder(filter) {
  const placeholders = {
    all: "नाम खोजें...",
    name: "नाम से खोजें...",
    father: "पिता का नाम...",
    year: "जन्म वर्ष...",
  };
  return placeholders[filter] || "खोजें...";
}

function performSearch(query) {
  const queryLower = query.toLowerCase();
  const queryNum = query.replace(/[^0-9]/g, "");
  const results = [];

  Object.values(personIndex).forEach((person) => {
    let score = 0;

    if (
      (person.name && person.name.toLowerCase() === queryLower) ||
      (person.nameEn && person.nameEn.toLowerCase() === queryLower)
    ) {
      score += 100;
    } else if (
      (person.name && person.name.toLowerCase().startsWith(queryLower)) ||
      (person.nameEn && person.nameEn.toLowerCase().startsWith(queryLower))
    ) {
      score += 50;
    } else if (
      (person.name && person.name.toLowerCase().includes(queryLower)) ||
      (person.nameEn && person.nameEn.toLowerCase().includes(queryLower))
    ) {
      score += 25;
    }

    if (currentFilter === "all" || currentFilter === "father") {
      if (person.parent) {
        if (person.parent.name && person.parent.name.toLowerCase() === queryLower) score += 80;
        else if (person.parent.name && person.parent.name.toLowerCase().includes(queryLower))
          score += 20;
      }
    }

    if (currentFilter === "all" || currentFilter === "year") {
      if (queryNum && person.birthYear && person.birthYear.toString().includes(queryNum)) {
        score += person.birthYear.toString() === queryNum ? 90 : 30;
      }
    }

    if (score > 0) {
      results.push({ person, score });
    }
  });

  results.sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    displaySearchResults(results.map((r) => r.person));
  } else {
    searchResults.innerHTML =
      '<div class="no-results">कोई परिणाम नहीं मिला</div>';
    searchResults.style.display = "block";
  }
}

function displaySearchResults(results) {
  searchResults.innerHTML = "";
  results.slice(0, 20).forEach((person) => {
    const div = document.createElement("div");
    div.className = "result-item";
    div.onclick = () => showPersonTree(person.id);

    const parentName = person.parent ? person.parent.name : "मूल पूर्वज";
    const childCount = person.children ? person.children.length : 0;

    div.innerHTML = `
                    <div class="result-name">${person.name}</div>
                    <div class="result-details">पिता: ${parentName} | जन्म: ${person.birthYear} | संतान: ${childCount}</div>
                    <div class="result-generation">पीढ़ी ${person.generation}</div>
                `;
    searchResults.appendChild(div);
  });
  searchResults.style.display = "block";
}

function showFullTree() {
  isVanshMode = false;
  document.getElementById("vanshControls").style.display = "none";
  if (!familyData || !familyData.id) {
      console.log("Attempting emergency re-build...");
      startup(); 
  }
  
  if (!familyData || !familyData.id) {
      alert("परेशानी: वृक्ष का डेटा नहीं मिल पाया। कृपया 'डेटा रीसेट' दबाएं।");
      return;
  }

  document.getElementById("homePage").style.display = "none";
  document.getElementById("treePage").style.display = "block";
  document.getElementById("treeTitle").textContent = "संपूर्ण परिवार वृक्ष";
  document.getElementById("quickActions").style.display = "flex";
  
  // ADD TOGGLE BUTTON
  let viewModeBtn = document.getElementById("viewModeBtn");
  if (!viewModeBtn) {
      viewModeBtn = document.createElement("button");
      viewModeBtn.id = "viewModeBtn";
      viewModeBtn.className = "smart-view-btn";
      viewModeBtn.innerHTML = isCollapsibleMode 
          ? '<span class="btn-icon">📋</span> पूरा देखें' 
          : '<span class="btn-icon">✨</span> स्मार्ट व्यू';
      viewModeBtn.onclick = toggleCollapsibleMode;
      document.getElementById("quickActions").appendChild(viewModeBtn);
  }
  
  clearFocusMode();
  renderTree(familyData, null);
  showScrollHint();
  
  // Verification check:
  setTimeout(() => {
    const nodeCount = document.querySelectorAll(".node").length;
    console.log("Post-render node count:", nodeCount);
    if (nodeCount === 0) {
        if (typeof logToUI === 'function') logToUI("Rendering failed: No nodes detected in DOM", true);
        alert("त्रुटि: वृक्ष के सदस्य स्क्रीन पर नहीं दिख रहे हैं। कृपया 'डेटा रीसेट' बटन का उपयोग करें।");
    }
  }, 500);
}

// AI Bridge: Show a person on the tree
function showPersonOnTree(personId) {
    // 1. Ensure we are in tree view
    if (document.getElementById("treePage").style.display !== "block") {
        showFullTree();
    }

    // 2. Wait for tree to render if it was just triggered
    setTimeout(() => {
        const node = document.querySelector(`[data-person-id="${personId}"]`);
        if (node) {
            // 3. Scroll to node
            node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

            // 4. Highlight node temporarily
            node.style.transition = "outline 0.3s ease";
            node.style.outline = "4px solid black";
            setTimeout(() => {
                node.style.outline = "none";
            }, 3000);

            // 5. Open details
            showPersonDetails(personId);
        }
    }, 600);
}

function showGenerationView() {
  isVanshMode = false;
  document.getElementById("vanshControls").style.display = "none";
  document.getElementById("homePage").style.display = "none";
  document.getElementById("treePage").style.display = "block";
  document.getElementById("treeTitle").textContent = "पीढ़ी अनुसार";
  document.getElementById("quickActions").style.display = "flex";
  clearFocusMode();
  document.getElementById("generationNav").style.display = "block";

  const genNav = document.getElementById("generationNav");
  genNav.innerHTML = "";
  for (let i = 1; i <= maxGeneration; i++) {
    const btn = document.createElement("button");
    btn.className = "gen-btn" + (i === 1 ? " active" : "");
    btn.textContent = `पीढ़ी ${i}`;
    btn.onclick = (e) => filterByGeneration(i, e.target);
    genNav.appendChild(btn);
  }

  renderTree(familyData, null);
  showScrollHint();
}

function filterByGeneration(gen, btn) {
  document
    .querySelectorAll(".gen-btn")
    .forEach((b) => b.classList.remove("active"));
  
  if (btn) btn.classList.add("active");
  else if (event && event.target) event.target.classList.add("active");

  document.querySelectorAll(".node").forEach((node) => {
    const personId = parseInt(node.dataset.personId);
    const person = personIndex[personId];
    if (person.generation === gen) {
      node.style.opacity = "1";
      node.style.pointerEvents = "auto";
    } else {
      node.style.opacity = "0.2";
      node.style.pointerEvents = "none";
    }
  });
}

function showPersonTree(personId) {
  // Use Focus View by default as per user preference
  showFocusView(personId);
}

function showFocusView(personId) {
    isVanshMode = false;
    document.getElementById("vanshControls").style.display = "none";
    const person = personIndex[personId];
    if (!person) return;

    document.getElementById("homePage").style.display = "none";
    document.getElementById("treePage").style.display = "block";
    document.getElementById("treeTitle").textContent = person.name; 
    document.getElementById("quickActions").style.display = "flex";
    
    document.getElementById("focusBanner").style.display = "block";
    document.getElementById("treeContainer").classList.add("tree-focus-active");

    const wrapper = document.getElementById("treeWrapper");
    wrapper.innerHTML = '';
    
    const focusContainer = document.createElement("div");
    focusContainer.className = "focus-container";
    
    // DATA GATHERING
    let grandparents = [];
    if (person.parent && person.parent.parent) {
        grandparents.push(person.parent.parent);
    }
    
    let parents = [];
    if (person.parent) {
        parents.push(person.parent);
    }

    let siblings = [];
    if (person.parent && person.parent.children) {
        siblings = person.parent.children;
    } else {
        siblings = [person]; 
    }

    // RENDER LAYERS (Bottom-Up)
    if (grandparents.length > 0) {
        const row = document.createElement("div");
        row.className = "focus-generation-row";
        grandparents.forEach(gp => row.appendChild(renderFocusNode(gp, "grandparent")));
        focusContainer.appendChild(row);
        
        const conn = document.createElement("div");
        conn.className = "focus-connector-vertical";
        focusContainer.appendChild(conn);
    }
    
    if (parents.length > 0) {
         const row = document.createElement("div");
        row.className = "focus-generation-row";
        parents.forEach(p => row.appendChild(renderFocusNode(p, "parent")));
        focusContainer.appendChild(row);
        
         const conn = document.createElement("div");
        conn.className = "focus-connector-vertical";
        focusContainer.appendChild(conn);
    }
    
    // Focus Row (Contains Siblings + Focus Person with Nested Children)
    const focusRow = document.createElement("div");
    focusRow.className = "focus-generation-row focus-main-row";
    focusRow.style.alignItems = "flex-end"; // Align siblings to bottom (lineage)
    
    siblings.forEach(sib => {
        if (sib.id === person.id) {
            // FOCUS PERSON WRAPPER
            // We nest children here so the line comes ONLY from this person
            const wrapper = document.createElement("div");
            wrapper.style.display = "flex";
            wrapper.style.flexDirection = "column-reverse"; // Bottom-Up: Person at bottom, Children up
            wrapper.style.alignItems = "center";
            
            // 1. The Person Node
            wrapper.appendChild(renderFocusNode(sib, "focus"));
            
            // 2. Children (if any)
            if (person.children && person.children.length > 0) {
                const conn = document.createElement("div");
                conn.className = "focus-connector-vertical";
                wrapper.appendChild(conn);
                
                const childRow = document.createElement("div");
                childRow.className = "focus-generation-row";
                person.children.forEach(c => childRow.appendChild(renderFocusNode(c, "child")));
                wrapper.appendChild(childRow);
            }
            
            focusRow.appendChild(wrapper);
        } else {
            // Sibling Node
            focusRow.appendChild(renderFocusNode(sib, "sibling"));
        }
    });
    
    focusContainer.appendChild(focusRow);
    
    wrapper.appendChild(focusContainer);
    
     setTimeout(() => {
        const focusNode = document.querySelector(".node.focus-node");
        if (focusNode) {
            focusNode.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
    }, 100);
}

function renderFocusNode(person, type) {
    const wrapper = document.createElement("div");
    wrapper.className = "focus-node-wrapper";
    
    const node = document.createElement("div");
    node.className = "node " + (type === "focus" ? "focus-node selected" : "focus-sibling");
    node.dataset.personId = person.id;
    
    // FORCE RESET OPACITY & EVENTS
    node.style.opacity = "1";
    node.style.pointerEvents = "auto";
    
    node.onclick = (e) => {
        e.stopPropagation(); // Prevent bubbling issues
        showFocusView(person.id);
    };
    
    const name = person.name || "Unknown";
    const year = person.birthYear || "";
    
    node.innerHTML = `
        <div class="node-name">${name}</div>
        <div class="node-year">${year}</div>
    `;
    
    wrapper.appendChild(node);
    return wrapper;
}

function goHome() {
  document.getElementById("homePage").style.display = "flex";
  document.getElementById("treePage").style.display = "none";
  document.getElementById("generationNav").style.display = "none";
  searchInput.value = "";
  searchResults.style.display = "none";
  clearBtn.style.display = "none";
  document.getElementById("personDetails").style.display = "none";
  document.getElementById("quickActions").style.display = "none";
  
  // Vansh cleanup
  isVanshMode = false;
  document.getElementById("vanshControls").style.display = "none";
  document.getElementById("vanshInfoBanner").style.display = "none";

  currentZoom = 1;
  clearFocusMode();
}

function clearFocusMode() {
  document.getElementById("treeContainer").classList.remove("tree-focus-active");
  document.getElementById("focusBanner").style.display = "none";
  document.querySelectorAll(".node").forEach(n => n.classList.remove("focused"));
}

function zoomIn() {
  if (currentZoom < 2) {
    currentZoom += 0.2;
    updateZoom();
  }
}

function zoomOut() {
  if (currentZoom > 0.5) {
    currentZoom -= 0.2;
    updateZoom();
  }
}

function resetZoom() {
  currentZoom = 1;
  updateZoom();
}

function updateZoom() {
  const wrapper = document.getElementById("treeWrapper");
  wrapper.style.transform = `scale(${currentZoom})`;
  document.getElementById("zoomLevel").textContent =
    Math.round(currentZoom * 100) + "%";
}

function toggleView(view, btn) {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    else if (event && event.target) event.target.classList.add("active");

  const container = document.getElementById("treeContainer");
  if (view === "compact") {
    container.classList.add("compact-mode");
  } else {
    container.classList.remove("compact-mode");
  }
}

// TOUCH & ZOOM CONTROLS
let lastTouchDistance = 0;
let initialPinchZoom = 1;
let isDragging = false;
let startX, startY, scrollLeft, scrollTop;

function setupTouchControls() {
  const container = document.getElementById("treeContainer");
  const wrapper = document.getElementById("treeWrapper");

  // Pinch to Zoom
  container.addEventListener("touchstart", function (e) {
    if (e.touches.length === 2) {
      e.preventDefault(); // Prevent default browser zoom
      lastTouchDistance = getDistance(e.touches);
      initialPinchZoom = currentZoom;
    } else if (e.touches.length === 1) {
       // Drag to Scroll (Custom implementation for smoother feel if needed, 
       // but native overflow: auto works well. We'll leave native unless zoomed out?)
       // Actually, native scroll is fine, but we might want to prevent drag if we are handling pinch.
       isDragging = true;
       startX = e.touches[0].pageX - container.offsetLeft;
       startY = e.touches[0].pageY - container.offsetTop;
       scrollLeft = container.scrollLeft;
       scrollTop = container.scrollTop;
    }
  }, { passive: false });

  container.addEventListener("touchmove", function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches);
      if (lastTouchDistance > 0) {
        const scale = currentDistance / lastTouchDistance;
        let newZoom = initialPinchZoom * scale;
        
        // Clamp zoom
        newZoom = Math.min(Math.max(newZoom, 0.5), 3); // Allow slightly more details zoom
        
        currentZoom = newZoom;
        updateZoom();
      }
    } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
         // Optional: Custom drag logic if native scroll feels weird when zoomed
         // For now, let's rely on native scroll but maybe prevent interference
    }
  }, { passive: false });

  container.addEventListener("touchend", function (e) {
    if (e.touches.length < 2) {
      lastTouchDistance = 0;
    }
    isDragging = false;
  });
}

function getDistance(touches) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Initialize controls when page loads
document.addEventListener('DOMContentLoaded', setupTouchControls);

let lastRenderNodeCount = 0;
function renderTree(rootPerson, highlightId) {
  lastRenderNodeCount = 0;
  logToUI("Rendering attempt for root: " + (rootPerson ? rootPerson.name : "N/A"));
  
  if (!rootPerson || !rootPerson.id) {
    logToUI("Render failed: Invalid root", true);
    const wrapper = document.getElementById("treeWrapper");
    if (wrapper) wrapper.innerHTML = '<div class="error-msg">वृक्ष का डेटा नहीं मिला।</div>';
    return;
  }
  
  try {
      const wrapper = document.getElementById("treeWrapper");
      if (!wrapper) {
          logToUI("Critical: treeWrapper not found!", true);
          return;
      }
      wrapper.innerHTML = '<div class="tree"></div>';
      const treeDiv = wrapper.querySelector(".tree");

      console.time("RenderTime");
      renderPerson(treeDiv, rootPerson, highlightId);
      console.timeEnd("RenderTime");
      
      logToUI("Render complete. Nodes: " + lastRenderNodeCount);
  } catch (e) {
      logToUI("Render error: " + e.message, true);
      console.error(e);
  }
}

// GLOBAL STATE for Collapsible Tree
const expandedFamilies = new Set();
let isFirstRender = true;
let isCollapsibleMode = false; // Default: Full Tree (as requested)

function toggleFamily(personId) {
    if (expandedFamilies.has(personId)) {
        expandedFamilies.delete(personId);
    } else {
        expandedFamilies.add(personId);
    }
    renderTree(familyData, null); 
}

function toggleCollapsibleMode() {
    isCollapsibleMode = !isCollapsibleMode;
    const btn = document.getElementById("viewModeBtn");
    if (isCollapsibleMode) {
        expandedFamilies.clear();
        if (familyData && familyData.id) expandedFamilies.add(familyData.id);
        if (btn) {
            btn.innerHTML = '<span class="btn-icon">📋</span> पूरा देखें';
            btn.classList.add("active");
        }
    } else {
        if (btn) {
            btn.innerHTML = '<span class="btn-icon">✨</span> स्मार्ट व्यू';
            btn.classList.remove("active");
        }
    }
    renderTree(familyData, null);
}

function renderPerson(container, person, highlightId, forceShowBranch = false) {
  lastRenderNodeCount++;
  
  if (isCollapsibleMode && isFirstRender && !person.parent) {
      expandedFamilies.add(person.id);
      isFirstRender = false;
  }
  
  // --- VANSH MODE FILTERING ---
  let childrenToRender = person.children || [];
  let nextForceShow = forceShowBranch;

  if (isVanshMode) {
      const isOnPath = vanshAncestryPathIds.has(person.id);
      const isBranchRoot = person.id === vanshBranchRootId;

      if (isOnPath && !isBranchRoot && !forceShowBranch) {
          // ABOVE BRANCH (Ancestry Chain): Only show the path to the branch
          childrenToRender = childrenToRender.filter(c => vanshAncestryPathIds.has(c.id));
          nextForceShow = false;
      } else if (isBranchRoot || forceShowBranch) {
          // AT OR BELOW BRANCH: Show all paternal descendants
          childrenToRender = childrenToRender.filter(child => {
              const gender = inferGender(child);
              const isFemale = gender === 'female';
              if (!isFemale) return true; 
              return showMarriedDaughters;
          });
          nextForceShow = true;
      } else {
          // Outside of the Vansh scope (shouldn't happen with correct root selection)
          return;
      }
  }
  
  const personDiv = document.createElement("div");
  personDiv.className = "person-group";

  const node = document.createElement("div");
  node.className = "node";
  
  // Style for Ancestry Path (above focus branch)
  if (isVanshMode && vanshAncestryPathIds.has(person.id) && person.id !== vanshBranchRootId && !forceShowBranch) {
      node.classList.add("ancestry-path");
  }

  if (person.id === highlightId) {
    node.classList.add("selected");
  }
  if (isVanshMode && person.id === vanshTargetId) {
    node.classList.add("vansh-target"); 
  }
  node.dataset.personId = person.id;
  node.onclick = () => showPersonDetails(person.id);

  const name = person.name || "Unknown";
  const year = person.birthYear || "N/A";
  const gen = person.generation || "?";

  node.innerHTML = `
                <div class="node-name">${name}</div>
                <div class="node-year">जन्म: ${year}</div>
                <div class="node-gen">पीढ़ी ${gen}</div>
            `;
            
  personDiv.appendChild(node);

  const childCount = childrenToRender.length;
  const isExpanded = expandedFamilies.has(person.id);

  if (childCount > 0) {
    const verticalLine = document.createElement("div");
    verticalLine.className = "vertical-line";
    personDiv.appendChild(verticalLine);

    const shouldShowChildren = !isCollapsibleMode || isExpanded;

    if (isCollapsibleMode) {
        const familyBlock = document.createElement("div");
        familyBlock.className = "family-block" + (isExpanded ? " expanded" : "");
        familyBlock.innerHTML = `Family · ${childCount} members`;
        familyBlock.onclick = (e) => { e.stopPropagation(); toggleFamily(person.id); };
        personDiv.appendChild(familyBlock);
        
        if (shouldShowChildren) {
            const childrenDiv = document.createElement("div");
            childrenDiv.className = "children-container";

            if (childCount > 1) {
                const horizontalLine = document.createElement("div");
                horizontalLine.className = "horizontal-line";
                childrenDiv.appendChild(horizontalLine);
            }

            childrenToRender.forEach((child) => {
                const childGender = inferGender(child);
                if (isVanshMode && childGender === 'female') {
                    const cw = document.createElement("div");
                    cw.className = "child-wrapper";
                    const conn = document.createElement("div");
                    conn.className = "child-connector";
                    cw.appendChild(conn);
                    renderLeafNode(cw, child, highlightId);
                    childrenDiv.appendChild(cw);
                } else {
                    const childWrapper = document.createElement("div");
                    childWrapper.className = "child-wrapper";
                    const connector = document.createElement("div");
                    connector.className = "child-connector";
                    childWrapper.appendChild(connector);
                    renderPerson(childWrapper, child, highlightId, nextForceShow);
                    childrenDiv.appendChild(childWrapper);
                }
            });
            personDiv.appendChild(childrenDiv);
        }
    } else {
        const childrenDiv = document.createElement("div");
        childrenDiv.className = "children-container";

        if (childCount > 1) {
            const horizontalLine = document.createElement("div");
            horizontalLine.className = "horizontal-line";
            childrenDiv.appendChild(horizontalLine);
        }

        childrenToRender.forEach((child) => {
            const childGender = inferGender(child);
            const childWrapper = document.createElement("div");
            childWrapper.className = "child-wrapper";
            const connector = document.createElement("div");
            connector.className = "child-connector";
            childWrapper.appendChild(connector);

            if (isVanshMode && childGender === 'female') {
               renderLeafNode(childWrapper, child, highlightId);
            } else {
               renderPerson(childWrapper, child, highlightId, nextForceShow);
            }
            childrenDiv.appendChild(childWrapper);
        });
        personDiv.appendChild(childrenDiv);
    }
  }
  
  container.appendChild(personDiv);
}

function renderLeafNode(container, person, highlightId) {
    const node = document.createElement("div");
    node.className = "node leaf-node";
    if (person.id === highlightId) node.classList.add("selected");
    node.onclick = () => showPersonDetails(person.id);
    node.innerHTML = `
        <div class="node-name">${person.name}</div>
        <div class="node-year">${person.birthYear || ''}</div>
    `;
    container.appendChild(node);
}

function showPersonDetails(personId) {
  const person = personIndex[personId];
  if (!person) return;

  document
    .querySelectorAll(".node")
    .forEach((n) => n.classList.remove("selected", "ancestor", "descendant"));
  const clickedNode = document.querySelector(`[data-person-id="${personId}"]`);
  if (clickedNode) clickedNode.classList.add("selected");

  let current = person.parent;
  while (current) {
    const ancestorNode = document.querySelector(
      `[data-person-id="${current.id}"]`,
    );
    if (ancestorNode) ancestorNode.classList.add("ancestor");
    current = current.parent;
  }

  function highlightDescendants(p) {
    if (p.children) {
      p.children.forEach((child) => {
        const descendantNode = document.querySelector(
          `[data-person-id="${child.id}"]`,
        );
        if (descendantNode) descendantNode.classList.add("descendant");
        highlightDescendants(child);
      });
    }
  }
  highlightDescendants(person);

  const detailsDiv = document.getElementById("personDetails");
  detailsDiv.style.display = "block";

  const parentName = person.parent ? person.parent.name : "मूल पूर्वज";
  const childrenList =
    person.children && person.children.length > 0
      ? '<ul class="detail-list">' +
        person.children
          .map((c) => `<li>${c.name} (जन्म: ${c.birthYear})</li>`)
          .join("") +
        "</ul>"
      : '<p style="padding-left: 10px;">कोई नहीं</p>';

  let ancestorsList = "";
  let temp = person.parent;
  let ancestors = [];
  while (temp) {
    ancestors.unshift(temp);
    temp = temp.parent;
  }
  if (ancestors.length > 0) {
    ancestorsList =
      '<ul class="detail-list">' +
      ancestors
        .map((a) => `<li>${a.name} (जन्म: ${a.birthYear})</li>`)
        .join("") +
      "</ul>";
  } else {
    ancestorsList = '<p style="padding-left: 10px;">यह मूल पूर्वज हैं</p>';
  }

  detailsDiv.innerHTML = `
                <div class="detail-title">
                    ${person.name}
                    <button class="detail-close-btn" onclick="document.getElementById('personDetails').style.display='none'">×</button>
                </div>
                
                <div class="detail-section">
                    <div class="detail-row"><span class="detail-label">जन्म वर्ष:</span> ${person.birthYear}</div>
                    <div class="detail-row"><span class="detail-label">पीढ़ी:</span> ${person.generation}</div>
                    <div class="detail-row"><span class="detail-label">पिता:</span> ${parentName}</div>
                </div>

                <div class="detail-section">
                    <div class="detail-section-title">पूर्वज:</div>
                    ${ancestorsList}
                </div>

                <div class="detail-section">
                    <div class="detail-section-title">संतान (${person.children ? person.children.length : 0}):</div>
                    ${childrenList}
                </div>

                <button class="close-details" onclick="closeDetails()">बंद करें</button>
            `;

  detailsDiv.scrollIntoView({ behavior: "smooth" });
}

function closeDetails() {
  document.getElementById("personDetails").style.display = "none";
  document
    .querySelectorAll(".node")
    .forEach((n) => n.classList.remove("selected", "ancestor", "descendant"));
}

function showHelp() {
  document.getElementById("helpModal").style.display = "block";
}

function closeHelp() {
  document.getElementById("helpModal").style.display = "none";
}

function scrollToTop() {
  document
    .getElementById("treeContainer")
    .scrollTo({ top: 0, behavior: "smooth" });
}

function showScrollHint() {
  const hint = document.getElementById("scrollHint");
  hint.style.display = "block";
  setTimeout(() => {
    hint.style.display = "none";
  }, 3000);
}



document.getElementById("helpModal").addEventListener("click", function (e) {
  if (e.target === this) {
    closeHelp();
  }
});

treeContainer.addEventListener("scroll", function () {
  const scrollTop = this.scrollTop;
  const quickActions = document.getElementById("quickActions");
  if (scrollTop > 200) {
    quickActions.style.display = "flex";
  }
});

// RELATIONSHIP CALCULATOR LOGIC

let calcPerson1 = null;
let calcPerson2 = null;

function showCalculator() {
    document.getElementById("homePage").style.display = "none";
    document.getElementById("treePage").style.display = "none";
    document.getElementById("generationNav").style.display = "none";
    document.getElementById("calculatorModal").style.display = "block";
    
    setupAutocomplete(document.getElementById("calcInput1"), "calcList1", (p) => calcPerson1 = p);
    setupAutocomplete(document.getElementById("calcInput2"), "calcList2", (p) => calcPerson2 = p);
}

function closeCalculator() {
    document.getElementById("calculatorModal").style.display = "none";
    document.getElementById("homePage").style.display = "flex";
    
    // Reset
    document.getElementById("calcInput1").value = "";
    document.getElementById("calcInput2").value = "";
    document.getElementById("calcResult").style.display = "none";
    calcPerson1 = null;
    calcPerson2 = null;
}

function setupAutocomplete(inp, listId, onSelect, displayField = "name") {
    const list = document.getElementById(listId);
    
    // Close lists when clicking outside
    document.addEventListener("click", function (e) {
        if (e.target !== inp) {
             list.innerHTML = "";
        }
    });

    inp.addEventListener("input", function(e) {
        const val = this.value;
        list.innerHTML = "";
        if (!val) return false;
        
        let count = 0;
        Object.values(personIndex).forEach(person => {
            if (count > 10) return;

            let matches = false;
            // Safe checks for undefined names just in case
            if (person.name && person.name.toLowerCase().includes(val.toLowerCase())) matches = true;
            if (person.nameEn && person.nameEn.toLowerCase().includes(val.toLowerCase())) matches = true;
            
            // Search by Father's Name too
            if (person.parent) {
                if (person.parent.name && person.parent.name.toLowerCase().includes(val.toLowerCase())) matches = true;
                if (person.parent.nameEn && person.parent.nameEn.toLowerCase().includes(val.toLowerCase())) matches = true;
            }

            if (matches) {
                const item = document.createElement("div");
                // Highlight match logic is complex for bilingual, simplifying to just show name
                item.innerHTML = `<strong>${person.name}</strong> (${person.nameEn})`;
                item.innerHTML += `<br><small>पिता: ${person.parent ? person.parent.name : 'Unknown'}</small>`;
                
                item.addEventListener("click", function(e) {
                    inp.value = person[displayField] || person.name; // Use specified field
                    list.innerHTML = "";
                    onSelect(person);
                });
                
                list.appendChild(item);
                count++;
            }
        });
    });
}

function calculateRelationship() {
    const resultDiv = document.getElementById("calcResult");
    const resultText = document.getElementById("relationText");
    const resultPath = document.getElementById("relationPath");

    if (!calcPerson1 || !calcPerson2) {
        // Fallback: try to find by name if user typed but didn't select
        const in1 = document.getElementById("calcInput1").value;
        const in2 = document.getElementById("calcInput2").value;
        if(in1 && !calcPerson1) calcPerson1 = findPersonByName(in1);
        if(in2 && !calcPerson2) calcPerson2 = findPersonByName(in2);
        
        if (!calcPerson1 || !calcPerson2) {
            alert("कृपया सूची से दोनों व्यक्तियों का चयन करें।");
            return;
        }
    }

    if (calcPerson1.id === calcPerson2.id) {
        resultDiv.style.display = "block";
        resultText.textContent = "यह एक ही व्यक्ति है।";
        resultPath.innerHTML = "";
        return;
    }

    // Find Logic
    const path1 = getAncestors(calcPerson1);
    const path2 = getAncestors(calcPerson2);

    let lca = null;
    // Iterate to find diverging point from Root
    // Paths are [Self, Parent, ... Root]
    // Reverse them to get [Root, GreatGrandParent, ... Self]
    const rev1 = [...path1].reverse();
    const rev2 = [...path2].reverse();
    
    let minLen = Math.min(rev1.length, rev2.length);
    for(let k=0; k<minLen; k++) {
        if(rev1[k].id === rev2[k].id) {
            lca = rev1[k];
        } else {
            break;
        }
    }

    if (!lca) {
        resultDiv.style.display = "block";
        resultText.textContent = "कोई संबंध नहीं मिला।";
        resultPath.textContent = "ये शायद अलग-अलग परिवारों से हैं।";
        return;
    }

    const dist1 = path1.findIndex(p => p.id === lca.id); // Dist from P1 to LCA
    const dist2 = path2.findIndex(p => p.id === lca.id); // Dist from P2 to LCA

    const relation = getRelationName(dist1, dist2, calcPerson1, calcPerson2, path1);

    resultDiv.style.display = "block";
    resultText.innerHTML = `<span class="calc-person">${calcPerson2.name}</span>, <span class="calc-person">${calcPerson1.name}</span> के <span class="calc-relation">${relation}</span> हैं।`;
    
    resultPath.innerHTML = `साझा पूर्वज: <b>${lca.name}</b><br>
                            पीढ़ी अंतर: ${calcPerson2.generation - calcPerson1.generation}`;
}

function findPersonByName(name) {
    return Object.values(personIndex).find(p => p.name === name || p.nameEn === name);
}

function getAncestors(person) {
    const path = [];
    let curr = person;
    while (curr) {
        path.push(curr);
        curr = curr.parent;
    }
    return path;
}

function getRelationName(d1, d2, p1, p2, path1) {
    const genDiff = d2 - d1;
    const isFemale = inferGender(p2);
    
    // Direct Line
    if (d1 === 0) {
        if (genDiff === 1) return isFemale ? "बेटी" : "बेटा";
        if (genDiff === 2) return isFemale ? "पोती" : "पोता";
        if (genDiff === 3) return isFemale ? "परपोती" : "परपोता";
        if (genDiff > 3) return "वंशज";
    }
    
    if (d2 === 0) {
        if (genDiff === -1) return isFemale ? "माता" : "पिता";
        if (genDiff === -2) return isFemale ? "दादी" : "दादा";
        if (genDiff === -3) return isFemale ? "परदादी" : "परदादा";
        if (genDiff < -3) return "पूर्वज";
    }

    // Siblings
    if (genDiff === 0 && d1 === 1 && d2 === 1) {
        return isFemale ? "बहन" : "भाई";
    }
    
    // Cousins (Same Gen)
    if (genDiff === 0) {
        return isFemale ? "चचेरी बहन" : "चचेरा भाई";
    }

    // Uncle/Aunt (1 gen up)
    if (genDiff === -1) {
        // Check if P2 is father's brother (Chaacha/Taau) or sister (Bua)
        // P1's parent is at path1[d1-1]
        // P2 is sibling of P1's parent.
        const parent = path1[d1 - 1]; // P1's parent
        
        if (isFemale) return "बुआ";
        
        // Compare age for Chaacha vs Taau
        if (p2.birthYear && parent.birthYear) {
            if (p2.birthYear < parent.birthYear) return "ताऊ"; // Older than dad
            if (p2.birthYear > parent.birthYear) return "चाचा"; // Younger than dad
        }
        return "चाचा / ताऊ"; // Fallback if no years
    }

    // Nephew/Niece (1 gen down)
    if (genDiff === 1) {
        return isFemale ? "भतीजी" : "भतीजा";
    }

    // Grandparents zone (2 gens up)
    if (genDiff === -2) {
         return isFemale ? "दादी (रिश्ते में)" : "दादा (रिश्ते में)";
    }
    
    // Grandchildren zone (2 gens down)
    if (genDiff === 2) {
         return isFemale ? "पोती (रिश्ते में)" : "पोता (रिश्ते में)";
    }

    return "दूर के रिश्तेदार";
}

function inferGender(person) {
    // Simple heuristic for Indian names
    const name = person.nameEn ? person.nameEn.toLowerCase() : "";
    if (!name) return false; // Default Male

    // Known female suffixes/names based on common patterns or specific data
    const femaleEndings = ["i", "a", "ee"]; 
    // Exceptions like 'Krishna', 'Chandra' end in 'a' but are male
    const maleExceptions = ["chandra", "krishna", "datt", "datta", "ballabh", "bhallabh", "prasad", "kumar", "lal", "ram", "nath", "bindeshwari"];
    
    // Explicit known females in this specific tree context if possible
    // (Based on user report: Anvesha, Hitaxi, Mahi, Manvi, Maya, Bindu, Neelu, Tara)
    const knownFemales = ["anvesha", "hitaxi", "mahi", "manvi", "maya", "bindu", "neelu", "tara"];
    const firstName = name.split(" ")[0];
    
    if (knownFemales.includes(firstName)) return true;
    
    // Check male exceptions first (stronger rule)
    for (let exc of maleExceptions) {
        if (name.includes(exc)) return false;
    }

    // Weak check for female endings
    if (firstName.endsWith("i") || firstName.endsWith("ee") || firstName.endsWith("a")) {
        // 'a' is risky (Rahul vs Anvesha), but 'Pandey' ends in y
        // Let's stick to known list + 'i'/'ee' which is safer for this tree
        if (firstName.endsWith("a") && !firstName.endsWith("undra")) { // Chandra check handled
             // It's ambiguous, but let's default Male for this tree unless confident
             return false;
        }
        return true; 
    }
    
    return false;
}




// --- ADD MEMBER TOOL LOGIC ---
let addMemberParent = null;

function showAddMember() {
    addMemberParent = null; // Clear old selection
    document.getElementById("homePage").style.display = "none";
    document.getElementById("addMemberModal").style.display = "block";
    
    // Reuse the existing autocomplete logic, but bind it to our new input
    setupAutocomplete(document.getElementById("addParentInput"), "addParentList", (p) => {
        addMemberParent = p;
    });
    
    // Autocomplete for names (to reuse existing names if needed)
    setupAutocomplete(document.getElementById("addNameHi"), "addNameHiList", (p) => {
        // Just filling text, no object mapping needed
    }, "name");
    
    setupAutocomplete(document.getElementById("addNameEn"), "addNameEnList", (p) => {
        // Just filling text
    }, "nameEn");
}

function closeAddMember() {
    document.getElementById("addMemberModal").style.display = "none";
    document.getElementById("homePage").style.display = "flex";
    
    // Reset form
    document.getElementById("addParentInput").value = "";
    document.getElementById("addNameHi").value = "";
    document.getElementById("addNameEn").value = "";
    document.getElementById("addBirthYear").value = "";
    addMemberParent = null;
}

function addMemberToTree() {
    const parent = addMemberParent;
    const nameHi = document.getElementById("addNameHi").value.trim();
    const nameEn = document.getElementById("addNameEn").value.trim();
    const year = document.getElementById("addBirthYear").value.trim();
    
    if (!parent || !nameHi) {
        alert("कृपया माता/पिता और नाम (हिंदी) कम से कम भरें।");
        return;
    }
    
    // Calculate new ID: Find max ID in existing data and add 1
    // We can iterate over 'personIndex' keys
    let maxId = 0;
    Object.keys(personIndex).forEach(k => {
        const id = parseInt(k);
        if (id > maxId) maxId = id;
    });
    const newId = maxId + 1;
    const newGen = parent.generation + 1;
    
    // Create new person object
    const newPerson = {
        id: newId,
        name: nameHi,
        nameEn: nameEn || undefined,
        birthYear: year ? parseInt(year) : undefined,
        generation: newGen,
        parentId: parent.id
    };
    
    // 1. Add to flat list
    flatFamilyData.push(newPerson);
    
    // 2. Save to LocalStorage
    localStorage.setItem("familyTreeData", JSON.stringify(flatFamilyData));
    
    // 3. Reload everything (Safest way to refresh all logic)
    alert(`${nameHi} को वृक्ष में जोड़ दिया गया है!`);
    location.reload();
}

function downloadData() {
    // Generate valid JS file content
    const jsonContent = JSON.stringify(flatFamilyData, null, 2);
    const fileContent = "const familyMembers = " + jsonContent + ";";
    
    const blob = new Blob([fileContent], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetToOriginalData() {
    if (confirm("क्या आप वाकई डेटा को रीसेट करना चाहते हैं? आपकी जोड़ी गई नई जानकारी हट जाएगी।")) {
        localStorage.removeItem("familyTreeData");
        location.reload();
    }
}
// --- MY LINEAGE LOGIC ---
let lineagePerson = null;

function showLineage() {
    lineagePerson = null;
    document.getElementById("homePage").style.display = "none";
    document.getElementById("treePage").style.display = "none";
    document.getElementById("generationNav").style.display = "none";
    document.getElementById("lineageModal").style.display = "block";
    
    setupAutocomplete(document.getElementById("lineageInput"), "lineageList", (p) => {
        lineagePerson = p;
    });
}

function closeLineage() {
    document.getElementById("lineageModal").style.display = "none";
    document.getElementById("homePage").style.display = "flex";
    
    document.getElementById("lineageInput").value = "";
    document.getElementById("lineageResult").style.display = "none";
    lineagePerson = null;
}

function getExtendedLineageIds(personId) {
    const person = personIndex[personId];
    if (!person) return [];

    const ids = new Set();
    
    // 1. Direct Ancestors
    let current = person;
    const ancestors = [];
    while (current) {
        ids.add(current.id);
        ancestors.push(current);
        current = current.parent;
    }

    // 2. Siblings of self and all ancestors (Uncles/Aunts)
    ancestors.forEach(anc => {
        if (anc.parent && anc.parent.children) {
            anc.parent.children.forEach(sib => ids.add(sib.id));
        }
    });

    // 3. Descendants of self
    function addDescendants(p) {
        ids.add(p.id);
        if (p.children) {
            p.children.forEach(child => addDescendants(child));
        }
    }
    
    // Find the original person object in children arrays to get full descendant tree
    const originalPerson = personIndex[personId];
    addDescendants(originalPerson);

    return Array.from(ids);
}

function focusOnLineage(personId) {
    const lineageIds = getExtendedLineageIds(personId);
    const container = document.getElementById("treeContainer");
    
    // Activate Focus Mode
    container.classList.add("tree-focus-active");
    document.getElementById("focusBanner").style.display = "block";
    
    // Highlight nodes
    document.querySelectorAll(".node").forEach(node => {
        const id = parseInt(node.dataset.personId);
        if (lineageIds.includes(id)) {
            node.classList.add("focused");
        } else {
            node.classList.remove("focused");
        }
    });
}

function showMyLineage() {
    if (!lineagePerson) {
        const inputVal = document.getElementById("lineageInput").value.trim();
        if (inputVal) {
            lineagePerson = Object.values(personIndex).find(p => p.name === inputVal || p.nameEn === inputVal);
        }
    }

    if (!lineagePerson) {
        alert("कृपया सूची से किसी व्यक्ति का चयन करें।");
        return;
    }

    // --- CLAN VIEW (POORA KHANDAN) LOGIC ---
    isVanshMode = true;
    vanshTargetId = lineagePerson.id;
    showMarriedDaughters = false; // By default hidden

    // Find Vansh (Clan) Root
    // 1. Ultimate Root (Vansh Purush - Gaddar Pandey)
    let ultimate = lineagePerson;
    while (ultimate.parent) {
        ultimate = ultimate.parent;
    }
    vanshRootId = ultimate.id;

    // 2. Branch Root (Grandfather - capturing Father and real brothers)
    let branch = lineagePerson;
    if (branch.parent) branch = branch.parent; // Level 1: Father
    if (branch.parent) branch = branch.parent; // Level 2: Grandfather
    vanshBranchRootId = branch.id;

    // 3. Ancestry Path (Ultimate -> ... -> Branch Root)
    // This is the single line of fathers leading to the branch
    vanshAncestryPathIds.clear();
    let pathCurr = branch;
    while (pathCurr) {
        vanshAncestryPathIds.add(pathCurr.id);
        pathCurr = pathCurr.parent;
    }

    // 1. Close modal
    document.getElementById("lineageModal").style.display = "none";
    document.getElementById("vanshControls").style.display = "flex";
    document.getElementById("vanshInfoBanner").style.display = "flex"; 
    
    // Reset toggle UI
    document.getElementById("daughterToggle").checked = false;

    // 2. Render from Ultimate Root, but filtering will happen in renderPerson
    renderTree(ultimate, lineagePerson.id);
    
    // Switch page
    document.getElementById("homePage").style.display = "none";
    document.getElementById("treePage").style.display = "block";
    document.getElementById("treeTitle").textContent = "वंश-खानदान (Poora Khandan)";
}

function toggleDaughters(checked) {
    showMarriedDaughters = checked;
    const root = personIndex[vanshRootId];
    renderTree(root, vanshTargetId);
}

function toggleVanshInfo() {
    const banner = document.getElementById("vanshInfoBanner");
    banner.style.display = banner.style.display === "none" ? "flex" : "none";
}

function exitVanshMode() {
    isVanshMode = false;
    vanshTargetId = null;
    vanshRootId = null;
    document.getElementById("vanshControls").style.display = "none";
    document.getElementById("vanshInfoBanner").style.display = "none";
    goHome();
}


// --- VILLAGE PAGE LOGIC ---
function showVillagePage() {
    document.getElementById("homePage").style.display = "none";
    document.getElementById("treePage").style.display = "none";
    document.getElementById("generationNav").style.display = "none";
    document.getElementById("villagePage").style.display = "block";
    window.scrollTo(0, 0);
}

function closeVillagePage() {
    document.getElementById("villagePage").style.display = "none";
    document.getElementById("homePage").style.display = "flex";
}

// --- STARTUP ---
try {
    startup();
} catch (e) {
    if (typeof logToUI === 'function') logToUI("Global startup crash: " + e.message, true);
    console.error(e);
}
