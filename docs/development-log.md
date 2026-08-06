# Development Log

This document tracks our progress, key decisions, challenges, and next steps throughout the project. Each team member adds a dated entry after completing a milestone or significant task.

---

## Project Status

**Current Phase:** Phase 6 | Submitted for review (Prof Lookup v1.6.0 submitted to the Chrome Web Store; pending Google's in-depth review, auto-publish on approval)

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

## 7/19/2026 | Jinge
Completed: Reviewed and merged Antony's Phase 3 PR (#1) — first time seeing the design running live on real RMP pages with real Reddit threads. QA on a 5-post professor found an overflow bug: the card grew taller than the window, cutting off the LinkedIn button with no way to scroll. Fixed it with max-height + internal scroll on the body, and built the show-2-then-expand pattern as a CSS-only toggle (hidden checkbox + :has for the exact hidden-post count), so no content.js changes were needed for the toggle itself.
Challenges: First "Extension context invalidated" error. Reloading the extension orphans the content scripts in tabs that are already open, so the habit is now refresh the extension, then refresh the page.
Next Steps: Antony adds the collapsed-reset on professor change. Error card markup and icons are mine.

## 7/27/2026 | Antony
### Completed
- Show-more feature complete: Jinge's CSS-only toggle (hidden checkbox + :checked pattern, her discovery — no JS needed for the toggle itself) landed directly on main on 7/19; my 12-line collapsed-reset in content.js merged via PR #2, so a new professor always starts back at 2 posts.
- LinkedIn lookup button merged (PR #3): Google site:linkedin.com/in search URL built as one string with a single encodeURIComponent pass; handles anchor or button markup; updates on SPA navigation; hidden whenever detection gives up.
- README rewritten and merged (PR #4): architecture overview, Built By split, v2 roadmap with the AI-summary grounding constraint.
- Error-state design decision: the error card + retry covers fetch failures only; when detection gives up, keep the existing empty card with the manual search link, since there is no confirmed professor to retry.
### Challenges
- Process lesson, recorded honestly: I self-merged all three PRs by accident. After the second "Create pull request" click I kept going and hit "Merge pull request" — same color, different job. New rule: my clicks stop at Create; any Merge button belongs to the reviewer. Jinge is reviewing the closed PRs after the fact.
### Next Steps
- Remaining Phase 4: error-state wiring (blocked on Jinge's error card markup), icons in manifest.json (blocked on her 16/48/128 PNGs), Web Store developer account (not started).
- Jinge's queue: error card, icons, "Find on LinkedIn" relabel, after-the-fact review of README and the two content.js PRs.
- Parked by choice: the quality loop (roster + ground truth + bake-off) gates Phase 5, not Phase 4.

## 7/27/2026 | Jinge
Completed: Pulled and verified Antony's three merged PRs (#2 collapsed-reset, #3 LinkedIn button, #4 README) on live professor pages. Reviewing the self-merged PRs after the fact under the new rule that the Merge button belongs to the reviewer.
Challenges: git pull kept aborting and I assumed the extension was broken. The real cause was an uncommitted README edit blocking the merge, so his code never reached my machine at all. Lesson: read the last line of Git's output first, that's where it says whether it actually worked. Stashed the edit and the pull went through.
Next Steps: Error card markup, 16/48/128 icons, "Find on LinkedIn" relabel. Confirm with Antony whether the AI summary stays parked at v2.

## 7/28/2026 | Jinge
Completed: Built the error card to Antony's spec — fetch failures only with a retry button, detection failures keep the empty card — and added an Error button to test-preview.html so all four states are checkable locally. Made the 16/48/128 icons, drawn separately per size rather than downscaled. Relabeled the LinkedIn button to "Find on LinkedIn". Added README screenshots: hero plus light/dark/collapsed, and the three states (loading, empty, error) captured from the preview page. Reviewed and commented on the self-merged PRs #2-#4. Docs catch-up: my 7/19 and 7/27 log entries and the phase2-notes show-more section. Both of Antony's blockers are cleared.
Challenges: A "---" directly under text silently turns it into a heading in markdown. Also dropped a closing </div> while pasting the error card and nested it inside the empty card; caught it by comparing indentation. And left a "Coming soon" placeholder glued to the hero image in the README before spotting it.
Next Steps: Ask Antony about the three parked design-review items (flatten cards to rows, tool identity in header, demote LinkedIn button) and whether the AI summary stays at v2.

## 8/1/2026 | Antony
### Completed
- Ran the search quality loop end to end. Useful results (score 2) among the professors with real Reddit presence: baseline 5 of 9, Round 1 7 of 9, Round 2 8 of 9. The zero-presence control correctly returned nothing in every round.
- Round 1 (school-ID mapping + quoted sitewide query, PRs #5/#6). Round 2 (last-name fallback, PR #7): when the exact-phrase query returns zero in the campus subreddit, retry that same subreddit with the bare last name, unquoted. Campus-only, because a bare surname sitewide pulls strangers from every campus.
- Three root causes, all in query construction rather than parsing or ranking:
  1. r/hunter was the wrong community entirely; Hunter College's sub is r/HunterCollege. Worse, the hardcoded multireddit meant every professor searched all three subs regardless of school, so a Baruch professor was always dragging Queens and mis-targeted Hunter noise into the results.
  2. School-name keys failed against RMP's inconsistent school records: CUNY-prefixed names ("CUNY Queens College") and three separate Hunter entries with three IDs and three spellings. Fixed by keying to the school ID in the /school/{id} href. Same URL-as-identity lesson as the Phase 3 professor detection fix — the URL is exact and stable where the rendered name is neither.
  3. Exact-phrase queries missed threads where students write "professor Lastname" instead of the full name RMP lists, which is most of how professors actually get mentioned. Fixed with the last-name fallback, which only fires when the exact query returns zero, so it can add results but never displace better ones.
- Two things scoring caught that code review had not:
  - The first Round 1 pass silently tested the fallback path instead of the primary one. The harness calls fetchRedditThreads with no school ID, so it exercised the name lookup — exactly the path Round 1 was replacing — and the numbers meant nothing until it was re-run.
  - The sitewide query had been leaving the school words unquoted, so Reddit was free to rank threads matching only "Queens" or "College" and nothing about the professor.
### Methodology
- 10-professor stratified roster: 5 Baruch, 2 Hunter, 1 Queens, 1 non-CUNY, 1 zero-presence control.
- Hand-written ground truth recorded BEFORE scoring, so the target could not drift to match whatever the tool produced.
- One change per round, re-scored against the same 0-to-2 rubric throughout (0 junk / 1 weak match / 2 genuinely useful), so every delta is attributable to a single change.
### Next Steps
- Quality gate cleared, so Phase 5 is open: Jinge's restyle, a 15-to-20-professor hardening pass, screenshots and demo GIF.
- Phase 4 leftovers are now mine and no longer blocked — Jinge landed the error card and the icon PNGs on 7/28. Remaining: wire the error state to her card, add the icons key to manifest.json, open the Web Store developer account.

## 8/2/2026 | Jinge
Completed: Phase 5 restyle done. Flattened post cards to rows (kept the quote, dropped the box), demoted the LinkedIn button to a blue outline in LinkedIn's #0A66C2, removed the star since favorites are v2, and put the RMP Lookup logo in the header and the collapsed tab. Optimized the logo from 1.5 MB to 15 KB with a transparent background so it doesn't show a white box in dark mode.
Challenges: The restyle broke the live extension — no Reddit results, dead LinkedIn button — while the local preview looked fine. I'd replaced #pc-initials with a logo <img>, and content.js still wrote .textContent to it, so updateSidebarIdentity threw a null TypeError before it reached updateLinkedInLink and startRedditSearch. One dead line killed two unrelated features. Fixed in content.js and manifest.json (Antony's files, flagged to him directly).
Next Steps: Lock the design with Antony, then reshoot README screenshots. His side before publish: manifest still says "Professor Companion 1.5.0" with the placeholder icon and old description, plus the hardening pass. We also need a backup name since "RMP" is Rate My Professors' trademark.

## 8/3/2026 | Antony
### Completed
- Reviewed Jinge's content.js fix for the restyle breakage and kept it as written. Dropping the dead initials writes, deleting the now-unused initialsFrom, and setting the logo src through chrome.runtime.getURL was the correct set, and nothing stale was left referencing the old hooks.
- Hardened the class of failure rather than the one instance. Every sidebar template lookup now goes through a hook() helper that warns and returns null instead of throwing, so a renamed id costs that one element instead of every feature on the lines below it. The new logo lines had actually reproduced the original pattern in a worse spot: wireSidebarControls runs inside mountSidebar BEFORE the host is appended to the page, so a null there would have killed the entire sidebar mount rather than two features — and it would have looked like the extension simply never loaded.
- Decoupled paint from data: the identity update is now wrapped so startRedditSearch runs regardless of what the header does. Painting the header is cosmetic; searching Reddit is the product, and the first must never be able to stop the second.
- manifest.json: registered the 16/48/128 icons — the key was missing entirely, so Jinge's PNGs had been sitting unused since 7/28 and would have blocked store submission — bumped to 1.6.0, and renamed the extension to RMP Lookup so the manifest agrees with the logo alt text and the restyled identity.
### Challenges
- The trademark question is decided for now, not resolved. "RMP" is Rate My Professors' mark, so the current name carries real rejection risk at the store. Backups on file: Course Companion, Prof Lookup, Campus Companion. Listing mitigations when we submit: keep the mark out of the name and short description, lead with what the tool does, use none of their logo or wordmark, and add a "not affiliated with or endorsed by Rate My Professors" line.
### Next Steps
- Mine: wire the error state to Jinge's card (the last Phase 4 item), run the 15-to-20-professor hardening pass weighted toward common surnames and non-CUNY schools, open the Web Store developer account.
- Shared: lock the design, then Jinge reshoots the screenshots.
- Still carrying the old name: popup.html title and heading, the README H1 and hero caption, and the sidebar footer (which also still reads v0.1). The manifest description is unchanged as well.

## 8/3/2026 | Jinge
Completed: Finished the Phase 5 polish pass. Removed the dead CSS left from the star button, avatar, and brandmark, keeping --pc-avatar-bg/--pc-avatar-ink since the icon buttons and theme menu still use them. Regenerated the 16/48/128 icons from the real logo — the committed ones were still the placeholder cap design and had never matched the brand. Made the retry button Reddit orange to match the Search Reddit link. Reviewed and agreed with Antony's hardening commit: the hook() guard, and decoupling the header paint from the Reddit search so a cosmetic failure can't stop the product. Settled the name on Prof Lookup, swept the remaining old-name strings out of content.js, reddit.js, and background.js (13 console prefixes and file headers — user-visible in console output, so not history the way the docs and mockups are), fixed the README hero image markdown and the stale star-button roadmap line, removed the placeholder Demo section, and reshot all seven README screenshots against the locked design.
Challenges: Pasted the retry-orange CSS a second time without realizing it was already in the file — caught in review before committing, but it would have re-added exactly the kind of duplicate rule I had just cleaned out. Reading the diff beats trusting memory about what is already applied.
Next Steps: Chrome Web Store submission — developer account, listing assets, and store copy.

## 8/4/2026 | Antony
### Completed
- Wired the error state and retry button against Jinge's card, which closes the last Phase 4 code item. All four sidebar states now route: results to loaded, zero results to empty, a fetch failure to the error card, and detection give-up back to the empty card with its manual search link.
- Held the boundary we agreed in Phase 4 rather than routing every failure to the new card. A retry button promises that pressing it does something specific; after a fetch failure we know which professor to ask about again, so the promise is real, but after a detection give-up there is no confirmed professor and the button would be an apology shaped like a solution.
- Retry reads lastLogged at click time instead of capturing a professor, so one listener stays correct across SPA navigations. No cache bypass needed since failed searches are never cached, and it takes a fresh request ticket so a slow original attempt landing later cannot overwrite the newer result.
- Design locked with Jinge as shipped: flat rows, blue outlined LinkedIn, logo in the header and collapsed tab, star gone. She had already pushed the CSS cleanup and swapped the extension icons to the real logo.
- Name settled: RMP Lookup lasted one day as a deliberate placeholder, then became Prof Lookup. Recognisability is worth nothing if the listing never goes live, and "RMP" is Rate My Professors' mark. Swept everywhere it ships — manifest, both logo alt strings, the collapsed tab's hover title, the footer, popup.html, and the README — and synced the footer version to 1.6.0 so nothing in a screenshot contradicts anything else. The mockups and the dated log entries keep the old names on purpose; they are a record of what was true then.
### Challenges
- The footer was the near miss. It sits in frame for every screenshot, and it was carrying both a stale name and v0.1 against a manifest at 1.6.0 — one shoot away from a full reshoot. Worth generalising: before capturing anything, read the strings that are actually visible in the frame, not just the ones you edited.
### Next Steps
- Mine: the 15-to-20-professor hardening pass, weighted toward common surnames and non-CUNY schools, then the Web Store developer account.
- Jinge had already reshot all seven README screenshots against the locked design and dropped the placeholder Demo section, so what is left for launch is the submission itself: listing assets and store copy.

## 8/5/2026 | Jinge
### Completed
- Built scripts/make_store_screenshots.py: takes the five README screenshots, pads each onto a 1280x800 canvas in the brand background color (#EDEDEA), and drops them in a store-screenshots folder on the Desktop as store-1 through store-5, matching the Chrome Web Store's fixed screenshot size.
- Made the repo public. No LICENSE file exists, so all rights are reserved by default; added an explicit copyright line to the README (Jinge Huang and Antony Wu, 2026) so a now-public repo isn't left with no visible terms at all.
- Added PRIVACY.md at the repo root for the store listing's privacy policy link.
- Filled out the store listing: category Education, language English, homepage URL and support URL both point at the repo (support URL to its issues page specifically), since there's no standalone site yet.
- Filled out the privacy practices tab: single purpose description plus per-permission justifications for activeTab, host permissions, and storage. Answered No to remote code, left every data collection category unchecked, checked all three certifications.
- Submitted Prof Lookup v1.6.0 for review. Item ID ckphgmjfninpcijmhnlpobmphclklleg, status pending review, auto-publish on approval.
### Challenges
- Host permissions put this submission on Google's in-depth human review path rather than the fast automated one, so pending review could mean days, not hours. Nothing to do but wait — flagging it so a quiet week doesn't read as something broken.
- Caught after submitting: the storage justification only mentions theme and collapsed state, but content.js also persists drag position under the same storage key. Logged in docs/phase6-notes.md to fix in the next submission; not a data-use problem, just an undersold justification.
### Next Steps
- Wait on review; auto-publish means no further action is needed once Google approves.
- Confirm with Antony whether the 15-to-20-professor hardening pass landed before this build or still needs to happen for a follow-up release — it doesn't block this submission either way.

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