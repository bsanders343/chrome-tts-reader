# Chrome TTS Reader Extension

## Overview

Minimal Chrome extension for macOS: highlight text → right-click or keyboard shortcut → read aloud using `chrome.tts` API with native macOS voices.

**Why chrome.tts instead of Web Speech API:** The web `SpeechSynthesis` API has a known Chromium bug (issue 679437) that cuts off speech after ~15 seconds. The `chrome.tts` extension API bypasses this by talking directly to the OS speech engine.

---

## Project Structure

```
chrome-tts-reader/
├── manifest.json
├── background.js          # Service worker handling TTS
├── content.js             # Gets selected text from page
├── popup.html             # Settings UI (voice, rate, pitch)
├── popup.js
├── popup.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "TTS Reader",
  "version": "1.0.0",
  "description": "Read selected text aloud using native macOS voices",
  "permissions": [
    "tts",
    "contextMenus",
    "storage",
    "activeTab",
    "scripting"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "read-selection": {
      "suggested_key": {
        "default": "Ctrl+Shift+S",
        "mac": "Command+Shift+S"
      },
      "description": "Read selected text aloud"
    }
  }
}
```

---

## Core Components

### 1. Background Service Worker (`background.js`)

**Responsibilities:**
- Register context menu item on extension install
- Listen for context menu clicks
- Listen for keyboard command triggers
- Get selected text via scripting API
- Call `chrome.tts.speak()` with user preferences
- Handle playback: stop current speech before starting new

**Key functions to implement:**

```javascript
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
  
  // Inject content script to get selection
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
}
```

### 2. Content Script (`content.js`)

Minimal — only used if you need persistent injection. For this project, use `chrome.scripting.executeScript()` with an inline function instead (shown above). No separate content.js file needed.

### 3. Popup UI (`popup.html`)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1>TTS Reader</h1>
    
    <label for="voice">Voice</label>
    <select id="voice"></select>
    
    <label for="rate">Speed: <span id="rate-value">1.0</span></label>
    <input type="range" id="rate" min="0.5" max="2" step="0.1" value="1">
    
    <label for="pitch">Pitch: <span id="pitch-value">1.0</span></label>
    <input type="range" id="pitch" min="0.5" max="1.5" step="0.1" value="1">
    
    <button id="test">Test Voice</button>
    <button id="stop">Stop</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

### 4. Popup Logic (`popup.js`)

**Responsibilities:**
- Populate voice dropdown from `chrome.tts.getVoices()`
- Filter to English voices, prefer local (native macOS) voices
- Update sliders and save preferences to `chrome.storage.sync`
- Test button speaks sample text
- Stop button calls `chrome.tts.stop()`

```javascript
document.addEventListener("DOMContentLoaded", async () => {
  const voiceSelect = document.getElementById("voice");
  const rateInput = document.getElementById("rate");
  const pitchInput = document.getElementById("pitch");
  const rateValue = document.getElementById("rate-value");
  const pitchValue = document.getElementById("pitch-value");
  const testBtn = document.getElementById("test");
  const stopBtn = document.getElementById("stop");

  // Load voices
  const voices = await new Promise((resolve) => {
    chrome.tts.getVoices((v) => resolve(v));
  });

  // Filter to English, prefer local voices, sort alphabetically
  const englishVoices = voices
    .filter((v) => v.lang && v.lang.startsWith("en"))
    .sort((a, b) => {
      if (a.localService !== b.localService) return b.localService ? 1 : -1;
      return a.voiceName.localeCompare(b.voiceName);
    });

  // Populate dropdown
  englishVoices.forEach((v) => {
    const option = document.createElement("option");
    option.value = v.voiceName;
    option.textContent = `${v.voiceName}${v.localService ? "" : " (remote)"}`;
    voiceSelect.appendChild(option);
  });

  // Load saved preferences
  const prefs = await chrome.storage.sync.get({
    voiceName: "",
    rate: 1.0,
    pitch: 1.0
  });

  voiceSelect.value = prefs.voiceName;
  rateInput.value = prefs.rate;
  pitchInput.value = prefs.pitch;
  rateValue.textContent = prefs.rate;
  pitchValue.textContent = prefs.pitch;

  // Save on change
  const save = () => {
    chrome.storage.sync.set({
      voiceName: voiceSelect.value,
      rate: parseFloat(rateInput.value),
      pitch: parseFloat(pitchInput.value)
    });
  };

  voiceSelect.addEventListener("change", save);
  
  rateInput.addEventListener("input", () => {
    rateValue.textContent = rateInput.value;
    save();
  });
  
  pitchInput.addEventListener("input", () => {
    pitchValue.textContent = pitchInput.value;
    save();
  });

  // Test button
  testBtn.addEventListener("click", () => {
    chrome.tts.stop();
    chrome.tts.speak("This is a test of the text to speech reader.", {
      voiceName: voiceSelect.value || undefined,
      lang: "en-US",
      rate: parseFloat(rateInput.value),
      pitch: parseFloat(pitchInput.value)
    });
  });

  // Stop button
  stopBtn.addEventListener("click", () => {
    chrome.tts.stop();
  });
});
```

