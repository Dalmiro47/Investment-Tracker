# CLAUDE.md

## Constraints

Read and follow `CONSTRAINTS.md` at the repo root before every task. It defines:
- What you must never do (Section 1)
- When to stop and ask (Section 2)
- How to resolve goal vs. constraint conflicts (Section 3)
- Session hygiene rules (Section 4)
- Project-specific extensions (Section 5)

CONSTRAINTS.md rules are non-negotiable. If a task conflicts with a constraint, stop and surface the conflict — do not silently resolve it.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run typecheck    # npx tsc --noEmit
npm run lint         # ESLint via next lint
npx shadcn-ui@latest add [component-name]  # Add Shadcn components
```

**Definition of Done:** Always run `npm run typecheck && npm run lint` before finishing. No `any` types allowed — TypeScript must pass cleanly.

## Architecture

**Framework:** Next.js 15 App Router. Default to Server Components; use `'use client'` only for hooks/event listeners.

**Backend hybrid model:**
- **Reads:** Firebase Client SDK via hooks in `src/hooks/`
- **Writes:** Next.js Server Actions (`src/app/actions/`) using Firebase Admin SDK (`src/lib/firebase-admin.ts`)
- Every write Server Action must verify the user's UID via Admin SDK to confirm ownership

**Key directories:**
- `src/app/actions/` — Server Actions (prices, ETF, Kraken sync, mobile UI session)
- `src/app/api/` — API routes for Kraken (account-log, fills, open-positions, prices), ETF prices, JustETF, simulate
- `src/features/portfolio/` — Portfolio feature logic
- `src/hooks/` — Client-side Firestore listeners (`useClosedPositions`, `useFuturesPositions`, `useKrakenSync`, etc.)
- `src/lib/` — Firebase config, Firestore helpers, types, utilities
- `src/components/` — Feature components; `src/components/ui/` for Shadcn atomic components

**Domain types** (`src/lib/types.ts`): `Investment`, `Transaction`, `TaxSettings`, `AggregatedSummary`. ETF-specific types are in `src/lib/types.etf.ts`.

**Firestore helpers:** Client reads use `src/lib/firestore.ts` / `src/lib/firestore.etf.ts`; server writes use `src/lib/firestore.etf.server.ts`. Always include `createdAt`/`updatedAt` with `serverTimestamp()` on writes.

**External data sources:**
- Kraken API (`src/lib/kraken-api.ts`) for crypto futures positions
- Yahoo Finance + ECB FX rates for ETF price refreshes (`src/lib/providers/`)
- JustETF via API route

**Tax logic:** German tax calculations in `src/lib/tax.ts`, futures tax in `src/lib/futures-tax.ts`. Uses FIFO for sell matching (`src/components/fifo-sell-dialog.tsx`).

**AI integration:** Genkit with Google AI in `src/ai/` — run with `npm run genkit:dev`.

## Standards

- **Mobile-first:** Design for 375px+, then scale up with `md:` / `lg:` prefixes
- **Validation:** Zod schemas for all database entities and Server Action inputs
- **Icons:** Lucide React, standardized to `size={20}`
- **Notifications:** `sonner` toast on action success/failure
- **Absolute imports:** `@/components/...`, `@/lib/...`, `@/hooks/...`
- **Batch writes:** Use `writeBatch` for multiple Firestore operations; avoid N+1 patterns
- **Precision:** Use `big.js` for financial arithmetic
- **Data migrations:** Flag any schema change that requires a Firestore backfill script
