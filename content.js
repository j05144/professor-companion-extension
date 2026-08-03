// Professor Companion — content script.
//
// Sections:
//   1. Settings      — chrome.storage.local persistence (theme, collapsed)
//   2. Sidebar       — fetch Jinge's sidebar.html template, mount in Shadow DOM
//   3. Page scraping — professor name + school selectors
//   4. Detection     — SPA-navigation-aware detection loop (Phase 1.1)
//
// RMP is a single-page app: clicking from one professor to another calls
// history.pushState() and swaps the DOM in place — no page load happens, so
// nothing would re-inject this script. The fix: inject once anywhere on the
// site (see manifest matches), keep a single MutationObserver alive for the
// tab's lifetime, and treat "location.pathname changed" as the signal to
// start a fresh detection pass. The isProfessorPath() gate keeps the
// extension inert everywhere except professor pages.

// ---------- 1. settings (chrome.storage.local) ----------
// Two persisted keys. "auto" is the template's name for "follow the OS
// setting" (what settings UIs usually call "system").

// position.card = {left, top} px of the expanded card (null → the CSS
// default top-right slot); position.tabY = top px of the collapsed tab on
// its right-edge rail (null → CSS default). One key, so card and tab
// positions travel together through storage and the onChanged sync.
const DEFAULT_SETTINGS = {
  theme: "auto",
  collapsed: false,
  position: { card: null, tabY: null },
};

let settings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  // Passing the defaults object to get() merges stored values over it, so
  // missing keys (first run) come back as their defaults — no undefined
  // checks needed anywhere else.
  settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
}

function saveSetting(key, value) {
  settings[key] = value;
  // Fire-and-forget: the in-memory copy above is already correct, and the
  // storage.onChanged listener below keeps other tabs in sync.
  chrome.storage.local.set({ [key]: value });
}

// ---------- 2. sidebar ----------

let sidebarHost = null;  // page-DOM <div> that owns the shadow root
let sidebarRoot = null;  // #pc-root <aside> inside the shadow root
let mountPromise = null; // guards against two concurrent mounts

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

// Mirrors styles.css's bottom-sheet breakpoint. Below it the sidebar is a
// full-width sheet: dragging is disabled and stored positions are ignored.
const bottomSheet = window.matchMedia("(max-width: 900px)");

// The stylesheet only knows data-theme="light|dark", so "auto" is resolved
// here — the template's caption ("Auto matches your device setting") is
// implemented by this line plus the matchMedia listener below.
function resolvedTheme() {
  if (settings.theme === "auto") return prefersDark.matches ? "dark" : "light";
  return settings.theme;
}

// Single writer for settings → DOM. Idempotent, so it's safe to call from
// every path that changes state (clicks, storage sync, OS theme flips).
function applySettingsToSidebar() {
  if (!sidebarRoot) return;
  sidebarRoot.dataset.theme = resolvedTheme();
  sidebarRoot.classList.toggle("pc-collapsed", settings.collapsed);
  for (const btn of sidebarRoot.querySelectorAll("[data-theme-choice]")) {
    btn.classList.toggle("pc-selected", btn.dataset.themeChoice === settings.theme);
  }
  applyPositions();
}

