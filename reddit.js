// Professor Companion — Reddit thread search (Phase 3, no UI yet).
//
// fetchRedditThreads(professorName, school) is the public entry point. It
// runs here in the content script, but the actual network request happens in
// background.js: a content script inherits ratemyprofessors.com's origin for
// network purposes, so the browser's same-origin policy blocks it from
// reading reddit.com responses. The background service worker runs in the
// extension's own origin with host_permissions for reddit.com, so it fetches
// on our behalf and messages the JSON back.
//
// Division of labor: this file owns the Reddit domain logic (which
// subreddits, query building, response parsing, ranking); background.js owns
// transport only (validate URL → fetch → return JSON).

// School → its own subreddit. Searching a Baruch professor in r/QueensCollege
// only adds noise, so the campus query is scoped to the school RMP reports.
// Keys are RMP's school strings, normalized (lowercased/trimmed) so casing
// and spacing differences still match. Extend as we verify more campus subs.
const SCHOOL_SUBREDDITS = new Map([
  ["baruch college", ["Baruch"]],
  ["hunter college", ["HunterCollege"]],
  ["queens college", ["QueensCollege"]],
]);

// Added alongside any mapped school: the system-wide subreddit, where
// cross-campus threads about CUNY professors live.
const CUNY_WIDE_SUBREDDIT = "CUNY";

// Returns the subreddits to search for this school, or null when we have no
// mapping — in which case the caller skips the subreddit query entirely
// rather than guessing at campus subs that may not exist.
function subredditsForSchool(school) {
  const own = SCHOOL_SUBREDDITS.get((school ?? "").trim().toLowerCase());
  return own ? [...own, CUNY_WIDE_SUBREDDIT] : null;
}

const RESULTS_PER_SEARCH = 15; // per request; Reddit caps limit at 100
const SNIPPET_MAX_CHARS = 200;

// API host for search fetches. www and old serve the same .json endpoints,
// but Reddit's bot gating has flip-flopped between them (www 403'd us on
// 2026-07-13; old 403'd us on 2026-07-14 while www recovered). Both hosts
// are pre-cleared in background.js's allow-list and the manifest's
// host_permissions, so when it flips again this constant is the ONLY line
// that changes. User-facing links (permalinks, fallback search) always
// point at www regardless.
const REDDIT_API_BASE = "https://www.reddit.com";

// Keep in sync with background.js (content scripts and the service worker
// don't share scope, so the constant is declared in both files).
const REDDIT_MESSAGE_TYPE = "reddit-fetch-json";

// ---------- session cache ----------
// Repeat views and SPA back-and-forth were re-hitting Reddit on every
// navigation; our own browsing volume is a plausible 403 trigger, so fewer
// requests is self-defense as much as polish. The Map lives in this tab's
// isolated world, so it dies with the tab — a true session cache, no
// storage permission or invalidation policy needed. 10 minutes is fresh
// enough for discussion threads that change on the scale of days.

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map(); // key → { threads, expiresAt }

function searchCacheKey(professorName, school) {
  return `${professorName}|${school}`.toLowerCase();
}

// ---------- public API ----------

async function fetchRedditThreads(professorName, school) {
  const cacheKey = searchCacheKey(professorName, school);
  const cached = searchCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.threads;
    searchCache.delete(cacheKey); // lazy eviction: expired entries die on touch
  }

  // Up to two searches, in parallel:
  //  1. The school's own subreddit + r/CUNY — "r/Baruch+CUNY" is a
  //     multireddit, so one request covers both. School context is implied
  //     by the subreddit, so the query is just the professor's name, quoted
  //     for an exact-phrase match. Skipped entirely for unmapped schools.
  //  2. All of Reddit — here the school name IS in the query, to
  //     disambiguate professors with common names. Always runs, so an
  //     unmapped school still gets results.
  const subreddits = subredditsForSchool(school);

  // Labels ride with the URLs so a failure can name which search died.
  const searches = [];
  if (subreddits) {
    searches.push(["school subreddits", buildSearchUrl(`"${professorName}"`, subreddits)]);
  }
  searches.push(["sitewide", buildSearchUrl(`"${professorName}" ${school}`)]);

  // allSettled (not all): one search failing shouldn't throw away the other.
  const results = await Promise.allSettled(searches.map(([, url]) => requestJson(url)));

  const threads = [];
  const failures = [];
  const seen = new Set();

  // Order matters: the subreddit search is first in `searches`, which both
  // puts its results at the top of the returned array and wins the dedupe
  // when the same post shows up in both searches.
  for (let i = 0; i < results.length; i++) {
    const [label] = searches[i];
    const result = results[i];
    if (result.status === "rejected") {
      failures.push(`${label}: ${result.reason.message}`);
      continue;
    }
    for (const thread of parseSearchResults(result.value)) {
      if (!seen.has(thread.url)) {
        seen.add(thread.url);
        threads.push(thread);
      }
    }
  }

  if (failures.length === searches.length) {
    throw new Error(`All Reddit searches failed — ${failures.join("; ")}`);
  }
  if (failures.length > 0) {
    console.warn(`Professor Companion: partial Reddit results — ${failures.join("; ")}`);
  } else {
    // Cache only complete results: pinning a partial (one search failed)
    // for 10 minutes would hide a recovery the very next navigation might
    // have gotten. Total failure throws above and caches nothing.
    searchCache.set(cacheKey, {
      threads,
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    });
  }
  return threads;
}