### 5. Popup Styles (`popup.css`)

```css
body {
  width: 280px;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}

.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h1 {
  font-size: 18px;
  margin: 0 0 8px 0;
}

label {
  font-weight: 500;
  margin-bottom: -8px;
}

select, input[type="range"] {
  width: 100%;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

#test {
  background: #007AFF;
  color: white;
}

#stop {
  background: #ccc;
  color: #333;
}

button:hover {
  opacity: 0.9;
}
```

---

## Icons

Generate simple placeholder icons (colored squares are fine for development). For production, create proper icons at 16x16, 48x48, and 128x128 pixels.

Placeholder approach: Create solid color PNG files or use an online generator.

---

## User Flow

```
1. User highlights text on any webpage
2. User triggers via:
   a. Right-click → "Read Selection" context menu item
   b. Keyboard shortcut (Cmd+Shift+S on macOS)
3. Background worker:
   - Calls chrome.tts.stop() to cancel any in-progress speech
   - Executes script to get selection text
   - Loads preferences from storage
   - Calls chrome.tts.speak(text, options)
4. macOS speaks the text using native voice
```

---

## Edge Cases to Handle

| Scenario | Behavior |
|----------|----------|
| No text selected | Do nothing (fail silently) |
| Very long selection | Speak it all (chrome.tts has no timeout bug) |
| User triggers while speaking | Stop current, start new |
| No en-US voices available | Fall back to any English voice |
| Tab is a chrome:// URL | scripting.executeScript will fail — catch and ignore |

---

## Testing Checklist

- [ ] Fresh install creates context menu item
- [ ] Right-click on selected text shows "Read Selection"
- [ ] Clicking menu item speaks the selection
- [ ] Keyboard shortcut (Cmd+Shift+S) works
- [ ] Popup opens and shows voice dropdown
- [ ] Voice dropdown lists macOS voices (Samantha, Alex, etc.)
- [ ] Rate slider changes speed audibly
- [ ] Pitch slider changes pitch audibly
- [ ] Settings persist after closing popup
- [ ] Settings persist after browser restart
- [ ] "Test Voice" button works
- [ ] "Stop" button stops speech
- [ ] Long text (1000+ words) completes without cutoff
- [ ] Rapid re-triggering doesn't overlap audio
- [ ] Works on regular HTTPS pages
- [ ] Fails gracefully on chrome:// pages

---

## Out of Scope (v1)

- Word-level highlighting synchronization
- PDF reader support
- Pause/resume controls
- Cloud/remote voices
- Multiple language support
- Saving/exporting audio

---

## Development Notes

**Loading the extension:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-tts-reader/` directory

**Debugging:**
- Background worker: Click "service worker" link in extension card
- Popup: Right-click popup → Inspect
- Content script errors: Browser DevTools console

**Hot reload:**
- After code changes, click the reload icon on the extension card
- For manifest changes, remove and re-add the extension
