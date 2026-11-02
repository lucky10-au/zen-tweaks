// ==UserScript==
// @name           URL bar suggestions for visited sites
// @description    Autofill previously visited URLs and widen the suggestion list
// ==/UserScript==

(function () {
  const LOG = "[urlbar-tweaks]";
  const PREF = "extensions.zentweaks.urlbar-tweaks.enabled";
  console.log(LOG, "script loaded");

  const ADAPTIVE = "browser.urlbar.autoFill.adaptiveHistory.enabled";
  const AUTOFILL = "browser.urlbar.autoFill";
  const MAX_RICH = "browser.urlbar.maxRichResults";
  const SEARCH_FIRST = "browser.urlbar.showSearchSuggestionsFirst";

  function isEnabled() {
    return Services.prefs.getBoolPref(PREF, true);
  }

  function apply(on) {
    if (on) {
      // Complete URLs you pick often (deep pages, not just domains).
      Services.prefs.setBoolPref(ADAPTIVE, true);
      // Make sure domain autofill is on.
      Services.prefs.setBoolPref(AUTOFILL, true);
      // Show more results so history hits are not crowded out by search
      // suggestions (default: 10).
      Services.prefs.setIntPref(MAX_RICH, 15);
      // Rank history results ABOVE Google search suggestions — with search
      // first, URL autofill never fires and visited sites get pushed down.
      Services.prefs.setBoolPref(SEARCH_FIRST, false);
    } else {
      for (const pref of [ADAPTIVE, AUTOFILL, MAX_RICH, SEARCH_FIRST]) {
        if (Services.prefs.prefHasUserValue(pref)) {
          Services.prefs.clearUserPref(pref);
        }
      }
    }
  }

  apply(isEnabled());
  Services.prefs.addObserver(PREF, {
    observe: () => apply(isEnabled()),
  });
})();
