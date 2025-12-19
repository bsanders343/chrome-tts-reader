# Plan: Smart Navigation for Restart Sentence/Paragraph

## Summary
Enhance `restart-sentence` and `restart-paragraph` shortcuts to navigate to the **previous** sentence/paragraph when either:
- Pressed again within 1.5 seconds, OR
- Less than 25% of the current unit has been read

Otherwise, restart the current sentence/paragraph (existing behavior).

## File to Modify

### background.js

#### 1. Add navigation state variables (after line 9)
```javascript
let lastSentenceNavTime = 0;
let lastParagraphNavTime = 0;
const NAV_TIME_THRESHOLD = 1500;  // 1.5 seconds
const NAV_PERCENT_THRESHOLD = 0.25;  // 25%
```

#### 2. Add helper function to calculate percent read
```javascript
function getPercentRead(boundaries, boundaryIndex, charIndex) {
  const boundary = boundaries[boundaryIndex];
  const length = boundary.end - boundary.start;
  if (length === 0) return 1;
  return (charIndex - boundary.start) / length;
}
```

#### 3. Update `restartSentence()` (lines 168-175)
```javascript
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
```

#### 4. Update `restartParagraph()` (lines 177-184)
```javascript
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
```

## Behavior Summary

| Condition | Result |
|-----------|--------|
| First press (or >1.5s since last) AND >25% read | Restart current |
| Pressed within 1.5s of last press | Go to previous (if exists) |
| Less than 25% of current unit read | Go to previous (if exists) |
| Already at first sentence/paragraph | Restart current (can't go earlier)