// ---------- request plumbing ----------

function buildSearchUrl(query, subreddits) {
  // With subreddits: /r/Baruch+CUNY+hunter/search.json — a "multireddit"
  // search, N subreddits in one request. Without: sitewide /search.json.
  const base = subreddits
    ? `${REDDIT_API_BASE}/r/${subreddits.join("+")}/search.json`
    : `${REDDIT_API_BASE}/search.json`;

  // URLSearchParams handles all the percent-encoding (spaces, quotes).
  const params = new URLSearchParams({
    q: query,
    sort: "relevance",
    limit: String(RESULTS_PER_SEARCH),
    raw_json: "1", // return real characters, not HTML entities like &amp;
  });
  if (subreddits) {
    params.set("restrict_sr", "1"); // stay inside the multireddit
  }

  return `${base}?${params}`;
}

function requestJson(url) {
  // Hand the URL to background.js and wrap Chrome's callback-style messaging
  // in a Promise so callers can just await it.
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: REDDIT_MESSAGE_TYPE, url }, (response) => {
      // lastError is set when no listener ever responded — most often
      // "Receiving end does not exist" right after reloading the extension
      // without refreshing the RMP tab.
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error ?? "Empty response from background"));
      } else {
        resolve(response.data);
      }
    });
  });
}

// ---------- response parsing ----------

function parseSearchResults(listing) {
  // Reddit search returns a "Listing":
  //   { kind: "Listing", data: { children: [{ kind: "t3", data: {...} }] } }
  // where kind "t3" means a post (t1 is a comment, t5 a subreddit, ...).
  const children = listing?.data?.children ?? [];
  return children
    .filter((child) => child.kind === "t3" && child.data)
    .map((child) => {
      const post = child.data;
      return {
        title: post.title,
        subreddit: post.subreddit,
        snippet: makeSnippet(post.selftext),
        upvotes: post.score,
        // created_utc is in seconds; JS Dates count milliseconds.
        date: new Date(post.created_utc * 1000).toISOString().slice(0, 10),
        // permalink is site-relative ("/r/CUNY/comments/abc123/...").
        url: `https://www.reddit.com${post.permalink}`,
      };
    });
}