async function mountSidebar() {
  if (mountPromise) return mountPromise;

  mountPromise = (async () => {
    // Settings and both extension files load in parallel. The fetches need
    // the files listed in web_accessible_resources: a content script's
    // fetch runs as the *page's* origin, and pages can only read extension
    // files that the manifest explicitly exposes to them.
    const [, templateHtml, cssText] = await Promise.all([
      loadSettings(),
      fetch(chrome.runtime.getURL("sidebar.html")).then((r) => r.text()),
      fetch(chrome.runtime.getURL("styles.css")).then((r) => r.text()),
    ]);

    // Shadow DOM gives the sidebar its own style scope: RMP's CSS can't
    // reach in, ours can't leak out (styles.css counts on this).
    sidebarHost = document.createElement("div");
    sidebarHost.id = "pc-host";
    const shadow = sidebarHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${cssText}</style>${templateHtml}`;
    sidebarRoot = shadow.getElementById("pc-root");

    wireSidebarControls(shadow);

    // Order matters: stored settings are applied while the host is still
    // detached, so the sidebar's very first paint is already in the right
    // theme and collapse state — no light-mode flash, no expand-then-snap.
    applySettingsToSidebar();
    document.body.append(sidebarHost);

    // If detection already finished before the mount did (likely on a full
    // page load: two fetches lose to a querySelector), backfill the header.
    if (lastLogged && lastLogged.path === location.pathname) {
      updateSidebarIdentity(lastLogged.name, lastLogged.school);
    }
  })();

  return mountPromise;
}

function wireSidebarControls(shadow) {
  const logoUrl = chrome.runtime.getURL("assets/logo.png");
  shadow.getElementById("pc-logo-main").src = logoUrl;
  shadow.getElementById("pc-tab-logo").src = logoUrl;

  const themeMenu = shadow.getElementById("pc-theme-menu");

  shadow.getElementById("pc-theme-btn").addEventListener("click", () => {
    themeMenu.classList.toggle("pc-open");
  });

  for (const btn of themeMenu.querySelectorAll("[data-theme-choice]")) {
    btn.addEventListener("click", () => {
      saveSetting("theme", btn.dataset.themeChoice);
      applySettingsToSidebar();
      themeMenu.classList.remove("pc-open");
    });
  }

  shadow.getElementById("pc-collapse-btn").addEventListener("click", () => {
    saveSetting("collapsed", true);
    applySettingsToSidebar();
  });
  shadow.getElementById("pc-tab").addEventListener("click", () => {
    // A drag that ends on the tab still fires a click — don't expand for it.
    if (suppressNextTabClick) {
      suppressNextTabClick = false;
      return;
    }
    // Deferred so a double-click (reset the tab's slot) can cancel it: the
    // tab disappears the moment it expands, so an immediate expand would
    // swallow the second click of every double-click.
    clearTimeout(pendingTabExpand);
    pendingTabExpand = setTimeout(() => {
      saveSetting("collapsed", false);
      applySettingsToSidebar();
    }, 250);
  });

  // LinkedIn element: if Jinge ever swaps the anchor for a button there's
  // no href to set, so open the stored URL on click — wired once here so
  // repeated detections never stack listeners. Starts hidden either way:
  // it only appears once a detection confirms who we'd be searching for.
  const linkedIn = shadow.getElementById("pc-linkedin");
  if (linkedIn && linkedIn.tagName !== "A") {
    linkedIn.addEventListener("click", () => {
      if (linkedInUrl) window.open(linkedInUrl, "_blank", "noopener,noreferrer");
    });
  }
  hideLinkedInLink();

  wireDragging(shadow);

  // Clicking anywhere else in the sidebar closes the theme menu.
  shadow.addEventListener("click", (event) => {
    if (!event.target.closest("#pc-theme-menu") && !event.target.closest("#pc-theme-btn")) {
      themeMenu.classList.remove("pc-open");
    }
  });
}

// ---------- 2c. LinkedIn lookup ----------
// v1 ships a search URL, not a scraped profile: a Google query scoped to
// linkedin.com/in with the professor's quoted name plus school. (The Google
// CSE one-click top-result version is deferred to v2.)

// Current professor's search URL; null until a detection succeeds. The
// button-variant click handler reads this instead of capturing arguments,
// so one listener wired at mount always opens the CURRENT professor.
let linkedInUrl = null;

function buildLinkedInUrl(name, school) {
  // Assemble the query as ONE plain string first, then encode ONCE —
  // encoding pieces separately and concatenating would double-encode the
  // quotes (%22 → %2522) and break the exact-phrase search.
  const query = `site:linkedin.com/in "${name}" ${school}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function updateLinkedInLink(name, school) {
  if (!sidebarRoot) return;
  const el = sidebarRoot.querySelector("#pc-linkedin");
  if (!el) return;
  linkedInUrl = buildLinkedInUrl(name, school);
  // The template currently ships an <a>, but the element is Jinge's to
  // change — handle either tag. Anchor: a real href (middle-click, copy
  // link, and target/rel all work natively). Button: the click handler
  // wired in wireSidebarControls opens linkedInUrl.
  if (el.tagName === "A") {
    el.href = linkedInUrl;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  }
  // Reveal via inline style, mirroring how hideLinkedInLink hides it.
  el.style.display = "";
}

// Hidden whenever there's no confirmed professor: before first detection,
// during SPA-navigation resets, and when detection times out and gives up
// (never re-shown for that page, since only a success calls update).
// Inline display:none, not the hidden attribute: Jinge's
// ".pc-linkedin { display: flex }" would override the UA's [hidden] rule,
// but nothing outranks an inline style.
function hideLinkedInLink() {
  linkedInUrl = null;
  if (!sidebarRoot) return;
  const el = sidebarRoot.querySelector("#pc-linkedin");
  if (el) el.style.display = "none";
}

// ---------- 2a. dragging ----------

const DRAG_THRESHOLD_PX = 4;   // less movement than this is a click, not a drag
const MIN_VISIBLE_PX = 48;     // how much card must remain on-screen after release
const TAB_EDGE_MARGIN_PX = 8;  // breathing room at the rail's ends

// Set when a tab drag just ended: the browser fires a click on release
// (pointer went down and up on the same element), which must not expand.
let suppressNextTabClick = false;
// Pending single-click expand of the tab (deferred for dblclick detection).
let pendingTabExpand = null;

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Drag feedback is deliberately inline style, not styles.css: it's transient
// interaction state owned by JS, not a designed state Jinge should have to
// model — and half of it must apply OUTSIDE the shadow root anyway, because
// it's the page underneath that keeps trying to select RMP's text while the
// pointer sweeps across it.
function beginDragFeedback() {
  document.documentElement.style.userSelect = "none";
  document.documentElement.style.cursor = "grabbing";
  if (sidebarRoot) sidebarRoot.style.cursor = "grabbing";
}

function endDragFeedback() {
  document.documentElement.style.userSelect = "";
  document.documentElement.style.cursor = "";
  if (sidebarRoot) sidebarRoot.style.cursor = "";
}

// Projects settings.position onto the DOM. Inline styles beat styles.css in
// the cascade, so clearing them (position null, or bottom-sheet mode) hands
// control straight back to Jinge's CSS defaults — that's also all a
// double-click reset has to do.
function applyPositions() {
  if (!sidebarRoot) return;
  const pos = settings.position ?? {};
  const custom = !bottomSheet.matches;

  if (custom && pos.card) {
    sidebarRoot.style.left = `${pos.card.left}px`;
    sidebarRoot.style.top = `${pos.card.top}px`;
    sidebarRoot.style.right = "auto"; // release the CSS "right: 16px" anchor
  } else {
    sidebarRoot.style.left = "";
    sidebarRoot.style.top = "";
    sidebarRoot.style.right = "";
  }

  const tab = sidebarRoot.querySelector("#pc-tab");
  if (custom && typeof pos.tabY === "number") {
    tab.style.top = `${pos.tabY}px`;
  } else {
    tab.style.top = "";
  }
}

function wireDragging(shadow) {
  const header = shadow.querySelector(".pc-header");
  const tab = shadow.getElementById("pc-tab");

  header.addEventListener("pointerdown", (event) => {
    if (bottomSheet.matches || event.button !== 0) return;
    // The header hosts the theme/star/collapse buttons and the theme menu;
    // drags must not start from any of them.
    if (event.target.closest(".pc-iconbtn") || event.target.closest("#pc-theme-menu")) return;

    // The card's rect is the visual truth no matter where the current
    // position came from (CSS right-anchor or stored inline left/top).
    const rect = sidebarRoot.querySelector("#pc-card").getBoundingClientRect();
    startDrag(header, event, (dx, dy, done) => {
      if (done) {
        // Clamp on release only — free movement feels right mid-drag. Keep
        // at least MIN_VISIBLE_PX of the card in the viewport horizontally,
        // and never let the header (the only drag handle!) escape the top.
        const card = {
          left: clampNumber(rect.left + dx, MIN_VISIBLE_PX - rect.width, window.innerWidth - MIN_VISIBLE_PX),
          top: clampNumber(rect.top + dy, 0, window.innerHeight - MIN_VISIBLE_PX),
        };
        saveSetting("position", { ...settings.position, card });
        applyPositions();
      } else {
        sidebarRoot.style.left = `${rect.left + dx}px`;
        sidebarRoot.style.top = `${rect.top + dy}px`;
        sidebarRoot.style.right = "auto";
      }
    });
  });

  header.addEventListener("dblclick", (event) => {
    if (event.target.closest(".pc-iconbtn") || event.target.closest("#pc-theme-menu")) return;
    saveSetting("position", { ...settings.position, card: null });
    applyPositions();
  });

  tab.addEventListener("pointerdown", (event) => {
    if (bottomSheet.matches || event.button !== 0) return;
    const rect = tab.getBoundingClientRect();
    startDrag(tab, event, (dx, dy, done) => {
      // Vertical rail: dx is ignored and the CSS "right: 0" dock never moves.
      // Clamped live — a rail with hard stops reads better than free flight.
      const top = clampNumber(
        rect.top + dy,
        TAB_EDGE_MARGIN_PX,
        window.innerHeight - rect.height - TAB_EDGE_MARGIN_PX
      );
      if (done) {
        suppressNextTabClick = true;
        saveSetting("position", { ...settings.position, tabY: top });
        applyPositions();
      } else {
        tab.style.top = `${top}px`;
      }
    });
  });

  tab.addEventListener("dblclick", () => {
    clearTimeout(pendingTabExpand); // this was a reset, not an expand
    saveSetting("position", { ...settings.position, tabY: null });
    applyPositions();
  });
}

// Shared drag engine. Calls apply(dx, dy, done=false) on every move past the
// threshold, then once more with done=true on release. setPointerCapture
// routes all further pointer events to the handle even when the pointer
// outruns the element mid-drag — no document-level listeners needed, and
// nothing leaks: every path through onEnd removes all three listeners.
function startDrag(handle, downEvent, apply) {
  const startX = downEvent.clientX;
  const startY = downEvent.clientY;
  let moved = false;

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return; // still just a click
      moved = true;
      beginDragFeedback();
    }
    apply(dx, dy, false);
  };

  const onEnd = (ev) => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onEnd);
    handle.removeEventListener("pointercancel", onEnd);
    if (!moved) return;
    endDragFeedback();
    apply(ev.clientX - startX, ev.clientY - startY, true);
  };

  handle.setPointerCapture(downEvent.pointerId);
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onEnd);
  handle.addEventListener("pointercancel", onEnd);
  downEvent.preventDefault(); // keep the browser from starting a text selection
}

