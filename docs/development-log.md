# Development Log

This document tracks our progress, key decisions, challenges, and next steps throughout the project. Each team member adds a dated entry after completing a milestone or significant task.

---

## Project Status

**Current Phase:** Phase 4 | LinkedIn + Polish (Phase 3 PR open, awaiting review/merge)

**Current Direction:** Chrome extension MVP on RMP pages -> quality pass -> Chrome Web Store publish. Standalone site and AI summary deferred to v2.

---

# Work Log

## 7/5/2026 | Jinge
Completed: Project setup done. Created the private GitHub repo, connected it with VS Code, and cloned it locally. Built the initial structure: manifest.json, popup.html, popup.js, content.js, background.js, styles.css, plus assets/data/docs folders, README, and starter code. Made the first commit.
Challenges: Used the wrong repository URL when cloning. Learned how GitHub, Git, and VS Code work together, where the local project folder lives, and what each core Chrome extension file is for.
Next Steps: Load the extension into Chrome and verify it works. Research professor name detection. Design the sidebar. Finalize MVP features.

## 7/9/2026 | Antony
Completed: Phase 1 detection working. Extension runs only on RMP professor pages, logs professor name + school. Tested on 5 professors across 4 CUNY schools. Saved technical notes to docs/phase1-notes.md.
Challenges: —
Next Steps: Phase 2 sidebar shell. Sketch wireframe with Jinge first.

## 7/12/2026 | Jinge
Completed: Phase 2 frontend done. Confirmed design decisions with Antony (overlay, open first visit + remember choice, collapse to floating tab). Designed the missing wireframe states (loading, empty, collapsed) and committed both wireframes to /mockups. Built sidebar.html (full template, js hooks marked for content.js) and rewrote styles.css (light/dark themes, CSS state machine via data-state, skeletons, collapse, mobile layout). Tested all states locally with a gitignored preview page. Fixed popup.html charset bug. Notes in docs/phase2-notes.md.
Challenges: Briefly edited a downloaded copy of styles.css instead of the project's file (had two tabs open). Cleaned up duplicate files between Downloads and the project folder. Git's LF/CRLF warnings turned out to be harmless.
Next Steps: Antony wires the injection (web_accessible_resources + fetch into Shadow DOM + hardcoded post data). I do visual QA on a real RMP page once it lands, then we run the Phase 2 done checklist together.

## 7/12/2026 | Antony
### Completed
- Loaded the extension in Chrome and verified Phase 1 on live RMP pages: console logs the detected professor name and school.
- Reviewed Jinge's styles.css: Shadow DOM scoping, data-state machine (loading/loaded/empty), skeletons, collapse tab. Locked the data contract: Reddit results must provide {title, subreddit, snippet, upvotes, date, url}.
- Decisions: dropped DM Sans bundling (system font stack is fine for v1), LinkedIn button moves to brand blue (Jinge's file), star/save button deferred to v2 (needs a saved-professors view we haven't designed).
### Challenges
- Learned CSS token definitions vs. var() usages before editing colors.
### Next Steps
- Persist settings, build the Reddit data layer.

## 7/13/2026 | Antony
### Completed
- Settings persistence in chrome.storage.local (theme light/dark/auto, collapsed), applied before first paint so there is no flash; synced across tabs via storage.onChanged.
- Sidebar mounted: content.js fetches sidebar.html + styles.css and attaches them in a Shadow DOM root on professor pages.
- Reddit data layer: reddit.js builds CUNY multireddit + sitewide searches; background.js service worker proxies the fetches (content scripts are CORS-blocked from reddit.com) behind a strict allow-list (HTTPS + known host + .json paths only).
- Wired real results into the sidebar states. First live render: real r/Baruch threads for a real professor.
- Endpoint incident #1: www.reddit.com started returning 403 from the extension; switched REDDIT_API_BASE to old.reddit.com.
### Challenges
- Reddit's unauthenticated .json endpoints are bot-gated; scripted probes 403 even when the browser passes.
### Next Steps
- Drag/move the sidebar, test across professors.

