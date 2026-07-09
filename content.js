// Professor Companion — Phase 1.1: detection that survives client-side navigation.
//
// RMP is a single-page app: clicking from one professor to another calls
// history.pushState() and swaps the DOM in place — no page load happens, so
// nothing would re-inject this script. The fix: inject once anywhere on the
// site (see manifest matches), keep a single MutationObserver alive for the
// tab's lifetime, and treat "location.pathname changed" as the signal to
// start a fresh detection pass. The isProfessorPath() gate keeps the
// extension inert everywhere except professor pages.

const DETECTION_TIMEOUT_MS = 15000;

// ---------- page scraping ----------
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

// ---------- navigation-aware detection ----------

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
    if (isProfessorPath(path)) {
      beginDetectionPass();
    } else {
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