// Show on professor pages, hide (not unmount) everywhere else — remounting
// on every navigation would refetch the template for nothing.
function syncSidebarToPath(onProfessorPage) {
  if (onProfessorPage) {
    if (sidebarHost) {
      sidebarHost.hidden = false;
    } else {
      mountSidebar().catch((err) => {
        console.warn(`Professor Companion: sidebar failed to mount — ${err.message}`);
      });
    }
  } else if (sidebarHost) {
    sidebarHost.hidden = true;
  }
}

function updateSidebarIdentity(name, school) {
  if (!sidebarRoot) return;
  sidebarRoot.querySelector("#pc-name").textContent = name;
  sidebarRoot.querySelector("#pc-school").textContent = school;
  // Identity-derived, so it rides identity updates: every successful
  // detection (including the mount backfill) refreshes the LinkedIn URL.
  updateLinkedInLink(name, school);
}

// Between professors (SPA navigation) the header would otherwise keep
// showing the previous professor while the new one loads.
function resetSidebarIdentity() {
  if (!sidebarRoot) return;
  sidebarRoot.querySelector("#pc-name").textContent = "Loading…";
  sidebarRoot.querySelector("#pc-school").textContent = "";
  // No confirmed professor during the transition — hide rather than leave
  // a link that would search for the professor we just left.
  hideLinkedInLink();
}

