# Autars MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a polished first MVP/prototype of an AI agent command center: users create a business mission, see a gamified dashboard, review proposed AI actions, and control autonomy/budget before execution.

**Architecture:** Single-page React/Vite/TypeScript app with local state only. No real AI calls, email sending, scraping, or payments in v0. The prototype demonstrates the core product experience: mission setup → agent team → approval center → XP/progress → cost/risk control.

**Tech Stack:** Vite, React, TypeScript, CSS modules via global `src/App.css`, local mock data in `src/data.ts`, pure functions in `src/missionEngine.ts`.

---

## Product Scope

### Product positioning

Autars is **not** “AI makes money while you sleep.” It is:

> Autonomous AI agents for business execution — with human approval, budgets, risk levels, and a gamified command center.

### MVP user promise

A solo founder can create a mission like “Find 20 qualified prospects for my offer,” then review:

- recommended agents;
- proposed tasks;
- sensitive actions requiring approval;
- estimated AI cost;
- risk level;
- mission XP/progress.

### Core constraints

- No external sending/publishing in v0.
- Approval-first UX is the differentiator.
- Every automation has a visible cost, risk, and permission gate.
- Design should feel premium: Linear-style dark UI, game layer, command center aesthetic.

---

## Tasks

### Task 1: Create project scaffold

**Objective:** Initialize Vite React TypeScript project.

**Files:**
- Create: `package.json`, `src/*`, `index.html`

**Commands:**
```bash
npm create vite@latest autars -- --template react-ts
cd autars
npm install
```

**Verification:**
```bash
npm run build
```
Expected: TypeScript + Vite build succeeds.

---

### Task 2: Add product model types and mock data

**Objective:** Define missions, agents, approvals, autonomy levels, and gamification primitives.

**Files:**
- Create: `src/types.ts`
- Create: `src/data.ts`

**Acceptance criteria:**
- Types include `Mission`, `Agent`, `ApprovalAction`, `AutonomyLevel`, `GameProfile`, `RiskLevel`.
- Mock mission shows a realistic business mission.
- Approval actions include email, LinkedIn, landing page, budget, and public posting examples.

---

### Task 3: Add mission engine helpers

**Objective:** Add deterministic helper functions for progress, risk, cost, XP, and approval summaries.

**Files:**
- Create: `src/missionEngine.ts`

**Acceptance criteria:**
- `calculateMissionProgress` returns 0–100.
- `getPendingApprovals` filters pending actions.
- `calculateTotalEstimatedCost` sums action costs.
- `getRiskColor` maps risk to UI colors.
- Functions are pure and easy to replace later with API-backed logic.

---

### Task 4: Build main app UI

**Objective:** Replace default Vite app with Autars dashboard.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/index.css`

**UI sections:**
1. Header with brand, autonomy mode, and CTA.
2. Hero / mission creation card.
3. Mission status panel with XP, level, progress, budget, risk.
4. Agent squad cards.
5. Approval center with approve/edit/reject buttons.
6. Automation control panel with autonomy slider and hard limits.
7. Activity feed / game achievements.

**Design style:**
- Dark Linear-inspired UI.
- Indigo/violet accent.
- Neon green success states.
- Premium glass cards.
- Gamified XP/progress without looking childish.

---

### Task 5: Add local interactions

**Objective:** Make prototype feel alive without backend.

**Files:**
- Modify: `src/App.tsx`

**Interactions:**
- Approve/reject actions updates their status.
- Autonomy level can be changed.
- Mission input updates generated mission title.
- Progress and XP update based on approvals.
- No real external action occurs.

---

### Task 6: Build and verify

**Objective:** Ensure the prototype compiles and can be viewed.

**Commands:**
```bash
npm run build
npm run dev -- --host 0.0.0.0
```

**Verification:**
- Browser opens dashboard.
- No console errors.
- Main sections are visible.
- Approval interactions work.
- Mobile layout remains usable.

---

## V1 After Prototype

Only after validating the UI/concept:

1. Add auth and persisted missions.
2. Add real AI planning/generation.
3. Add email/LinkedIn export, not auto-send first.
4. Add Stripe billing + credits.
5. Add real scheduled agents with approval gates.
6. Add integrations: Gmail, Notion, Airtable, GitHub, Webflow/Framer.

## Kill / Continue Criteria

Continue if 10 target users understand the product in under 30 seconds and at least 3 say they would pay 29–99€/month for controlled AI business missions.

Kill or pivot if users only see it as a toy, or if they want fully autonomous “make money” promises rather than controlled execution.
