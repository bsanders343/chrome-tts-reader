# Plan: News Headline/Body Searching with Accessibility Integration

## Overview

Add functionality to automatically extract and navigate news article content (headlines, bylines, body), with deep integration for visually impaired/blind users via screen readers and braille displays.

---

## Research Summary

### How Other Applications Do This

**Content Extraction:**
- [Mozilla Readability.js](https://github.com/mozilla/readability) - Powers Firefox Reader View, Chrome Reader View extensions (300k+ users)
- Returns structured data: `title`, `byline`, `content`, `textContent`, `excerpt`, `siteName`
- Pre-check with `isProbablyReaderable()` before expensive parsing
- [article-extractor](https://github.com/extractus/article-extractor) - Node.js alternative with similar output

**Screen Reader Navigation:**
- JAWS/NVDA: `H` key jumps between headings, `Ins+F6/F7` lists all headings/links
- VoiceOver (macOS): `Cmd+F5` to enable, integrates with Safari best
- All support [ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions) for dynamic content announcements

### Existing Hardware/Software Integration Points

| Technology | Integration Method |
|------------|-------------------|
| **JAWS/NVDA** | Automatic via browser accessibility API - no special code needed if HTML is semantic |
| **VoiceOver** | Same - uses macOS accessibility API |
| **Braille Displays** | Screen readers pipe text to braille hardware automatically |
| **ChromeVox** | Chrome OS built-in, uses same WAI-ARIA as other readers |

**Key insight:** We don't need to directly integrate with screen readers. If we output proper semantic HTML with ARIA attributes, the user's existing assistive technology handles the rest.

---

## Proposed Architecture

### Phase 1: Article Extraction (Core Feature)

**New Module: `content-extractor.js`**
```javascript
// Bundle Mozilla Readability.js (standalone, no dependencies)
// Use in content script context to access page DOM

async function extractArticle(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Clone document (Readability mutates DOM)
      const clone = document.cloneNode(true);
      const article = new Readability(clone).parse();
      return {
        title: article?.title,
        byline: article?.byline,
        content: article?.textContent,  // Plain text for TTS
        siteName: article?.siteName,
        excerpt: article?.excerpt
      };
    }
  });
}
```

**Trigger: Smart Play Shortcut**
- Cmd+Shift+P behavior changes based on context:
  - **Has selection** → Read selected text (current behavior)
  - **No selection** → Extract and read full article (new)
- No new shortcut needed, uses existing slot intelligently
- Also add context menu "Read Full Article" for discoverability

### Phase 2: Structured Navigation

**Parsing Enhancements to `parseSentences()`:**
```javascript
// Detect additional boundaries for news articles:
// - Datelines: "LONDON (Reuters) —"
// - Section breaks: "---", "***", "• • •"
// - Numbered sections: "1.", "2.", etc. at line start
// - Quote attributions: "— John Smith, CEO"
```

**New Navigation Structure:**
```javascript
let articleParts = {
  headline: { start: 0, end: 50 },
  byline: { start: 51, end: 80 },
  sections: [
    { start: 81, end: 500, sentences: [...] },
    { start: 501, end: 1200, sentences: [...] }
  ]
};
```

### Phase 3: Accessibility Announcements

**ARIA Live Region for Status:**
```javascript
// Inject hidden live region into page
function injectAccessibilityBridge(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const region = document.createElement('div');
      region.id = 'tts-reader-status';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.style.cssText = 'position:absolute;left:-9999px;';
      document.body.appendChild(region);
    }
  });
}

// Announce to screen readers
function announce(tabId, message) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (msg) => {
      const region = document.getElementById('tts-reader-status');
      if (region) region.textContent = msg;
    },
    args: [message]
  });
}

// Usage (minimal mode - default):
announce(tabId, "Now reading article");  // On start
announce(tabId, "Paused");               // On pause
announce(tabId, "Resumed");              // On resume
announce(tabId, "End of article");       // On complete
```

**User Preference: Toggle in Popup**
```javascript
// Store in chrome.storage.sync
{ announceToScreenReader: true }  // Default: enabled
```

**Why This Works for Blind Users:**
- JAWS/NVDA/VoiceOver monitor `aria-live="polite"` regions
- Announcements queue after current speech finishes
- User's existing braille display shows the announcement text
- No special hardware integration code needed

---

## Implementation Steps

### Step 1: Add Readability.js
- Download [readability.js](https://github.com/mozilla/readability/blob/main/Readability.js) (single file, ~50KB)
- Add to extension directory
- Update manifest.json to include it as a web accessible resource

### Step 2: Add Context Menu Option
```javascript
// In background.js chrome.runtime.onInstalled
chrome.contextMenus.create({
  id: "read-article",
  title: "Read Full Article",
  contexts: ["page"]  // Works without selection
});
```

### Step 3: Create Extraction Function
- Clone page DOM
- Run Readability parser
- Return structured article data
- On failure: Show error notification, don't auto-fallback to body text

### Step 4: Add Accessibility Bridge
- Inject hidden ARIA live region on first use
- Create `announce()` helper function
- Announce key navigation events:
  - "Now reading: [headline]"
  - "Skipped to paragraph N"
  - "Paused" / "Resumed"
  - "End of article"

### Step 5: Update Popup UI
- Add toggle: "Announce to screen readers" (default: on)
- Store preference in chrome.storage.sync

---

## File Changes Summary

| File | Change |
|------|--------|
| `Readability.js` | **NEW** - Mozilla's extraction library |
| `manifest.json` | Add `web_accessible_resources`, update `content_scripts` if needed |
| `background.js` | Add article extraction, context menu handler, announce() function |
| `popup.html` | Add accessibility toggle checkbox |
| `popup.js` | Handle toggle, save accessibility preference |

---

## Accessibility Compliance

**WCAG 2.1 AA Considerations:**
- Screen reader users: ARIA live announcements
- Braille users: Announcements appear on display via screen reader
- Low vision: No changes needed (using native TTS)
- Keyboard-only: All features accessible via shortcuts or context menu

**No direct hardware integration required** - modern assistive tech works through the browser's accessibility API. We just need proper semantic markup and ARIA attributes.

---

## Alternative Approaches Considered

1. **Direct JAWS/NVDA API integration** - Rejected: Not possible from browser extension, and unnecessary with ARIA
2. **Custom braille output** - Rejected: Screen readers already handle this
3. **Build custom extraction** - Rejected: Readability.js is battle-tested, used by Firefox

---

## Decisions Made

1. **Trigger:** Smart shortcut - Cmd+Shift+P reads article if no selection, reads selection if text selected
2. **Announcements:** Minimal (start, pause, resume, end) with toggle in popup
3. **Fallback:** Show error on extraction failure, no auto-fallback to body text

---

## Sources

- [Mozilla Readability.js](https://github.com/mozilla/readability)
- [ARIA Live Regions - MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [Chrome Extension Accessibility](https://developer.chrome.com/docs/extensions/how-to/ui/a11y)
- [WebAIM Screen Reader Survey](https://webaim.org/projects/screenreadersurvey10/)
- [Reader View Extension](https://reader-view.com/)
- [article-extractor npm](https://www.npmjs.com/package/@mozilla/readability)
