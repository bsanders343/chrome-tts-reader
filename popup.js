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