function makeSnippet(selftext) {
  // Link posts have no body — selftext is "" — so the snippet may be empty.
  //
  // Reddit bodies are markdown; the card shows plain prose, so strip the
  // common markup instead of rendering it raw. This is COSMETIC cleanup,
  // not a security layer — the render side already writes snippets with
  // textContent, which is what makes untrusted text safe. Best-effort by
  // design: rare constructs (tables, nested emphasis) degrade gracefully
  // into slightly odd prose, never into broken cards.
  let text = selftext ?? "";
  text = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1"); // [text](url) → text, BEFORE bare-URL pass
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");        // **bold** / __bold__ → bold
  text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, "$2"); // *italics* / _italics_ → italics
  text = text.replace(/https?:\/\/\S+/g, "");            // bare URLs contribute nothing to a preview
  text = text.replace(/\s+/g, " ").trim();

  if (text.length <= SNIPPET_MAX_CHARS) return text;

  // Truncate at a word boundary so cards never end mid-word — unless the
  // last space is so early the snippet would collapse (one giant token),
  // in which case a hard cut is the lesser evil.
  const cut = text.slice(0, SNIPPET_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > SNIPPET_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.trimEnd()}…`;
}

// ---------- dev test harness ----------
//
// With REDDIT_TEST_MODE on, opening any RMP page runs the searches below and
// prints the results to the page console (F12). Flip it off when done —
// while on, every RMP page load fires Reddit requests, which invites rate
// limiting (HTTP 429).
//
// For one-off manual tests: in DevTools, switch the console's context
// dropdown from "top" to "Professor Companion", then run e.g.
//   await fetchRedditThreads("Jane Doe", "Baruch College")

const REDDIT_TEST_MODE = false;

// Swap in professors you've verified on RMP — hits are most likely for
// professors students actually talk about.
const REDDIT_TEST_CASES = [
  { professorName: "David Sitt", school: "Baruch College" },
  { professorName: "Corey Robin", school: "Brooklyn College" },
];

async function runRedditSelfTest() {
  for (const { professorName, school } of REDDIT_TEST_CASES) {
    console.log(`Professor Companion — Reddit search: ${professorName} (${school})`);
    try {
      const threads = await fetchRedditThreads(professorName, school);
      console.log(`${threads.length} thread(s) found`);
      if (threads.length) {
        // console.table renders the array as a sortable grid in DevTools.
        console.table(threads, ["subreddit", "title", "upvotes", "date"]);
        console.log(threads); // full objects (snippet + url), expandable
      }
    } catch (err) {
      console.error(`Professor Companion: Reddit search failed — ${err.message}`);
    }
  }
}

if (REDDIT_TEST_MODE) {
  runRedditSelfTest();
}

// ---------- search-quality test harness ----------
//
// Flip QUALITY_TEST on, fill QUALITY_TEST_CASES (e.g. from
// docs/test-roster.md), reload the extension, then open any RMP page — the
// RMP homepage or a search page is best, since no sidebar fetch fires there
// to interleave with the report. One consolidated console.log prints at the
// end: right-click the message → "Copy string object" and paste it into a
// chat for scoring. Flip the flag off when done.

const QUALITY_TEST = false;

// { name, school } pairs.
const QUALITY_TEST_CASES = [
  // { name: "Jane Doe", school: "Baruch College" },
];

const QUALITY_TEST_DELAY_MS = 2000; // politeness gap between searches
const QUALITY_SNIPPET_CHARS = 100;

// Local copy of the age math (content.js has one too, but the harness stays
// self-contained rather than coupling reddit.js to content.js internals).
function qualityAge(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 1) return "today";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

async function runQualityTest() {
  const lines = [];
  lines.push(`=== Reddit search quality report — ${new Date().toISOString()} ===`);
  lines.push(
    `${QUALITY_TEST_CASES.length} professor(s) · cache bypassed · ${QUALITY_TEST_DELAY_MS}ms between searches`
  );

  for (let i = 0; i < QUALITY_TEST_CASES.length; i++) {
    const { name, school } = QUALITY_TEST_CASES[i];
    // Sequential on purpose, with a gap: a burst of parallel searches is
    // exactly the traffic shape that gets extensions 403'd.
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, QUALITY_TEST_DELAY_MS));

    lines.push("");
    lines.push(`[${i + 1}/${QUALITY_TEST_CASES.length}] ${name} — ${school}`);
    try {
      // Evict any cached entry first so every run measures live search
      // quality, not a 10-minute-old snapshot.
      searchCache.delete(searchCacheKey(name, school));
      const threads = await fetchRedditThreads(name, school);
      if (threads.length === 0) lines.push("  (no results)");
      threads.forEach((thread, n) => {
        lines.push(`  ${n + 1}. ${thread.title}`);
        lines.push(
          `     r/${thread.subreddit} · ${thread.upvotes} upvotes · ${qualityAge(thread.date)} old`
        );
        if (thread.snippet) {
          const preview =
            thread.snippet.length > QUALITY_SNIPPET_CHARS
              ? `${thread.snippet.slice(0, QUALITY_SNIPPET_CHARS)}…`
              : thread.snippet;
          lines.push(`     "${preview}"`);
        }
      });
    } catch (err) {
      lines.push(`  ERROR: ${err.message}`);
    }
  }

  lines.push("");
  lines.push("=== end of report ===");
  // One log call for the whole report: a single string copies cleanly,
  // where dozens of separate log lines would not.
  console.log(lines.join("\n"));
}

if (QUALITY_TEST) {
  runQualityTest();
}
