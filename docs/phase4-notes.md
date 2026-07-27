# Phase 4 Notes: Polish

Deeper context for the Phase 4 work through 7/27. The dev log has the timeline; this has the reasoning.

## Show-more: who owns what (PR #2)
Jinge's toggle is pure CSS — a hidden checkbox holds the state, :checked plus
:has() selectors compute the button's visibility and the exact "Show N more"
count. The JS half deliberately duplicates none of that (writing the label's
text from JS would fight her ::after content). The one thing CSS cannot do is
forget: the checkbox keeps its state across renders, so without a reset,
professor B inherits professor A's expanded view. content.js unchecks it in
showSearching(), which every new professor passes through — including instant
cache hits. Lesson repeated from show-more's first day: the shipped files are
the source of truth, not the spec; read them before implementing.

## LinkedIn lookup (PR #3)
- The query is assembled as ONE string, then encodeURIComponent'd ONCE.
  Encoding pieces separately and concatenating double-encodes the quotes
  (%22 -> %2522) and silently breaks Google's exact-phrase match.
- The element is handled as anchor or button at runtime, since sidebar.html
  is Jinge's to change: anchors get a real href (middle-click and copy-link
  work), a button would get one mount-time window.open handler that reads the
  current URL from a variable — no listener stacking, no stale closures.
- Lifecycle rides identity: every successful detection refreshes the URL,
  every SPA reset hides the element, and detection give-up never reveals it —
  so the link can never point at the professor you just left.
- Hiding uses inline display:none, not the hidden attribute: the author rule
  ".pc-linkedin { display: flex }" outranks the UA's [hidden] rule, but
  nothing outranks an inline style.

## Error-state decision (wiring pending Jinge's card)
Two failure cases, one distinction: if the Reddit SEARCH failed we know the
professor and a retry makes sense — error card + #pc-retry. If DETECTION gave
up we never confirmed who is on the page, so "retry the search" has nothing to
retry — that case keeps the empty card with the manual search link, the only
affordance that still works without a confirmed professor.

## Process: the self-merge incident
All three Phase 4 PRs (#2, #3, #4) were self-merged by accident — after
"Create pull request", the next same-colored button is "Merge pull request",
and momentum did the rest. Rule going forward: Antony's clicks stop at Create;
any Merge button belongs to the reviewer. Jinge reviews the closed PRs after
the fact.

## Status and gates
- Done: show-more reset, LinkedIn button, README.
- Remaining Phase 4: error-state wiring (blocked on Jinge's error card),
  manifest icons (blocked on her 16/48/128 PNGs), Web Store developer account.
- Parked by choice: the quality loop (roster + ground truth + bake-off) gates
  Phase 5, not Phase 4.
