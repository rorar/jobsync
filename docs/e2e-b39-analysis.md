# E2E-B39 — Root-cause analysis

**Status:** diagnosed (read-only investigation; no code changed).
**Branch:** `fix/e2e-elysium` · **HEAD at analysis:** `04d6381d`.
**Subject tests:** `e2e/crud/profile-crud.spec.ts`
- `:373` "add work experience" — fails at the Job Title assertion (`:408`).
- `:448` "edit experience dialog opens and cancels" — fails at the Company assertion (`:493`).

---

## Verdict

There is **one** root defect, and it lives in the component, not the test.

`src/components/ComboBox.tsx` makes a just-**created** option visible only by mutating the
parent's prop array in place, and it derives the trigger's displayed text purely from that
array. When the parent replaces the array — which `AddExperience` does legitimately, on every
mount fetch — the created row disappears from the array while the form field still holds its
id, so the trigger renders the empty string. The failing assertion reads `""` where it expects
the label.

The cross-test ordering (`NoCrossTestDependency`) recorded in the spec is **not a second
defect**. It is the amplifier: prior specs load the server, the extra latency widens the race
that the component defect opens, and more create-path assertions flip red. Fixing the component
removes both symptoms; making the spec independent only hides them.

---

## The defect, with the decisive lines

**Create handler — `src/components/ComboBox.tsx:58-69`:**

```tsx
const handleCreateOption = (label: string) => {
  if (!label || !onCreateOption) return;
  startTransition(async () => {
    const result = await onCreateOption(label);
    if (result) {
      options.unshift(result);      // line 63 — mutates the PROP array in place
      field.onChange(result.id);    // line 64 — form field now holds the new id
      setIsPopoverOpen(false);
      setAnnouncement(t("forms.optionCreated").replace("{label}", result.label));
    }
  });
};
```

**Trigger render — `src/components/ComboBox.tsx:112-116`:**

```tsx
{field.value
  ? options.find((option) => option.id === field.value)?.label   // line 113 — undefined → "" when the id is absent
  : (placeholder ??
    t("forms.selectPlaceholder").replace("{label}", resolvedLabel))}
```

Line 63 is the single decisive line. `options` is the prop straight from the parent
(`src/components/profile/AddExperience.tsx:200` `options={jobTitles}`). The component never
lifts it into state. The created row exists only as an in-place `unshift` into whatever array
the parent currently holds — a mutation React does not know about and does not preserve across
a parent state update.

Because `field.value` is now truthy (line 64), the render can never fall through to the
placeholder branch. It commits to `options.find(...)?.label`. If the array no longer contains
that id, `find` returns `undefined`, the label is `""`, and the button shows nothing.

**Decisive failure line (both runs):**

```
Error: expect(locator).toContainText(expected)
Received string:  ""
```

The locator resolves to the combobox button `<button role="combobox" data-state="closed">`.

---

## The parent replaces the array — the other half of the mechanism

`src/components/profile/AddExperience.tsx`:

```tsx
const getTitleCompanyAndLocationData = useCallback(async () => {
  const [companiesResult, titlesResult, locationsResult] = await Promise.all([
    getAllCompanies(),
    getAllJobTitles(),
    getAllJobLocations(),
  ]);
  setCompanies(companiesResult.success ? companiesResult.data ?? [] : []);   // line 68
  setLocations(locationsResult.success ? locationsResult.data ?? [] : []);   // line 69
  setJobTitles(titlesResult.success ? titlesResult.data ?? [] : []);         // line 70
}, []);

useEffect(() => {
  getTitleCompanyAndLocationData();       // line 86 — runs on mount and on dep change
  // ...reset(...)
}, [getTitleCompanyAndLocationData, experienceToEdit, reset, resumeId, sectionId]);  // lines 114-120
```

Each `setJobTitles(...)` / `setCompanies(...)` **replaces** the options array with a fresh
server array. That fresh array is a brand-new object; the `unshift`ed row is not in it (the
row was appended client-side and, when the value was just created, the server snapshot that the
in-flight fetch returns predates the write). Any such `set*` that fires after the create's
`field.onChange` therefore wipes the only copy of the created option, while the field still
points at its id.