// OS theme flipped while we're in "auto": re-resolve.
prefersDark.addEventListener("change", () => {
  if (settings.theme === "auto") applySettingsToSidebar();
});

// Crossing the bottom-sheet breakpoint (resize/zoom): stored positions must
// switch off below it and come back above it — applyPositions handles both
// directions by clearing or re-setting the inline styles.
bottomSheet.addEventListener("change", () => applyPositions());

// A setting changed in another context — a second RMP tab, or the popup one
// day. Mirror it here so every tab agrees. (This also fires in the tab that
// made the change; applySettingsToSidebar is idempotent, so that's fine.)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let touched = false;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in changes) {
      settings[key] = changes[key].newValue;
      touched = true;
    }
  }
  if (touched) applySettingsToSidebar();
});

// ---------- 2b. Reddit results → sidebar ----------
// fetchRedditThreads comes from reddit.js, which the manifest loads into
// this same isolated world just before content.js.

const MAX_POSTS = 10; // #pc-posts is getting a scrollable body (Jinge), so more fit

// Guards against out-of-order responses on SPA navigation: each search takes
// a ticket, and only the holder of the LATEST ticket may touch the DOM.
// Navigating anywhere (new professor or off professor pages) bumps the
// counter, so a slow response for the previous professor is silently dropped
// instead of rendering under the wrong name.
let redditRequestId = 0;

