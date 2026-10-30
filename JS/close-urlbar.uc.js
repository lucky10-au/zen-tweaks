// ==UserScript==
// @name           Cmd+W closes URL bar
// @description    Close the open URL bar instead of the tab behind it
// ==/UserScript==

window.addEventListener("keydown", (e) => {
  if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (e.key.toLowerCase() !== "w") return;

  const urlbar = window.gURLBar;
  if (!urlbar) return;

  if (urlbar.focused || urlbar.view?.isOpen) {
    e.preventDefault();
    e.stopPropagation();
    urlbar.view?.close();
    urlbar.blur();
  }
}, true);