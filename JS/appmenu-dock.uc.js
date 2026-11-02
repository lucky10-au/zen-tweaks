// ==UserScript==
// @name           Dock the ⋯ menu as a right sidebar
// @description    Embed the app menu as a resizable right-hand pane that narrows the webpage
// ==/UserScript==

(function () {
  const LOG = "[appmenu-dock]";
  console.log(LOG, "script loaded");

  const PREF_ENABLED = "extensions.zentweaks.appmenu-dock.enabled";
  const PREF_WIDTH = "extensions.zentweaks.appmenu-dock.width";

  const { PanelMultiView, PanelView } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs"
  );

  const enabled = () => Services.prefs.getBoolPref(PREF_ENABLED, false);

  let els = null;
  let docked = false;

  function log(...args) {
    console.log(LOG, ...args);
  }

  function ensureDock() {
    if (els) return els;
    const dock = document.createXULElement("vbox");
    dock.id = "zt-appmenu-dock";
    dock.hidden = true;

    const splitter = document.createXULElement("splitter");
    splitter.id = "zt-appmenu-dock-splitter";
    splitter.classList.add("chromeclass-extrachrome");
    splitter.hidden = true;

    document.getElementById("browser").appendChild(splitter);
    document.getElementById("browser").appendChild(dock);

    // Remember a dragged width while dragging the splitter.
    splitter.addEventListener("dragend", () => {
      try {
        Services.prefs.setIntPref(
          PREF_WIDTH,
          Math.round(dock.getBoundingClientRect().width)
        );
      } catch (ex) {
        console.warn(LOG, "could not save width", ex);
      }
    });

    if (Services.prefs.prefHasUserValue(PREF_WIDTH)) {
      dock.style.width =
        Services.prefs.getIntPref(PREF_WIDTH, 320) + "px";
    }

    els = {
      dock,
      splitter,
      panel: document.getElementById("appMenu-popup"),
      multiView: document.getElementById("appMenu-multiView"),
      menuButton: document.getElementById("PanelUI-menu-button"),
    };

    // Click outside the dock closes it.
    document.addEventListener(
      "mousedown",
      (e) => {
        if (!docked || !enabled()) return;
        if (els.dock.contains(e.target) || els.menuButton.contains(e.target)) {
          return;
        }
        undock();
      },
      true
    );

    // Escape closes it.
    window.addEventListener(
      "keydown",
      (e) => {
        if (!docked || e.key !== "Escape" || !enabled()) return;
        e.stopPropagation();
        undock();
      },
      true
    );

    log("dock structure created");
    return els;
  }

  async function openDock() {
    if (docked) {
      undock();
      return;
    }
    const { dock, splitter, panel, multiView } = ensureDock();
    if (document.documentElement.hasAttribute("customizing")) return;
    try {
      panel.hidden = false;
      panel.setAttribute("zt-docked", "true");
      dock.appendChild(panel);
      dock.hidden = false;
      splitter.hidden = false;

      const pmv = PanelMultiView.forNode(multiView);
      if (!pmv.connected) {
        pmv.connect();
      }
      // Mimic popupshowing (adds key navigation + panelopen styling).
      panel.dispatchEvent(new Event("popupshowing", { bubbles: true }));

      // Import the main view, replicating PanelMultiView#showMainView.
      const mainViewNode = PanelMultiView.getViewNode(
        document,
        multiView.getAttribute("mainViewId")
      );
      if (mainViewNode.panelMultiView && mainViewNode.panelMultiView !== multiView) {
        PanelMultiView.forNode(mainViewNode.panelMultiView).hidePopup();
      }
      pmv._viewStack.appendChild(mainViewNode);
      mainViewNode.panelMultiView = multiView;
      const pv = PanelView.forNode(mainViewNode);
      pmv.openViews.push(pv);
      pv.mainview = true;
      pv.headerText = "";
      pv.minMaxWidth = 0;
      pv.minMaxHeight = 0;
      pv.visible = true;

      let canceled = false;
      try {
        canceled = await pv.dispatchAsyncEvent("ViewShowing");
      } catch (ex) {
        console.warn(LOG, "ViewShowing error:", ex);
      }
      if (canceled || !pmv.openViews.includes(pv)) {
        log("ViewShowing canceled, undocking");
        await undock();
        return;
      }

      // Mimic popupshown: activates the main view, dispatches ViewShown.
      panel.dispatchEvent(new Event("popupshown", { bubbles: true }));
      panel.setAttribute("mainviewshowing", "true");
      try {
        CustomizableUI.addPanelCloseListeners(panel);
      } catch (ex) {
        console.warn(LOG, "addPanelCloseListeners:", ex);
      }
      docked = true;
      log("docked");
      dumpDebug(panel, multiView);
    } catch (ex) {
      console.error(LOG, "failed to dock, restoring popup:", ex);
      await undock();
    }
  }

  function rect(el) {
    if (!el) return "null";
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`;
  }

  function matchingRules(el) {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (ex) {
        continue;
      }
      const href = sheet.href || "(no href)";
      for (const rule of rules) {
        if (rule.type !== 1 || !rule.selectorText) continue;
        let matches = false;
        try {
          matches = el.matches(rule.selectorText);
        } catch (ex) {}
        if (!matches) continue;
        const pos = rule.style.getPropertyValue("position");
        const disp = rule.style.getPropertyValue("display");
        if (pos || disp) {
          out.push(`${href.slice(-60)} :: ${rule.selectorText} -> position=${pos}${rule.style.getPropertyPriority("position") !== "" ? "!" : ""} display=${disp}`);
        }
      }
    }
    return out;
  }

  function dumpDebug(panel, multiView) {
    try {
      const pmv = PanelMultiView.forNode(multiView);
      log("--- dock debug start ---");
      log("panel.state:", panel.state, "hidden:", panel.hidden, "rect:", rect(panel));
      log("dock rect:", rect(els.dock), "dock computed display:", getComputedStyle(els.dock).display);
      const cs = getComputedStyle(panel);
      log(
        "panel computed: display=" + cs.display,
        "position=" + cs.position,
        "visibility=" + cs.visibility,
        "contain=" + cs.contain
      );
      log("rules affecting panel position/display:");
      for (const line of matchingRules(panel)) log("  ", line);
      // Empirical test: does an inline !important win over the cascade?
      const before = getComputedStyle(panel).position;
      panel.style.setProperty("position", "static", "important");
      const after = getComputedStyle(panel).position;
      panel.style.removeProperty("position");
      log("inline important test: before=" + before, "after=" + after);
      log("multiView rect:", rect(multiView), "computed display:", getComputedStyle(multiView).display);
      const inDoc = document.getElementById(multiView.getAttribute("mainViewId"));
      log(
        "main view in document:", !!inDoc,
        "template present:", !!document.getElementById("appMenu-viewCache")
      );
      log("pmv.connected:", pmv.connected, "openViews:", pmv.openViews?.length);
      log(
        "multiView children:",
        [...multiView.children].map((c) => c.localName + "#" + (c.id || c.classList[0])).join(", ") || "(none)"
      );
      const vc = pmv._viewContainer;
      const vs = pmv._viewStack;
      log("viewContainer rect:", rect(vc), "css display:", vc && getComputedStyle(vc).display);
      log("viewStack rect:", rect(vs), "children:", vs && vs.children.length);
      const views = vs ? [...vs.children] : [];
      for (const v of views) {
        log(
          "view:",
          v.localName + "#" + (v.id || "?"),
          "visibleattr:", v.hasAttribute("visible"),
          "mainview:", v.getAttribute("mainview"),
          "rect:", rect(v),
          "css:", (c => `display=${c.display} visibility=${c.visibility} overflow=${c.overflow}`)(getComputedStyle(v))
        );
        log("view innerHTML length:", v.innerHTML.length);
      }
      log("--- dock debug end ---");
    } catch (ex) {
      console.error(LOG, "debug dump failed:", ex);
    }
  }

  function undock() {
    if (!els || !docked) return;
    docked = false;
    const { dock, splitter, panel, multiView } = els;
    try {
      const pmv = PanelMultiView.forNode(multiView);
      try {
        CustomizableUI.removePanelCloseListeners(panel);
      } catch (ex) {
        console.warn(LOG, "removePanelCloseListeners:", ex);
      }
      // Fire the full close sequence: views close, nav listeners detach,
      // PanelUI resets its button state.
      panel.dispatchEvent(new Event("popuphiding", { bubbles: true }));
      panel.dispatchEvent(new Event("popuphidden", { bubbles: true }));
      try {
        pmv._moveOutKids();
      } catch (ex) {
        console.warn(LOG, "moveOutKids:", ex);
      }
      const popupSet =
        document.getElementById("mainPopupSet") ||
        panel.parentNode;
      popupSet.appendChild(panel);
      panel.hidden = true;
      panel.removeAttribute("zt-docked");
    } finally {
      dock.hidden = true;
      splitter.hidden = true;
      log("undocked");
    }
  }

  // Intercept the ⋯ button: capture-phase so PanelUI's own mousedown/keypress
  // handlers never run while the toggle is on (falls through to the normal
  // popup when off).
  function interceptButton() {
    const menuButton = document.getElementById("PanelUI-menu-button");
    menuButton.addEventListener(
      "mousedown",
      (e) => {
        if (!enabled()) return;
        if (document.documentElement.hasAttribute("customizing")) return;
        e.preventDefault();
        e.stopPropagation();
        openDock();
      },
      true
    );
    menuButton.addEventListener(
      "keypress",
      (e) => {
        if (!enabled()) return;
        if (document.documentElement.hasAttribute("customizing")) return;
        if (e.key !== " " && e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        openDock();
      },
      true
    );
  }

  interceptButton();

  // React to the Sine toggle: undock immediately when switched off.
  Services.prefs.addObserver(PREF_ENABLED, {
    observe: () => {
      if (docked && !Services.prefs.getBoolPref(PREF_ENABLED, false)) {
        undock();
      }
    },
  });

  window.addEventListener("unload", () => {
    try {
      undock();
    } catch (ex) {
      console.warn(LOG, ex);
    }
  });
})();
