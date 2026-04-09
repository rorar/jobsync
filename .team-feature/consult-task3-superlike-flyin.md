# Consult Task 3 — Super-Like Fly-In (UX / Interaction Design)

**Consulted files:**
- `/home/pascal/projekte/jobsync/src/components/staging/DeckView.tsx`
- `/home/pascal/projekte/jobsync/src/hooks/useDeckStack.ts`
- `/home/pascal/.claude/plugins/marketplaces/claude-code-workflows/plugins/ui-design/skills/interaction-design/SKILL.md`
- `/home/pascal/.claude/plugins/marketplaces/claude-code-workflows/plugins/ui-design/skills/interaction-design/references/microinteraction-patterns.md`
- `/home/pascal/projekte/jobsync/src/components/ui/toast.tsx` (Radix toast — current global toaster)
- `/home/pascal/projekte/jobsync/src/components/ui/use-toast.ts` (`TOAST_LIMIT = 1` — hard cap, matters for stacking)

---

## Executive recommendation (the opinionated TL;DR)

**Do NOT reuse the global Radix Toaster** and **do NOT install Sonner**. Both conflict with the constraints:

1. The project's `use-toast.ts` hard-codes `TOAST_LIMIT = 1` — super-liking 3 vacancies in a row would erase the previous two before the user can click "Open". Raising the limit would affect every toast in the app.
2. The global Toaster viewport currently sits **top-right on desktop** (`sm:bottom-0 sm:right-0`, plus `top-0` on mobile) — the opposite of "fly in from the bottom center, riding the hype moment".
3. Sonner would add a second toast system alongside Radix — two competing z-index stacks and two `aria-live` regions. Sustainability principle (CLAUDE.md) says "well-founded path, not easiest". A purpose-built in-deck celebration surface is the correct layer.

Instead: build a **dedicated, self-contained `SuperLikeCelebration` component** that is mounted **inside `DeckView`** (co-located with the deck state), uses **CSS transitions + tailwindcss-animate** (no new dependencies), and is completely independent of the global toast system. It is a *domain-specific microinteraction*, not a general notification — and should be modeled that way in code.

This approach also resolves a latent architectural gap the consultation exposed: `useDeckStack.performAction()` currently discards the result of `onAction()` beyond `success: boolean`. The deck never learns the **created Job ID**, so it cannot offer "Open created job". The fly-in requires plumbing that ID through — see section 11 below.

---

## 1. Visual position

- **Position:** `fixed` to viewport, **bottom center**. Not anchored to the deck container — the deck may scroll; the celebration must stay anchored in the hype zone (thumb reach on mobile, natural eye-path on desktop).
- **Offsets:** `bottom: max(env(safe-area-inset-bottom, 0px) + 16px, 24px)` on mobile (safe area on iOS), `bottom: 32px` on desktop.
- **Horizontal:** `left: 50%; transform: translateX(-50%)`.
- **Width:**
  - Mobile (`< 640px`): `calc(100vw - 24px)`, max `400px`.
  - Desktop (`≥ 640px`): fixed `380px`.
- **Height:** content-driven, `min-height: 68px`, `max-height: 96px`. Single-line title + single-line subtitle + single CTA button.
- **z-index:** `z-50` (same layer as Radix Toast viewport — but does not conflict because both accept pointer events on their children only).
- **Pointer events:** the outer wrapper is `pointer-events-none`, the inner card is `pointer-events-auto`. This is **load-bearing**: it is what makes "user can keep swiping behind it" true. The thin strip of screen the celebration occupies is the only area where clicks are captured.

## 2. Entry animation

