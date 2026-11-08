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

  // Widgets that lazily populate the History/Bookmarks sub-views. In the
  // stock popup, CustomizableUI wires ViewShowing handlers; our dock must
  // drive them itself.
  let _widgets = null;
  function historyWidget() {
    if (!_widgets) {
      _widgets = ChromeUtils.importESModule(
        "moz-src:///browser/components/customizableui/CustomizableWidgets.sys.mjs"
      ).CustomizableWidgets;
    }
    return _widgets.find((w) => w.id === "history-panelmenu");
  }

  function populateView(viewId, node) {
    try {
      if (viewId === "PanelUI-history") {
        historyWidget()?.onViewShowing?.({ type: "ViewShowing", target: node });
      } else if (viewId === "PanelUI-bookmarks") {
        window.BookmarkingUI?.onPanelMenuViewShowing?.({
          type: "ViewShowing",
          target: node,
        });
      }
    } catch (ex) {
      console.warn(LOG, "populate failed:", viewId, ex);
    }
  }

  // Mirror of the stock PanelMultiViewHidden cleanup so the widgets stop
  // listening (and PlacesPanelview stops observing) after undock.
  function cleanupWidgets() {
    try {
      const node = PanelMultiView.getViewNode(document, "PanelUI-history");
      historyWidget()?.onPanelMultiViewHidden?.({
        type: "PanelMultiViewHidden",
        target: node,
      });
    } catch (ex) {
      console.warn(LOG, "history cleanup:", ex);
    }
    try {
      const node = PanelMultiView.getViewNode(document, "PanelUI-bookmarks");
      if (node && window.BookmarkingUI?._panelMenuView) {
        window.BookmarkingUI.onPanelMenuViewHiding({
          type: "ViewHiding",
          target: node,
        });
      }
    } catch (ex) {
      console.warn(LOG, "bookmarks cleanup:", ex);
    }
  }

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
    // The History widget listens on panelview.panelMultiView; keep those
    // calls harmless on our stub.
    addEventListener() {},
    removeEventListener() {},
  };

  function labelFor(node) {
    if (!node) return "";
    return node.getAttribute("label") || node.textContent.trim() || "";
  }

  function returnNodeToCache(node) {
    if (!node) return;
    try {
      // Temporary contrast-diagnosis ink probes must never ride back into
      // the view cache (they would pollute the stock popup).
      node.querySelectorAll("[data-zt-ink]").forEach((e) => e.remove());
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
    populateView(viewId, node);
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
    "appMenuRecentlyClosedTabs": "appMenu-library-recentlyClosedTabs",
    "appMenuRecentlyClosedWindows": "appMenu-library-recentlyClosedWindows",
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
      // Temporary paint diagnosis v2: lime probe FAMILY at five tree spots
      // (dock child, browser row, app content wrapper, toolbox, fixed at
      // window root) + drawWindow sampling of each + getAnimations dump +
      // attribute MutationObserver. The bright/dim boundary between probes
      // locates the layer that multiplies paint by ~0.35.
      try {
        const mkProbe = (id, fixed) => {
          let p = document.getElementById(id);
          if (p && p.parentNode) return p;
          p = document.createXULElement("vbox");
          p.id = id;
          p.setAttribute(
            "style",
            (fixed
              ? "position:fixed;left:120px;top:160px;"
              : "flex:none;") +
              "width:110px;height:28px;background:rgb(0,255,0);" +
              "align-items:center;justify-content:center;" +
              "color:rgb(0,0,255);font-weight:800;z-index:2147483646"
          );
          p.textContent = id;
          return p;
        };
        const targets = [
          ["zt-probe-dock", dock, false],
          ["zt-probe-brow", dock.parentElement, false],
          ["zt-probe-wrap",
            (document.getElementById("zen-appcontent-wrapper") ||
              document.body), false],
          ["zt-probe-tool",
            (document.getElementById("navigator-toolbox") ||
              document.body), false],
          ["zt-probe-root", document.documentElement, true],
        ];
        const probes = [];
        for (const [id, parent, fixed] of targets) {
          const p = mkProbe(id, fixed);
          if (p.parentNode !== parent) {
            p.remove();
            parent.appendChild(p);
          }
          p.hidden = false;
          probes.push(p);
        }

        // Ink probes INSIDE the panelview (same paint path as the menu
        // rows): opaque white/black rects plus a big white text sample.
        // Tells us whether plain ink also dims inside the panelview or
        // only the row elements.
        const mainView =
          dock.querySelector("panelview#appMenu-mainView") ||
          dock.querySelector("panelview");
        const inkEls = [];
        if (mainView) {
          const mkInk = (id, css, text) => {
            document.getElementById(id)?.remove();
            const el = document.createElement("div");
            el.id = id;
            el.setAttribute("data-zt-ink", "");
            Object.assign(el.style, css);
            if (text) el.textContent = text;
            mainView.prepend(el);
            inkEls.push(el);
            return el;
          };
          mkInk("zt-rect-white", {
            width: "60px",
            height: "40px",
            background: "#ffffff",
            flex: "none",
            margin: "4px",
          });
          mkInk("zt-rect-black", {
            width: "60px",
            height: "40px",
            background: "#000000",
            flex: "none",
            margin: "4px",
          });
          mkInk(
            "zt-bigtext",
            {
              fontSize: "26px",
              fontWeight: "700",
              color: "#ffffff",
              background: "#000000",
              padding: "4px 8px",
              flex: "none",
              margin: "4px",
            },
            "ZT WHITE TEXT"
          );
        }

        const cs = getComputedStyle(dock);
        console.log(
          LOG,
          "palette debug:",
          "css=" + (cs.getPropertyValue("--zt-css-version").trim() || "MISSING"),
          "rootDark=" +
            document.documentElement.getAttribute("zen-should-be-dark-mode"),
          "dockScheme=" + cs.getPropertyValue("color-scheme").trim()
        );

        const drawSample = (r, label, pts) => {
          const W = Math.max(1, Math.round(r.width));
          const H = Math.max(1, Math.round(r.height));
          const canvas = document.createElementNS(
            "http://www.w3.org/1999/xhtml",
            "canvas"
          );
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext("2d");
          ctx.drawWindow(
            window,
            r.left,
            r.top,
            W,
            H,
            "rgb(255,0,255)",
            ctx.DRAWWINDOW_DRAW_VIEW
          );
          const px = (x, y) => {
            const d = ctx.getImageData(
              Math.min(W - 1, Math.max(0, Math.round(x))),
              Math.min(H - 1, Math.max(0, Math.round(y))),
              1,
              1
            ).data;
            return "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")";
          };
          const list = pts || [
            ["mid", W / 2, H / 2],
            ["edge", 4, H / 2],
          ];
          console.log(
            LOG,
            "drawWin[" + label + "]",
            list.map(([n, x, y]) => n + "=" + px(x, y)).join(" ")
          );
        };

        const animDump = () => {
          for (const t of [dock, ...probes]) {
            try {
              const list = t.getAnimations({ subtree: true });
              const parts = list.slice(0, 6).map((a) => {
                const prop =
                  a.propertyName || a.animationName || a.constructor.name;
                return prop + ":" + a.playState + ":" + a.currentTime;
              });
              console.log(LOG, "anims[" + t.id + "]", parts.join(" | ") || "none");
            } catch (ex) {
              console.warn(LOG, "anims[" + t.id + "]", "failed:", ex);
            }
          }
        };

        const observer = new MutationObserver((muts) => {
          for (const m of muts) {
            console.log(
              LOG,
              "mut[" + (m.target.id || m.target.localName) + "]",
              m.attributeName,
              m.oldValue,
              "->",
              (m.target.getAttribute(m.attributeName) || "").slice(0, 60)
            );
          }
        });
        observer.observe(dock, { attributes: true, attributeOldValue: true });
        for (const p of probes) {
          observer.observe(p, { attributes: true, attributeOldValue: true });
        }

        window.setTimeout(() => {
          try {
            for (const p of probes) drawSample(p.getBoundingClientRect(), p.id);
            for (const e of inkEls) {
              drawSample(e.getBoundingClientRect(), e.id);
            }
            const row = dock.querySelector("panelview toolbarbutton");
            if (row) {
              const r = row.getBoundingClientRect();
              const W = Math.max(1, Math.round(r.width));
              const H = Math.max(1, Math.round(r.height));
              drawSample(r, "row:" + (row.id || row.localName).slice(0, 20), [
                ["q25", W * 0.25, H / 2],
                ["mid", W * 0.5, H / 2],
                ["q75", W * 0.75, H / 2],
              ]);
            }
            animDump();
            // ---------- v2.1.15 isolation tests ----------
            try {
              const view = dock.querySelector("panelview");
              console.log(
                LOG,
                "viewAttrs= " +
                  (view
                    ? Array.from(view.attributes)
                        .map((a) => a.name + "=" + a.value)
                        .join(" ")
                    : "none")
              );

              // Top-layer dump: what elements actually exist over the sampled
              // points (decesive for overlay-type effects).
              const efp = (x, y, label) => {
                const els = [...document.elementsFromPoint(x, y)].slice(0, 6);
                console.log(
                  LOG,
                  "efp[" + label + "]",
                  ...els.map((el) => {
                    const cs = getComputedStyle(el);
                    const cls =
                      typeof el.className === "string"
                        ? el.className.split(" ").slice(0, 2).join(".")
                        : "";
                    return (
                      el.localName +
                      "#" +
                      (el.id || "") +
                      "." +
                      cls +
                      " op=" +
                      cs.opacity +
                      " bg=" +
                      cs.backgroundColor.slice(0, 22) +
                      " tf=" +
                      cs.transform.slice(0, 22)
                    );
                  })
                );
              };
              const vr = view ? view.getBoundingClientRect() : null;
              if (vr) {
                efp(vr.left + vr.width / 2, vr.top + Math.max(10, vr.height * 0.15), "viewTop");
                efp(vr.left + vr.width / 2, vr.top + vr.height / 2, "viewMid");
              }
              const dr0 = dock.getBoundingClientRect();
              efp(dr0.left + dr0.width / 2, dr0.bottom - 20, "dockBottom");

              // z-falsifiers: identical white rects at normal z and at
              // max-ish z. If max-z is bright while normal-z is grey, a
              // high-z overlay is dimming everything beneath it — which
              // also explains every prior "old vs fresh" confusion (the
              // probe strips ALL carry z-index 2147483646 inline).
              const mkZRect = (id, z) => {
                const el = document.createElement("div");
                el.id = id;
                el.style.cssText =
                  "position:relative;width:60px;height:40px;" +
                  "background:#ffffff;flex:none;margin:2px;";
                if (z) el.style.zIndex = String(z);
                dock.appendChild(el);
                return el;
              };
              const wNorm = mkZRect("zt-znorm", 0);
              const wTop = mkZRect("zt-ztop", 2147483646);
              drawSample(wNorm.getBoundingClientRect(), "znorm-white");
              drawSample(wTop.getBoundingClientRect(), "ztop-white");
              // Elevate an existing ink INSIDE the panelview and a real row.
              const ink0 = inkEls[0];
              if (ink0) {
                ink0.style.position = "relative";
                ink0.style.zIndex = "2147483646";
                drawSample(
                  ink0.getBoundingClientRect(),
                  "zview-ink-white"
                );
                ink0.style.zIndex = "";
                ink0.style.position = "";
              }
              const rowEl = dock.querySelector("panelview toolbarbutton");
              if (rowEl) {
                rowEl.style.position = "relative";
                rowEl.style.zIndex = "2147483646";
                const rr = rowEl.getBoundingClientRect();
                drawSample(rr, "zview-row", [
                  ["mid", rr.width / 2, rr.height / 2],
                ]);
                rowEl.style.zIndex = "";
                rowEl.style.position = "";
              }
              window.setTimeout(() => {
                wNorm.remove();
                wTop.remove();
                console.log(LOG, "z-falsifiers done");
              }, 900);

              // Repaint test: force a fresh composite, redraw the inks to
              // reconfirm the dim is time-static.
              if (view) {
                view.style.display = "none";
                void view.getBoundingClientRect();
                view.style.display = "";
              }
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  for (const e of inkEls) {
                    drawSample(e.getBoundingClientRect(), "r-" + e.id);
                  }
                  console.log(LOG, "repaint test done");
                });
              });
            } catch (ex) {
              console.warn(LOG, "repaint test failed:", ex);
            }
            const later = (ms) =>
              window.setTimeout(() => {
                try {
                  const view = dock.querySelector("panelview");
                  const vcs = view ? getComputedStyle(view) : null;
                  console.log(
                    LOG,
                    "later[" + ms + "]",
                    "viewOpacity=" + (vcs ? vcs.opacity : "n/a"),
                    "viewFilter=" + (vcs ? vcs.filter.slice(0, 20) : "n/a"),
                    "viewBlend=" + (vcs ? vcs.mixBlendMode : "n/a"),
                    "viewBackdrop=" + (vcs ? vcs.backdropFilter.slice(0, 20) : "n/a"),
                    "anims=" +
                      (view ? view.getAnimations({ subtree: true }).length : "n/a")
                  );
                  // Decay matrix: same elements every round, labeled t<ms>.
                  const tag = (x) => "t" + ms + (Number.isInteger(ms) ? "" : "") + ":" + x;
                  for (const p of probes) drawSample(p.getBoundingClientRect(), tag(p.id));
                  for (const e of inkEls) drawSample(e.getBoundingClientRect(), tag(e.id));
                  const row2 = dock.querySelector("panelview toolbarbutton");
                  if (row2) {
                    const r2 = row2.getBoundingClientRect();
                    const W2 = Math.max(1, Math.round(r2.width));
                    drawSample(
                      r2,
                      tag("row:" + (row2.id || row2.localName).slice(0, 12)),
                      [["mid", W2 * 0.5, Math.max(1, Math.round(r2.height / 2))]]
                    );
                  }
                } catch (ex) {
                  console.warn(LOG, "diagnosis failed:", ex);
                }
              }, ms);
            later(1000);
            later(4000);
            window.setTimeout(() => observer.disconnect(), 5500);
            // ---------- v2.1.20: overlay hunt ----------
            // The dim behaves like a translucent dark layer ABOVE normal-z
            // content, BELOW z 2147483646, invisible to elementsFromPoint
            // (pointer-events:none). Scan DOM + key Zen pseudos for it.
            const overlayHunt = (tag) => {
              try {
                const hits = [];
                const seen = new Set();
                const describe = (el, cs, pseudo) => {
                  const r = el.getBoundingClientRect();
                  const id = el.id || "";
                  if (seen.has(id + pseudo)) return;
                  seen.add(id + pseudo);
                  let cls = "";
                  if (typeof el.className === "string") {
                    cls = el.className.split(" ").slice(0, 3).join(".");
                  }
                  hits.push(
                    (pseudo || "") +
                      el.localName +
                      "#" +
                      id +
                      "." +
                      cls +
                      " pos=" +
                      cs.position +
                      " z=" +
                      cs.zIndex +
                      " pe=" +
                      cs.pointerEvents +
                      " op=" +
                      cs.opacity +
                      " r=[" +
                      Math.round(r.left) +
                      "," +
                      Math.round(r.top) +
                      " " +
                      Math.round(r.width) +
                      "x" +
                      Math.round(r.height) +
                      "] anim=" +
                      cs.animationName +
                      " bg=" +
                      cs.backgroundColor.slice(0, 26) +
                      " bf=" +
                      cs.backdropFilter.slice(0, 16)
                  );
                };
                for (const el of document.body.querySelectorAll("*")) {
                  if (el.id?.startsWith("zt-")) continue;
                  let cs;
                  try {
                    cs = getComputedStyle(el);
                  } catch (ex) {
                    continue;
                  }
                  if (cs.position === "static") continue;
                  const z = parseInt(cs.zIndex, 10);
                  if (!Number.isFinite(z) || z < 1000) continue;
                  const r = el.getBoundingClientRect();
                  if (r.width < 60 || r.height < 60) continue;
                  describe(el, cs, "");
                }
                // Zen paints window-scale effects on pseudos of its bg hosts;
                // pseudos never appear in elementsFromPoint scans.
                const hosts = [
                  document.getElementById("zen-main-app-wrapper"),
                  document.getElementById("browser"),
                  document.getElementById("zen-appcontent-wrapper"),
                  document.body,
                ].filter(Boolean);
                for (const h of hosts) {
                  for (const ps of ["::before", "::after"]) {
                    const cs = getComputedStyle(h, ps);
                    if (!cs || cs.content === "none") continue;
                    describe(h, cs, ps);
                  }
                }
                console.log(
                  LOG,
                  "overlay[" + tag + "] " + (hits.length ? hits.join(" ; ") : "none found")
                );
              } catch (ex) {
                console.warn(LOG, "overlay hunt failed:", ex);
              }
            };
            overlayHunt("t300");
            window.setTimeout(() => overlayHunt("t4000"), 4000);
          } catch (ex) {
            console.warn(LOG, "diagnosis failed:", ex);
          }
        }, 250);
      } catch (ex) {
        console.warn(LOG, "diagnosis failed:", ex);
      }
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
    cleanupWidgets();
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
