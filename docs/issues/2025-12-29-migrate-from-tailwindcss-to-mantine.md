---
title: Migrate from TailwindCSS to Mantine UI Library
labels: feature-request, frontend, migration
priority: high
---

# Migrate from TailwindCSS to Mantine UI Library

## Feature Request

### Overview
Replace TailwindCSS utility classes with Mantine UI components for improved developer experience and consistent design system.

### Background
Current TailwindCSS setup requires extensive custom styling and utility class management, leading to bloated CSS and inconsistent component behavior. Mantine offers pre-built, accessible React components with theming, reducing development time and maintenance overhead.

### User Story
- **As a** frontend developer
- **I want to** migrate to Mantine UI library
- **So that** I can build UIs faster with standardized components and better maintainability

### Requirements
- Mantine library installation and configuration
- Component migration from custom Tailwind classes to Mantine equivalents
- Theme setup matching existing design
- Removal of unused TailwindCSS dependencies
- Updated styling documentation

### Acceptance Criteria
- [ ] Mantine v7+ installed with core components
- [ ] All major UI components migrated:
  - [ ] Buttons, inputs, modals
  - [ ] Navigation, cards, tables
  - [ ] Forms and validation components
- [ ] Theme configuration matches current color scheme
- [ ] No TailwindCSS classes remain in codebase
- [ ] Bundle size reduced by 20%
- [ ] All existing functionality preserved
- [ ] Components render correctly across browsers

### Technical Notes
- Follow existing React patterns in src/ components
- Use Mantine hooks for state management where applicable
- Maintain TypeScript support (see tsconfig.json)
- Update Vite config for any asset handling changes

### Proposed Implementation
1. Install Mantine: `npm install @mantine/core @mantine/hooks @mantine/dates`
2. Create Mantine theme provider in src/
3. Migrate components in src/App.jsx and puck-config.jsx
4. Update frontend tests in __tests__/ui/
5. Remove TailwindCSS: `npm uninstall tailwindcss` and delete tailwind.config.js
6. Update documentation in README.md

### Success Metrics
- Reduce component development time by 40% within 1 month
- Achieve 100% component coverage with Mantine
- Eliminate custom CSS classes by 80%
- Maintain or improve Lighthouse performance scores

### Alternatives Considered
- **Option A**: Keep TailwindCSS with custom component library - Pros: Familiar, flexible; Cons: High maintenance
- **Option B**: Switch to Material-UI - Pros: Mature ecosystem; Cons: Heavy bundle size
- **Option C**: ✓ Migrate to Mantine - Pros: Modern, lightweight, React-focused; Cons: Learning curve
- **Option D**: Build custom design system from scratch - Pros: Full control; Cons: Time-intensive

### Related Issues
- Blocks #notifyhub-restructure (2025-12-26-project-restructure-plan.md)
- Depends on stabilizing current React setup

### Estimated Effort
**5-7 days** (2 days research/setup, 3 days component migration, 2 days testing/docs)