# Phase 6 Notes: Chrome Web Store Submission

Deeper context for the store submission. The dev log has the timeline; this
has the reasoning.

## Why this wasn't just "upload a zip"
The Chrome Web Store submission asks for three things the codebase doesn't
otherwise produce: a public-facing privacy policy, a plain-language
justification for every permission the manifest requests, and store-sized
screenshots. None of those exist naturally from writing an extension, so each
had to be built or written specifically for this step.

The one that matters most for timeline: **host permissions put this
submission on the in-depth human review path.** Google fast-tracks
extensions with a narrow permission footprint; anything that requests access
to page content on a host pattern — which Prof Lookup needs, since it reads
professor pages on ratemyprofessors.com — goes into a slower, human-reviewed
queue. Pending review here could mean days, not hours, and that isn't a sign
anything is wrong.

## Store listing
- **Category:** Education.
- **Language:** English.
- **Homepage URL / Support URL:** both point at the GitHub repo, the support
  URL specifically to its issues page. There's no standalone site (deferred
  to v2 per the README roadmap), so the repo does double duty as both.

## Verbatim text submitted to Google

### Single purpose description
Prof Lookup serves a single purpose: when a student is viewing a
professor's page on Rate My Professors, it displays public Reddit
discussions about that professor in a sidebar on the same page. It also
provides one link that runs a Google search for that professor's LinkedIn
profile. Every feature exists to give the student additional
student-written context about the professor they are already viewing,
without opening new tabs.

### activeTab justification
activeTab is used to read the professor's name and school identifier from
the Rate My Professors page the user is currently viewing, so the
extension knows which professor to search Reddit for. It is only used on
the tab the user has open and never on other tabs. No page content is
stored or transmitted.

### Host permission justification
Host access to ratemyprofessors.com is required to inject the sidebar into
the professor page and to read the professor name and school identifier
from that page. Host access to reddit.com is required to fetch public
Reddit search results about that professor so they can be displayed in the
sidebar. Both are read-only requests for publicly available data. No user
data is sent to either site, and the extension makes no requests to any
server we control.

### storage justification
chrome.storage is used only to remember the user's own interface settings:
their theme choice (light, dark, or auto) and whether the sidebar is
collapsed. These values stay on the user's device and are never
transmitted. No browsing history, no search activity, and no personal
information is stored.

### Remote code
No, I am not using remote code.

### Known discrepancy
The storage justification above says theme and collapsed state only.
content.js's DEFAULT_SETTINGS actually stores a third key, `position`
(the dragged card's `{left, top}` and the collapsed tab's rail `tabY`), so
the submitted text undersells what's persisted. It's still on-device,
non-transmitted interface state — the same category as theme and
collapsed — so the risk is understatement, not a misrepresentation of what
the data is used for. Correct the justification text to mention position
in the next submission.

## Going public: license and copyright
The repo moved from private (since 7/5/2026) to public alongside the
submission, since the privacy policy and support links needed to resolve to
something a reviewer — and eventually a user — could actually open.

No LICENSE file exists, so by default all rights are reserved; a public repo
with no visible terms at all would leave that ambiguous to anyone who found
it, so the README now states the copyright explicitly (Jinge Huang and
Antony Wu, 2026). Decided for now, not resolved: whether to add an actual
open-source license is a separate question from making the code visible, and
it's deferred rather than answered by omission.

PRIVACY.md was added at the repo root to give the privacy practices tab a
real URL to point to.

## Screenshot pipeline
scripts/make_store_screenshots.py takes the five screenshots already in
assets/ (hero, light, dark, collapsed, empty-state) and pads each onto a
fixed 1280x800 canvas in the brand background color (#EDEDEA), centered with
a 60px margin, then writes them to a store-screenshots folder on the Desktop
as store-1 through store-5. The Chrome Web Store requires a fixed screenshot
size; the README screenshots were sized for a README, not a store listing, so
this is a repeatable conversion rather than a one-off resize — the same
script runs again for the next release's screenshots.

## Status and what remains
- Submitted 8/5/2026: Prof Lookup v1.6.0, item ID
  ckphgmjfninpcijmhnlpobmphclklleg, status pending review, auto-publish on
  approval.
- Because of the host-permissions review path, there's no fixed ETA. Nothing
  further is needed on the submission itself — auto-publish means approval
  is the only remaining gate.
- Correct the storage justification's known discrepancy (position isn't
  mentioned) in the next submission.
- Open question carried from Phase 5: whether Antony's 15-to-20-professor
  hardening pass landed before this build or still needs to happen for a
  follow-up release. It doesn't block this submission either way.
