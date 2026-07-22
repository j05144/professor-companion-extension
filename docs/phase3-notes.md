# Phase 3 Notes: Reddit Integration

Deeper context for the Phase 3 work. The dev log has the timeline; this has the reasoning.
Built in Claude Code sessions directed by Antony; all testing, browser debugging, and product decisions ours.

## Architecture: why the background proxy exists
A content script inherits the origin of the page it runs on. For network purposes our code IS
ratemyprofessors.com code, and the same-origin policy blocks it from reading reddit.com responses.
The background service worker runs in the extension's own origin and is exempt for hosts listed in
host_permissions. So: reddit.js owns domain logic (queries, parsing, ranking), background.js is a
dumb validated pipe. The worker refuses anything that is not HTTPS + a known Reddit hostname
(exact match, parsed with new URL, never startsWith) + a .json path, so a bug elsewhere can never
turn it into an open proxy.

## The 403 saga and endpoint policy
Reddit's unauthenticated .json endpoints are bot-gated and moody: www 403'd on July 13, old.reddit
403'd on July 14 while www recovered. Policy that fell out of it:
- REDDIT_API_BASE in reddit.js is the ONLY dial. Both hosts are pre-cleared in the background
  allow-list and host_permissions, so a flip is one constant and cannot half-apply.
- A per-tab session cache (Map keyed by name|school, 10-min TTL, lazy eviction) cuts repeat
  traffic. This is UX polish and self-defense: our own request volume was a plausible 403 trigger.
  Only complete results are cached, so failures always retry.
- If both hosts ever 403 together: stop, wait hours, retest. If it recurs, migrate to the OAuth API
  (registered app, credentials in the worker). That is the designated durable fallback.

## SPA detection: the URL is identity
RMP navigates with pushState; nothing reloads. The bug that proved it: right after navigating, the
page title still said "Search professors at Baruch College | Rate My Professors" and our title
fallback parsed it as a professor named "Search professors."
Rules now enforced:
- Identity comes from the professor ID in the URL. Every detection pass and Reddit render is keyed
  to it; a result may only render if the URL still shows the professor it was fetched for.
- After navigation, the DOM and title are guilty until they change from a navigation-time snapshot.
  Initial page loads are exempt (served HTML genuinely belongs to the URL).
- On timeout, give up (empty card + manual search link) rather than force-log possibly stale data.
One-liner: the URL is the only part of an SPA that updates atomically with navigation; everything
else on screen is a lagging indicator.

## Incidents and lessons
- Stale service worker: after a laptop restart, Chrome ran a cached pre-switch copy of
  background.js and rejected old.reddit URLs that the on-disk code accepted. Disk, git, and the
  running process are three different copies of your code. Reload the extension after every edit.
- Ghost console: DevTools keeps old errors; we nearly re-fixed a solved bug. Clear before diagnosing.
- Rendering safety: all Reddit text lands via createElement/textContent, never innerHTML. Snippet
  markdown-stripping is cosmetic, not sanitization; safety comes from textContent.

## Search quality (status: harness built, pass not started)
QUALITY_TEST in reddit.js runs a {name, school} roster sequentially (2s gaps, cache bypassed) and
prints one copyable report. Rubric: 0 junk / 1 technically-matches-but-weak / 2 genuinely useful.
Bar: useful threads for 3 of 5 professors with real Reddit presence, clean empties for the rest.
Known problems: list-style megaposts match every professor named in them; common last names pull
cross-campus noise. Candidate levers: full CUNY subreddit coverage, title-match boosting,
multi-professor-post penalties, course codes scraped from the RMP page.
Gates: the demo GIF and the Web Store publish wait on this pass.

## Deferred with reasons
- AI summary card (watsonx + tiny proxy): v2, after publish. It is the project's first backend
  (API keys cannot live in extension source, hence the proxy) and does not fit August recruiting.
  Gated on the quality pass, because summarizing junk produces confident junk. Hard constraint:
  the summary only ever summarizes the fetched posts, never model knowledge about the professor.
- LinkedIn one-click (Google CSE API top-result): v2. v1 ships the site:linkedin.com/in search URL.
- Star/save, progressive disclosure beyond Jinge's show-more, drag-with-edge-docking: v2 list.
