# Phase 1 Notes — Detection Foundations

Concept explanations for Phase 1 (professor detection, console-log only) and the
Phase 1.1 follow-up (surviving client-side navigation). Written to be
interview-ready: each section explains not just *what* the code does, but *why*
that approach was chosen over the alternatives.

**Current state:** the extension detects the professor's name and school on any
Rate My Professors professor page — including when you reach one via RMP's
client-side navigation — and logs `Detected: [Name], [School]` to the console.
No UI yet.

---

## The manifest, field by field

`manifest.json` is the extension's contract with Chrome: what it's called, what
it's allowed to do, and what code runs where.

- **`manifest_version: 3`** — tells Chrome which extension platform rules
  apply. MV3 is the current generation; its headline changes from MV2 are that
  background pages became service workers and remotely hosted code is banned.
- **`name` / `version` / `description`** — store-listing metadata. `version`
  matters practically: Chrome uses it to decide whether an update should be
  installed. (Bumped to 1.1.0 with the navigation fix.)
- **`permissions: ["activeTab"]`** — API capabilities the extension requests.
  `activeTab` grants temporary access to whatever tab the user is on, but only
  when they deliberately invoke the extension (like clicking its icon). Not
  used yet, but harmless and useful later for the popup.
- **`content_scripts`** — declares JS/CSS Chrome should auto-inject into
  matching pages. The `matches` array uses Chrome's match-pattern format
  (`scheme://host/path`); the `*.` host prefix in
  `https://*.ratemyprofessors.com/*` covers both the bare domain and `www.`.
  `run_at: "document_idle"` says "inject after the DOM is basically ready" —
  it's the default, but stating it explicitly makes the injection timing part
  of the story.
- **`action`** — defines the toolbar button; `default_popup` is the HTML page
  that opens when it's clicked.
- **`host_permissions` (deliberately absent)** — a common point of confusion,
  and a good interview flex: a content script declared in the manifest gets its
  page access *from its own `matches` patterns*. `host_permissions` is for
  programmatic access — `fetch()`ing a site from the background script, or
  injecting scripts dynamically with `chrome.scripting`. Since we do neither
  yet, including it would just violate least-privilege. When a later phase
  fetches external data (e.g., Google Scholar), *that* origin gets added here.

### Why `matches` is site-wide, not `/professor/*`

Phase 1 originally matched only `https://www.ratemyprofessors.com/professor/*`.
That failed in practice because Chrome evaluates `matches` **only at page-load
time** — and RMP is a single-page app. Land on the homepage or search results
and click through to a professor, and no page load ever happens on a
`/professor/*` URL, so the content script was **never injected at all**.

The fix: inject once into any RMP tab, and enforce "professor pages only" in
code with a `location.pathname.startsWith("/professor/")` gate. The rule didn't
disappear — it moved from the manifest into JavaScript, because the manifest
can't express "when the URL *becomes* a professor page" and JavaScript can.

---

## Content script vs. background script

They differ in **where they run** and therefore **what they can touch**.

A **content script** runs *inside a web page* — one copy per matching tab. It
can read and modify that page's DOM, which is why detection lives there: the
professor's name only exists inside the page. But it's sandboxed in an
**isolated world**: it shares the DOM with RMP's own JavaScript but not
variables or functions, and it only gets a small slice of the `chrome.*` APIs.

A **background script** (a *service worker* in MV3) runs in the extension's own
context, independent of any tab. It has no DOM and can't see any web page
directly, but it gets the full extension API surface — cross-origin network
requests, storage, alarms, tab management. Crucially, it's event-driven: Chrome
starts it when an event fires and kills it when idle, so it can't hold
long-lived state in variables.

