# Inside Track UI — Design Specification (Welle 5, Phase 5)

Up-front design gate (frontend-design + ui-design:ui-designer + ui-design:accessibility-expert,
2026-06-15). Behaviour SoT = `specs/inside-track.allium` (frozen). This doc is the
implementation contract for the conductor TDD loop. Aesthetic direction: **refined
consistency with the existing Shadcn CRM surfaces** (no bespoke fonts/layouts — sustainability
+ DDD ubiquity); the one memorable element is the referral **lifecycle rail**.

## A. Information Architecture (decided)

| Surface | Lives at | Form factor | Rationale |
|---|---|---|---|
| Inside Track home (referral list + TipCapture entry) | `/dashboard/referrals` | Page | Mirrors `/dashboard/contacts\|interviews\|crm-tasks` |
| ReferralWorkspace (one referral) | `/dashboard/referrals/[id]` | **Page, not Sheet** | Needs desktop side-by-side WarmPathFinder; matches `contacts/[id]` |
| TipCapture | Sheet from the home page (right desktop / bottom mobile) | Sheet | Creation form, like "Add Contact" |
| WarmPathFinder | reusable panel: (a) `myjobs/[id]` JobDetails when job has a Company, (b) inside ReferralWorkspace when `target_company != null` | Panel | Spec `related: WarmPathFinder(target_company)` |
| AddPersonConnection | Dialog from Person detail (`contacts/[id]`) | Dialog | 4-field form, no scroll |

- **Nav:** new sidebar entry after `crm-tasks`, lucide `Network` icon, key `nav.insideTrack`.
- **Component dir:** `src/components/inside-track/` (NEW). WarmPathFinder is consumed by `myjobs` →
  keeping it out of `crm/` avoids a cross-bounded-context import. CRM conventions are followed
  as *patterns*, not directory membership.

## B. Components (`src/components/inside-track/`)

| File | Responsibility |
|---|---|
| `ReferralList.tsx` | filterable/grouped-by-status list (home body) |
| `ReferralListItem.tsx` | one row → navigates to `/dashboard/referrals/[id]` |
| `ReferralStatusBadge.tsx` | Badge for `ReferralStatus` (color + text, never color-alone) |
| `ReferralKindBadge.tsx` | Badge for `ReferralKind` |
| `ReferralLifecycleRail.tsx` | the 7-state rail (section D) |
| `ReferralActionBar.tsx` | status-gated forward actions (section E) |
| `TipCaptureSheet.tsx` / `TipCaptureForm.tsx` | record insider/network tip |
| `PersonPickerCombobox.tsx` | combobox over CRM contacts (EuresLocationCombobox/JobContactPicker pattern: `shouldFilter={false}` + manual filter, `aria-live` selection, cmdk `value={`${name} ${id}`}`) |
| `AddConnectionForm.tsx` | AddPersonConnection (kind + strength selects) |
| `WarmPathFinder.tsx` (+ `WarmPathInsiderRow`, `WarmPathNetworkRow`) | insiders + network paths + empty/loading/error |

Route files: `src/app/dashboard/referrals/{page.tsx, ReferralsPageClient.tsx, [id]/page.tsx, [id]/ReferralWorkspaceClient.tsx}`.

## C. States (every surface)

- **List:** loading (3 Skeleton rows, `motion-reduce:animate-none`), empty (Network icon + "No warm leads yet" + New Tip), empty-filtered ("No referrals match" + Clear filters), error (`role="alert"` + Retry), populated (grouped by status, collapsible).
- **Workspace:** loading (skeletons), not-found (message + back link), per-status (table below). Desktop = 2 cols (rail+actions | WarmPathFinder); mobile = stack, WarmPathFinder in Collapsible.
- **WarmPathFinder:** loading (Skeleton w/ translated label), empty ("No connections found" + actionable hint — common!), error, populated (Direct Insiders + Via Your Network sections).

Per-status workspace rendering:

| status | action bar | rail |
|---|---|---|
| open | Engage (variant label) | step 1 current |
| engaged | Relay (variant label) | step 2 current |
| relayed | Review | step 3 current |
| in_review | CommitToApply (aria-disabled if no target_company) | step 4 current |
| converted | none (terminal) + "Converted to Job" banner + View Job link | step 5 filled/terminal |
| declined | none (terminal) + "Declined" banner | declined indicator |
| stale | Revive | stale badge, prior step greyed |

Decline lives in the **action bar** (`ReferralActionBar` — destructive ghost button + an
AlertDialog confirm), present for every working state (open/engaged/relayed/in_review/stale).
(The Allium SoT `DeclineReferral` permits decline from all of these, incl. `stale`. An earlier
draft placed it in the header to keep the forward row single-purpose; the shipped design groups
all actions and guards the destructive one with a confirm dialog instead.)

## D. Lifecycle rail (accessible, Shadcn-only)

`<nav aria-label={t('insideTrack.lifecycle.railLabel')}><ol>` of the 7 states. Each `<li>`:
`aria-current="step"` on the active state; `sr-only` "terminal" on converted/declined;
`sr-only` "revivable" on stale. **NOT `role="progressbar"`** (graph is non-linear/branching).
Visual: filled circle (completed/current), ring (current), border (future), connector lines;
`overflow-x-auto` on mobile. Stale = orange ring + Badge; declined = truncate at red dot;
converted = filled primary + check. Information never by color alone (always text label).

## E. Status-gated action affordance

`ReferralActionBar(status, kind, hasTargetCompany, loadingAction)` renders ONLY the legal
forward action (single primary `<Button>`), wrapped in `<div role="group" aria-label aria-describedby>`:

| status | forward action key |
|---|---|
| open | `insideTrack.action.engage.<kind>` |
| engaged | `insideTrack.action.relay.<kind>` |
| relayed | `insideTrack.action.review` |
| in_review | `insideTrack.action.commitToApply` |
| stale | `insideTrack.action.revive` |
| converted / declined | (none) |

- **Illegal transitions = HIDDEN** (unmounted, absent from a11y tree).
- **CommitToApply with `target_company==null` = `aria-disabled="true"`** (NOT `disabled`),
  `aria-describedby` → sr-only `insideTrack.action.commitToApplyRequiresCompany`, `onClick`
  `preventDefault`. Keeps it discoverable + explainable.
- **Confirm dialogs (AlertDialog):** CommitToApply ("creates a Job for {company}") + Decline
  ("cannot be undone"). Engage/Relay/Review/Revive = immediate (low-stakes forward progress).
- **In-flight:** spinner + `aria-busy="true"` + disabled, per `StagedVacancyDetailSheet`.
- **Focus after transition:** the triggering button may unmount → programmatically focus a
  persistent `tabIndex={-1}` status-display element (`data-testid="referral-status-display"`).
- **aria-live:** single polite `role="status"` region (top of workspace, `aria-atomic`) updated
  with a fully-translated sentence per transition; errors use `role="alert"`.

## F. i18n — single `insideTrack.*` namespace (×4: en/de/fr/es)

(role labels already shipped under `crm.jobContactRole.*` — do NOT duplicate. Nav key is `nav.insideTrack`.)

- `status.{open,engaged,relayed,in_review,converted,declined,stale}` (7)
- `kind.{insider_relay,network_path}` (2)
- `connectionKind.{former_colleague,friend,acquaintance,mentor,family,other}` (6)
- `connectionStrength.{close,medium,weak}` (3)
- `action.engage.{insider_relay,network_path}`, `action.relay.{insider_relay,network_path}`,
  `action.{review,commitToApply,revive,decline}`, `action.commitToApplyRequiresCompany`
- `action.{commitToApplyConfirmTitle,commitToApplyConfirmDescription,declineConfirmTitle,declineConfirmDescription,confirmContinue,confirmCancel}`
- `pageTitle,newTip,filter.{allStatuses,allKinds}`,
  `list.{empty.title,empty.description,emptyFiltered,clearFilters,loadError,retry,col.company,col.tipster,col.kind,col.lastActivity,noCompany}`
- `tipCapture.{title,kindLabel,tipsterLabel,tipsterPlaceholder,insiderLabel,insiderPlaceholder,viaLabel,companyLabel,companyPlaceholder,submit,cancel,kindHint.insider_relay,kindHint.network_path,insiderRelayFieldsAppeared,networkPathFieldsAppeared,requiredLegend}`
- `addConnection.{title,fromLabel,toLabel,personPlaceholder,kindLabel,strengthLabel,submit,cancel}`
- `warmPath.{panelTitle,sectionInsiders,sectionNetwork,formerBadge,empty.title,empty.description,emptyRegionLabel,loadError,loadingPaths,pathsListLabel,pathDescription,directPath}`
- `lifecycle.{railLabel,staleBadge,convertedBadge,declinedBadge,terminalState,staleRevivable,currentStatus}`
- `workspace.{tipsterLabel,receivedLabel,lastActivityLabel,targetJobLabel,targetCompanyLabel,notFound,backToList,convertedBanner,viewJob,declinedBanner,availableActions,actionsContextDescription,statusLiveAnnouncement}`
- `errors.*` for action failures (i18n; per [[feedback_i18n_error_messages]])

## G. Accessibility musts (WCAG 2.2 AA) — test-encoded

1. Lifecycle rail: `nav` landmark + `ol`; exactly one `aria-current="step"`; NO progressbar; sr-only terminal/revivable text.
2. Transition: polite live region updates; focus moves to `tabIndex=-1` status display after the action unmounts; error → `role="alert"`.
3. Action group: illegal=hidden; CommitToApply-blocked=`aria-disabled`+`aria-describedby` (in tab order); group labelled.
4. TipCapture: `fieldset`+`legend` for kind (RadioGroup, not tabs); optional fields labelled "(optional)"; conditional fields removed from DOM (not CSS-hidden) + reveal announced; Shadcn `Form*` for error id/`aria-invalid`; error text suggests a fix (3.3.3).
5. WarmPathFinder: `ul`/`li`; each path has sr-only relationship sentence (arrows `aria-hidden`); loading→empty→results announced via live region.
6. Target size ≥44px for standalone action buttons (h-11); combobox h-10 acceptable (documented exception). Focus-visible ring on all, incl. the aria-disabled CommitToApply.

## H. Component test contracts (TDD)

- `ReferralLifecycleRail`: correct `aria-current` per status; no `progressbar`; nav landmark; terminal/revivable sr-only; declined truncates.
- `ReferralActionBar`: only legal action per status; variant-correct labels; CommitToApply `aria-disabled` when `!hasTargetCompany` (not `disabled`); none at converted/declined; `aria-busy` while loading.
- `TipCaptureForm`: default insider_relay; selecting network_path reveals insider/via (DOM-removed otherwise) + announces; no submit without tipster; submit shape `{kind, tipsterId, targetCompany?, insiderId?, via?}`.
- `WarmPathFinder`: empty/loading/error; former badge; active-before-former order; close>medium>weak order; sr-only path sentence; `null` company → renders null.
- `PersonPickerCombobox`: manual filter; select→`onValueChange(id)`; clear→`onValueChange(null)`; aria-live selection.
- `ReferralWorkspaceClient` (integration): loading/not-found; converted/declined hide action bar + show banner; decline opens AlertDialog → calls `declineReferral`.
