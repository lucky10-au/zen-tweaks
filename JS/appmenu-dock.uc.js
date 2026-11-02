// ==UserScript==
// @name           Dock the ⋯ menu as a right sidebar
// @description    Host the app menu's views in a resizable right-hand pane that narrows the webpage
// ==/UserScript==

(function () {
  const LOG = "[appmenu-dock]";
  console.log(LOG, "script loaded");

  const PREF_ENABLED = "extensions.zentweaks.appmenu-dock.enabled";
  const PREF_WIDTH = "extensions.zentweaks.appmenu-dock.width";
  const MIN_WIDTH = 220;
  const MAX_WIDTH_RATIO = 0.5;

  const { PanelMultiView, PanelView } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs"
  );

  const enabled = () => Services.prefs.getBoolPref(PREF_ENABLED, false);

  let els = null;
  let docked = false;
  let stack = []; // view ids currently shown, root first
  let drag = null;

  function log(...args) {
    console.log(LOG, ...args);
  }

  const viewCache = () => document.getElementById("appMenu-viewCache");

  // Back buttons created by PanelView call panelMultiView.goBack(), so our
  // host stub supplies it.
  const hostStub = {
    goBack() {
      if (stack.length > 1) {
        stack.pop();
        renderView(stack[stack.length - 1], null);
      } else {
        undock();
      }
    },
  };

  function labelFor(node) {
    if (!node) return "";
    return node.getAttribute("label") || node.textContent.trim() || "";
  }

  function returnNodeToCache(node) {
    if (!node) return;
    try {
      node.panelMultiView = null;
      const pv = PanelView.forNode(node);
      pv.visible = false;
      const cache = viewCache();
      if (cache && cache.content) {
        cache.content.appendChild(node);
      }
    } catch (ex) {
      console.warn(LOG, "returnNodeToCache:", ex);
    }
  }

  function dockedViews() {
    return [...els.dock.children].filter(
      (c) =>
        c.localName === "panelview" ||
        c.tagName === "panelview" ||
        c.nodeName === "panelview"
    );
  }

  // Renders exactly one panelview inside the dock: returns the previously
  // shown one to the view cache, moves the requested one into the dock and
  // fires its real ViewShowing listeners.
  async function renderView(viewId, triggerNode) {
    for (const v of dockedViews()) {
      returnNodeToCache(v);
    }
    const node = PanelMultiView.getViewNode(document, viewId);
    if (!node) {
      console.error(LOG, "view not found:", viewId);
      return false;
    }
    els.dock.appendChild(node);
    node.panelMultiView = hostStub;
    const pv = PanelView.forNode(node);
    const isRoot = viewId === els.rootViewId;
    if (isRoot) {
      pv.mainview = true;
      pv.headerText = "";
    } else {
      pv.mainview = false;
      pv.headerText = labelFor(triggerNode) || viewId;
    }
    pv.minMaxWidth = 0;
    pv.minMaxHeight = 0;
    pv.visible = true;

    let canceled = false;
    try {
      canceled = await pv.dispatchAsyncEvent("ViewShowing");
    } catch (ex) {
      console.warn(LOG, "ViewShowing error:", ex);
    }
    if (canceled || node.parentNode !== els.dock) {
      log("ViewShowing canceled for", viewId);
      return false;
    }
    try {
      pv.dispatchCustomEvent("ViewShown");
    } catch (ex) {
      console.warn(LOG, "ViewShown:", ex);
    }
    return true;
  }

  // Root menu buttons that switch content are redirected into the dock;
  // anything else keeps its real handler (passwords, settings, account…).
  const SUBVIEWS = {
    "appMenu-bookmarks-button": "PanelUI-bookmarks",
    "appMenu-history-button": "PanelUI-history",
    "appMenu-tab-groups-button": "appMenu-tabGroupsListView",
    "appMenu-more-button2": "appmenu-moreTools",
    "appMenu-help-button2": "PanelUI-helpView",
  };

  function ensureDock() {
    if (els) return els;
    const dock = document.createXULElement("vbox");
    dock.id = "zt-appmenu-dock";
    dock.hidden = true;

    const splitter = document.createXULElement("vbox");
    splitter.id = "zt-appmenu-dock-splitter";

    const browserBox = document.getElementById("browser");
    browserBox.appendChild(splitter);
    browserBox.appendChild(dock);

    if (Services.prefs.prefHasUserValue(PREF_WIDTH)) {
      dock.style.width = Services.prefs.getIntPref(PREF_WIDTH, 320) + "px";
    }

    // Hand-rolled drag (XUL splitter's frame resizing fights the flex:1
    // content box, so we set the dock width ourselves and keep it stable).
    splitter.addEventListener("mousedown", (e) => {
      if (!docked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = {
        startX: e.clientX,
        base: dock.getBoundingClientRect().width,
      };
      const move = (ev) => {
        if (!drag) return;
        const max = window.innerWidth * MAX_WIDTH_RATIO;
        const width = Math.max(
          MIN_WIDTH,
          Math.min(max, drag.base + (drag.startX - ev.clientX))
        );
        dock.style.width = Math.round(width) + "px";
      };
      const end = (ev) => {
        move(ev);
        drag = null;
        try {
          const w = Math.round(dock.getBoundingClientRect().width);
          if (Math.abs(w - Services.prefs.getIntPref(PREF_WIDTH, 0)) >= 2) {
            Services.prefs.setIntPref(PREF_WIDTH, w);
          }
        } catch (ex) {
          console.warn(LOG, "width save failed:", ex);
        }
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", end);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", end);
    });

    // Click outside the dock closes it.
    document.addEventListener(
      "mousedown",
      (e) => {
        if (!docked || !enabled()) return;
        if (
          els.dock.contains(e.target) ||
          els.menuButton?.contains(e.target) ||
          els.splitter.contains(e.target)
        ) {
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

    els = {
      dock,
      splitter,
      panel: document.getElementById("appMenu-popup"),
      menuButton: document.getElementById("PanelUI-menu-button"),
      rootViewId: document
        .getElementById("appMenu-multiView")
        .getAttribute("mainViewId"),
    };

    // Some close routes (Zen-added items etc.) call panel.hidePopup()
    // directly, which is meaningless while docked — turn those into undocks.
    const realHidePopup = els.panel.hidePopup.bind(els.panel);
    els.panel.hidePopup = () => {
      if (docked) {
        undock();
        return;
      }
      return realHidePopup();
    };

    // Redirect subview-opening root buttons into the dock. MUST be capture
    // phase: stock PanelUI.onCommand listens (bubbling) on the main view and
    // runs first, adopting the subview into its own anchored temp popup and
    // blanking the dock.
    els.dock.addEventListener(
      "command",
      async (e) => {
        if (!docked || !enabled()) return;
        const id = e.target.id;
        if (SUBVIEWS[id]) {
          e.preventDefault();
          e.stopPropagation();
          stack.push(SUBVIEWS[id]);
          // Match stock "More Tools" behavior: notify DevTools the view is showing.
          if (SUBVIEWS[id] === "appmenu-moreTools") {
            try {
              const view = document.getElementById(
                "appmenu-developer-tools-view"
              );
              Services.obs.notifyObservers(
                view,
                "web-developer-tools-view-showing"
              );
            } catch (ex) {
              console.warn(LOG, "devtools notify:", ex);
            }
          }
          const ok = await renderView(SUBVIEWS[id], e.target);
          if (!ok) stack.pop();
        }
      },
      true
    );

    // Fullscreen handlers in stock code call panel.hidePopup(), which has no
    // meaning in the dock; replicate the stock end result ourselves.
    els.dock.addEventListener(
      "command",
      (e) => {
        if (!docked || e.target.id !== "appMenu-fullscreen-button2") return;
        e.preventDefault();
        e.stopPropagation();
        undock();
        setTimeout(() => BrowserCommands.fullScreen(), 0);
      },
      true
    );

    // The account row opens its own anchored panel (gSync.toggleAccountPanel);
    // user asked for the plain Sync settings page instead.
    const accountHandler = (e) => {
      if (!docked || !enabled()) return;
      const t = e.target;
      const isAccount =
        t.id === "appMenu-fxa-label2" || !!t.closest?.("#appMenu-nova-fxa-label");
      if (!isAccount) return;
      e.preventDefault();
      e.stopPropagation();
      undock();
      setTimeout(() => openPreferences("sync"), 0);
    };
    els.dock.addEventListener("command", accountHandler, true);
    els.dock.addEventListener("click", accountHandler, true);

    // Any OTHER popup opening (downloads panel, extension popups, context
    // menus, notifications…) takes over the screen — put the dock away.
    window.addEventListener(
      "popupshown",
      (e) => {
        if (!docked || !enabled()) return;
        const t = e.target;
        if (t?.nodeType !== 1) return;
        if (t.localName !== "panel" && t.localName !== "menupopup") return;
        if (t.id === "appMenu-popup") return; // our stock panel stays hidden
        if (t.closest("#zt-appmenu-dock")) return;
        undock();
      },
      true
    );

    log("dock structure created");
    return els;
  }

  async function openDock() {
    if (!enabled()) return;
    if (document.documentElement.hasAttribute("customizing")) return;
    if (docked) {
      undock();
      return;
    }
    const { dock, splitter, panel, rootViewId } = ensureDock();
    try {
      // Make sure the real popup is not mid-session before we take the views.
      if (panel.state === "open" || panel.state === "showing") {
        PanelUI.hide();
        await new Promise((r) => setTimeout(r, 120));
      }
      await PanelUI.ensureReady();
      try {
        PanelUI._ensureShortcutsShown?.();
      } catch (ex) {
        console.warn(LOG, "shortcuts:", ex);
      }

      stack = [rootViewId];
      dock.hidden = false;
      splitter.hidden = false;
      const shown = await renderView(rootViewId, null);
      if (!shown) {
        log("main view canceled, reverting");
        stack = [];
        for (const v of dockedViews()) returnNodeToCache(v);
        dock.hidden = true;
        splitter.hidden = true;
        return;
      }
      docked = true;
      log("docked");
    } catch (ex) {
      console.error(LOG, "failed to dock:", ex);
      stack = [];
      for (const v of dockedViews()) returnNodeToCache(v);
      dock.hidden = true;
      splitter.hidden = true;
    }
  }

  function undock() {
    if (!els || !docked) return;
    docked = false;
    stack = [];
    const { dock, splitter, menuButton } = els;
    for (const v of dockedViews()) returnNodeToCache(v);
    dock.hidden = true;
    splitter.hidden = true;
    menuButton?.removeAttribute("open");
    log("undocked");
  }

  // Intercept the ⋯ button: capture-phase so PanelUI's own mousedown/keypress
  // handlers never run while the toggle is on (falls through to the normal
  // popup when off).
  function interceptButton() {
    const menuButton = document.getElementById("PanelUI-menu-button");
    menuButton?.addEventListener(
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
    menuButton?.addEventListener(
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
