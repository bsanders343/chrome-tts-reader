// Keyboard shortcuts for TTS control
// macOS: Cmd+Shift+Key, Windows/Linux: Ctrl+Shift+Key
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

document.addEventListener("keydown", (event) => {
  const hasModifier = event.shiftKey && (isMac ? event.metaKey : event.ctrlKey) && !event.altKey;
  if (!hasModifier) return;

  let action = null;

  switch (event.key) {
    case "p":
    case "P":
      action = "toggle-pause";
      break;
    case "ArrowLeft":
      action = "restart-sentence";
      break;
    case "ArrowUp":
      action = "restart-paragraph";
      break;
  }

  if (action) {
    event.preventDefault();
    chrome.runtime.sendMessage({ action });
  }
});
