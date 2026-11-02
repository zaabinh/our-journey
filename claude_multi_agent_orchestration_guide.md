# Master Orchestration Guide: Claude Opus & Parallel Sonnet Agents

This document contains the complete orchestration workflow and prompt templates for coordinating **Claude Opus** (as Lead Architect / Orchestrator) and **Claude Sonnet** (as parallel feature developers) using **Git Worktrees** in `zaabinh/our-journey`.

---

## 1. Master Prompt for Claude Opus (Lead Architect / Orchestrator)

> **Instructions**: Paste this prompt into Claude Opus (via Claude Code CLI, Cursor Composer, or web console) with the repository loaded.

```text
Act as a Principal Software Architect and Lead Project Orchestrator for the repository `zaabinh/our-journey`.

You are supervising multiple parallel Junior/Mid-level AI Engineers (Claude Sonnet agents). Your responsibility is to analyze the codebase, structure independent task assignments, create isolated Git worktrees, supervise parallel code generation, and run quality assurance/merge audits.

Here are the 4 main milestones we need to complete:
- Task 1: Cleanly commit existing unstaged changes with a logical Git commit message.
- Task 2: Landing Page Feature Cards Refactor (Icons, Serif tracking numbers 01/02/03, glassmorphism card hierarchy).
- Task 3: Theme-matching Skeleton Loading Screens (Album list & Memory detail pages).
- Task 4: User Profile Page Fix (Giant avatar constraint, file upload UX, form alignment).

---

### PHASE 1: REPOSITORY INSPECTION & SAFE BASELINE (Task 1 Execution)
1. Repository Audit:
   - Run `git status` and `git diff` to inspect current unstaged/untracked modifications.
   - Group related modifications into logical, atomic commits following the Conventional Commits specification (e.g., `refactor(ui): ...`, `fix(auth): ...`).
   - Create a clean baseline on the current working branch (`main` or `develop`).
2. File Dependency Mapping:
   - Map out the exact file paths involved in Tasks 2, 3, and 4 to verify that none of the sub-tasks have overlapping write targets:
     - Task 2 Target Files: Landing page components (e.g., landing page view, feature card subcomponents, landing styles).
     - Task 3 Target Files: Album / Memory views & new Skeleton components (e.g., `components/ui/Skeleton.tsx`, `MemoryCardSkeleton.tsx`, `MemoryDetailSkeleton.tsx`).
     - Task 4 Target Files: Profile view & form components (e.g., `ProfilePage.tsx`, profile styles).

---

### PHASE 2: WORKSPACE ISOLATION & GIT WORKTREE GENERATION
To enable parallel execution across multiple Claude Sonnet instances without race conditions or file locking, output the exact shell commands to set up Git worktrees:

```bash
git branch feature/landing-feature-cards
git branch feature/skeleton-loading
git branch feature/profile-page-fix

git worktree add ../our-journey-task2 feature/landing-feature-cards
git worktree add ../our-journey-task3 feature/skeleton-loading
git worktree add ../our-journey-task4 feature/profile-page-fix
```

---

### PHASE 3: SONNET ASSIGNMENT SPECIFICATIONS (Dispatch Briefs)
For each of the 3 worktrees, generate an isolated, self-contained prompt tailored for a Claude Sonnet agent. Each prompt must include:
1. Assigned Directory / Worktree Path.
2. Strict File Boundaries: List explicitly which files Sonnet is permitted to create/modify, and forbid touching other modules to prevent merge conflicts.
3. Exact Technical Specification (Tasks 2, 3, and 4 detailed specs).
4. Mandatory Git Protocol:
   - Stage only modified relevant files (`git add <files>`).
   - Commit using Conventional Commits.
   - Run local linting / typecheck (`npm run lint` or `npm run type-check`) before marking complete.

---

### PHASE 4: CODE REVIEW, TEST AUDIT & MERGE STRATEGY
After the Sonnet instances complete their respective branches:
1. Verification Checklist:
   - Provide the commands to verify each branch:
     - Check diffs: `git diff main..feature/<branch-name>`.
     - Build verification: Run `npm run build` or frontend test suites inside each worktree.
2. Merge & Clean-up Protocol:
   - Provide the sequential merge sequence (rebase or merge without fast-forward `--no-ff`).
   - Commands to remove temporary worktrees once merged:
     ```bash
     git worktree remove ../our-journey-task2
     git worktree remove ../our-journey-task3
     git worktree remove ../our-journey-task4
     git branch -d feature/landing-feature-cards feature/skeleton-loading feature/profile-page-fix
     ```

Begin by executing PHASE 1 (analyzing current repository status and committing existing changes), then output the dispatch briefs for PHASE 2 & 3.
```

