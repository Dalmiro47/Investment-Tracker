# DDeutSche Development Guidelines

## 1. Core Philosophy
* **Mobile-First:** All UI must be designed for mobile (375px+) first, then adapted for desktop using `md:`, `lg:` prefixes.
* **Type Safety:** The application must strictly pass TypeScript validation.
    * **Rule:** Run `npx tsc --noEmit` frequently. No code should be committed if this command fails.
* **Vibe Coding:** Always generate **complete, production-ready file blocks**. Never use placeholders like `// ... existing code`. 
* **Scalability:** Prefer `writeBatch` for multiple operations. Avoid "N+1" query patterns (fetching data inside a loop).

## 2. Tech Stack & Architecture
* **Framework:** Next.js (App Router). 
    * *Default to Server Components.* Use `'use client'` only when strictly necessary (hooks, event listeners).
* **Backend (Hybrid Model):**
    * **Reads:** Firebase Client SDK (use hooks in `/hooks`).
    * **Writes:** Next.js Server Actions using Firebase Admin SDK.
* **Validation:** Use `Zod` for all data validation, especially within Server Actions.
* **Styling:** Tailwind CSS + Shadcn UI + Lucide Icons (standardize to `size={20}`).

## 3. Coding Standards

### TypeScript & Validation
* **Strict Types:** No `any`. Use interfaces from `@/types`.
* **Schemas:** Define Zod schemas for all database entities to ensure runtime safety.

### Components
* **Imports:** Use absolute paths: `@/components/...`, `@/lib/...`, `@/hooks/...`.
* **Forms:** Use `sonner` for toast notifications on action success/failure.

### Firestore Interactions
* **Writes:** Always include `createdAt` and `updatedAt` using `serverTimestamp()`.
* **Server Actions:** Every write action must verify the user's UID via Admin SDK to ensure the requester owns the data they are modifying.
* **Migrations**: Notify the user if a change requires a data backfill script.

## 4. Workflows

### The "Definition of Done"
Before submitting code, you must:
1. Run `npx tsc --noEmit && npm run lint`.
2. Verify mobile responsiveness in dev tools.
3. Provide 3 User Acceptance Tests in English in this format:
   - **GIVEN** [context] **WHEN** [action] **THEN** [expected result].

### Shadcn UI
Add components via CLI: `npx shadcn-ui@latest add [component-name]`. Do not manually copy-paste shadcn code unless customizing core logic.

## 5. Directory Structure
* `app/` - Routes, Layouts, and Server Actions (`/actions` subfolder).
* `components/ui/` - Atomic Shadcn components.
* `components/` - Feature-specific components.
* `hooks/` - Client-side Firestore listeners and logic.
* `lib/` - Shared utilities and Firebase config (client vs admin).
* `types/` - TypeScript interfaces and Zod schemas.