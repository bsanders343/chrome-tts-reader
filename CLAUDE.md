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
- `chrome.commands` - Keyboard shortcut handler (Cmd+Shift+S on macOS)

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
2. Triggers via right-click context menu or Cmd+Shift+S
3. Background worker stops any current speech, gets selection, speaks with user preferences
