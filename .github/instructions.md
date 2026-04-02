# Project Overview

The BGG Dashboard is a lightweight board game collection tracker that syncs data from BoardGameGeek (BGG) into a local SQLite database. The dashboard provides:
- Real-time collection synchronization with granular progress tracking
- Play statistics and player insights (h-index, total plays, owned games count)
- Three-stage sync pipeline: Get Games → Get Metadata → Get Plays
- Full collection ingestion with ownership tracking for insights

**Core Tech Stack:**
- **Backend**: PHP + SQLite3 (no ORM)
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **Data Ingestion**: BGG XMLAPI2 endpoints only
- **Hosting**: Static dist/ folder deployable anywhere

# Instructions

- always keep README.md up to date using best practices for readme files
- always keep Architecture.md when introducing new architecture patterns or changeing existing patterns
- always keep Learnings.md up to date if we learn something that should be remembered while implementing the code
- check if any of the new or renamed files need to be added to gitignore