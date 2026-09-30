# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Grouped Card Lists (CollapsibleGroup)

**Convention**: any card-list page that renders grouped sections must reuse `frontend/src/components/CollapsibleGroup.tsx` — never re-implement collapse UI.

**Why**: consistent collapse behavior, arrow animation, and persisted state per group without duplicated code.

**How**:

- The page keeps its own grouping logic (extract keys, ordering) and renders one `CollapsibleGroup` per group, passing `title` / `count` / `storageKey`; children is the card grid.
- `storageKey` must be unique per page — group (e.g. `portal-group-collapsed-public`, `portal-group-collapsed-user-${ownerId}`, `tm-group-collapsed-${tag}`) so collapse state persists across sessions.
- Reference usages: `TestMachinePage.tsx`, `TestResultsPage.tsx`, `PortalPage.tsx`.

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

<!-- A11y requirements and patterns -->

(To be filled by the team)

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

(To be filled by the team)
