/**
 * AI LINEAGE GUIDE - LOCAL INTELLIGENCE ENGINE
 * This script handles natural language queries by parsing them 
 * and performing data lookups on the global 'personIndex'.
 */

const assistantInput = document.getElementById("assistantInput");
const assistantMessages = document.getElementById("assistantMessages");
const assistantWindow = document.getElementById("assistantWindow");

function toggleAssistant() {
    const isVisible = assistantWindow.style.display === "flex";
    assistantWindow.style.display = isVisible ? "none" : "flex";
    if (!isVisible) assistantInput.focus();
}

// Handle 'Enter' key
assistantInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter") handleAssistantQuery();
});

function addMessage(text, sender) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${sender}`;
    msgDiv.textContent = text;
    assistantMessages.appendChild(msgDiv);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function handleAssistantQuery() {
    const query = assistantInput.value.trim();
    if (!query) return;

    addMessage(query, "user");
    assistantInput.value = "";

    // Show "typing" effect
    const typingDiv = document.createElement("div");
    typingDiv.className = "message assistant typing";
    typingDiv.textContent = "...";
    assistantMessages.appendChild(typingDiv);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;

    setTimeout(() => {
        typingDiv.remove();
        const response = processQuery(query.toLowerCase());
        addMessage(response, "assistant");
        speakText(response); // Speak the response
    }, 600);
}

// --- VOICE RECOGNITION (STT) ---
const micBtn = document.getElementById("micBtn");
let isListening = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'hi-IN'; // Default to Hindi
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add("listening");
        assistantInput.placeholder = "सुन रहा हूँ... (Listening)";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        assistantInput.value = transcript;
        handleAssistantQuery();
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        stopListening();
    };

    recognition.onend = () => {
        stopListening();
    };

    function stopListening() {
        isListening = false;
        micBtn.classList.remove("listening");
        assistantInput.placeholder = "अपना प्रश्न यहाँ लिखें...";
    }

    micBtn.addEventListener("click", () => {
        if (isListening) {
            recognition.stop();
        } else {
            // Check if user prefers English or Hindi (basic toggle or mixed)
            // For now, it stays at hi-IN which handles mixed quite well
            recognition.start();
        }
    });
} else {
    micBtn.style.display = "none"; // Hide if not supported
}

// --- VOICE SYNTHESIS (TTS) ---
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Find a calm Hindi voice if possible
        const voices = window.speechSynthesis.getVoices();
        
        // Logic to pick a good voice
        // Default to first Hindi voice found, otherwise system default
        const hiVoice = voices.find(v => v.lang.includes('hi')) || voices.find(v => v.lang.includes('en'));
        if (hiVoice) utterance.voice = hiVoice;

        utterance.pitch = 1.0;
        utterance.rate = 0.95; // Slightly slower for clarity
        
        window.speechSynthesis.speak(utterance);
    }
}

let currentContextPerson = null;

// Helper: Get all descendants recursively
function getAllDescendants(person) {
    let results = [];
    if (person.children && person.children.length > 0) {
        person.children.forEach(child => {
            results.push(child);
            results = results.concat(getAllDescendants(child));
        });
    }
    return results;
}

// Helper: Get siblings
function getSiblings(person) {
    if (!person.parent) return [];
    return person.parent.children.filter(c => c.id !== person.id);
}

// Helper: Levenshtein Distance for typo tolerance
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

// Helper: Find best person match based on fuzzy scoring
function findBestPersonMatch(query) {
    const persons = Object.values(personIndex);
    let bestMatch = null;
    let highestScore = 0;

    const queryWords = query.split(/\s+/);

    for (const p of persons) {
        const nameFull = p.name.toLowerCase();
        const nameEn = p.nameEn ? p.nameEn.toLowerCase() : "";
        
        // 1. Exact match (Highest priority)
        if (query.includes(nameFull) || (nameEn && query.includes(nameEn))) {
            return p;
        }

        // 2. Partial word match
        for (const word of queryWords) {
            if (word.length < 3) continue;
            
            // Check Hindi and English parts
            if (nameFull.includes(word) || nameEn.includes(word)) {
                let score = word.length / Math.max(nameFull.length, nameEn.length);
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = p;
                }
            }

            // 3. Fuzzy match (Levenshtein)
            const parts = [...nameFull.split(/\s+/), ...nameEn.split(/\s+/)].filter(part => part.length >= 3);
            for (const part of parts) {
                const dist = getLevenshteinDistance(word, part);
                const similarity = 1 - (dist / Math.max(word.length, part.length));
                
                if (similarity > 0.7 && similarity > highestScore) {
                    highestScore = similarity;
                    bestMatch = p;
                }
            }
        }
    }
    return highestScore > 0.5 ? bestMatch : null;
}

function processQuery(q) {
    // 1. YEAR-BASED SEARCH (e.g., 1950)
    const yearMatch = q.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch && (q.includes("जन्म") || q.includes("born") || q.includes("साल") || q.includes("वर्ष"))) {
        const year = parseInt(yearMatch[0]);
        const matchingPeople = Object.values(personIndex).filter(p => p.birthYear === year);
        if (matchingPeople.length > 0) {
            const names = matchingPeople.map(p => p.name).join(", ");
            return `वर्ष ${year} में इन सदस्यों का जन्म हुआ था: ${names}।`;
        } else {
            return `क्षमा करें, वर्ष ${year} में जन्म लेने वाला कोई भी सदस्य हमारे रिकॉर्ड में नहीं है।`;
        }
    }

    // 2. STATS QUERIES
    if (q.includes("कुल सदस्य") || q.includes("कितने लोग") || q.includes("total members") || q.includes("कितने सदस्य")) {
        return `हमारे परिवार वृक्ष में कुल ${totalMembers} सदस्य दर्ज हैं।`;
    }
    
    if (q.includes("पीढ़ियां") || q.includes("पीढ़ी") || q.includes("how many generations") || q.includes("max generation")) {
        return `इस परिवार के इतिहास में अब तक कुल ${maxGeneration} पीढ़ियां दर्ज की गई हैं।`;
    }

    if (q.includes("सबसे बुजुर्ग") || q.includes("oldest") || q.includes("सबसे पुराने")) {
        const oldest = Object.values(personIndex)
            .filter(p => p.birthYear)
            .sort((a, b) => a.birthYear - b.birthYear)[0];
        if (oldest) {
            currentContextPerson = oldest;
            return `सबसे बुजुर्ग सदस्य ${oldest.name} हैं, जिनका जन्म वर्ष ${oldest.birthYear} है।`;
        }
        return "क्षमा करें, मुझे जन्म तिथि का सही डेटा नहीं मिला।";
    }

    // 3. CONTEXTUAL RESOLUTION (PRONOUNS)
    const pronouns = ["उनके", "उनका", "उनको", "उसका", "उसकी", "उसे", "वह", "वे", "his", "her", "he", "she", "him", "they", "their"];
    let usesPronoun = pronouns.some(p => q.includes(p));
    
    // 4. PERSON DETECTION (Fuzzy)
    let targetPerson = findBestPersonMatch(q);

    if (targetPerson) {
        currentContextPerson = targetPerson; // Update context if a person is found
    } else if (usesPronoun && currentContextPerson) {
        targetPerson = currentContextPerson;
    }

    if (targetPerson) {
        // VISUAL ACTIONS (Show/Find)
        if (q.includes("दिखाओ") || q.includes("कहाँ है") || q.includes("show") || q.includes("find") || q.includes("locate") || q.includes("where is")) {
            if (typeof showPersonOnTree === "function") {
                showPersonOnTree(targetPerson.id);
                return `बिल्कुल, मैं आपको ${targetPerson.name} के पास ले चलता हूँ।`;
            } else {
                return `क्षमा करें, मैं अभी आपको स्क्रीन पर नहीं दिखा पा रहा हूँ, लेकिन ${targetPerson.name} पीढ़ी ${targetPerson.generation} में हैं।`;
            }
        }

        // DESCENDANTS (Recursive)
        if (q.includes("वंशज") || q.includes("descendants") || q.includes("सभी बच्चे") || q.includes("आगे की पीढ़ी")) {
            const allDesc = getAllDescendants(targetPerson);
            if (allDesc.length === 0) return `${targetPerson.name} के कोई वंशज दर्ज नहीं हैं।`;
            const names = allDesc.map(d => d.name).join(", ");
            return `${targetPerson.name} के कुल ${allDesc.length} वंशज हैं: ${names}।`;
        }

        // COMPLEX RELATIONSHIPS (Siblings of ancestors)
        if (q.includes("दादा") || q.includes("grandfather")) {
            const father = targetPerson.parent;
            if (father && father.parent) {
                const grandfather = father.parent;
                if (q.includes("भाई") || q.includes("sibling") || q.includes("कौन हैं")) {
                    const siblings = getSiblings(grandfather);
                    if (siblings.length === 0) return `${targetPerson.name} के दादाजी (${grandfather.name}) का कोई भाई दर्ज नहीं है।`;
                    return `${targetPerson.name} के दादाजी ${grandfather.name} हैं, और उनके भाई ये हैं: ${siblings.map(s => s.name).join(", ")}।`;
                }
                return `${targetPerson.name} के दादाजी ${grandfather.name} हैं।`;
            }
            return `${targetPerson.name} के दादाजी का डेटा उपलब्ध नहीं है।`;
        }

        // Basic relations
        if (q.includes("बच्चे") || q.includes("संतान") || q.includes("children")) {
            const childrenCount = targetPerson.children ? targetPerson.children.length : 0;
            if (childrenCount === 0) return `${targetPerson.name} की कोई संतान दर्ज नहीं है।`;
            const names = targetPerson.children.map(c => c.name).join(", ");
            return `${targetPerson.name} के ${childrenCount} बच्चे हैं: ${names}।`;
        }

        if (q.includes("पिता") || q.includes("father") || q.includes("parents")) {
            if (targetPerson.parent) return `${targetPerson.name} के पिता ${targetPerson.parent.name} हैं।`;
            return `${targetPerson.name} हमारे मूल पूर्वज हैं।`;
        }

        if (q.includes("जन्म") || q.includes("born") || q.includes("year")) {
            return `${targetPerson.name} का जन्म वर्ष ${targetPerson.birthYear || "अज्ञात"} है।`;
        }
        
        if (q.includes("कौन") || q.includes("who") || q.includes("के बारे में") || q.includes("about")) {
            const p = targetPerson;
            let bio = `${p.name} पीढ़ी ${p.generation} के सदस्य हैं। `;
            if (p.parent) bio += `वे ${p.parent.name} के पुत्र हैं। `;
            if (p.children && p.children.length > 0) bio += `उनके ${p.children.length} बच्चे हैं।`;
            return bio;
        }

        return `${targetPerson.name} के बारे में क्या जानना चाहते हैं? (दिखाओ, वंशज, दादाजी, जन्म वर्ष, आदि)`;
    }

    // 5. FALLBACKS
    if (q.includes("महत्व") || q.includes("help") || q.includes("सहायता") || q.includes("क्या कर सकते")) {
        return "मैं बहुत कुछ कर सकता हूँ! जैसे: 'राहुल को दिखाओ', '1950 में कौन पैदा हुआ?', '[नाम] के दादाजी के भाई कौन हैं?', या '[नाम] के सभी वंशज बताओ'।";
    }

    if (q.length < 3) return "कृपया अपना प्रश्न थोड़ा विस्तार से लिखें।";

    return "क्षमा करें, मुझे इसका उत्तर नहीं पता। आप 'सिद्धार्थ को दिखाओ' या किसी सदस्य के वंशजों के बारे में पूछ सकते हैं।";
}
