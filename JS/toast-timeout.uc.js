// ==UserScript==
// @name           Toast auto-hide (5 s)
// @description    Make Zen's corner toasts ("link copied to clipboard" etc.) fade out after 5 seconds
// ==/UserScript==

(function () {
  const LOG = "[toast-timeout]";
  const PREF = "extensions.zentweaks.toast-timeout.enabled";
  const SAVE = "extensions.zentweaks.saved-disable-autohide";
  const AUTOHIDE = "ui.popup.disable_autohide";
  const TOAST_TIMEOUT_MS = 5000;
  console.log(LOG, "script loaded");

  function isEnabled() {
    return Services.prefs.getBoolPref(PREF, true);
  }

  // Remember the original autohide value so it can be restored when the
  // tweak is switched off later.
  if (Services.prefs.getPrefType(SAVE) === Services.prefs.PREF_INVALID) {
    Services.prefs.setCharPref(
      SAVE,
      String(Services.prefs.getBoolPref(AUTOHIDE, false))
    );
  }

  function applyAutohide() {
    const saved = Services.prefs.getCharPref(SAVE, "false") === "true";
    Services.prefs.setBoolPref(AUTOHIDE, isEnabled() ? false : saved);
  }

  if (window.gZenUIManager?.showToast) {
    const originalShowToast = gZenUIManager.showToast.bind(gZenUIManager);
    gZenUIManager.showToast = function (messageId, options = {}) {
      if (!isEnabled()) return originalShowToast(messageId, options);
      options.timeout = Math.max(options.timeout || 0, TOAST_TIMEOUT_MS);
      return originalShowToast(messageId, options);
    };
  } else {
    console.warn(LOG, "gZenUIManager.showToast not found");
  }

  applyAutohide();
  Services.prefs.addObserver(PREF, { observe: applyAutohide });
})();
