# E2E dev-server mid-run restart — Root-cause analysis

**Status:** diagnosed (read-only investigation; no code changed, nothing was run).
**Branch:** `fix/e2e-elysium` · **HEAD at analysis:** `2da07586` · **Date:** 2026-09-06.
**Subject:** `/tmp/jobsync-e2e-dev.log:2285` — `⚠ Server is approaching the used memory threshold, restarting...`
**Evidence base:** `.next/trace` (57 MB, 68 server lifetimes, 14 restarts, 53,373 per-request memory
samples spanning 2026-09-01 to 2026-09-06), the 11:40 dev log, the 11:40 Playwright output
(`bcz5hiwys.output`), Next.js 15.5.10 source in `node_modules`, and the application source.

---

## Verdict

**Mechanism.** The restart is Next.js's own dev-mode watchdog, not the cgroup, not the kernel,
not the wrapper. `node_modules/next/dist/server/lib/start-server.js:234-241` runs in the `finally`
of **every** request:

```js
if (v8.getHeapStatistics().used_heap_size > 0.8 * v8.getHeapStatistics().heap_size_limit) {
    Log.warn(`Server is approaching the used memory threshold, restarting...`);
    ...
    process.exit(RESTART_EXIT_CODE);   // 77
}
```

`process.exit` is immediate. The request whose `finally` tripped the check has already been
answered; **every other request in flight dies without a response and without running to the end
of its handler.** The parent process (`node_modules/next/dist/cli/next-dev.js:275-292`) sees exit
code 77 and forks a fresh server on the same port. That is why the dev log shows a full cold start
(instrumentation, crons, "Ready in 5.7s") in the middle of the run, and why a server action that was
in flight leaves no audit line, no error, and no decision: its JavaScript was never entered, or was
abandoned mid-await. No application code can observe or log this.

**Trigger.** `scripts/dev-e2e.sh:83,86` caps the heap at 3072 MB. V8 reports that as
`heap_size_limit = 3,271,557,120` bytes, so the watchdog fires at **2,617,245,696 bytes (2.62 GB)**.
All 14 restarts recorded in `.next/trace` fired at a `heapUsed` between 2,617 and 2,635 MB — the
first request to complete after the line was crossed.

**Classification.** The evidence separates the three candidates cleanly:

| Candidate | Verdict | Decisive evidence |
|---|---|---|
| (a) genuine retention the suite exposes | **Yes — in shape.** Retained heap grows linearly with the number of requests served, at ≈0.63 MB per request, and idle does not reclaim it. | §2, §3, §4 |
| (b) normal dev growth against a cap set too low | **No.** "Normal growth" would plateau or show flat post-GC floors; observed floors climb monotonically and a 79-minute idle gap frees nothing. The cap only decides *where in the run* the restart lands. | §3, §4 |
| (c) something the E2E configuration provokes | **No, beyond volume.** The suite supplies ≈5 requests/s (≈6,000 per 20-minute run) — that is the only E2E-specific ingredient. No E2E env flag, seed or helper touches the retained memory. | §5 |

**Where the retention lives.** **SUPERSEDED — see the second addendum of 2026-09-06.** A
heap-snapshot pair names the holder, and it is React's Flight server DEVELOPMENT build, whose
unguarded `async_hooks` owner-stack tracking accumulates ~2,749 `{promise, awaited, previous}`
nodes per request. Turbopack is exonerated; the paragraph below was a hypothesis from static
reading and its conclusion about the bundler is wrong. It is kept because its *evidence* still
holds and still rules out application code:

- The application's per-request state was audited store by store (§5); every one is bounded or
  request-scoped. No `new PrismaClient` outside the `globalThis` singleton.
- Native (non-V8) memory grows in step with the heap — RSS minus heap goes from 1.25 GB to 3.24 GB
  across one lifetime (§4). An application-level JavaScript leak grows the V8 heap only.
- Upstream tracks the same symptom as a confirmed Turbopack issue with no fix through 16.2.9 (§6).

**What is NOT determined** (and cannot be, without a run): *which* Next/Turbopack structure holds
the memory, whether the application contributes any share, and whether `next dev --webpack` avoids
it in this application. Upstream reports say webpack is stable; that is a report, not a measurement
of this tree. §8 names the one run that would settle it.

