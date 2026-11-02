// ==UserScript==
// @name           URL bar suggestions for visited sites
// @description    Autofill previously visited URLs and widen the suggestion list
// ==/UserScript==

(function () {
  const LOG = "[urlbar-tweaks]";
  console.log(LOG, "script loaded");

  // Complete URLs you pick often (deep pages, not just domains).
  Services.prefs.setBoolPref(
    "browser.urlbar.autoFill.adaptiveHistory.enabled",
    true
  );

  // Make sure domain autofill is on (pref could be toggled off elsewhere).
  Services.prefs.setBoolPref("browser.urlbar.autoFill", true);

  // Show more results so history hits are not crowded out by search
  // suggestions (default: 10).
  Services.prefs.setIntPref("browser.urlbar.maxRichResults", 15);
})();
