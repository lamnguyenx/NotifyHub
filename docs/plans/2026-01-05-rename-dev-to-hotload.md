# Rename "Dev" to "Hot-reload" Terminology

## Overview
Rename misleading "dev"/"development" terminology to "hot-reload" specifically for the hot-reloading frontend mode (port 9070 with proxy) to clarify its purpose. This avoids confusion with general development work and distinguishes loading modes from deployment environments.

## Scope
- Replace "dev"/"development" → "hot-reload" in hot-reload contexts only
- Keep general development references unchanged (e.g., "plugin development")
- Change table from "Environment" to "Mode" to properly categorize hot-reload vs production

## Files to Modify

### README.md
- Section: "## 3. Development Workflow" → "## 3. Frontend Loading Modes"
- Subsection: "### Development Diagram" → "### Hot-reload Diagram"
- Table header: "Environment" → "Mode"
- Table: "Development | `:9070` | `:9080` | Yes |" → "Hot-reload | `:9070` | `:9080` | Yes |"
- Table: "Production | `:9080` | `:9080` | No |" → "Static | `:9080` | `:9080` | No |"
- Commands: `make frontend-dev` → `make frontend-hotload`
- Tests: `make test-frontend-dev` → `make test-frontend-hotload`
- Descriptions: Update "development" → "hot-reload" where referring to the mode
- Flow: "**Development flow:**" → "**Hot-reload flow:**"

### AGENTS.md
- "frontend dev server" → "frontend hotload server"
- `make frontend-dev` → `make frontend-hotload`
- `make test-frontend-dev` → `make test-frontend-hotload`

### Makefile
- Comment: "# Development" → "# Hotload"
- Comment: "# Production" → "# Static"
- Targets: `frontend-dev` → `frontend-hotload`, `test-frontend-dev` → `test-frontend-hotload`
- Update `test-all` dependencies

### docs/plans/ (Active plans only)
- Update command references in current plans (e.g., 2025-12-30-dynamic-avatar-testing-plan.md)

## Implementation Steps
1. Update README.md sections, table, and references
2. Update AGENTS.md instructions
3. Rename Makefile targets and comments
4. Update active documentation plans
5. Test that `make frontend-hotload` works after changes

## Notes
- **Check actual date** when naming files that require dates (e.g., plan documents). Use `date +%Y-%m-%d` in a subshell to get the current date in YYYY-MM-DD format