---

## 1. The 11:40 run, reconstructed

| Event | Time (CEST) | Source |
|---|---|---|
| Server lifetime #66 ready | 11:20:04 | trace `start-dev-server` `startTime`; dev log line 24 |
| Restart fires (request #3,143, 10.7 min in) | 11:30:48 | trace restart event; dev log line 2285; last audit line before it is 11:30:47 |
| Lifetime #67 ready | ≈11:30:54 | dev log line 2305 |
| Suite ends (112 tests, 20.2 min) | ≈11:40 | Playwright output |

Cumulative test durations from the Playwright output put test **#38**
(`e2e/crud/job-detail-panels.spec.ts:389`, "status history timeline shows status change after
update") between 9.9 and 11.3 minutes into the run — it is the only test spanning 10.7 minutes.
Its failing assertion is `deleteJob` at `job-detail-panels.spec.ts:222`, which waits for the job
row to disappear after the confirm click. The dev log has **10** `job.delete` audit lines before
line 2285 and **3** after; none for that job. The confirm click's server-action POST was one of the
requests that `process.exit` abandoned.

Lifetime #67 then served 2,872 requests and peaked at **2,496 MB** — 120 MB short of a second
restart. Any run two minutes longer than this one restarts twice.

Two lines in the same window are noise, not cause: the `ECONNRESET [Error: aborted]` at line 2276
is a client-side abort (Playwright navigating away), and the thirteen `[ModuleRegistry] Duplicate
module id` warnings after the restart are the instrumentation bundle and a route bundle both
evaluating `register-all.ts` — expected, and unrelated to memory.

## 2. Restarts are a function of request count, not wall time

Per-lifetime summary from `.next/trace` (`handle-request` spans counted; `memory-usage` spans give
`heapUsed`). All 14 restarts:

| Lifetime | Started | Duration | Requests at restart | heapUsed at restart |
|---|---|---|---|---|
| #0 | 09-01 14:58 | 29.6 min | 3,178 | 2,635 MB |
| #5 | 09-01 16:39 | 16.9 min | 3,109 | 2,622 MB |
| #8 | 09-01 19:30 | 17.1 min | 3,123 | 2,619 MB |
| #11 | 09-02 09:14 | 16.7 min | 3,064 | 2,618 MB |
| #14 | 09-02 15:31 | 20.7 min | 3,223 | 2,618 MB |
| #18 | 09-02 16:06 | 16.7 min | 3,120 | 2,620 MB |
| #23 | 09-02 16:44 | 35.1 min | 3,128 | 2,617 MB |
| #25 | 09-02 17:32 | 8.9 min | 3,123 | 2,617 MB |
| #32 | 09-02 18:24 | 13.2 min | 3,123 | 2,628 MB |
| #43 | 09-03 11:39 | 39.2 min | 3,150 | 2,622 MB |
| #60 | 09-05 20:52 | 10.9 min | 3,073 | 2,619 MB |
| #62 | 09-05 22:26 | 13.7 min | 3,216 | 2,625 MB |
| #64 | 09-05 23:06 | 13.7 min | 3,169 | 2,618 MB |
| #66 | 09-06 09:20 | 10.7 min | 3,143 | 2,619 MB |

Duration varies four-fold (8.9 to 39.2 min); request count at restart varies by 5 %
(3,064 to 3,223). The counter that matters is requests.

The converse holds too. Lifetimes that lived long but served little stayed low:

| Lifetime | Duration | Requests | Peak heapUsed |
|---|---|---|---|
| #9 | 717 min | 1,930 | 1,825 MB |
| #13 | 352 min | 787 | 1,242 MB |
| #28 | 21 min | 89 | 538 MB |
| #59 | 2,774 min | 2,909 | 2,522 MB |
| #65 | 600 min | 2,820 | 2,467 MB |

A scheduler, cron or health-monitor accumulation would grow with time. It does not. The three
crons started in `src/instrumentation.ts` are ruled out as the driver.

## 3. The growth is retained, not garbage awaiting collection

Lifetime #66 (the 11:40 run), post-GC floors — each row is a sample where `heapUsed` fell by more
than 100 MB against the previous sample, i.e. the reading just after a major collection:

| Minute | Sample # | Before GC | After GC (floor) |
|---|---|---|---|
| 1.0 | 98 | 663 MB | 552 MB |
| 3.0 | 292 | 976 MB | 844 MB |
| 5.2 | 538 | 1,258 MB | 1,109 MB |
| 7.1 | 992 | 1,707 MB | 1,601 MB |
| 8.6 | 1,340 | 2,109 MB | 1,983 MB |
| 9.6 | 1,554 | 2,343 MB | 2,207 MB |
| 10.6 | 1,780 | 2,588 MB | 2,467 MB |

43 major collections in 10.7 minutes. Each one recovers ≈130 MB and the floor climbs ≈40 MB per
≈35 samples. A "cap set too low" (candidate b) predicts a sawtooth whose floors stay flat and whose
peaks are bounded by V8's growing factor; this is a staircase.

## 4. Idle does not reclaim; native memory grows alongside

- Lifetime #59 contained a **79-minute** gap with no requests. `heapUsed` went from 2,372 MB to
  2,390 MB across it; RSS from 5,597 MB to 5,617 MB. V8's memory reducer had over an hour and
  freed nothing. What is on the heap is live.
- Lifetime #66: RSS 1,591 MB at sample 0 with `heapTotal` 343 MB; RSS 6,039 MB at the restart with
  `heapTotal` 2,795 MB. **RSS minus heap grew from 1.25 GB to 3.24 GB.** Something outside V8
  retains memory at roughly the same rate as the heap does. The Turbopack compiler is a native
  addon in this process; the Prisma query engine is native too, but favicon and `_next/image`
  requests never reach Prisma and still appear in the growth (§5, regression).

## 5. Attribution: application stores audited, request mix regressed

**Pooled regression.** Across all 68 lifetimes, 962 GC intervals cover 78,632 requests and
49,863 MB of floor growth: **634 KB retained per request**. A least-squares fit of floor growth
on the request mix per interval gives page renders 0.54 MB, sign-in pages 1.2 MB, favicon 0.15 MB,
`_next/image` 3.2 MB, SSE 2.4 MB per request — but favicon, image and SSE requests are issued by
the browser alongside every page load, so the fit cannot separate a page from its companions.
The robust statement is ≈0.63 MB per request, ≈1.3–1.5 MB per page load, with favicon (a Next
metadata route that runs no application code) carrying the least.

**Application-side stores checked and bounded** (all `globalThis` singletons and module-scope
collections in `src/`, tests excluded):

| Store | File | Bound |
|---|---|---|
| Prisma client | `src/lib/db.ts:4-17` | one instance on `globalThis.prismaGlobal`; only `new PrismaClient` in `src/` |
| Connector LRU cache | `src/lib/connector/cache.ts:73` | `maxSize = 500`, TTL, 15-min prune |
| Sliding-window rate limiters | `src/lib/rate-limit.ts:88` | `DEFAULT_MAX_STORE_SIZE = 10_000`, cleanup timer, `.unref()` |
| SSE connections | `src/app/api/scheduler/status/route.ts:34,57,126` | 5 per user, 10-minute cap, `req.signal` abort → `cleanup()`; dev log shows streams completing in ≈2 s |
| Undo tokens | `src/lib/undo/undo-store.ts:27` | TTL purge every 30 s |
| Automation run logs | `src/lib/automation-logger.ts:21,94` | 500 per run, deleted on finish |
| API-key last-used throttle | `src/lib/api/last-used-throttle.ts:14` | 1,000 keys, FIFO eviction |
| Enrichment in-flight counter | `src/actions/enrichment.actions.ts:32-49` | decremented in `finally` |
| Notification staged buffers | `src/lib/events/consumers/notification-dispatcher.ts:122,156` | per automation, deleted on flush |
| Health timers | `src/lib/connector/health-scheduler.ts:17,55` | one interval per module (9) |
| Run coordinator | `src/lib/scheduler/run-coordinator.ts:35-41,344-345` | per automation, deleted on release |
| i18n | `src/i18n/lingui.ts:15-19` | React `cache()` per request on the single `@lingui/core` instance; nothing retained across requests |
| Middleware | `src/middleware.ts:79-87` | matcher excludes favicon and `_next/*`; sets headers only |

Nothing here grows by one entry per request. The Turbopack HMR client bookkeeping
(`node_modules/next/dist/server/dev/hot-reloader-turbopack.js:588-601`) removes clients and
returns their subscriptions on socket `close`, so an obvious per-page-load leak on the JS side of
the bundler is not visible either. What remains is inside the compiled-module / bundler request
path, which static reading cannot resolve — see §8.

**E2E-specific ingredients checked:** `E2E_AUTH_RATE_LIMIT_BYPASS` (a boolean gate in
`auth-rate-limit.ts`), the per-run database (`scripts/e2e-db.sh`), `storageState` reuse, one
worker. None allocates per request. The suite's contribution is volume: 6,015 requests in 20.2
minutes. A developer clicking through the app at a tenth of that rate would meet the same restart
after roughly two hours.

## 6. Upstream corroboration (reports, not proof for this tree)

- vercel/next.js **#83275** — the exact warning, filed Aug 2025 around the 15.5 release, "every
  couple of minutes".
- **#81161** — "Turbopack dev server uses too much RAM and CPU" (15.3.4, also on canary):
  "hard page reload adds ~30 MB each time, it just keeps growing until OOM". Labelled
  `linear: turbopack` (confirmed, tracked as PACK-5016); closed and locked without a referenced fix.
- **#91396** — "Dev server is going crazy on memory usage" (16.1.6): navigate multiple pages,
  reaches 7 GB. Labelled confirmed Turbopack issue, open, no maintainer comment.
- **#94915** — (16.2.9, June 2026) unbounded growth still reported; community reports there that
  `next dev --webpack` stays at ≈227–471 MB under similar navigation.

Sources: https://github.com/vercel/next.js/issues/83275 ·
https://github.com/vercel/next.js/issues/81161 · https://github.com/vercel/next.js/issues/91396 ·
https://github.com/vercel/next.js/issues/94915

## 7. Why the two earlier investigations reached the wrong file

Both read a downstream symptom as the defect. The eight `ERR_CONNECTION_REFUSED` in
`keyboard-ux.spec.ts:399` are the ≈6 seconds between `process.exit` and the child's "Ready" — the
browser was talking to a port nobody was listening on. The "reference cleanup" reading of the
abandoned delete saw a row that survived because the request that would have deleted it was never
processed. In both cases the dev log carries the restart line; nothing in the Playwright output
does, and the dev log has no timestamps of its own (only the audit JSON lines carry one), so the
correlation had to be made by hand. That is the first thing to fix.

## 8. Remedy — smallest first

**1. Make the restart visible in the run report (do this regardless).** Zero risk; prevents a
third misdiagnosis. In `scripts/test-e2e.sh`, after the Playwright process exits and before
`EXIT=`, grep `/tmp/jobsync-e2e-dev.log` for `approaching the used memory threshold`, and print
the count with a one-line explanation ("N dev-server restart(s) during this run — any test whose
server action was in flight failed without an error; see docs/e2e-dev-server-restart-analysis.md").
Prefix the dev-log lines with timestamps when the wrapper starts the server (`scripts/test-e2e.sh:270`
is the redirect; a `while IFS= read -r l; do printf '%s %s\n' "$(date +%T)" "$l"; done` between
`dev-e2e.sh` and the file, or `ts` from moreutils if present) so the restart can be placed against
the Playwright timeline without summing durations.

**2. Choose a budget.** With the current cap one lifetime serves ≈3,100 requests; a full run needs
≈6,000. Three options, in order of how much they change:

- **(i) Raise the cap and accept it.** `E2E_DEV_NODE_HEAP=6144` moves the threshold to ≈5.2 GB,
  ≈7,000 requests — one lifetime per run with headroom for a somewhat longer suite. **This is only
  honest together with `E2E_DEV_MEM_MAX`.** RSS tracks heap at roughly 1.2 GB + 1.85 × heap (§4),
  so the server would reach ≈10–11 GB RSS; under the current `MemoryMax=8G`
  (`scripts/dev-e2e.sh:84,88`) the kernel would SIGKILL the child instead, and
  `next-dev.js:272` (`if (sessionStopHandled || signal) return;`) does **not** respawn on a signal —
  the rest of the run would fail with `ECONNREFUSED`, strictly worse than today. So (i) means
  `E2E_DEV_MEM_MAX=12G` as well, which needs ≈17 GB free on the host for the run (server 12G plus
  the 6G runner scope). The host had 11 GB available at analysis time. Viable when the host is
  otherwise idle; not a fix, a larger bucket for the same leak.

- **(ii) Run the E2E server with `next dev --webpack`.** Upstream reports say the webpack dev
  server does not grow per request. Unverified for this application. Cost: a second dev script (or
  a flag through `scripts/dev-e2e.sh`), slower cold compile against the wrapper's 150 s readiness
  wait, and a bundler-specific `.next` cache that should not be shared with Turbopack sessions
  (`distDir` per bundler, or `scripts/clean.sh` before the switch).

- **(iii) Run the suite against `next build` + `next start`.** No watchdog (`isDev` is false), no
  Turbopack dev machinery. Not drop-in: `next start` sets `NODE_ENV=production`, which by design
  disables `E2E_AUTH_RATE_LIMIT_BYPASS` (CLAUDE.md, `__tests__/auth-rate-limit.spec.ts`), so the
  suite's repeated sign-ins would trip the 5-per-15-min cap. A separate decision.

**Recommendation.** Do (1) now. Then spend one run, not a sprint, on the open question: a full
suite with `--webpack`, reading `.next/trace` `memory-usage` floors exactly as in §3 (the script
that produced the tables above is trivially reproducible: parse each line of `.next/trace` as a
JSON array, group by `start-dev-server`, take `heapUsed` after every >100 MB drop). If the floors
stay flat, switch the E2E server to webpack and the class of failure is gone. If they climb the
same way, the retention is in the application or in shared Next server code, the webpack report
was wrong for this tree, and the honest answer becomes (i) — raise both caps, accept one
lifetime per run, and file the §2–§4 numbers upstream against #81161. Either way the answer is
known after one run, which is cheaper than the third misdiagnosis.

---

## Addendum 2026-09-06 — the two remedies measured, and neither is free

Written after running both options this analysis proposed. The numbers replace the
estimates above where they disagree.

### (ii) webpack — RULED OUT

`E2E_DEV_BUNDLER=webpack` (the knob added to `scripts/dev-e2e.sh` for this): floors
1404 → 1643 → 2075 MB, **+672 MB over three collections. RISING.** The upstream
reports that the webpack dev server does not grow per request do not hold for this
tree. That run was cut short at 36 minutes — I edited `scripts/test-e2e.sh` while it
was executing and bash, which reads a script lazily by byte offset, resumed
mid-token — so it contributed only 198 samples. The direction was already
unambiguous.

### (i) raise the caps — WORKS, and buys a bigger bucket rather than a fix

`E2E_DEV_NODE_HEAP=5120 E2E_DEV_MEM_MAX=11G`, Turbopack, 3,196 samples over 93 tests
before the session ended:

- **Zero watchdog restarts**, against one per run at 3072 MB. The threshold moved
  from 2.62 GB to 4.0 GB and the run stayed under it.
- **Floors 580 → 3783 MB, +3203 MB across 81 collections.** Monotonic, roughly 40 MB
  per collection, no plateau. This is retention, not collectable garbage, and it is
  the same shape webpack showed.
- **Peak 3909 MB against a 4096 MB threshold.** The run was about to restart anyway.
  93 tests consumed 95% of the headroom that 5120 MB buys, so a full 112-test suite
  does not fit and neither would a slightly longer one.

### The cost that was not in the estimate

Thirteen tests failed on that run with durations up to **6.6 minutes** for a single
test. That is the contention signature, not defects: the server at ~3.9 GB heap plus
the Playwright scope plus Chromium exceeded what this host can schedule. The estimate
above accounted for RSS against `MemoryMax` and did not account for the host having
only ~11 GB free — so on THIS machine raising the cap trades restarts for contention,
and a contended run is the failure mode the wrapper's own banner exists to warn about.

### Where that leaves it

The leak is the thing to fix; both bundlers exhibit it and both remedies only choose
which symptom to pay. Roughly 40 MB per collection over a run that issues ~6,000
requests is ~34 KB retained per request, which is a size worth attributing rather than
absorbing. The suspects named in §5 were audited and cleared; the next honest step is
a heap snapshot pair from a running suite, not another cap.

Until then, `E2E_DEV_NODE_HEAP=5120` is defensible ONLY on a host with more headroom
than this one — and the restart reporter added in `fc331d62` means a run that pays the
other price now says so.

---

## Addendum 2026-09-06 (2) — the leak, measured and named

The §Verdict above says the retention lives in the "Next 15.5.10 + Turbopack dev
request path". That was a hypothesis from static reading and **it is wrong about
Turbopack**. A heap-snapshot pair taken from one server lifetime names the
holder, and it is neither Turbopack nor application code.

### What was taken

`E2E_DEV_HEAP_SNAPSHOT=1` (`scripts/dev-e2e.sh`) arms SIGUSR2;
`tools/next-heap/snapshot-pair.py` fired it at two `heapUsed` thresholds read
from `.next/trace`, both inside server lifetime pid 1629375:

| | heapUsed | file | write |
|---|---|---|---|
| early | 701 MB | 375 MB | 15 s |
| late | 1170 MB | 1155 MB | 37 s |

**401 requests separate them** (counted as `memory-usage` events in the trace
between the two samples). The heap did NOT collapse at either snapshot
(701 → 699, 1170 → 1164), so these are ordinary in-flight readings; no claim is
made here that a full collection ran first.

### What grew

`tools/next-heap/heap-classes.py --diff`, shallow size:

| class | growth | count |
|---|---|---|
| `array: (object elements)` | +128.4 MB | 502,295 → 2,080,154 |
| `string: <content>` | +110.1 MB | 546,995 → 1,312,580 |
| `object: Object` | +107.4 MB | 432,668 → 1,741,401 |
| `object: Array` | +48.5 MB | 524,275 → 2,114,460 |
| `number: heap number` | +37.3 MB | 619,771 → 3,066,949 |
| **`object: WeakRef`** | **+33.6 MB** | **269,245 → 1,371,593** |

538.7 MB of shallow growth over 401 requests — about 1.3 MB per request in this
window, against the ~0.63 MB pooled figure in §5. The window is heavier (admin
and contacts pages), and the two numbers are measured differently; they are
consistent in magnitude, not identical.

The first five rows are generic and name nothing. `WeakRef` is the diagnostic
one: **+1,102,348 of them, ~2,749 per request.** A WeakRef does not keep its
target alive — but the WeakRef object itself is kept alive by whoever collects
it, and something was collecting them by the million.

### Who holds them

`tools/next-heap/heap-retainers.py`, incoming edges:

```
1,371,593 target node(s); 1,428,450 incoming edge(s)
   1,427,396   1,427,396  object: Object  --promise->
```

One distinct plain `Object` per WeakRef, referencing it through a property named
`promise`. One hop further up:

```
1,427,400 target node(s); 2,599,467 incoming edge(s)
   1,337,594   1,337,594  object: Object  --awaited->
     950,488     950,488  object: Object  --previous->
```

A linked structure of `{promise, awaited, previous}` nodes. Those property names
are distinctive enough to grep for, and they resolve immediately.

### The holder, by name

`node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.development.js`
— React's **Flight server development build** — installs a process-wide async
hook at module load, with no guard around it:

```js
var pendingOperations = new Map(),
    lastRanAwait = null;
...
async_hooks.createHook({
  init: function (asyncId, type, triggerAsyncId, resource) {
    var trigger = pendingOperations.get(triggerAsyncId);
    ... { tag, owner, stack, start, end, promise: null, awaited: null, previous: trigger }
    pendingOperations.set(asyncId, trigger);
  },
  before: ..., promiseResolve: ...,
  destroy: function (asyncId) { pendingOperations.delete(asyncId); }
}).enable();
```

This is React's async debug-info / owner-stack tracking. Every node matches the
heap exactly: a `promise` (the WeakRef), an `awaited`, a `previous`, plus
`owner` and a parsed `stack` — which is where the +110 MB of strings and the
+128 MB of element arrays go.

**Why `destroy` does not keep up.** It removes the MAP entry for one `asyncId`.
The nodes are also chained to each other through `previous` and `awaited`, and a
node that another node still points at stays reachable whether or not the Map
still holds it. `promiseResolve` makes this concrete: it constructs a fresh node
and assigns it as `node.previous`, so that node is **never in the Map at all**
and `destroy` can never reach it.

### Three consequences

1. **The webpack result in the previous addendum is explained rather than
   anomalous.** Both `app-page.runtime.dev.js` and `app-page-turbo.runtime.dev.js`
   contain this hook. Switching bundler was never going to help, because the
   bundler was never the cause. The +672 MB measured there was this.

2. **No runtime opt-out exists in the shipped bundle.** The `createHook(...)
   .enable()` is unguarded, and there is no `process.env` test within 200 lines
   of it in either the stable or the `-experimental` build. React gates the
   feature at ITS build time, so the dev bundle simply has it.

3. **Remedy (iii) — run against `next build` + `next start` — is now the only
   one that addresses the cause**, since a production build does not load a
   development Flight bundle. Its blocker is unchanged and unrelated:
   `E2E_AUTH_RATE_LIMIT_BYPASS` is deliberately inert under
   `NODE_ENV=production`. That is a decision to take, not a defect to fix.

### What this does NOT establish

The 401-request window is one sample from one lifetime, on pages the crud
project happened to be exercising. It shows this structure growing and holding
the memory; it does not prove that nothing else contributes, and it does not
quantify what share is React's versus everything else — shallow size by class is
not retained-size attribution. What it does settle is the question §Verdict got
wrong: the growth is not Turbopack's, and it is not the application's.

---

## Addendum 2026-09-06 (3) — remedy (iii), implemented and measured

The decision this document kept deferring was taken: the suite can now run
against `next build` + `next start`.

    E2E_PROD=1 ./scripts/test-e2e.sh

### Why this is the remedy and not another mitigation

The watchdog does not merely fire less often under a production server — it is
not compiled into one. `node_modules/next/dist/server/lib/start-server.js:233`
opens `if (isDev)`, and the heap check with its `process.exit(RESTART_EXIT_CODE)`
sits inside that block. The development Flight bundle whose `async_hooks` hook
does the retaining (addendum 2) is likewise not loaded. Both halves of the
failure are structurally absent rather than deferred, which is what neither
bundler nor heap cap could buy.

### Measured, same tree, same host, 2026-09-06

| | dev server | production server |
|---|---|---|
| full suite | **111 passed / 1 failed** | **111 passed / 1 failed** |
| wall clock | 20.2 min | **11.3 min** |
| watchdog restarts | 1 | none exist |
| the failing test | `job-detail-panels.spec.ts:389` — a delete the watchdog abandoned | `keyboard-ux.spec.ts:777` — see below |
| smoke project | — | 8 passed in 6.7 s |
| build | — | 1 min 54 s wall (49 s of it compilation), 1.3 GB in `.next-e2e/` |

The pass COUNT is unchanged, and that is the load-bearing number: the move did
not quietly change what the suite proves. The wall clock nearly halving is not a
statement about the application — it is compile-on-request removed, plus a
server that no longer spends its time in a leaking hook.

### The auth blocker, sized rather than asserted

Every previous version of this document called `E2E_AUTH_RATE_LIMIT_BYPASS` *the*
blocker. Counted: the limit is 5 signins per 15 minutes per IP
(`src/lib/auth/auth-rate-limit.ts:24-25`) and the suite spent three. It now
spends **two** — `e2e/global-setup.ts` mints the NextAuth session cookie instead
of signing in, which this project can do because it uses JWT sessions (no
`Session` model; `src/auth.config.ts:13` augments `@auth/core/jwt`). The two
remaining signins belong to the smoke tests that exercise the auth flow itself
and must stay real.

The limiter, its double gate and its contract test are untouched.
`scripts/prod-e2e.sh` actively UNSETS the bypass rather than leaving it to the
gate, so nothing downstream can read its presence as meaning anything.

### What this does NOT establish

That the production server holds no memory. Nobody measured it over a full run;
the claim made here is narrower and structural — the watchdog and the dev Flight
bundle are absent from the build. If a production run ever does grow, the tools
in `tools/next-heap/` still apply, and `E2E_DEV_HEAP_SNAPSHOT` has no production
twin yet.
