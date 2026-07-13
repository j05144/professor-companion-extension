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

const DEFAULT_SETTINGS = { theme: "auto", collapsed: false };

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
    saveSetting("collapsed", false);
    applySettingsToSidebar();
  });

  // Clicking anywhere else in the sidebar closes the theme menu.
  shadow.addEventListener("click", (event) => {
    if (!event.target.closest("#pc-theme-menu") && !event.target.closest("#pc-theme-btn")) {
      themeMenu.classList.remove("pc-open");
    }
  });
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

function initialsFrom(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "··";
}

function updateSidebarIdentity(name, school) {
  if (!sidebarRoot) return;
  sidebarRoot.querySelector("#pc-name").textContent = name;
  sidebarRoot.querySelector("#pc-school").textContent = school;
  const initials = initialsFrom(name);
  sidebarRoot.querySelector("#pc-initials").textContent = initials;
  sidebarRoot.querySelector("#pc-tab-initials").textContent = initials;
}

// Between professors (SPA navigation) the header would otherwise keep
// showing the previous professor while the new one loads.
function resetSidebarIdentity() {
  if (!sidebarRoot) return;
  sidebarRoot.querySelector("#pc-name").textContent = "Loading…";
  sidebarRoot.querySelector("#pc-school").textContent = "";
  sidebarRoot.querySelector("#pc-initials").textContent = "··";
  sidebarRoot.querySelector("#pc-tab-initials").textContent = "··";
}

// OS theme flipped while we're in "auto": re-resolve.
prefersDark.addEventListener("change", () => {
  if (settings.theme === "auto") applySettingsToSidebar();
});

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

const MAX_POSTS = 6;

// Guards against out-of-order responses on SPA navigation: each search takes
// a ticket, and only the holder of the LATEST ticket may touch the DOM.
// Navigating anywhere (new professor or off professor pages) bumps the
// counter, so a slow response for the previous professor is silently dropped
// instead of rendering under the wrong name.
let redditRequestId = 0;

async function startRedditSearch(name, school) {
  const requestId = ++redditRequestId;
  try {
    // On a cold page load, detection (a querySelector) usually beats the
    // sidebar mount (two fetches + storage). Join the mount rather than
    // racing it — mountSidebar is a singleton promise, so this never
    // triggers a second mount.
    await mountSidebar();
    if (requestId !== redditRequestId) return;
    showSearching();

    const threads = await fetchRedditThreads(name, school);
    if (requestId !== redditRequestId) return;

    if (threads.length > 0) {
      showResults(threads.slice(0, MAX_POSTS));
    } else {
      showEmpty(name, school, { failed: false });
    }
  } catch (err) {
    if (requestId !== redditRequestId) return;
    console.warn(`Professor Companion: Reddit search failed — ${err.message}`);
    // Failure wears the same empty card, but the "Search Reddit" link below
    // still gives the user a manual path to the data we couldn't fetch.
    showEmpty(name, school, { failed: true });
  }
}

function showSearching() {
  if (!sidebarRoot) return;
  sidebarRoot.dataset.state = "loading";
  sidebarRoot.querySelector("#pc-posts").replaceChildren();
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
  const query = encodeURIComponent(`"${name}" ${school}`);
  sidebarRoot.querySelector("#pc-empty-search").href = `https://www.reddit.com/search/?q=${query}`;
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

function getFromPageTitle() {
  // Fallback if RMP renames its CSS classes: the tab title is
  // "First Last at School Name | Rate My Professors".
  const match = document.title.match(/^(.+?) at (.+?) \| Rate My Professors/);
  return match ? { name: match[1].trim(), school: match[2].trim() } : null;
}

function readProfessor() {
  let name = getNameFromDom();
  let school = getSchoolFromDom();

  if (!name || !school) {
    const fromTitle = getFromPageTitle();
    if (fromTitle) {
      name = name || fromTitle.name;
      school = school || fromTitle.school;
    }
  }

  return name && school ? { name, school } : null;
}

// ---------- 4. navigation-aware detection ----------

const DETECTION_TIMEOUT_MS = 15000;

function isProfessorPath(pathname) {
  return pathname.startsWith("/professor/");
}

let watchedPath = null;        // pathname we most recently saw in the URL bar
let awaitingDetection = false; // a detection pass is in progress
let timeoutId = null;
let lastLogged = null;         // { path, name, school } of the last successful log

function beginDetectionPass() {
  awaitingDetection = true;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(onDetectionTimeout, DETECTION_TIMEOUT_MS);
  attemptDetection(false);
}

function cancelDetectionPass() {
  awaitingDetection = false;
  clearTimeout(timeoutId);
}

function attemptDetection(force) {
  if (!awaitingDetection) return;

  const found = readProfessor();
  if (!found) return;

  // Staleness guard: right after a client-side navigation the URL already
  // points at the NEW professor, but React is often still showing the OLD
  // one while it fetches data. If we read exactly the name+school we last
  // logged but the path is different, assume it's the old page still on
  // screen and keep waiting for the re-render. (The timeout handler forces
  // the log through in the rare legit case of two consecutive profiles with
  // an identical name and school.)
  const looksStale =
    lastLogged &&
    lastLogged.name === found.name &&
    lastLogged.school === found.school &&
    lastLogged.path !== watchedPath;
  if (looksStale && !force) return;

  console.log(`Detected: ${found.name}, ${found.school}`);
  lastLogged = { path: watchedPath, name: found.name, school: found.school };
  updateSidebarIdentity(found.name, found.school);
  startRedditSearch(found.name, found.school);
  cancelDetectionPass();
}

function onDetectionTimeout() {
  attemptDetection(true);
  if (awaitingDetection) {
    awaitingDetection = false;
    console.warn("Professor Companion: no professor info found — giving up.");
  }
}

// Runs on every DOM mutation batch (and on popstate). Cheap when idle: a
// single string compare; the querySelector calls only happen while a
// detection pass is actually pending.
function check() {
  const path = location.pathname;
  if (path !== watchedPath) {
    watchedPath = path;
    const onProfessorPage = isProfessorPath(path);
    syncSidebarToPath(onProfessorPage);
    if (onProfessorPage) {
      resetSidebarForNavigation();
      beginDetectionPass();
    } else {
      redditRequestId++; // orphan any in-flight search for the page we left
      cancelDetectionPass();
    }
  } else if (awaitingDetection) {
    attemptDetection(false);
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
