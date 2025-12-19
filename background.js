// TTS state tracking
let ttsState = "stopped"; // "stopped" | "playing" | "paused"

// Text and position tracking for navigation
let currentText = "";
let currentCharIndex = 0;
let sentences = [];   // [{start, end}, ...]
let paragraphs = [];  // [{start, end}, ...]
let currentPrefs = {};

// Smart navigation state
let lastSentenceNavTime = 0;
let lastParagraphNavTime = 0;
const NAV_TIME_THRESHOLD = 1500;  // 1.5 seconds
const NAV_PERCENT_THRESHOLD = 0.25;  // 25%

// Parse text into sentence boundaries
function parseSentences(text) {
  const boundaries = [];
  const regex = /[.!?]+[\s]+|[.!?]+$/g;
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

// Parse text into paragraph boundaries
function parseParagraphs(text) {
  const boundaries = [];
  const regex = /\n\s*\n|\n/g;
  let lastEnd = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastEnd) {
      boundaries.push({ start: lastEnd, end: match.index });
    }
    lastEnd = match.index + match[0].length;
  }

  // Handle remaining text
  if (lastEnd < text.length) {
    boundaries.push({ start: lastEnd, end: text.length });
  }

  // If no paragraphs found, treat whole text as one paragraph
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
    case "restart-paragraph":
      restartParagraph();
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

// Restart from beginning of current paragraph (or go to previous)
function restartParagraph() {
  if (ttsState === "stopped" || !currentText) return;

  const now = Date.now();
  const paragraphIndex = findCurrentBoundary(paragraphs, currentCharIndex);
  const percentRead = getPercentRead(paragraphs, paragraphIndex, currentCharIndex);
  const withinTimeThreshold = (now - lastParagraphNavTime) < NAV_TIME_THRESHOLD;

  lastParagraphNavTime = now;

  // Go to previous if: quick double-tap OR near start of current paragraph
  if ((withinTimeThreshold || percentRead < NAV_PERCENT_THRESHOLD) && paragraphIndex > 0) {
    speakFrom(paragraphs[paragraphIndex - 1].start);
  } else {
    speakFrom(paragraphs[paragraphIndex].start);
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

    const text = results[0]?.result?.trim();
    if (!text) return;

    // Store text and parse boundaries
    currentText = text;
    currentCharIndex = 0;
    sentences = parseSentences(text);
    paragraphs = parseParagraphs(text);

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
