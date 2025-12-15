// Hardcoded pause shortcut: Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

document.addEventListener("keydown", (event) => {
  const isPauseShortcut =
    event.key.toLowerCase() === "p" &&
    event.shiftKey &&
    (isMac ? event.metaKey : event.ctrlKey) &&
    !event.altKey;

  if (isPauseShortcut) {
    event.preventDefault();
    chrome.runtime.sendMessage({ action: "toggle-pause" });
  }
});