async function startRedditSearch(name, school, professorId, schoolId) {
  const requestId = ++redditRequestId;
  // Render only while BOTH hold: we are the newest search (the ticket orders
  // our own requests) and the URL still shows the professor this search was
  // keyed to (the ID pins the result to the page, whatever else happened).
  const stillCurrent = () =>
    requestId === redditRequestId && professorIdFrom(location.pathname) === professorId;
  try {
    // On a cold page load, detection (a querySelector) usually beats the
    // sidebar mount (two fetches + storage). Join the mount rather than
    // racing it — mountSidebar is a singleton promise, so this never
    // triggers a second mount.
    await mountSidebar();
    if (!stillCurrent()) return;
    showSearching();

    const threads = await fetchRedditThreads(name, school, schoolId);
    if (!stillCurrent()) return;

    if (threads.length > 0) {
      showResults(threads.slice(0, MAX_POSTS));
    } else {
      showEmpty(name, school, { failed: false });
    }
  } catch (err) {
    if (!stillCurrent()) return;
    console.warn(`Professor Companion: Reddit search failed — ${err.message}`);
    // Failure wears the same empty card, but the "Search Reddit" link below
    // still gives the user a manual path to the data we couldn't fetch.
    showEmpty(name, school, { failed: true });
  }
}

// Jinge's show-more toggle is pure CSS: a hidden checkbox (#pc-showmore-check)
// plus a label (.pc-showmore) whose visibility and exact "Show N more" text
// are computed by :has() selectors in styles.css. JS must not duplicate any
// of that — its one job is this reset: the checkbox keeps its checked state
// across renders, so without it a new professor would inherit the previous
// professor's expanded view instead of starting collapsed at 2 posts.
function resetShowMore() {
  const check = sidebarRoot.querySelector("#pc-showmore-check");
  if (check) check.checked = false;
}

function showSearching() {
  if (!sidebarRoot) return;
  sidebarRoot.dataset.state = "loading";
  sidebarRoot.querySelector("#pc-posts").replaceChildren();
  resetShowMore();
  sidebarRoot.querySelector("#pc-count-label").textContent = "Reddit mentions · searching…";
}

function showResults(threads) {
  if (!sidebarRoot) return;
  const posts = sidebarRoot.querySelector("#pc-posts");
  posts.replaceChildren();
  for (const thread of threads) {
    posts.append(buildPostCard(thread));
  }
  sidebarRoot.querySelector("#pc-count-label").textContent = `Reddit mentions · ${threads.length}`;
  sidebarRoot.dataset.state = "loaded";
}

function showEmpty(name, school, { failed }) {
  if (!sidebarRoot) return;
  sidebarRoot.querySelector("#pc-posts").replaceChildren();
  sidebarRoot.querySelector("#pc-count-label").textContent = failed
    ? "Reddit mentions · unavailable"
    : "Reddit mentions · 0";
  // Same query our sitewide search uses, as a reddit.com URL the user can
  // open themselves — set in both the zero-results and failure cases.
  // Degrades when detection never confirmed a name (timeout give-up):
  // fall back to Reddit's plain search page rather than a stale query.
  const query = name ? encodeURIComponent(`"${name}"${school ? ` ${school}` : ""}`) : "";
  sidebarRoot.querySelector("#pc-empty-search").href = query
    ? `https://www.reddit.com/search/?q=${query}`
    : "https://www.reddit.com/search/";
  sidebarRoot.dataset.state = "empty";
}

