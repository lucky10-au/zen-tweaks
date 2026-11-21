// ==UserScript==
// @name           Auto PiP when switching tabs
// @description    Automatically put a playing video in Picture-in-Picture when you switch away from its tab
// ==/UserScript==

(function () {
  const LOG = "[auto-pip-tabs]";
  const MOD_PREF = "extensions.zentweaks.auto-pip-tabs.enabled";
  const PIPE_PREF =
    "media.videocontrols.picture-in-picture.enable-when-switching-tabs.enabled";

  console.log(LOG, "script loaded");

  function apply(on) {
    try {
      Services.prefs.setBoolPref(PIPE_PREF, on);
      console.log(LOG, "auto-PiP-on-tab-switch", on ? "enabled" : "disabled");
    } catch (e) {
      console.warn(LOG, "failed to set pref:", e);
    }
  }

  apply(Services.prefs.getBoolPref(MOD_PREF, false));

  // Live toggle from the Sine panel.
  Services.prefs.addObserver(MOD_PREF, {
    observe: () => apply(Services.prefs.getBoolPref(MOD_PREF, false)),
  });
})();
