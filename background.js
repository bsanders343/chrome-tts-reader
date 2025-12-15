// TTS state tracking
let ttsState = "stopped"; // "stopped" | "playing" | "paused"

// Text and position tracking for navigation
let currentText = "";
let currentCharIndex = 0;
let sentences = [];   // [{start, end}, ...]
let paragraphs = [];  // [{start, end}, ...]
let currentPrefs = {};

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
  if (command === "read-selection") {
    readSelectedText(tab.id);
  }
});

// Message handler for content script commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "toggle-pause":
      togglePause();
      sendResponse({ state: ttsState });
      break;
    case "restart-sentence":
      restartSentence();
      sendResponse({ state: ttsState });
      break;
    case "restart-paragraph":
      restartParagraph();
      sendResponse({ state: ttsState });
      break;
    case "get-state":
      sendResponse({ state: ttsState });
      break;
  }
  return true;
});

// Toggle pause/resume
function togglePause() {
  if (ttsState === "playing") {
    chrome.tts.pause();
    ttsState = "paused";
  } else if (ttsState === "paused") {
    chrome.tts.resume();
    ttsState = "playing";
  }
}

// Restart from beginning of current sentence
function restartSentence() {
  if (ttsState === "stopped" || !currentText) return;

  const sentenceIndex = findCurrentBoundary(sentences, currentCharIndex);
  const sentenceStart = sentences[sentenceIndex].start;
  speakFrom(sentenceStart);
}

// Restart from beginning of current paragraph
function restartParagraph() {
  if (ttsState === "stopped" || !currentText) return;

  const paragraphIndex = findCurrentBoundary(paragraphs, currentCharIndex);
  const paragraphStart = paragraphs[paragraphIndex].start;
  speakFrom(paragraphStart);
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
