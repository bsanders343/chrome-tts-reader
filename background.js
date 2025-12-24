// TTS state tracking
let ttsState = "stopped"; // "stopped" | "playing" | "paused"

// Text and position tracking for navigation
let currentText = "";
let currentCharIndex = 0;
let sentences = [];   // [{start, end}, ...]
let currentPrefs = {};

// Smart navigation state
let lastSentenceNavTime = 0;
const NAV_TIME_THRESHOLD = 1500;  // 1.5 seconds
const NAV_PERCENT_THRESHOLD = 0.25;  // 25%

// ============================================
// Text Preprocessing for Better TTS Quality
// ============================================

// Common abbreviations to expand for natural speech
const ABBREVIATIONS = {
  // Titles
  "Dr.": "Doctor",
  "Mr.": "Mister",
  "Mrs.": "Misses",
  "Ms.": "Miss",
  "Prof.": "Professor",
  "Sr.": "Senior",
  "Jr.": "Junior",
  "Rev.": "Reverend",
  "Gen.": "General",
  "Col.": "Colonel",
  "Lt.": "Lieutenant",
  "Sgt.": "Sergeant",
  "Capt.": "Captain",
  // Common abbreviations
  "vs.": "versus",
  "etc.": "etcetera",
  "i.e.": "that is",
  "e.g.": "for example",
  "approx.": "approximately",
  "govt.": "government",
  "dept.": "department",
  "est.": "established",
  "inc.": "incorporated",
  "corp.": "corporation",
  "ltd.": "limited",
  "assn.": "association",
  "intl.": "international",
  // Units
  "ft.": "feet",
  "in.": "inches",
  "lb.": "pounds",
  "oz.": "ounces",
  "pt.": "point",
  "no.": "number",
  "vol.": "volume",
  "pg.": "page",
  "pp.": "pages",
  // Time
  "min.": "minutes",
  "sec.": "seconds",
  "hr.": "hours",
  "mo.": "months",
  "yr.": "years",
  // Addresses
  "St.": "Street",
  "Ave.": "Avenue",
  "Blvd.": "Boulevard",
  "Rd.": "Road",
  "Ln.": "Lane",
  "Dr.": "Drive",
  "Ct.": "Court",
  "Apt.": "Apartment",
  "Ste.": "Suite"
};

// Preprocess text for better TTS output
function preprocessText(text) {
  let processed = text;

  // 1. Normalize whitespace (but preserve paragraph breaks)
  processed = processed.replace(/[ \t]+/g, " ");
  processed = processed.replace(/\n{3,}/g, "\n\n");

  // 2. Expand abbreviations (case-insensitive matching, preserve original case for first letter)
  for (const [abbrev, expansion] of Object.entries(ABBREVIATIONS)) {
    // Create regex that matches the abbreviation with word boundaries
    const regex = new RegExp(
      abbrev.replace(/\./g, "\\.").replace(/^(\w)/, "[$1" + "$1".toLowerCase() + "]"),
      "g"
    );
    processed = processed.replace(regex, expansion);
  }

  // 3. Handle URLs - simplify to "link" or read domain
  processed = processed.replace(
    /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)[^\s]*/g,
    (match, domain) => `link to ${domain.replace(/\./g, " dot ")}`
  );

  // 4. Handle email addresses
  processed = processed.replace(
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (match, user, domain) => `${user} at ${domain.replace(/\./g, " dot ")}`
  );

  // 5. Handle common symbols
  processed = processed.replace(/&/g, " and ");
  processed = processed.replace(/@(\w)/g, "at $1"); // @ when followed by word (not email)
  processed = processed.replace(/#(\w+)/g, "hashtag $1");
  processed = processed.replace(/\+(\d)/g, "plus $1");
  processed = processed.replace(/(\d)%/g, "$1 percent");
  processed = processed.replace(/\$(\d)/g, "dollar $1");
  processed = processed.replace(/€(\d)/g, "euro $1");
  processed = processed.replace(/£(\d)/g, "pound $1");

  // 6. Add slight pause after headings (lines that end without punctuation followed by newline)
  processed = processed.replace(/([A-Za-z0-9])(\n)(?=[A-Z])/g, "$1.$2");

  // 7. Handle ellipsis for natural pause
  processed = processed.replace(/\.{3,}/g, "...");

  // 8. Handle dashes for better pacing
  processed = processed.replace(/\s*—\s*/g, ", "); // em-dash
  processed = processed.replace(/\s*–\s*/g, ", "); // en-dash
  processed = processed.replace(/\s+-\s+/g, ", "); // hyphen used as dash

  // 9. Handle parenthetical content - add slight pauses
  processed = processed.replace(/\s*\(\s*/g, ", ");
  processed = processed.replace(/\s*\)\s*/g, ", ");

  // 10. Handle quotes for cleaner reading
  processed = processed.replace(/[""]/g, '"');
  processed = processed.replace(/['']/g, "'");

  // 11. Clean up multiple commas/periods from preprocessing
  processed = processed.replace(/,\s*,/g, ",");
  processed = processed.replace(/\.\s*\./g, ".");
  processed = processed.replace(/,\s*\./g, ".");

  // 12. Handle numbers with better pronunciation hints
  processed = processed.replace(/(\d),(\d{3})/g, "$1$2"); // Remove thousands separators for cleaner speech
  processed = processed.replace(/(\d+)\/(\d+)/g, "$1 of $2"); // Fractions

  return processed.trim();
}