## 7/14/2026 | Antony
### Completed
- Diagnosed a post-restart failure where results stopped loading: the error came from code that no longer existed on disk. Chrome had cached a pre-switch service worker. Lesson logged: disk, git, and the running process are three different copies of your code; always reload the extension after edits.
- Hardened background.js: allow-list is now a two-host set (www + old) matching host_permissions, so an endpoint flip is a one-constant change and can never half-apply.
- Committed the drag feature (card drags by header with clamping; collapsed tab slides on a vertical right-edge rail; positions persist; double-click resets) and raised the results cap to 10.
- Fixed the SPA staleness bug caught in the console (a search for professor "Search professors"): detection and rendering are now keyed to the professor ID in the URL, and DOM/title reads are distrusted after navigation until they visibly change. On timeout, detection gives up instead of force-logging stale data.
- Snippet sanitization: markdown stripped, URLs removed, word-boundary truncation (raw markdown and long URLs were overflowing cards).
- Endpoint incident #2: old.reddit.com 403'd while www recovered; flipped back (one constant) and added a per-tab 10-minute session cache so SPA back-and-forth stops re-hitting Reddit. The cache is also self-defense: our own test traffic was a plausible 403 trigger.
- Triaged an external design review: v1 polish items routed to Jinge's lane (flatten cards to rows, tool identity in header, demote LinkedIn button, error state); progressive disclosure and drag-docking parked for v2.
### Challenges
- Ghost console messages: old errors persisted next to a working extension and nearly sent us fixing a solved problem. Clear the console before diagnosing.
### Next Steps
- Quality harness, then Bain application takes the week.

## 7/18/2026 | Antony
### Completed
- Built the search-quality test harness (inert QUALITY_TEST flag in reddit.js): runs a professor roster sequentially with delays, prints one copyable report for scoring.
- Defined the scoring rubric (0 junk / 1 weak match / 2 genuinely useful) and the bar: useful threads for 3 of 5 professors with real Reddit presence, clean empties otherwise. Known problems to attack: megaposts that match every name, common-name noise.
### Next Steps
- Scoring pass deferred by choice until after recruiting deadlines; demo GIF and store publish stay gated on it.

## 7/19/2026 | Antony
### Completed
- Opened the Phase 3 pull request (12 commits, 4 files: content.js, reddit.js, background.js, manifest.json) with a full description; Jinge reviewing.
- Scope decisions with Jinge: her overflow fix (max-height + internal scroll) and show-2-then-expand pattern are approved for v1; the AI summary card (watsonx + proxy) is deferred to v2 because it is the project's first backend and is gated on the quality loop. Its hard constraint, kept verbatim: the summary only ever summarizes fetched posts, never model knowledge about the professor.
- Phase 4 begun: LinkedIn button wiring next.
### Next Steps
- Merge Phase 3 -> LinkedIn button PR -> show-more toggle (after Jinge's CSS) -> error state -> README -> Web Store developer account.

---

# Team Responsibilities

## Jinge
**Role:** Project Lead

**Responsibilities**
- Project planning and organization
- GitHub repository management
- Development documentation
- UI/UX planning
- Frontend development (HTML/CSS)
- Testing and quality assurance

## Antony
**Role:** Product Lead & Technical Lead

**Responsibilities**
- Product ideation and feature planning
- MVP definition and roadmap
- Chrome Extension APIs
- JavaScript development
- Professor detection
- Backend and database integration
- Technical troubleshooting

## Shared Responsibilities
- Brainstorming
- Feature planning
- Research
- Code reviews
- Testing
- Bug fixes
- Documentation updates
- Demo preparation

---

# Entry Format

## M/D/YYYY | Name
Completed: What actually got done, in one or two sentences.
Challenges: What confused you or went wrong today.
Next Steps: What's next for you or the team.