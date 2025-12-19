# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension for macOS that reads selected text aloud using the `chrome.tts` API with native macOS voices. Uses Manifest V3. The `chrome.tts` API is chosen over the Web Speech API to bypass Chromium bug #679437 that cuts off speech after ~15 seconds.

## Architecture

- **background.js** - Service worker that handles context menu creation, keyboard shortcuts, and TTS playback via `chrome.tts.speak()`
- **popup.html/popup.js/popup.css** - Settings UI for voice selection, rate, and pitch controls
- **manifest.json** - Manifest V3 config with permissions: tts, contextMenus, storage, activeTab, scripting

No content script is needed - text selection is retrieved via `chrome.scripting.executeScript()` with an inline function.

## Key APIs

- `chrome.tts.speak()` / `chrome.tts.stop()` / `chrome.tts.getVoices()` - Text-to-speech
- `chrome.scripting.executeScript()` - Get selected text from active tab
- `chrome.storage.sync` - Persist user preferences (voiceName, rate, pitch)
- `chrome.contextMenus` - Right-click "Read Selection" menu item
- `chrome.commands` - Keyboard shortcut handler (Cmd+Shift+P for play/pause, Left/Right arrows for sentence navigation)

## Development

**Load extension:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

**After code changes:** Click reload icon on extension card. For manifest changes, remove and re-add the extension.

**Debugging:**
- Background worker: Click "service worker" link in extension card
- Popup: Right-click popup → Inspect

## User Flow

1. User highlights text on webpage
2. Triggers via right-click context menu or Cmd+Shift+P
3. Background worker stops any current speech, gets selection, speaks with user preferences
4. Navigation: Cmd+Shift+P to pause/resume; Cmd+Shift+Left for previous sentence (smart: double-tap or <25% read); Cmd+Shift+Right for next sentence

## Constraints

**Chrome limits extensions to 4 keyboard shortcuts.** Current shortcuts:
1. Play/Pause (Cmd+Shift+P)
2. Previous sentence (Cmd+Shift+Left)
3. Next sentence (Cmd+Shift+Right)
4. *(1 slot available)*

Paragraph navigation (Cmd+Shift+Up/Down) was removed to stay within this limit. Sentence navigation was prioritized as the more useful granularity. If adding new shortcuts, one existing shortcut must be removed or the new feature must use a different trigger (context menu, popup button, etc.).
