// ==UserScript==
// @name           Download PDFs instead of opening in viewer
// @description    Prevents the built-in PDF viewer from opening; PDFs download instead
// ==/UserScript==

(function () {
  const LOG = "[pdf-download]";
  const MOD_PREF = "extensions.zentweaks.pdf-download.enabled";
  const PDFJS_PREF = "pdfjs.disabled";
  const HELPER_APPS_PREF = "browser.helperApps.neverAsk.saveToDisk";

  console.log(LOG, "script loaded");

  function getNeverAskList() {
    try {
      return Services.prefs.getCharPref(HELPER_APPS_PREF) || "";
    } catch (e) {
      return "";
    }
  }

  function setNeverAskList(list) {
    Services.prefs.setCharPref(HELPER_APPS_PREF, list);
  }

  function apply(on) {
    try {
      Services.prefs.setBoolPref(PDFJS_PREF, on);
      if (on) {
        // Also add application/pdf to neverAsk.saveToDisk so it always saves without asking.
        let list = getNeverAskList();
        let types = list ? list.split(",").map(t => t.trim()).filter(Boolean) : [];
        if (!types.includes("application/pdf")) {
          types.push("application/pdf");
          setNeverAskList(types.join(","));
        }
      } else {
        // Restore: remove application/pdf from neverAsk.saveToDisk.
        let list = getNeverAskList();
        let types = list ? list.split(",").map(t => t.trim()).filter(Boolean) : [];
        types = types.filter(t => t !== "application/pdf");
        if (types.length > 0) {
          setNeverAskList(types.join(","));
        } else {
          try {
            Services.prefs.clearUserPref(HELPER_APPS_PREF);
          } catch (e) {}
        }
      }
      console.log(LOG, "PDF download mode", on ? "enabled" : "disabled");
    } catch (e) {
      console.warn(LOG, "failed to set prefs:", e);
    }
  }

  apply(Services.prefs.getBoolPref(MOD_PREF, false));

  // Live toggle from the Sine panel.
  Services.prefs.addObserver(MOD_PREF, {
    observe: () => apply(Services.prefs.getBoolPref(MOD_PREF, false)),
  });
})();
