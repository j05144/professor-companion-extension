# Development Log

This document tracks our progress, key decisions, challenges, and next steps throughout the project. Each team member adds a dated entry after completing a milestone or significant task.

---

## Project Status

**Current Phase:** Phase 2 | Sidebar Frontend

**Current Direction:** Build a Chrome extension (MVP) first, then evaluate expanding into a standalone web application.

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
Completed: 
Challenges:
Next Steps:

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