# Phase 2 Notes — Sidebar Frontend

Explanations for Phase 2 (the sidebar's HTML template and stylesheet). Same
idea as phase1-notes: not just what the code does, but why we did it that way.

**Current state:** `sidebar.html` and `styles.css` contain the complete sidebar
UI — loading, loaded, and empty states, collapse, and light/dark/auto themes.
Wireframes are in `/mockups`. The sidebar is not injected into RMP pages yet;
that wiring is the next step in content.js.

---

## Why sidebar.html is its own file

The sidebar's HTML could have been built inside content.js with JavaScript.
We made it a separate file instead:

- **Clean ownership.** Our team rule is never edit the same file. I own the
  structure and styling, Antony owns the behavior. He fetches sidebar.html and
  only touches the elements marked with a `js hook` comment.
- **Easier to read.** HTML in an HTML file reads like a document. The same
  thing written in JavaScript is much harder to review and change.

The one cost: sidebar.html has to be listed under `web_accessible_resources`
in manifest.json, otherwise Chrome won't let the content script fetch it.

## The states are controlled by CSS, not JavaScript

The sidebar has three states: loading, loaded, empty. Instead of JavaScript
manually showing and hiding each element, the root carries one attribute:

```html
<aside id="pc-root" data-state="loading">
```

and styles.css decides what's visible in each state, for example:

```css
#pc-root[data-state="loaded"] .pc-skeletons { display: none; }
```

So JavaScript changes states with one line (`root.dataset.state = "loaded"`)
and the CSS handles the rest. The screen can never end up half in one state
and half in another, because everything follows that single attribute.
Collapse works the same way (a `.pc-collapsed` class) and so does theming
(`data-theme="dark"`).

Interview version: "JS says which state we're in, CSS says what each state
looks like."

## Themes are just variable swaps

Every color is defined once as a CSS variable at the top of the file (like
`--pc-bg` for background). Dark mode is a second block that swaps those
variable values. Nothing else in the stylesheet mentions actual colors, so
light and dark can't drift out of sync. "Auto" mode has no CSS at all:
content.js checks the device setting (`prefers-color-scheme`) and sets the
theme attribute. The user's choice gets saved in `chrome.storage`, not
localStorage, because a content script's localStorage is shared with the RMP
page itself.

## Decisions made for Shadow DOM

The sidebar will live inside a Shadow DOM so RMP's styles can't mess with our
card and ours can't leak into their page. Two things in styles.css exist
because of that:

- **`all: initial` on the root.** Shadow DOM blocks outside CSS rules, but
  inherited things like fonts and text color still seep through. This line
  cuts that off so the card looks the same on any page.
- **Every rule starts with `#pc-root`.** No generic selectors like `button`,
  so our styles can't accidentally hit RMP's buttons.

One limitation we found: custom fonts (`@font-face`) don't load inside a
shadow root. So the font stack tries DM Sans but falls back to the system
font. Properly bundling DM Sans with the extension is a later polish task.

Also, the sidebar's `z-index` is set near the browser maximum — the standard
trick so the host page can't stack anything on top of an extension overlay.

## Skeletons instead of a spinner

While Reddit results load, we show gray placeholder cards with a shimmer
instead of a spinner. A skeleton previews the shape of what's coming, so
nothing jumps when the real cards appear, and the wait feels shorter. The
name and school never skeleton — they come from the page itself (Phase 1
detection) and are instant, while Reddit is a network call that might be slow
or fail. Showing the name immediately confirms "we found the right professor"
even before results arrive.

Both animations (shimmer, slide-in) turn off automatically for users with the
reduced-motion setting on, and every clickable element has a visible keyboard
focus outline. Basic accessibility floor.

## The contract with renderSidebar(posts)

sidebar.html includes a comment showing the exact card structure Antony's
render function should generate per Reddit post (link, meta line, title,
quote). Phase 2 feeds it fake hardcoded posts; Phase 3 swaps in the real
Reddit API response and nothing about the template or styles changes. Every
external link opens in a new tab with `rel="noopener"`, so the user never
loses the RMP page.

---

## Manual test checklist (no extension needed)

`test-preview.html` (gitignored — personal QA tool, not part of the
extension) loads the real styles.css with buttons to force each state:

1. Loading → two shimmering skeleton cards, name/school already visible.
2. Loaded → post cards show; hover turns the border blue; links open new tabs.
3. Empty → "0 found" plus the "No discussions found yet" card; LinkedIn button
   still there (it doesn't depend on Reddit).
4. Dark theme → everything swaps, nothing stays light by accident.
5. Toggle collapsed → card hides, floating tab appears at the right edge,
   clicking it brings the card back.
6. Reduced-motion on → no shimmer, no slide-in.