Two triggers fire `set*` after a create, both more likely under load:

1. **The mount fetch resolving late.** The `Promise.all` is issued when the dialog's tree
   mounts. Under a loaded server it can still be in flight when the user creates a value, then
   resolves with a pre-create snapshot and calls `setJobTitles(...)`.
2. **The effect re-running.** The dependency list includes `experienceToEdit` (lines 114-120).
   Opening the edit dialog changes it (`AddResumeSection.tsx:60-62`), the effect re-runs, and
   `getTitleCompanyAndLocationData` fetches and replaces all three arrays again.

---

## Why the order dependency is a race, not a data leak

Established and re-confirmed:

- **Run alone:** 16/16 green — the create path works when the server is idle.
- **Fails after other specs:** `:373` red twice, identically, on the unmodified baseline.
- **The row is written on both paths.** The 01:31 dev log records
  `CompanyCreated companyName: 'company test'`; the kept run DB holds "Software Developer".
  The create succeeds; only the trigger fails to reflect it.
- **No storage leak.** `e2e/.auth/user.json` has `"origins": []`; every run gets its own
  ephemeral DB (ADR-045). Nothing carries client state between specs.
- **The server was contended at 01:31.** The dev log shows
  `GET /api/scheduler/status 200 in 17450ms` (also 16781ms, 17282ms) and repeated
  `ECONNRESET` / `uncaughtException: aborted`. Server-action latency was seconds, not
  milliseconds — exactly the condition that widens the window between `field.onChange` (value
  set) and the array settling with the row in it.
- **The 00:51 → 01:31 flip of `:448`.** The only commit between the two runs is `31ed962b`,
  which edits `kanban.spec.ts`. It reaches `profile-crud` only by changing what ran before it,
  i.e. by changing the load. A load-gated race flips; a code defect in `profile-crud` could not
  have changed without touching `profile-crud`.

In the full suite the crud specs run in alphabetical file order in both runs; `profile-crud` is
the 15th of 25. The "fails after task-crud + activity-crud" reproduction was the reduced manual
case. In the suite it is the 14 specs' worth of accumulated in-flight work and scheduler
contention that supplies the latency.

---

## The discriminator that isolates the create path

The two failing assertions are both **create** paths, and the one place a **select** path runs
under identical load **passes**. That split is the strongest evidence and it is structural, not
timing luck.

The `afterEach` sweeps Company and Location but deliberately does **not** sweep Job Title
(`profile-crud.spec.ts:176-201`). Consequently, within one run:

| Test | Combobox | Job Title swept? | Path taken | Result |
|---|---|---|---|---|
| `:373` add work experience | Job Title (`:408`) | first creator, fresh DB | **CREATE** | **red** |
| `:448` edit experience | Job Title (`:483`) | not swept — row from `:373` present | SELECT | green |
| `:448` edit experience | Company (`:493`) | swept every afterEach | **CREATE** | **red** |

`:448` runs its Job Title and Company comboboxes microseconds apart, under the same server load.
Job Title finds the row `:373` left in the DB, so its fetched `options` contain the id, the
SELECT branch (`ComboBox.tsx:169-176`) sets the field from an option already in the array, and
`find` on line 113 succeeds. Company was swept, so it is absent from the fetched array, the
CREATE branch runs, and the only copy of the row is the fragile `unshift`. Same test, same
load, opposite outcomes, split exactly on select-vs-create. The defect is the create path's
reliance on `options.unshift`; the select path never shows the symptom because the row is
durably in the fetched array.

This is what the spec's own `afterEach` comment observed empirically
(`profile-crud.spec.ts:177-201`): "Deleting it after each test forces that test onto the CREATE
path, and the create path leaves the trigger empty." Sweeping Job Title too would push `:448`'s
Job Title assertion onto the create path and turn it red as well.

---

## Corroborating unit test

`__tests__/ComboBox.spec.tsx:77` already pins the exact symptom:

```tsx
it("does NOT show the placeholder when a value is set but absent from options (latent edge)", () => {
  render(<Harness value="ghost-id" label="Company" />);
  expect(screen.getByRole("combobox")).not.toHaveTextContent("Select Company");
});
```

