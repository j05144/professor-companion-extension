# Phase 5 Notes: Search Quality

Deeper context for the quality loop. The dev log has the timeline and the
numbers; this has the reasoning.

## The loop, and why it was run this way
Search quality is the one part of this project that cannot be verified by
looking at the code. Every round of changes looked correct in review; the only
way to know whether results got better was to read them against a fixed
standard. So:
- 10-professor stratified roster (5 Baruch, 2 Hunter, 1 Queens, 1 non-CUNY,
  1 zero-presence control). The strata exist to keep a single campus from
  carrying the score, and the control exists so "found nothing" stays a
  correct answer we can measure rather than a failure we can only regret.
- Ground truth written by hand BEFORE scoring. Deciding what a good result
  looks like after seeing the output is how a target quietly moves to wherever
  the tool already is.
- One change per round, same 0-to-2 rubric throughout (0 junk / 1 weak match /
  2 genuinely useful). Two changes in one round would have produced a number
  nobody could attribute.

Result: 5 of 9 with-presence professors useful at baseline, 7 of 9 after
Round 1, 8 of 9 after Round 2, with the control correctly empty every time.
The bar was useful threads for 3 of 5 with-presence professors, so the Phase 5
gate is cleared.

## What was actually broken
All three root causes were in query CONSTRUCTION. Nothing was wrong with
parsing, ranking, dedupe, or rendering — the pipeline was faithfully
delivering the answers to the wrong questions.

1. **Wrong community, and asked of everyone.** The hardcoded multireddit
   searched r/hunter, which is not Hunter College's subreddit (that is
   r/HunterCollege) — and because the list was fixed, every professor searched
   all three subs regardless of school. A Baruch professor was carrying Queens
   noise plus noise from a community that had nothing to do with any campus.
2. **School names are not identity.** Keying the campus mapping on RMP's
   display string failed the moment RMP disagreed with itself: it prefixes
   some campuses ("CUNY Queens College") and keeps three separate Hunter
   records with three IDs and three spellings. The fix was to key on the
   school ID in the /school/{id} href — the same URL-as-identity lesson the
   Phase 3 detection fix taught, arriving a second time in a different
   costume. Rendered text is a display artifact; the URL is the record.
3. **Students do not write full names.** The exact-phrase query missed threads
   saying "professor Lastname", which is most of how professors get mentioned.
   The last-name fallback fires only when the exact query returns zero, so it
   can add results but never displace better ones, and only inside the campus
   subreddit, where a surname is probably about that campus's professor.

## Two things scoring caught that review did not
- **The first Round 1 pass measured the wrong code path.** The harness calls
  fetchRedditThreads without a school ID, so it fell through to the name
  lookup — precisely the mechanism Round 1 existed to replace. The change was
  correct and the test was honest; they were just testing different things.
  Worth remembering: a harness that bypasses the integration point measures
  the code you did not change.
- **The sitewide query had been leaving school words unquoted**, so Reddit
  could rank a thread matching only "Queens" or "College" with nothing about
  the professor in it. Reading actual output surfaced it; reading the code had
  not, because the query string looked reasonable.

## Status and what remains
- Quality loop: complete. Phase 5's gate is cleared, so the demo GIF and the
  Web Store publish are unblocked.
- Phase 4 leftovers, now unblocked (Jinge landed the error card and the
  16/48/128 PNGs on 7/28): wire the error state to her card, add the icons key
  to manifest.json, open the Web Store developer account.
- Phase 5 remaining: Jinge's restyle (flatten cards to rows, tool identity in
  the header, demote the LinkedIn button), a 15-to-20-professor hardening pass
  on the same rubric, then screenshots and the demo GIF.
