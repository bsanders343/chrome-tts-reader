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

  // Identify premium/enhanced voices for better quality
  const isPremiumVoice = (name) => {
    const premiumPatterns = [
      /premium/i,
      /enhanced/i,
      /neural/i,
      /wavenet/i,
      /natural/i,
      /studio/i
    ];
    return premiumPatterns.some((pattern) => pattern.test(name));
  };

  // Quality tier for sorting (lower = better)
  const getVoiceQualityTier = (voice) => {
    const name = voice.voiceName;
    if (isPremiumVoice(name)) return 0; // Premium voices first
    if (!voice.localService) return 1; // Remote/cloud voices second
    return 2; // Standard local voices last
  };

  // Filter to English, sort by quality tier then alphabetically
  const englishVoices = voices
    .filter((v) => v.lang && v.lang.startsWith("en"))
    .sort((a, b) => {
      const tierA = getVoiceQualityTier(a);
      const tierB = getVoiceQualityTier(b);
      if (tierA !== tierB) return tierA - tierB;
      return a.voiceName.localeCompare(b.voiceName);
    });

  // Populate dropdown with quality indicators
  englishVoices.forEach((v) => {
    const option = document.createElement("option");
    option.value = v.voiceName;

    let qualityLabel = "";
    if (isPremiumVoice(v.voiceName)) {
      qualityLabel = " ★";
    } else if (!v.localService) {
      qualityLabel = " (cloud)";
    }

    option.textContent = `${v.voiceName}${qualityLabel}`;
    voiceSelect.appendChild(option);
  });

  // Load saved preferences
  const prefs = await chrome.storage.sync.get({
    voiceName: "",
    rate: 1.0,
    pitch: 1.0
  });

  // Auto-select best available voice if none saved
  if (!prefs.voiceName && englishVoices.length > 0) {
    const bestVoice = englishVoices[0]; // Already sorted by quality
    voiceSelect.value = bestVoice.voiceName;
    chrome.storage.sync.set({ voiceName: bestVoice.voiceName });
  } else {
    voiceSelect.value = prefs.voiceName;
  }
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
