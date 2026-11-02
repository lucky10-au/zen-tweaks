// ==UserScript==
// @name           Cmd+W closes URL bar
// @description    Close the open URL bar instead of the tab behind it
// ==/UserScript==

(function () {
  const LOG = "[close-urlbar]";
  console.log(LOG, "script loaded");

  function isUrlbarActive() {
    const urlbar = window.gURLBar;
    if (!urlbar) return false;
    return urlbar.focused || urlbar.view?.isOpen;
  }

  function closeUrlbar() {
    console.log(LOG, "URL bar active, closing it instead of the tab");
    window.gURLBar?.view?.close();
    window.gURLBar?.blur();
  }

  // Route 1: stop the key before the tab-close shortcut fires.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "w") return;
      if (!isUrlbarActive()) return;
      e.preventDefault();
      e.stopPropagation();
      closeUrlbar();
    },
    true
  );

  // Route 2: on macOS Cmd+W is a reserved accelerator handled by the native
  // menu, so the keydown above often never runs. Intercept the command it
  // dispatches instead.
  if (window.BrowserCommands?.closeTabOrWindow) {
    const originalClose = BrowserCommands.closeTabOrWindow.bind(BrowserCommands);
    BrowserCommands.closeTabOrWindow = function (event) {
      if (isUrlbarActive()) {
        closeUrlbar();
        return;
      }
      return originalClose(event);
    };
  } else {
    console.warn(LOG, "BrowserCommands.closeTabOrWindow not found");
  }
})();