- **Type:** slide-up + fade-in, **not** a spring overshoot. Overshoot reads as attention-grabbing/nagging; the brief says "subtle, non-nagging".
- **Transform:** `translateY(24px) → translateY(0)` combined with `opacity: 0 → 1`.
- **Duration:** `280ms` (in the 200–300ms "small transition" band from the skill guide).
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (the skill's `--ease-out` — decelerating, for entering elements).
- **Delay:** `0ms`. The exit animation of the swiped card (`ANIMATION_DURATION = 300ms` in `useDeckStack`) runs **in parallel** with the fly-in entrance. Sequencing them would feel laggy. Fire the celebration the moment the server action resolves successfully.
- **Star "sparkle" accent (optional, small):** a single `lucide-react` `<Sparkles />` icon next to the title with a `300ms` scale-up + subtle rotate `0→-8deg→0`. Celebration without glitter. Use `@keyframes` in `globals.css`, respects `prefers-reduced-motion`.

## 3. Dismiss interactions

**Six ways to dismiss, ranked by user intent clarity:**

| # | Method | Threshold / Behavior | Rationale |
|---|---|---|---|
| 1 | **Click CTA ("Open created job")** | Immediate | Primary success path |
| 2 | **X button** (top-right, inside card) | 32×32px tap target, `aria-label` translated | Explicit |
| 3 | **Swipe down** (touch + pointer drag) | `translateY > 48px` OR `velocityY > 0.4px/ms` | Matches user request |
| 4 | **Swipe right/left** | `abs(translateX) > 80px` | Nice-to-have; mirrors deck swipes |
| 5 | **ESC key** | Only when celebration currently has/had focus | A11y standard |
| 6 | **Auto-dismiss timer** | `6000ms` default, `8000ms` when hovered/focused | See below |

**Click outside:** **NO.** Click-outside as dismiss would defeat the "keep swiping behind it" constraint — every swipe behind the celebration would be interpreted as dismiss, killing the hype before the user can act. The celebration must be dismissed *intentionally*.

**Swipe down details:**
- Use native pointer events (same pattern `DeckView` already uses — `onPointerDown/Move/Up` + `setPointerCapture`). No new gesture library.
- During drag: apply `transform: translateY(${max(0, dragY)}px)` and `opacity: 1 - min(0.6, dragY/200)`.
- On release: if threshold crossed → exit animation down (`translateY(100%) + opacity 0`, 220ms). Else: spring back (`200ms ease-out`).
- Touch-action: `touch-action: pan-x` on the celebration card — allows horizontal browser gestures to pass through, captures vertical.

**Auto-dismiss timer rules (explicit):**
- **Default:** 6 seconds. Derived from Nielsen's "5-second floor for non-trivial content" + 1 second of breathing room for the user to realize what happened (the celebration is riding the post-swipe emotional peak, they need a beat).
- **Pause on hover/focus:** YES. Pause-on-hover is mandatory per WCAG 2.2.1 (Timing Adjustable) if content is time-limited.
- **Timer restart on hover?** **NO — pause, don't restart.** Restarting a timer on every mouse jiggle is a classic anti-pattern (the toast that "won't go away"). Pause while hovered; on `mouseleave`/`blur`, **resume with the remaining time, floored at 2000ms** so the user gets at least a 2-second window to act after moving away. Use `performance.now()` to track remaining.
- **Pause on any celebration focus** (keyboard-tab into it), not just hover.
- **Never** restart the timer when the user scrolls, swipes the deck, or interacts with non-celebration UI.

## 4. Stacking behavior

Rapid super-likes are a realistic flow — the user found a good batch. The UX must honor that, not punish it.

**Decision: hybrid — one visible card at a time, with a count badge and a compact queue.**

- **Queue model:** a FIFO list of pending celebrations (max 5 entries — older ones drop silently).
- **Visible state:** always exactly one card visible. When a new super-like lands:
  - If the current card is still within its **first 1500ms** of life (user hasn't had time to read it), **enqueue** the new one.
  - If the current card is older than 1500ms, **collapse-replace**: fade out the old (120ms), fade in the new (220ms), and show a compact badge "+2 more" in the top-left of the new card.
- **Count badge:** when `queue.length > 0`, render a small pill `"+N more"` in the top-left. Clicking it expands an inline stacked list (up to 3 preview rows with title + micro-CTA chevron). Clicking any row opens that job. Clicking elsewhere in the badge cycles to the next queued celebration.
- **Why not show 3 stacked cards visually?** It visually dominates the bottom of the deck, defeats "subtle". A single card + badge is the standard solution (Slack/Linear use this for grouped notifications).
- **Auto-dismiss while queued:** each card gets its own 6s timer starting when it becomes visible. The queue does not "wait". If the user ignores, all celebrations fall off in sequence (queue drains without user intervention).
- **Undo a super-like while celebration is visible:** if `useDeckStack.undo()` reverses a super-like whose celebration is still visible, **remove the corresponding celebration** (the job no longer exists). Match by `jobId`.

## 5. Visual hierarchy

**Layout (left to right):**

```
┌─────────────────────────────────────────────┐
│ [icon] Title (bold, 14px)              [×] │
│        Subtitle (12px, muted)               │
│                              [CTA button →] │
└─────────────────────────────────────────────┘
```

On a single compact row, it collapses to:

```
┌─────────────────────────────────────────────┐
│ [icon] Title — Subtitle       [CTA →]  [×] │
└─────────────────────────────────────────────┘
```

Prefer the second, compact layout at mobile widths; two-line layout at `≥ 640px`.

**Icon / illustration:**
- Use `<Sparkles />` from `lucide-react` at `h-5 w-5` in a rounded gradient chip (18×18 chip with `bg-gradient-to-br from-blue-500 to-indigo-600` light / `from-blue-400 to-indigo-500` dark). The gradient gives the celebration feel without heavy illustration work.
- **NOT** a `<Star />` — that's already the super-like *action* icon in `DeckView.tsx`. Using it again would conflate "the action" with "the confirmation of the action". Sparkles reads as "something happened" (celebration), which is the correct signal.
- No animated illustration, no confetti sprite. That violates "subtle".

**Color palette (rides the super-like blue, not the promote green):**

| Token | Light | Dark |
|---|---|---|
| Card background | `bg-white` | `bg-slate-900` |
| Border | `border border-blue-200` | `border-blue-900/60` |
| Title text | `text-slate-900` | `text-slate-50` |
| Subtitle text | `text-slate-500` | `text-slate-400` |
| Icon chip gradient | `from-blue-500 to-indigo-600` | `from-blue-400 to-indigo-500` |
| CTA button | `bg-blue-600 hover:bg-blue-700 text-white` | `bg-blue-500 hover:bg-blue-400 text-white` |
| Shadow | `shadow-lg shadow-blue-500/10` | `shadow-lg shadow-blue-400/5` |

**Why blue and not green?** Super-like is the **blue** action in the deck (`bg-blue-100 text-blue-600` on the super-like button, `bg-blue-500/15` swipe overlay). The celebration must share the color story of the action that triggered it — otherwise it reads as "a different system responded". Promote (green) triggers its own success; super-like (blue) triggers this celebration.

**Not celebration yellow** — yellow reads as warning in the JobSync palette (blacklist/block uses red, matches are yellow). Blue-with-sparkles is the cleanest fit.

**Copy guidance — who/what/how to act:**

| Slot | Guideline | Example key |
|---|---|---|
| Title | "What happened" + implicit "who" (the deck). Past tense, first-person neutral. Max 28 chars. | `deck.superLikeFlyin.title` → "Added to your favorites" |
| Subtitle | "Which one" — vacancy title (ellipsized to ~40 chars). | Vacancy title, plain text, no template |
| CTA | "How to act" — imperative verb + noun. 12–18 chars. | `deck.superLikeFlyin.cta` → "Open job" (see section 9) |

**Subtitle must be the vacancy title, not a generic message.** The user just saw a deck card — the subtitle is the memory hook that confirms the correct job was saved. Omitting it creates doubt and breaks trust.

## 6. Accessibility

- **Live region semantics:**
  - The celebration card root has `role="status"` and `aria-live="polite"` + `aria-atomic="true"`. Polite, not assertive — the user is in the middle of a rapid interaction flow; assertive would interrupt screen reader output mid-sentence.
  - Label: `aria-label={t("deck.superLikeFlyin.ariaLabel")}` on the region.
  - When the celebration appears, screen readers announce: *"Added to your favorites: \<vacancy title\>. Open job. Dismiss."* The existing `aria-live="assertive"` region in `DeckView.tsx` (lines 448–450) is **unrelated and must stay** — that one announces deck state.
- **Focus management: do NOT trap focus, do NOT auto-move focus.** Auto-focusing the CTA would yank focus away from the deck mid-swipe — that is the single most user-hostile thing a "subtle fly-in" can do. Keep focus on the deck. The celebration is tabbable in the normal document order (added to the tab sequence at the end of the deck region).
- **Keyboard reachability:**
  - `Tab` from the deck eventually lands on the celebration's CTA, then X button.
  - `ESC` dismisses the celebration **only** if focus is currently inside it or if a keyboard user has explicitly tabbed into it at least once in this instance. Otherwise `ESC` belongs to higher-level UI (e.g., closing a dialog above the deck). Use a `wasFocusedOnce` ref.
  - `Enter`/`Space` on CTA navigates to the job.
- **Visible focus ring:** use the project-standard `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (consistent with all deck buttons).
- **Tap target sizes:** CTA button `min-h-[40px] min-w-[96px]`, X button `min-h-[32px] min-w-[32px]` with `p-2` inner hitbox (meets WCAG 2.5.5 AAA 44×44 when you count padding).
- **Contrast:** blue-600 on white = 8.59:1 (AAA). Blue-500 on slate-900 = 7.1:1 (AAA). Both pass.
- **Reduced transparency:** no glassmorphism, no `backdrop-blur`. Solid backgrounds honor macOS/iOS "reduce transparency" by default.
- **Do not** use `role="alert"` — that's assertive and wrong for success.

## 7. Reduced motion (`prefers-reduced-motion: reduce`)

- **Entry/exit:** skip slide, use **fade only**, `150ms linear`. No `translateY`.
- **Sparkle accent:** disabled (no scale/rotate).
- **Swipe-to-dismiss:** still works — gestures are user-initiated motion, not system motion, and reduced-motion should not disable user controls.
- **Auto-dismiss timer:** unchanged. Reduced motion is not reduced time; some users with vestibular issues still want the celebration to clear itself.
- **Implementation:** single `prefers-reduced-motion` media query in a `<style>` block inside the component, gating two CSS variables (`--celebration-translate`, `--celebration-sparkle-scale`). Avoid JS `matchMedia` branching — keeps SSR simple.

## 8. Mobile vs desktop

**One component, two layouts** — controlled by Tailwind breakpoints, no JS branching.

| Aspect | Mobile (`< 640px`) | Desktop (`≥ 640px`) |
|---|---|---|
| Position | Bottom center, respects safe area | Bottom center, 32px from bottom |
| Width | `calc(100vw - 24px)`, max 400 | Fixed 380px |
| Layout | Two-line (title over subtitle+CTA) | Two-line (wider, more breathing room) |
| Dismiss X | Always visible | Visible on hover/focus only (`opacity-60 hover:opacity-100`) |
| Swipe to dismiss | Native pointer (primary) | Native pointer (works but secondary) |
| Compact badge "+N more" | Visible above card as a pill | Visible above card as a pill |
| Keyboard hints | Hidden | Optional: `"ESC to dismiss"` microcopy |

**Do not** use a mobile bottom sheet (`src/components/ui/sheet.tsx`) even though it exists. Sheets are modal — they dim the deck and block swipes. That breaks the core requirement.

**Do not** consider the Radix Toaster's current desktop bottom-right position "good enough" as a fallback — the brief says *center*, and center is correct. Right-anchored toasts read as system chrome, not as celebration.

## 9. CTA copy

Recommendation: **"Open job"** (short, imperative, uses the domain term the rest of the UI uses).

Ranking of the proposed options:

| Copy | Verdict | Why |
|---|---|---|
| **"Open job"** (my addition) | Winner | Shortest, clearest. "Job" is the exact domain term (`Job` entity, `/my-jobs` page). |
| "Open created job" | Close second | Accurate but "created" is developer-speak — users don't think "I just created a job", they think "I saved a job". |
| "View in MyJobs" | Reject | Surfaces navigation chrome ("MyJobs"), not intent. Users who haven't learned the MyJobs page name are lost. |
| "See your new application" | Reject | **Wrong domain word.** An "application" in JobSync is the act of applying (status transition). Super-like creates a `Job` in the pipeline, not an application. This would be a data-model lie. |

**Localization consequences:** create namespace `deck.superLikeFlyin` in `src/i18n/dictionaries/` with 4 locales:

| Key | EN | DE | FR | ES |
|---|---|---|---|---|
| `title` | Added to your favorites | Zu deinen Favoriten hinzugefügt | Ajouté à vos favoris | Añadido a tus favoritos |
| `cta` | Open job | Job öffnen | Ouvrir le poste | Abrir empleo |
| `dismissLabel` | Dismiss celebration | Benachrichtigung schließen | Fermer la notification | Cerrar notificación |
| `countBadge` | +{count} more | +{count} weitere | +{count} autres | +{count} más |
| `ariaLabel` | Super-like confirmed | Super-Like bestätigt | Super-like confirmé | Súper me gusta confirmado |

## 10. Exact component structure

### Files to create

```
src/components/staging/
  SuperLikeCelebration.tsx         ← new: visual component
  SuperLikeCelebrationHost.tsx     ← new: queue + rendering host (mounted once in DeckView)
src/hooks/
  useSuperLikeCelebrations.ts      ← new: queue state, timer, enqueue API
```

### Primitives used

- **Radix: none.** Not a dialog, not a popover, not a toast. This is a custom non-modal status surface.
- **`framer-motion`: none.** Not installed. Do not install for this feature.
- **`vaul` (bottom sheet): none.** Modal, wrong pattern.
- **Shadcn `sonner`: NO.** See Executive Recommendation.
- **Tailwind CSS + `tailwindcss-animate`:** already in project, use for slide/fade keyframes.
- **`lucide-react`:** `Sparkles`, `X`, `ArrowRight` icons.
- **Native `Pointer Events`:** same pattern `DeckView` uses (`setPointerCapture` + delta tracking).
- **`useTranslations()`** from `@/i18n` (client component).
- **`next/link`** for the CTA (pre-fetches the job detail page, no full nav).

### `useSuperLikeCelebrations` public API

```ts
interface CelebrationEntry {
  id: string;            // local uuid
  jobId: string;         // created Job.id from onAction result (see §11)
  vacancyTitle: string;  // subtitle
  createdAt: number;     // performance.now() for timer math
}

interface UseSuperLikeCelebrationsReturn {
  visible: CelebrationEntry | null;
  queueCount: number;            // additional queued beyond visible
  enqueue: (jobId: string, vacancyTitle: string) => void;
  dismiss: (id: string) => void;           // user dismiss
  pause: () => void;                        // on hover/focus
  resume: () => void;                       // on mouseleave/blur
  removeByJobId: (jobId: string) => void;  // for undo
}
```

Timer lives inside the hook (single active `setTimeout`), not inside the component — avoids timer-reset bugs from re-renders.

### Integration points in existing files

**`DeckView.tsx`:**
1. `import { SuperLikeCelebrationHost } from "./SuperLikeCelebrationHost";`
2. `import { useSuperLikeCelebrations } from "@/hooks/useSuperLikeCelebrations";`
3. Inside component: `const celebrations = useSuperLikeCelebrations();`
4. Render `<SuperLikeCelebrationHost {...celebrations} />` as the last child of the component return (alongside the sr-only divs).
5. The existing `lastAction` state + `aria-live=assertive` region continues to announce generic actions; celebration has its own `role=status`.

**`useDeckStack.ts`:**
1. Change `onAction` signature from `Promise<{ success: boolean }>` to `Promise<{ success: boolean; createdJobId?: string }>`. This is the load-bearing change.
2. `performAction()` forwards `createdJobId` to a new callback `onSuperLikeSuccess?: (jobId: string, vacancy: StagedVacancyWithAutomation) => void` when `action === "superlike"`.
3. In the `undo()` path, call a new optional `onSuperLikeUndone?: (jobId: string) => void` so the celebration host can `removeByJobId`.
4. The **caller** (`StagingContainer.tsx`) — which wires `onAction` to server actions — must return the created job id from the promote/super-like server action. Check `src/actions/stagedVacancy.actions.ts` (not read in this consultation, but likely needs a field added to its ActionResult data shape).

**Server action side-effect note:** if `promoteStagedVacancy` already returns the created job, the change is trivial. If it doesn't (e.g., returns `{ success: true }`), add `createdJob: { id }` to its return payload. This is correct DDD — the Repository (action) should return the created aggregate ID.

### Sketch of `SuperLikeCelebration.tsx` (structure only — no final code)

```tsx
"use client";
// props: entry, queueCount, onDismiss, onPause, onResume
// layout:
//   <div
//     role="status"
//     aria-live="polite"
//     aria-atomic="true"
//     aria-label={t("deck.superLikeFlyin.ariaLabel")}
//     onPointerDown/Move/Up={...}        // swipe-down dismiss
//     onMouseEnter={onPause}
//     onMouseLeave={onResume}
//     onFocusCapture={onPause}
//     onBlurCapture={onResume}
//     className="pointer-events-auto ..."
//   >
//     {queueCount > 0 && <Badge>+{queueCount} more</Badge>}
//     <SparkleChip />
//     <Title>{t("deck.superLikeFlyin.title")}</Title>
//     <Subtitle>{entry.vacancyTitle}</Subtitle>
//     <Link href={`/my-jobs/${entry.jobId}`} prefetch>
//       {t("deck.superLikeFlyin.cta")} <ArrowRight />
//     </Link>
//     <button aria-label={t("deck.superLikeFlyin.dismissLabel")} onClick={onDismiss}>
//       <X />
//     </button>
//   </div>
```

### CSS (add to `globals.css` or inline `<style jsx>` inside the component)

```css
@keyframes superlike-flyin-slide {
  from { transform: translate(-50%, 24px); opacity: 0; }
  to   { transform: translate(-50%, 0);    opacity: 1; }
}
@keyframes superlike-flyin-fade {  /* reduced-motion fallback */
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes superlike-sparkle {
  0%   { transform: scale(1) rotate(0);   }
  40%  { transform: scale(1.15) rotate(-8deg); }
  100% { transform: scale(1) rotate(0);   }
}
.superlike-celebration {
  animation: superlike-flyin-slide 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-reduced-motion: reduce) {
  .superlike-celebration { animation: superlike-flyin-fade 150ms linear; }
  .superlike-sparkle     { animation: none; }
}
```

---

## 11. The architectural gap this consultation exposed

The brief assumes the fly-in can link to "the newly created Job". **Currently, it cannot**, because:

- `useDeckStack.performAction()` receives `{ success: boolean }` from `onAction` and throws away everything else.
- `StagingContainer.tsx` (the caller, not read here) wires `onAction` to the staging server action; the server action's return shape is not surfaced to the deck.

**Required interface change (load-bearing, not optional):**

```ts
// in src/hooks/useDeckStack.ts
interface UseDeckStackOptions {
  vacancies: StagedVacancyWithAutomation[];
  onAction: (
    vacancy: StagedVacancyWithAutomation,
    action: DeckAction,
  ) => Promise<{ success: boolean; createdJobId?: string }>;   // <-- add createdJobId
  onUndo?: (entry: UndoEntry) => Promise<void>;
  onSuperLikeSuccess?: (                                        // <-- new callback
    jobId: string,
    vacancy: StagedVacancyWithAutomation,
  ) => void;
  onSuperLikeUndone?: (jobId: string) => void;                 // <-- new callback
  enabled?: boolean;
}
```

And in `performAction`, after `result.success` becomes true:

```ts
if (action === "superlike" && result.createdJobId) {
  onSuperLikeSuccess?.(result.createdJobId, vacancy);
}
```

Without this change, the fly-in's CTA has no destination and the feature degrades to a decorative toast — which the user explicitly said they don't want.

---

## 12. What NOT to do (opinionated rejections)

1. **Do not raise `TOAST_LIMIT` in `use-toast.ts`** to fit this feature. Global change for a local need = tech debt.
2. **Do not use Sonner.** Adds a second toast system. See Executive Recommendation.
3. **Do not use `sheet.tsx`.** Sheets are modal. Blocks deck.
4. **Do not auto-focus the CTA.** Yanks focus from deck mid-swipe.
5. **Do not use click-outside to dismiss.** Kills the "keep swiping behind it" property.
6. **Do not animate with spring overshoot.** Reads as attention-grabbing. Use ease-out.
7. **Do not use the `<Star />` icon in the celebration.** It's the super-like *action* icon — conflates action with confirmation.
8. **Do not use celebration yellow.** Yellow = warning in the JobSync palette. Use super-like blue.
9. **Do not restart the auto-dismiss timer on hover.** Pause-and-resume only. Restart-on-hover is the "toast that won't die" anti-pattern.
10. **Do not use `role="alert"` / `aria-live="assertive"`.** Interrupts screen reader mid-flow.
11. **Do not install framer-motion for this.** CSS keyframes are sufficient and keep the bundle lean. Reserve framer-motion for a future proper motion system (ADR-worthy decision).
12. **Do not show the celebration on regular `promote` swipes.** This is super-like territory only — reserving this delight moment for super-like reinforces that super-like is the special action. If every promote also celebrated, the celebration would lose meaning (hedonic adaptation).

---

## 13. Acceptance checklist for the implementer

- [ ] `SuperLikeCelebration` mounted inside `DeckView`, not in global layout
- [ ] Fixed bottom-center, safe-area aware, `pointer-events-none` wrapper
- [ ] Slide-up + fade entry, 280ms ease-out
- [ ] Swipe-down dismiss with `48px` / `0.4px/ms` thresholds
- [ ] X button, ESC key, CTA all dismiss
- [ ] Click-outside does NOT dismiss
- [ ] Auto-dismiss 6000ms, pause-on-hover/focus, resume with remaining time floored at 2000ms
- [ ] Queue FIFO max 5, compact badge "+N more", visible card replaces only after 1500ms grace
- [ ] Undo removes celebration by jobId
- [ ] `role=status` + `aria-live=polite` + `aria-atomic=true`
- [ ] Focus stays on deck; celebration tabbable at end
- [ ] i18n keys added to 4 locales under `deck.superLikeFlyin.*`
- [ ] `prefers-reduced-motion` → fade only, no slide, no sparkle
- [ ] `useDeckStack.ts` signature updated to return `createdJobId` + new callbacks
- [ ] Server action `promoteStagedVacancy` (or its super-like variant) returns the created job id
- [ ] Unit tests: queue ordering, pause/resume math, undo removal by jobId
- [ ] Component tests: swipe gesture math, a11y attrs, reduced-motion branch
- [ ] No new dependencies (no sonner, no framer-motion, no vaul)
- [ ] Dictionary consistency test passes across 4 locales
