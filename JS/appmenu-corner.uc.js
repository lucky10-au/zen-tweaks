// ==UserScript==
// @name           App menu sits in the content corner
// @description    Pin the ⋯ app menu panel flush into the top-right corner of the page area
// ==/UserScript==

(function () {
  const LOG = "[appmenu-corner]";
  console.log(LOG, "script loaded");

  const PREF = "extensions.zentweaks.appmenu-corner.enabled";

  const panel = document.getElementById("appMenu-popup");
  if (!panel) {
    console.warn(LOG, "#appMenu-popup not found");
    return;
  }
  if (panel.dataset.ztCorner) return;
  panel.dataset.ztCorner = "true";

  // Re-run on every open so toggling the pref takes effect immediately.
  panel.addEventListener("popupshown", () => {
    if (!Services.prefs.getBoolPref(PREF, true)) return;

    const anchor = panel.triggerNode || panel.anchorNode;
    if (!anchor || !panel.moveToAnchor) return;

    const a = anchor.getBoundingClientRect();
    const toolbox = document.getElementById("navigator-toolbox");

    // Right edge: align the panel with the right edge of the window.
    const dx = window.innerWidth - a.right;
    // Top edge: align with the bottom of the toolbar (top of the page area).
    const dy = toolbox ? toolbox.getBoundingClientRect().bottom - a.bottom : 0;

    panel.moveToAnchor(anchor, "bottomright topright", dx, dy);
  });
})();