// Every piece of Reddit text lands via textContent, never innerHTML: titles
// and snippets are untrusted input, and textContent is written into the DOM
// as a text node — it can't be parsed as markup, so injection is impossible
// by construction rather than by escaping discipline.
function buildPostCard(thread) {
  const card = document.createElement("a");
  card.className = "pc-post";
  // Belt and braces: reddit.js builds these hrefs itself, but external data
  // never goes into an anchor without a scheme check.
  card.href = thread.url.startsWith("https://") ? thread.url : "https://www.reddit.com/";
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const meta = document.createElement("div");
  meta.className = "pc-meta";
  meta.textContent = `r/${thread.subreddit} · ${formatAge(thread.date)} · ▲ ${formatCount(thread.upvotes)}`;
  card.append(meta);

  const title = document.createElement("div");
  title.className = "pc-title";
  title.textContent = thread.title;
  card.append(title);

  // Link posts have no body text — skip the quote element entirely.
  if (thread.snippet) {
    const quote = document.createElement("div");
    quote.className = "pc-quote";
    quote.textContent = `“${thread.snippet}”`;
    card.append(quote);
  }

  return card;
}

// "YYYY-MM-DD" → "2y ago" / "5mo ago" / "12d ago" / "today".
function formatAge(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// 12 → "12", 4302 → "4.3k".
function formatCount(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

// Called when the URL path changes to a (new) professor page: back to
// skeletons, wipe the previous professor's cards so results never bleed
// across, and orphan any in-flight search.
function resetSidebarForNavigation() {
  redditRequestId++;
  resetSidebarIdentity();
  showSearching();
}

// ---------- 3. page scraping ----------
// RMP is built with styled-components, so class names look like
// "NameTitle__Name-dowf0z-0 cbZBiP". The hash parts change whenever RMP
// redeploys, but the "NameTitle__Name" prefix is stable — so all selectors
// match on the prefix with [class*="..."] instead of the full class name.

function getNameFromDom() {
  // <div class="NameTitle__Name-..."><h1>First <span>Last</span></h1></div>
  const el = document.querySelector('[class*="NameTitle__Name"]');
  if (!el) return null;
  // textContent flattens the first/last-name nodes; collapse the stray
  // whitespace React leaves between them.
  const name = el.textContent.replace(/\s+/g, " ").trim();
  return name || null;
}

function getSchoolFromDom() {
  // The header line is "Professor in the <dept> at <school>", where the
  // school is the only link in that block pointing at a /school/ URL.
  const link = document.querySelector('[class*="NameTitle__Title"] a[href^="/school"]');
  if (!link) return null;
  const school = link.textContent.replace(/\s+/g, " ").trim();
  return school || null;
}

// RMP's numeric school ID, read from the same link's href ("/school/231").
// The ID is the dependable key for subreddit mapping: display names vary
// ("CUNY Queens College" vs "Queens College") and some campuses have several
// school records, but the ID in the URL is exact. Null when the link is
// absent — the title fallback below has no ID to offer.
function getSchoolIdFromDom() {
  const link = document.querySelector('[class*="NameTitle__Title"] a[href^="/school"]');
  const match = link?.getAttribute("href").match(/^\/school\/(\d+)/);
  return match ? match[1] : null;
}

function getFromPageTitle() {
  // Fallback if RMP renames its CSS classes: the tab title is
  // "First Last at School Name | Rate My Professors".
  const match = document.title.match(/^(.+?) at (.+?) \| Rate My Professors/);
  return match ? { name: match[1].trim(), school: match[2].trim() } : null;
}

// ---------- 4. navigation-aware detection ----------

const DETECTION_TIMEOUT_MS = 15000;

// "/professor/2302328" → "2302328"; anything else → null. The ID is the
// page's identity: detection passes and Reddit searches are keyed to it, so
// nothing read or fetched for one professor can ever render under another.
function professorIdFrom(pathname) {
  const match = pathname.match(/^\/professor\/(\d+)/);
  return match ? match[1] : null;
}

function isProfessorPath(pathname) {
  return professorIdFrom(pathname) !== null;
}

let watchedPath = null;        // pathname we most recently saw in the URL bar
let awaitingDetection = false; // a detection pass is in progress
let timeoutId = null;
let lastLogged = null;         // { path, professorId, name, school } of the last success
let navSnapshot = null;        // { initial, title, name } captured as each pass begins

function beginDetectionPass(isInitial) {
  awaitingDetection = true;
  // Snapshot what's on screen right now. On an SPA navigation that's the
  // page we came FROM — React hasn't re-rendered yet — so no DOM or title
  // read is trusted until it differs from this snapshot.
  navSnapshot = {
    initial: isInitial,
    title: document.title,
    name: getNameFromDom(),
  };
  clearTimeout(timeoutId);
  timeoutId = setTimeout(onDetectionTimeout, DETECTION_TIMEOUT_MS);
  attemptDetection();
}

function cancelDetectionPass() {
  awaitingDetection = false;
  clearTimeout(timeoutId);
}

function attemptDetection() {
  if (!awaitingDetection) return;

  const professorId = professorIdFrom(watchedPath);

  // DOM reads are trusted as-is on the initial pass (the served HTML belongs
  // to this URL). After an SPA navigation the header on screen is the
  // PREVIOUS page's until React re-renders, so nothing counts until the NAME
  // differs from the navigation-time snapshot. The name is the gate — the
  // school can legitimately stay identical when browsing within one school,
  // and a school read alongside a stale name is equally stale.
  let name = getNameFromDom();
  let school = getSchoolFromDom();
  // The ID comes from the same link as the school name, so it passes or
  // fails the staleness gate with it — never carry the previous page's ID.
  let schoolId = getSchoolIdFromDom();
  if (!navSnapshot.initial && name !== null && name === navSnapshot.name) {
    name = null;
    school = null;
    schoolId = null;
  }

  // Title fallback, hardened: getFromPageTitle already requires the
  // "X at Y | Rate My Professors" pattern, but after an SPA navigation the
  // title must ALSO have changed since navigation began — the old page's
  // title matching the pattern is exactly the "Search professors" bug.
  if ((!name || !school) && (navSnapshot.initial || document.title !== navSnapshot.title)) {
    const fromTitle = getFromPageTitle();
    if (fromTitle) {
      name = name || fromTitle.name;
      school = school || fromTitle.school;
    }
  }

  if (!name || !school) return; // not confirmable yet; the observer retries

  console.log(`Detected: ${name}, ${school}`);
  lastLogged = { path: watchedPath, professorId, name, school, schoolId };
  updateSidebarIdentity(name, school);
  // schoolId may be null (title-fallback path); reddit.js then falls back to
  // its name-based lookup rather than skipping the campus search.
  startRedditSearch(name, school, professorId, schoolId);
  cancelDetectionPass();
}

function onDetectionTimeout() {
  if (!awaitingDetection) return;
  awaitingDetection = false;
  // Give up rather than force-accept: a read that still can't clear the
  // staleness gates after 15 seconds is more likely wrong than late. The
  // empty card keeps the manual search link as an escape hatch — and even
  // that only borrows the DOM's name if it clears the same staleness gate,
  // so the link can't search for the previous page's professor.
  console.warn("Professor Companion: could not confirm professor info — giving up.");
  let name = getNameFromDom();
  if (!navSnapshot.initial && name === navSnapshot.name) name = null;
  showEmpty(name, getSchoolFromDom(), { failed: true });
}

// Runs on every DOM mutation batch (and on popstate). Cheap when idle: a
// single string compare; the querySelector calls only happen while a
// detection pass is actually pending.
function check() {
  const path = location.pathname;
  if (path !== watchedPath) {
    // First run ever = the script was just injected, so the DOM genuinely
    // belongs to this URL; every later path change is an SPA navigation
    // where the on-screen content still belongs to the previous page.
    const isInitial = watchedPath === null;
    watchedPath = path;
    const onProfessorPage = isProfessorPath(path);
    syncSidebarToPath(onProfessorPage);
    if (onProfessorPage) {
      resetSidebarForNavigation();
      beginDetectionPass(isInitial);
    } else {
      redditRequestId++; // orphan any in-flight search for the page we left
      cancelDetectionPass();
    }
  } else if (awaitingDetection) {
    attemptDetection();
  }
}

// Why watch the DOM instead of the URL? A content script lives in an
// isolated world, so it can't intercept the page's history.pushState calls,
// and the popstate event only fires for back/forward — not for normal link
// clicks in an SPA. But every client-side navigation mutates the DOM, and
// new content arriving is also exactly the moment detection can succeed —
// so one observer covers both "the URL changed" and "the content showed up".
const observer = new MutationObserver(check);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", check);

check();