The test's own comment calls this "Unreachable on the real jobs page (getAllCompanies returns
ALL of the user's companies)." That reasoning holds for **select** but not for **create**: the
create path sets `field.value` to an id that the fetched options do not (yet, or any longer)
contain, which is precisely `value="ghost-id"`. The latent edge the unit test documents is the
edge the create-under-load path actually reaches.

---

## One defect or two

**One root defect**, surfacing in two tests. The two tests are two demonstrations of the same
cause; the commit that widened the bug (`04d6381d`) says as much ("the second demonstrates the
cause"). The candidate second cause the spec names, `NoCrossTestDependency`, is real as a test-
hygiene observation but is downstream: the tests only lean on ordering because the component
cannot durably show a value it created without help, so a swept reference (Company) or a fresh
DB (`:373`'s Job Title) exposes the fragility. It is the amplifier, not a co-equal root.

The three candidates raised at the outset resolve as:

- **React key/id collision** — not supported. Ids are stable DB ids; the select path proves
  `find`-by-id works when the row is present.
- **Stale options cache** — this is the effect, described precisely: the "cache" is the prop
  array, and the create path's write to it is discarded when the parent replaces it.
- **Race between server action and popover close** — partly. The helper already waits for the
  popover to close (`e2e/helpers/index.ts:307-317`), so the value is set before the assertion.
  The race that matters is not create-vs-close but create-vs-**parent-refetch**: a `set*` that
  lands after `field.onChange` wipes the row.

---

## Smallest honest fix

**Root defect — make the created option durable in what the trigger reads.**
In `AddExperience.tsx`, the parent owns the arrays, so the parent should absorb the created row
into state instead of letting the child mutate the prop. Change each `onCreateOption` handler to
append the result to the corresponding state array, e.g. for Job Title
(`AddExperience.tsx:204-215`):

```tsx
onCreateOption={async (label) => {
  const res = await createJobTitle(label);
  if (!res.success) { /* toast, return null */ }
  const created = res.data as { id: string; label: string; value: string };
  setJobTitles((prev) => [created, ...prev]);   // durable, React-visible
  return created;
}}
```

and remove the in-place `options.unshift(result)` at `ComboBox.tsx:63` so the child no longer
mutates its prop. The trigger's `options.find` (line 113) then reads an array that the parent
keeps, and a later mount fetch that replaces the array must be reconciled by the parent (see
below), not silently drop the row.

A self-contained alternative that touches only `ComboBox.tsx`: lift `options` into local state
seeded from the prop and add created rows to that state, or render a fallback label captured
from `result.label` when `find` misses. Any of the three works; the principle is that the label
the trigger shows must not depend on an array a parent can replace out from under it.

One caveat the fix must handle: the mount fetch in `AddExperience` still replaces `jobTitles`
wholesale, so an appended row can be lost if a stale fetch resolves afterward. The durable fix
should either merge fetch results with locally-created rows, or guard against a late fetch
overwriting newer client state (e.g. ignore a fetch resolution once the user has created a
value in that field). Appending in the parent (first option) plus this guard closes the window
the race opens.

**Spec robustness — secondary, and only after the component fix.**
Making `:448` independent (create its own Job Title rather than relying on `:373`'s unswept
leftover, and stop treating Job Title specially in the `afterEach`) removes the ordering
sensitivity `NoCrossTestDependency` flags. On its own it would mask the component defect — it
must not be done as the fix, only as hygiene once the control is correct. With the control
fixed, the Job Title sweep can be re-enabled and the create path will pass regardless of order.

---

## What the evidence does not support

I did not reproduce the failure live (the host runs gates centrally; this was static analysis
plus existing artifacts), so the exact interleaving that flips one create-path assertion while
another create-path assertion in the same run passes (e.g. `:373` red while the multi-section
test at `:541` is green in both runs) is not pinned to a specific ordering. That variability is
consistent with a race and is not needed to establish the cause: the select-vs-create split
within `:448`, the load correlation in the dev log, the unit test at `ComboBox.spec.tsx:77`,
and the code path from `ComboBox.tsx:63` to `:113` together identify the defect without it.
