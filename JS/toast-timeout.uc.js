// ==UserScript==
// @name           Toast auto-hide (5 s)
// @description    Make Zen's corner toasts ("link copied to clipboard" etc.) fade out after 5 seconds
// ==/UserScript==

(function () {
  const LOG = "[toast-timeout]";
  console.log(LOG, "script loaded");

  const TOAST_TIMEOUT_MS = 5000;

  // Zen skips its auto-hide timer when this pref is on (it was set in this
  // profile, which is why toasts stuck around). Restore normal auto-hiding.
  Services.prefs.setBoolPref("ui.popup.disable_autohide", false);

  // Zen's own default timeout is 2 s; honor it only when a caller requests a
  // longer one, otherwise apply our 5 s.
  if (window.gZenUIManager?.showToast) {
    const originalShowToast = gZenUIManager.showToast.bind(gZenUIManager);
    gZenUIManager.showToast = function (messageId, options = {}) {
      options.timeout = Math.max(options.timeout || 0, TOAST_TIMEOUT_MS);
      return originalShowToast(messageId, options);
    };
  } else {
    console.warn(LOG, "gZenUIManager.showToast not found");
  }
})();
