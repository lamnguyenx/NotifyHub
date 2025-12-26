# Project Restructure Plan: NotifyHub Organization

**Date:** December 26, 2025  
**Status:** Planned  
**Priority:** Medium  

## Overview
Restructure the NotifyHub project for improved readability by organizing backend and frontend components into dedicated subdirectories under the main `notifyhub/` package.

## Current Structure
```
notifyhub/
├── __init__.py
├── cli.py
├── models.py
├── server.py
notifyhub/frontend/
├── src/
├── public/
├── templates/
├── static/
└── package.json
```

## Proposed Structure
```
notifyhub/
├── __init__.py          # Unchanged (empty)
├── cli.py               # Kept here for top-level access
├── backend/
│   ├── __init__.py      # New (empty)
│   ├── backend.py       # Renamed from server.py
│   └── models.py        # Moved from notifyhub/
└── frontend/            # Moved from notifyhub/frontend/
    ├── src/
    ├── public/
    ├── templates/
    ├── static/
    └── package.json
```

## Implementation Steps

### Phase 1: Directory and File Restructuring
1. Create `notifyhub/backend/` directory
2. Move `notifyhub/models.py` → `notifyhub/backend/models.py`
3. Move `notifyhub/server.py` → `notifyhub/backend/backend.py` (rename during move)
4. Move entire `notifyhub/frontend/` directory → `notifyhub/frontend/`
5. Create empty `notifyhub/backend/__init__.py`

### Phase 2: Code Path Updates
- Update static file mount in `notifyhub/backend/backend.py`:
  - `directory="notifyhub/frontend/static"`
- Update template directory in `notifyhub/backend/backend.py`:
  - `directory="notifyhub/frontend/templates"`

### Phase 3: Import Reference Updates (Breaking Changes)
- Update `tests/test_server.py`:
  - `from notifyhub.server import app` → `from notifyhub.backend.backend import app`
  - `notifyhub.server.store` → `notifyhub.backend.backend.store`
- Update any other code/docs referencing `notifyhub.server` → `notifyhub.backend.backend`

### Phase 4: Build System Updates
- Update `Makefile`:
  - `backend`: `python -m notifyhub.backend.backend --port 9080`
  - `frontend`: `cd notifyhub/frontend && bun run build`
  - `frontend-dev`: `cd notifyhub/frontend && bun run dev`
  - `noti`: `python -m notifyhub.cli --port 9080 "Hello"` (unchanged)

### Phase 5: Documentation Updates
- Update `README.md`:
  - Change all `cd web` commands to `cd notifyhub/frontend`
  - Update installation and development instructions
- Update all documentation in `docs/` referencing `notifyhub/frontend/` paths
- Update any configuration files or scripts with old paths

### Phase 6: Testing & Verification
- Install dependencies: `pip install -e . && cd notifyhub/frontend && bun install`
- Build frontend: `make frontend`
- Run backend: `make backend`
- Update and run tests: `make test-all`
- Verify API endpoints and static file serving

## Benefits
- **Readability**: Clear separation of backend/frontend under `notifyhub/`
- **Organization**: Related components grouped logically
- **Maintainability**: Easier navigation and development workflow

## Risks & Mitigations
- **Breaking Changes**: Import paths change - update all references immediately
- **Path Dependencies**: Ensure static/template paths resolve correctly from new locations
- **Testing**: Comprehensive testing required after restructuring

## Dependencies
- None - this is internal restructuring

## Success Criteria
- [x] All directories moved and files renamed
- [x] Backend starts successfully: `make backend`
- [x] Frontend builds: `make frontend`
- [x] All tests pass: `make test-all`
- [x] API endpoints functional
- [x] Static assets served correctly