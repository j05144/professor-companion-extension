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

// Subreddits searched first — results from these outrank sitewide matches.
// Extend freely (e.g. "ccny", "QueensCollege"); a name with no matches just
// contributes zero results.
const CUNY_SUBREDDITS = ["Baruch", "CUNY", "hunter"];

const RESULTS_PER_SEARCH = 15; // per request; Reddit caps limit at 100
const SNIPPET_MAX_CHARS = 200;

// Keep in sync with background.js (content scripts and the service worker
// don't share scope, so the constant is declared in both files).
const REDDIT_MESSAGE_TYPE = "reddit-fetch-json";

// ---------- public API ----------

async function fetchRedditThreads(professorName, school) {
  // Two searches, in parallel:
  //  1. CUNY subreddits only — "r/Baruch+CUNY+hunter" is a multireddit, so
  //     one request covers all of them. School context is implied by the
  //     subreddit, so the query is just the professor's name, quoted for an
  //     exact-phrase match.
  //  2. All of Reddit — here the school name IS in the query, to
  //     disambiguate professors with common names.
  const cunyUrl = buildSearchUrl(`"${professorName}"`, CUNY_SUBREDDITS);
  const sitewideUrl = buildSearchUrl(`"${professorName}" ${school}`);

  // allSettled (not all): one search failing shouldn't throw away the other.
  const [cuny, sitewide] = await Promise.allSettled([
    requestJson(cunyUrl),
    requestJson(sitewideUrl),
  ]);

  const threads = [];
  const failures = [];
  const seen = new Set();

  // Order matters: CUNY results are pushed first, which both puts them at
  // the top of the returned array and wins the dedupe when the same post
  // shows up in both searches.
  for (const [label, result] of [["CUNY subreddits", cuny], ["sitewide", sitewide]]) {
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

  if (failures.length === 2) {
    throw new Error(`All Reddit searches failed — ${failures.join("; ")}`);
  }
  if (failures.length === 1) {
    console.warn(`Professor Companion: partial Reddit results — ${failures[0]}`);
  }
  return threads;
}

// ---------- request plumbing ----------

function buildSearchUrl(query, subreddits) {
  // With subreddits: /r/Baruch+CUNY+hunter/search.json — a "multireddit"
  // search, N subreddits in one request. Without: sitewide /search.json.
  const base = subreddits
    ? `https://www.reddit.com/r/${subreddits.join("+")}/search.json`
    : "https://www.reddit.com/search.json";

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
  const text = (selftext ?? "").replace(/\s+/g, " ").trim();
  return text.length > SNIPPET_MAX_CHARS
    ? `${text.slice(0, SNIPPET_MAX_CHARS - 1)}…`
    : text;
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
