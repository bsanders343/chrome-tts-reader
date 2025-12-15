# Chrome TTS Reader

A minimal Chrome extension for macOS that reads selected text aloud using native macOS voices.

## Why?

The Web Speech API has a [known Chromium bug](https://bugs.chromium.org/p/chromium/issues/detail?id=679437) that cuts off speech after ~15 seconds. This extension uses the `chrome.tts` API instead, which talks directly to the OS speech engine and has no such limitation.

## Features

- **Right-click menu**: Select text → Right-click → "Read Selection"
- **Keyboard shortcut**: `Cmd+Shift+S` (macOS) / `Ctrl+Shift+S` (Windows/Linux)
- **Voice settings**: Choose from available system voices
- **Speed & pitch controls**: Adjust to your preference
- **Persistent settings**: Your preferences sync across devices

## Installation

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `chrome-tts-reader` directory

## Usage

1. Highlight text on any webpage
2. Either:
   - Right-click and select "Read Selection", or
   - Press `Cmd+Shift+S`
3. Click the extension icon to adjust voice, speed, and pitch

## Development

After making code changes, click the reload icon on the extension card at `chrome://extensions/`.

For manifest.json changes, remove and re-add the extension.

**Debugging:**
- Background worker: Click "service worker" link on extension card
- Popup: Right-click the popup → Inspect

## License

MIT