---

## 2. Dispatch Prompt for Agent 1 (Sonnet - Task 2)

> **Worktree Directory**: `../our-journey-task2`  
> **Branch**: `feature/landing-feature-cards`

```text
Act as a Senior UI/UX Frontend Engineer. You are working exclusively inside the worktree directory `../our-journey-task2` on branch `feature/landing-feature-cards`.

### STRICT BOUNDARY RULES
- Only touch Landing Page components and related landing styles.
- Do NOT touch profile pages, auth controllers, or album/memory detail components.

### SPECIFICATION: Refactor Feature Cards (01, 02, 03)
1. Redesign Feature Numbers (01, 02, 03):
   - Remove the small dark solid pill badges currently wrapping the numbers.
   - Style the numbers `01`, `02`, `03` using the same elegant Serif / tracking styling as the "OUR JOURNEY" sub-badge:
     - Font: Serif typography (matching the "OUR JOURNEY" subtitle), uppercase, tracking-wider/tracking-widest.
     - Sizing & Color: Styled prominently (e.g., `text-xl` or `text-2xl`, semi-bold) in a refined deep wine or rose accent color (`#7A2238` or `text-rose-900/80`), positioned cleanly at the top header of each card.
2. Add Feature Icons:
   - Add a themed Lucide/SVG icon to each card header next to or above the number:
     - Card 01 ("Một nơi cho mọi câu chuyện"): Book / Journal / Album icon (`BookHeart` or `FolderHeart`).
     - Card 02 ("Ảnh đi cùng ký ức"): Camera / Gallery icon (`Camera` or `ImagePlus`).
     - Card 03 ("Dễ tìm lại khi cần"): Search / Sparkle filter icon (`Sparkles` or `SearchHeart`).
   - Style icons inside a soft pastel rounded container (`w-10 h-10 rounded-xl bg-rose-100/70 text-rose-800 flex items-center justify-center`).
3. Card Typography & Visual Hierarchy:
   - Align the Icon and the Serif Number `01/02/03` gracefully on the top row (flex justify-between).
   - Increase title contrast (`text-lg font-semibold text-rose-950 mt-3`).
   - Body copy: `text-sm leading-relaxed text-stone-600 mt-1`.
   - Add hover micro-interaction (`hover:-translate-y-1 hover:shadow-lg hover:border-rose-200 transition-all duration-300`).

### COMPLETION PROTOCOL
- Run `npm run lint` or `npm run type-check`.
- Commit with: `git commit -m "feat(landing): modernize feature cards with serif numbers and icons"`.
```

---

## 3. Dispatch Prompt for Agent 2 (Sonnet - Task 3)

> **Worktree Directory**: `../our-journey-task3`  
> **Branch**: `feature/skeleton-loading`

```text
Act as a Senior Frontend Engineer. You are working exclusively inside the worktree directory `../our-journey-task3` on branch `feature/skeleton-loading`.

### STRICT BOUNDARY RULES
- Only touch Album List, Memory Details, and UI Skeleton components.
- Do NOT modify Landing Page or User Profile logic.

### SPECIFICATION: Themed Skeleton Loading Screens
1. Reusable Skeleton Primitive:
   - Build a flexible `<Skeleton className="..." />` component supporting customizable dimensions and smooth blush/cream pulse effects (`bg-rose-100/60` transitioning to `bg-rose-200/50` or warm cream `bg-[#F5ECEB]`).
   - Avoid cold generic grays.
