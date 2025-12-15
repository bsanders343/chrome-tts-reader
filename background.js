// TTS state tracking
let ttsState = "stopped"; // "stopped" | "playing" | "paused"

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
  if (message.action === "toggle-pause") {
    togglePause();
    sendResponse({ state: ttsState });
  } else if (message.action === "get-state") {
    sendResponse({ state: ttsState });
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
  // If stopped, do nothing
}

// Get selection and speak
async function readSelectedText(tabId) {
  // Stop any current speech
  chrome.tts.stop();
  ttsState = "stopped";

  try {
    // Inject script to get selection
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection().toString()
    });

    const text = results[0]?.result?.trim();
    if (!text) return;

    // Load user preferences
    const prefs = await chrome.storage.sync.get({
      voiceName: "",
      rate: 1.0,
      pitch: 1.0
    });

    // Speak
    chrome.tts.speak(text, {
      voiceName: prefs.voiceName || undefined,
      lang: "en-US",
      rate: prefs.rate,
      pitch: prefs.pitch,
      enqueue: false,
      onEvent: (event) => {
        switch (event.type) {
          case "start":
            ttsState = "playing";
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
    });
  } catch (error) {
    // Fail silently (e.g., chrome:// pages don't allow scripting)
    console.error("Could not read selection:", error.message);
  }
}
