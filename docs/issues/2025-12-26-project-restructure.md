# Project Restructure: Organize NotifyHub Components

**Issue:** #RESTRUCTURE-001  
**Date:** December 26, 2025  
**Type:** Enhancement / Refactoring  
**Priority:** Medium  
**Status:** Open  

## Problem
The current project structure mixes backend Python files and frontend assets at the root level, reducing readability and making navigation confusing:

- Backend components (`server.py`, `models.py`) are scattered in `notifyhub/`
- Frontend is in a separate `notifyhub/frontend/` directory
- No clear logical grouping of related components

This makes it harder for developers to understand the project layout and maintain code.

## Proposed Solution
Restructure the project to organize components into dedicated subdirectories under `notifyhub/`:

### Current Structure
```
notifyhub/
├── cli.py
├── models.py
├── server.py
notifyhub/frontend/
├── src/, public/, templates/, static/
```

### Proposed Structure
```
notifyhub/
├── cli.py               # Kept for top-level access
├── backend/
│   ├── backend.py       # Renamed from server.py
│   ├── models.py        # Moved
│   └── __init__.py
└── frontend/            # Moved from notifyhub/frontend/
    ├── src/, public/, templates/, static/
```

## Implementation Plan
See `docs/plans/2025-12-26-project-restructure-plan.md` for detailed implementation steps.

## Key Changes
- Move `notifyhub/frontend/` → `notifyhub/frontend/`
- Move `notifyhub/models.py` → `notifyhub/backend/models.py`
- Rename `notifyhub/server.py` → `notifyhub/backend/backend.py`
- Update all path references and imports
- Update Makefile, README, and documentation

## Breaking Changes
- Import paths change: `notifyhub.server` → `notifyhub.backend.backend`
- File paths in documentation and configs
- Makefile commands: `cd web` → `cd notifyhub/frontend`

## Acceptance Criteria
- [ ] Project structure matches proposed layout
- [ ] Backend starts successfully: `make backend`
- [ ] Frontend builds successfully: `make frontend`
- [ ] All tests pass: `make test-all`
- [ ] API endpoints functional
- [ ] Static assets served correctly
- [ ] No broken imports or references
- [ ] Documentation updated
- [ ] Development workflow unchanged for users

## Risks
- Path resolution issues for static files and templates
- Import compatibility during transition
- Potential disruption to development workflow

## Related Files
- Plan: `docs/plans/2025-12-26-project-restructure-plan.md`
- Affected: `Makefile`, `README.md`, `tests/test_server.py`, all docs in `docs/`

## Labels
enhancement, refactoring, breaking-change, documentation