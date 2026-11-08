// ==UserScript==
// @name           Remove video PiP button
// @description    Hide the picture-in-picture button that overlays videos
// ==/UserScript==

(function () {
  const LOG = "[pip-toggle]";
  console.log(LOG, "script loaded");

  const TOGGLE_PREF = "extensions.zentweaks.pip-button.enabled";
  const VIDEO_TOGGLE =
    "media.videocontrols.picture-in-picture.video-toggle.enabled";

  const apply = (on) => {
    if (on) {
      // Tweak active: kill the inline PiP overlay button on all videos.
      Services.prefs.setBoolPref(VIDEO_TOGGLE, false);
    } else {
      // Tweak off: restore Zen's default (the button shows again).
      Services.prefs.clearUserPref(VIDEO_TOGGLE);
    }
  };

  apply(Services.prefs.getBoolPref(TOGGLE_PREF, true));

  // Live toggle from the Sine panel.
  Services.prefs.addObserver(TOGGLE_PREF, {
    observe: () => apply(Services.prefs.getBoolPref(TOGGLE_PREF, true)),
  });
})();