2. Album List & Memory Grid Skeleton (`MemoryCardSkeleton`):
   - Rounded card container (`rounded-2xl`).
   - Cover image frame with fixed ratio (`aspect-[4/3]` or `h-52`).
   - Title bar (`h-6 w-3/4 rounded-md`), date badge (`h-4 w-1/3 rounded-md mt-2`), 2 snippet lines (`h-3.5`), and footer metadata badges.
   - Render a responsive 4–6 card grid during data fetching.
3. Memory Detail Page Skeleton (`MemoryDetailSkeleton`):
   - Top action bar & title skeletons (`h-8 w-1/2` and `h-4 w-1/4`).
   - Two equal-height photo frames side-by-side (`rounded-xl`).
   - Reaction bar: row of circular skeletons (`w-8 h-8 rounded-full`).
   - Story card: 3–4 paragraph skeletons.
   - Comments section: avatar circle (`w-9 h-9 rounded-full`) + comment bubble placeholder.
4. Integration:
   - Wire skeletons into data loading flags (`isLoading` or query status) with smooth replacement on load completion.

### COMPLETION PROTOCOL
- Run `npm run lint` or `npm run type-check`.
- Commit with: `git commit -m "feat(ui): add warm themed skeleton loading for albums and memories"`.
```

---

## 4. Dispatch Prompt for Agent 3 (Sonnet - Task 4)

> **Worktree Directory**: `../our-journey-task4`  
> **Branch**: `feature/profile-page-fix`

```text
Act as a Senior Frontend Engineer. You are working exclusively inside the worktree directory `../our-journey-task4` on branch `feature/profile-page-fix`.

### STRICT BOUNDARY RULES
- Only touch User Profile view, avatar management components, and profile styling.
- Do NOT touch Landing Page or Album/Memory view modules.

### SPECIFICATION: User Profile Modernization & Layout Fix
1. Fix Giant Avatar Container:
   - Restrict avatar dimensions to standard compact size: `width: 112px; height: 112px` (`w-28 h-28`), `rounded-full`, `object-fit: cover`.
   - Add a subtle ring and shadow (`ring-4 ring-rose-100 shadow-sm`).
2. Redesign Avatar Action Controls:
   - Hide the raw browser `<input type="file" />`.
   - Trigger file selection via a styled "Đổi ảnh đại diện" button or floating camera icon over the avatar.
   - Add a secondary subtle "Xóa ảnh" button (visible only when an avatar exists).
3. Form Layout & Fields Polish:
   - Restructure into a balanced, centered profile card (`max-w-xl` on desktop).
   - Display name input with clean theme-matching focus rings.
   - Read-only email: Apply `readOnly`/`disabled`, background `#F9FAFB`, muted text, and a small lock icon indicator.
   - Submit Button ("Lưu hồ sơ"): Right-aligned or full-width button with deep wine styling (`#4A1220`), comfortable padding (`px-6 py-2.5`), and hover states.

### COMPLETION PROTOCOL
- Run `npm run lint` or `npm run type-check`.
- Commit with: `git commit -m "fix(profile): constrain avatar size and polish form layout"`.
```

---

## 5. Verification & Merging Sequence (Run in Main Repo)

Once all agents report completion:

```bash
# 1. Switch to your main branch
git checkout main

# 2. Review and merge Task 2
git merge --no-ff feature/landing-feature-cards -m "merge: feat(landing) feature cards redesign"

# 3. Review and merge Task 3
git merge --no-ff feature/skeleton-loading -m "merge: feat(ui) skeleton loading integration"

# 4. Review and merge Task 4
git merge --no-ff feature/profile-page-fix -m "merge: fix(profile) layout and avatar fix"

# 5. Clean up temporary worktrees and branches
git worktree remove ../our-journey-task2
git worktree remove ../our-journey-task3
git worktree remove ../our-journey-task4

git branch -d feature/landing-feature-cards feature/skeleton-loading feature/profile-page-fix
```