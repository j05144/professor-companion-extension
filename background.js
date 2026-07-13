// Professor Companion — background service worker.
//
// Its only job so far: fetch Reddit JSON on behalf of content scripts.
// Content scripts inherit ratemyprofessors.com's origin, so the same-origin
// policy blocks them from reading reddit.com responses. This worker runs in
// the extension's own origin, and the manifest's host_permissions entry for
// reddit.com exempts its requests from CORS.

// Keep in sync with reddit.js.
const REDDIT_MESSAGE_TYPE = "reddit-fetch-json";

// Allow-list, not block-list: this worker fetches exactly one shape of URL
// (HTTPS + old.reddit.com + a .json path) and refuses everything else. That
// way a bug elsewhere in the extension can never turn this handler into an
// open proxy that reads arbitrary sites with the extension's permissions.
// Parsing with new URL() beats string checks: a startsWith() test can be
// fooled by hosts like "www.reddit.com.evil.com".
function isAllowedRedditUrl(raw) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      url.hostname === "old.reddit.com" &&
      url.pathname.endsWith(".json")
    );
  } catch {
    return false; // not even parseable as a URL
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== REDDIT_MESSAGE_TYPE) {
    return; // not ours — leave the channel to other listeners
  }

  if (!isAllowedRedditUrl(message.url)) {
    sendResponse({ ok: false, error: `Refused to fetch non-Reddit URL: ${message.url}` });
    return;
  }

  fetch(message.url)
    .then((res) => {
      if (!res.ok) {
        const hint =
          res.status === 403
            ? " — Reddit refused the request; see the Phase 3 notes on bot detection"
            : res.status === 429
              ? " — rate limited; wait a minute before retrying"
              : "";
        throw new Error(`Reddit responded HTTP ${res.status}${hint}`);
      }
      return res.json();
    })
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  // Returning true tells Chrome this response is asynchronous: keep the
  // message channel open (and this worker alive) until sendResponse fires.
  // Without it, the channel closes the moment this listener returns, and the
  // content script would see "The message port closed before a response was
  // received."
  return true;
});
