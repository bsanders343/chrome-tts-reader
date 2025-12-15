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

// Keyboard shortcut handler
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "read-selection") {
    readSelectedText(tab.id);
  }
});

// Get selection and speak
async function readSelectedText(tabId) {
  // Stop any current speech
  chrome.tts.stop();

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
        if (event.type === "error") {
          console.error("TTS error:", event.errorMessage);
        }
      }
    });
  } catch (error) {
    // Fail silently (e.g., chrome:// pages don't allow scripting)
    console.error("Could not read selection:", error.message);
  }
}