The classic architecture this project will grow into: the content script is the
*eyes and hands* on the page (scrape the name, later inject UI), the background
worker is the *brains and network* (fetch external data the page's origin
wouldn't allow), and they talk via message passing
(`chrome.runtime.sendMessage`). Right now `background.js` is empty because
nothing is needed outside the page.

---

## How detection works

### Reading the page — three layers, most to least precise

1. **Finding the name.** RMP is built with *styled-components*, a React library
   that generates class names like `NameTitle__Name-dowf0z-0 cbZBiP`. The hash
   parts (`dowf0z-0`, `cbZBiP`) are build artifacts that change whenever RMP
   redeploys — hardcoding them would break silently within weeks. But the
   prefix comes from the component's name in RMP's source code, which is
   stable. So the code uses a CSS *attribute substring selector*:
   `document.querySelector('[class*="NameTitle__Name"]')` — "any element whose
   class attribute contains this string." Then `.textContent` flattens the
   nested first/last-name nodes into one string, and
   `.replace(/\s+/g, " ").trim()` collapses the stray whitespace React leaves
   between them.

2. **Finding the school.** The header line reads "Professor in the
   *&lt;department&gt;* at *&lt;school&gt;*" — two links. Rather than guessing
   by position, select by *meaning*:
   `'[class*="NameTitle__Title"] a[href^="/school"]'` — the link inside the
   title block whose URL starts with `/school`. Only the school link can match
   that, so a layout reshuffle won't grab the department by mistake.

3. **Fallback.** If RMP ever renames those components entirely, the `<title>`
   tag follows a stable pattern — `Jane Doe at Some University | Rate My
   Professors` — so a regex (`/^(.+?) at (.+?) \| Rate My Professors/`)
   recovers both values from it.

*(Selectors were verified against a live professor page, not guessed.)*

### Waiting for dynamic content

RMP pages are server-rendered, so at `document_idle` the content is *usually*
already there and the first attempt succeeds immediately. But it's a React app,
and content can appear late (client-side hydration, slow connections). Instead
of the naive fixes — a `setTimeout` guess (fails on slow networks, wastes time
on fast ones) or polling — the code uses a **`MutationObserver`**: a browser
API that runs a callback whenever the observed DOM subtree changes. Try once
immediately; if that fails, each DOM change triggers a retry until detection
succeeds. A 15-second timeout stops a pass on pages where detection can never
succeed (e.g., a deleted profile).

> Interview soundbite: *"I don't guess when the content arrives — the browser
> tells me the moment the DOM changes, and I stop listening as soon as I've
> found it."*

---

## Surviving client-side navigation (Phase 1.1)

### The problem was actually two problems

1. **Professor → professor:** RMP swaps content with `history.pushState()` — no
   page load, so Chrome never re-injects the script, and the original script
   had stopped its observer after the first success.
2. **Search → professor:** with `/professor/*`-only matching, the script was
   never injected in the first place (see the manifest section above). A script
   that isn't in the tab can't detect anything, no matter how clever it is.

Problem 2 dictates the architecture: the script must already be present
*before* the user reaches a professor page.

### The design: one persistent observer + a small state machine

- **`check()`** runs on every DOM mutation batch. It compares
  `location.pathname` to the last path it saw. Path changed to `/professor/…` →
  start a fresh detection pass. Path changed to anything else → cancel any
  pending pass and go idle. Path unchanged while a pass is pending → retry
  detection. When idle, `check()` is just one string compare — the
  `querySelector` calls only happen mid-pass, so leaving the observer alive
  forever costs effectively nothing.
- The **observer never disconnects** (the core change — before, it disconnected
  after the first success, which is exactly why F5 was needed). Only the
  per-navigation *timeout* gets reset.
- **Staleness guard** — the subtle bug this refactor had to dodge: right after
  a client-side navigation, the URL already shows professor B while React is
  still rendering professor A during the data fetch. Detect too eagerly and
  you'd log *A's name under B's URL*. So if a pass reads exactly the
  name+school last logged but the path is different, the code assumes it's the
  old page still on screen and keeps waiting for the re-render. The timeout
  handler force-logs whatever is there after 15s, which covers the one
  legitimate collision (two consecutive profiles with identical name *and*
  school — usually duplicate RMP profiles).

### How does the script notice the URL changed at all?

A content script runs in an isolated world, so it **cannot intercept RMP's
`history.pushState` calls** (patching `history` in the isolated world doesn't
affect the page's copy), and the `popstate` event only fires for back/forward —
not for normal link clicks in an SPA. But every client-side navigation *always*
mutates the DOM — so "DOM changed → is the path different?" catches every
navigation mechanism (pushState, replaceState, back/forward) with zero new
machinery. A `popstate` listener is kept as a one-line belt-and-braces for
back/forward.

### Why not `chrome.webNavigation.onHistoryStateUpdated`?

It works, but every part of it adds a failure mode, and it still doesn't remove
the need for the DOM observer:

- It requires a new `webNavigation` permission (an extra install warning), a
  live background service worker, and `chrome.tabs.sendMessage` plumbing.
- The messaging introduces real races: the event can fire before the content
  script exists in that tab, and after reloading the extension during
  development, old tabs hold orphaned content scripts that can no longer
  receive messages. All of that needs error handling.
- **The punchline:** even with perfect URL-change events, the new professor's
  DOM isn't there yet when the event fires — you still need the
  MutationObserver to wait for content. So the background route adds
  permissions, a process, and message-passing races, to deliver a signal the
  observer already provides for free.

> Interview soundbite: *"URL-change events tell you a navigation started; what
> I actually need to know is when the new content exists. One MutationObserver
> answers both questions, entirely inside the page, with no extra permissions."*

---

## Manual test checklist

After reloading the extension in `chrome://extensions` (and refreshing any open
RMP tabs — reloading an extension orphans its old content scripts):

1. Load a professor page directly → one `Detected:` log.
2. From that page, click a "Similar Professors" card → new log for the new
   professor, no F5.
3. Start from the homepage, search, click a professor → log appears (this never
   worked before Phase 1.1).
4. Press Back to return to the previous professor → new log.
5. Sit on a search page → no logs at all (the pathname gate).

Quirk to expect: DevTools may clear the console display on SPA navigation —
enable **Preserve log** in the console settings to see the history of
detections while clicking around.
