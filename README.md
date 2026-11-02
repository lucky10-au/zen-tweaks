# Zen Tweaks

A [Sine](https://github.com/CosmoCreeper/Sine) mod for the [Zen Browser](https://zen-browser.app) with a small set of quality-of-life tweaks, each individually togglable in **Zen Settings → Sine Mods → Zen Tweaks → ⚙️**.

## What it does

- **⌘W closes the URL bar** — when the URL bar is focused or open, Cmd+W closes the bar instead of the tab behind it. Handles both the direct keydown and macOS's reserved native-menu accelerator route for `BrowserCommands.closeTabOrWindow`. If the URL bar isn't active, Cmd+W behaves normally.
- **Toasts disappear after 5 seconds** — corner toasts ("Link copied to clipboard", etc.) fade out after 5 s instead of sticking around. (Zen's auto-hide was being skipped by the `ui.popup.disable_autohide` pref; the tweak restores auto-hiding and sets a 5 s timeout.)
- **Better URL bar suggestions** — enables adaptive-history autofill (completes the deep pages you visit often, not just homepages) and widens the dropdown to 15 results so history isn't crowded out by search suggestions.
- **Collapsed sidebar CSS** — hides the workspace "three dots" options button in collapsed sidebar mode and dims the space icon on hover. Always on (pure CSS, no toggle).

Every JS tweak has an on/off checkbox in the mod's settings panel; changes apply immediately, no restart needed.

## Install

Sine → Marketplace or paste the repo URL: `https://github.com/lucky10-au/zen-tweaks`

Turn on **"Allow running JavaScript from unofficial mods"** in Zen Settings → Sine Mods (required, since this isn't a store mod). Restart Zen after installing.

## Files

```
theme.json             Sine mod manifest (scripts, style, preferences pointer)
chrome.css             Collapsed sidebar tweaks
JS/close-urlbar.uc.js  Cmd+W closes the URL bar
JS/toast-timeout.uc.js Toast auto-hide after 5 s
JS/urlbar-tweaks.uc.js Adaptive URL bar autofill + 15 results
preferences.json       Per-tweak checkboxes for Sine's settings panel
```