// Parse text into sentence boundaries
function parseSentences(text) {
  const boundaries = [];
  // Match: sentence-ending punctuation, OR newline followed by capital/quote (headlines, new paragraphs)
  const regex = /[.!?]+[\s]+|[.!?]+$|\n(?=[A-Z"\u201C])/g;
  let lastEnd = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    boundaries.push({ start: lastEnd, end: match.index + match[0].length });
    lastEnd = match.index + match[0].length;
  }

  // Handle remaining text without sentence ending
  if (lastEnd < text.length) {
    boundaries.push({ start: lastEnd, end: text.length });
  }

  // If no sentences found, treat whole text as one sentence
  if (boundaries.length === 0) {
    boundaries.push({ start: 0, end: text.length });
  }

  return boundaries;
}

// Find boundary containing current position
function findCurrentBoundary(boundaries, charIndex) {
  for (let i = 0; i < boundaries.length; i++) {
    if (charIndex >= boundaries[i].start && charIndex < boundaries[i].end) {
      return i;
    }
  }
  return 0;
}

// Calculate what percent of a boundary has been read
function getPercentRead(boundaries, boundaryIndex, charIndex) {
  const boundary = boundaries[boundaryIndex];
  const length = boundary.end - boundary.start;
  if (length === 0) return 1;
  return (charIndex - boundary.start) / length;
}

// Speak text from a given position
function speakFrom(startIndex) {
  chrome.tts.stop();
  const textToSpeak = currentText.slice(startIndex).trim();
  if (!textToSpeak) return;

  currentCharIndex = startIndex;

  chrome.tts.speak(textToSpeak, {
    voiceName: currentPrefs.voiceName || undefined,
    lang: "en-US",
    rate: currentPrefs.rate || 1.0,
    pitch: currentPrefs.pitch || 1.0,
    enqueue: false,
    onEvent: (event) => {
      handleTtsEvent(event, startIndex);
    }
  });
}

// Handle TTS events
function handleTtsEvent(event, offset = 0) {
  switch (event.type) {
    case "start":
      ttsState = "playing";
      break;
    case "word":
      // charIndex is relative to the spoken text, add offset for original position
      currentCharIndex = offset + (event.charIndex || 0);
      break;
    case "end":
    case "cancelled":
    case "interrupted":
      ttsState = "stopped";
      break;
    case "pause":
      ttsState = "paused";
      break;
    case "resume":
      ttsState = "playing";
      break;
    case "error":
      ttsState = "stopped";
      console.error("TTS error:", event.errorMessage);
      break;
  }
}

// On install: create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-selection",
    title: "Read Selection",
    contexts: ["selection"]
  });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-selection") {
    readSelectedText(tab.id);
  }
});

// Keyboard shortcut handler (for manifest-defined shortcuts)
chrome.commands.onCommand.addListener((command, tab) => {
  switch (command) {
    case "read-selection":
      if (ttsState === "stopped") {
        readSelectedText(tab.id);
      } else if (ttsState === "playing") {
        chrome.tts.pause();
        ttsState = "paused";
      } else if (ttsState === "paused") {
        chrome.tts.resume();
        ttsState = "playing";
      }
      break;
    case "restart-sentence":
      restartSentence();
      break;
    case "next-sentence":
      nextSentence();
      break;
  }
});

// Message handler for state queries
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "get-state") {
    sendResponse({ state: ttsState });
  }
  return true;
});

// Restart from beginning of current sentence (or go to previous)
function restartSentence() {
  if (ttsState === "stopped" || !currentText) return;

  const now = Date.now();
  const sentenceIndex = findCurrentBoundary(sentences, currentCharIndex);
  const percentRead = getPercentRead(sentences, sentenceIndex, currentCharIndex);
  const withinTimeThreshold = (now - lastSentenceNavTime) < NAV_TIME_THRESHOLD;

  lastSentenceNavTime = now;

  // Go to previous if: quick double-tap OR near start of current sentence
  if ((withinTimeThreshold || percentRead < NAV_PERCENT_THRESHOLD) && sentenceIndex > 0) {
    speakFrom(sentences[sentenceIndex - 1].start);
  } else {
    speakFrom(sentences[sentenceIndex].start);
  }
}

// Skip to next sentence
function nextSentence() {
  if (ttsState === "stopped" || !currentText) return;

  const sentenceIndex = findCurrentBoundary(sentences, currentCharIndex);
  if (sentenceIndex < sentences.length - 1) {
    speakFrom(sentences[sentenceIndex + 1].start);
  }
}

// Get selection and speak
async function readSelectedText(tabId) {
  chrome.tts.stop();
  ttsState = "stopped";

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection().toString()
    });

    const rawText = results[0]?.result?.trim();
    if (!rawText) return;

    // Preprocess text for better TTS quality, then parse sentences
    const text = preprocessText(rawText);
    currentText = text;
    currentCharIndex = 0;
    sentences = parseSentences(text);

    // Load user preferences
    currentPrefs = await chrome.storage.sync.get({
      voiceName: "",
      rate: 1.0,
      pitch: 1.0
    });

    // Speak from beginning
    speakFrom(0);
  } catch (error) {
    console.error("Could not read selection:", error.message);
  }
}
