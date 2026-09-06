#!/usr/bin/env python3
"""Take a pair of V8 heap snapshots from the running E2E dev server.

The point of a PAIR: the dev server's heap grows monotonically with the number
of requests served (docs/e2e-dev-server-restart-analysis.md sec. 2-4), so a single
snapshot cannot separate what the server legitimately holds from what it is
accumulating. Two snapshots at different heap sizes can — whatever grew between
them is the leak, and everything that did not is baseline.

Taken EARLY on purpose. Growth is linear, so a 1000 MB / 2400 MB pair shows the
same accumulation as a 1 GB / 2.5 GB pair would, with smaller files and shorter
stop-the-world pauses. The pause is the reason the run's test results have to be
discarded: serialising a multi-gigabyte heap blocks every request in flight, and
Playwright's timeouts keep running.

How the trigger knows the heap size: Next's dev server writes a `memory-usage`
event to `.next/trace` after every request, carrying `memory.heapUsed`. That is
the same source the floors in the analysis came from, so the thresholds here are
directly comparable to the tables there. Polling `/proc/<pid>/status` instead
would read RSS, which sits 1.2-3.2 GB ABOVE the heap and by a margin that itself
changes during a run — it cannot be converted back.

Usage (from the worktree root, with a run already in flight):
    python3 tools/next-heap/snapshot-pair.py --port 3737 --at 1000 --at 2400

Arming is separate and deliberate: start the server with
`E2E_DEV_HEAP_SNAPSHOT=1` so Node installs the SIGUSR2 handler. Without it,
SIGUSR2 KILLS the server, so this script refuses to signal a process whose
environment does not show the flag.
"""
import argparse
import glob
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time

MB = 1024 * 1024


def log(msg):
    print(f"[snapshot-pair] {time.strftime('%T')} {msg}", flush=True)


def listener_pid(port):
    """PID of the process listening on `port`, or None.

    The listener is the SERVER; `next dev` also runs a supervisor process that
    holds no request state and would produce a snapshot of nothing.
    """
    try:
        out = subprocess.run(["ss", "-lptnH", f"sport = :{port}"],
                             capture_output=True, text=True, timeout=10).stdout
    except (subprocess.SubprocessError, OSError):
        return None
    m = re.search(r"pid=(\d+)", out)
    return int(m.group(1)) if m else None


def is_armed(pid):
    """True when the process was started with --heapsnapshot-signal=SIGUSR2.

    Guard, not diagnostics. Node's default disposition for SIGUSR2 is to
    TERMINATE; signalling an unarmed dev server would kill it mid-suite and the
    failure would look like the very watchdog restart this work is chasing.
    """
    try:
        with open(f"/proc/{pid}/environ", "rb") as fh:
            env = fh.read().decode("utf-8", "replace")
    except OSError:
        return False
    for entry in env.split("\0"):
        if entry.startswith("NODE_OPTIONS=") and "--heapsnapshot-signal=SIGUSR2" in entry:
            return True
    return False


def follow_heap(trace_path, state):
    """Append heapUsed values (MB) newly written to the trace into state["pending"].

    `state` carries the read offset, the partial trailing line, and the queue of
    values not yet consumed. The trace is APPENDED to across server lifetimes
    rather than truncated, so reading from the beginning would replay every
    previous run's numbers.

    Values are queued rather than yielded because the caller stops to take a
    snapshot mid-batch. A generator would drop every sample already parsed but
    not yet handed out, and with two close thresholds that silently skips one.
    """
    try:
        size = os.path.getsize(trace_path)
    except OSError:
        return
    if size < state["offset"]:
        # Truncated (a `scripts/clean.sh` between runs) — restart from the front.
        state["offset"] = 0
        state["partial"] = ""
    if size == state["offset"]:
        return
    with open(trace_path, "r", errors="replace") as fh:
        fh.seek(state["offset"])
        data = fh.read()
        state["offset"] = fh.tell()
    buf = state["partial"] + data
    lines = buf.split("\n")
    state["partial"] = lines.pop()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            events = json.loads(line)
        except json.JSONDecodeError:
            continue
        for ev in events if isinstance(events, list) else [events]:
            if not isinstance(ev, dict):
                continue
            used = (ev.get("tags") or {}).get("memory.heapUsed")
            if used is None:
                continue
            try:
                state["pending"].append(int(used) / MB)
            except (TypeError, ValueError):
                continue


def wait_for_snapshot(cwd, pid, since, out_dir, timeout=600):
    """Wait for node to finish writing, then move the file into `out_dir`.

    Finished means the size stopped changing — node writes the snapshot
    incrementally and there is no completion signal to wait on.
    """
    pattern = os.path.join(cwd, f"Heap.*.{pid}.*.heapsnapshot")
    deadline = time.time() + timeout
    path = None
    while time.time() < deadline:
        for cand in glob.glob(pattern):
            if os.path.getmtime(cand) >= since - 2:
                path = cand
                break
        if path:
            break
        time.sleep(0.5)
    if not path:
        return None

    last, stable = -1, 0
    while time.time() < deadline:
        try:
            cur = os.path.getsize(path)
        except OSError:
            return None
        if cur == last and cur > 0:
            stable += 1
            if stable >= 4:
                break
        else:
            stable = 0
        last = cur
        time.sleep(1.0)

    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, os.path.basename(path))
    shutil.move(path, dest)
    return dest


def run(port, thresholds, trace, out_dir, cwd, timeout, poll=2.0):
    thresholds = sorted(thresholds)
    cwd = os.path.abspath(cwd)
    out_dir = os.path.abspath(out_dir)

    pid = listener_pid(port)
    if not pid:
        log(f"ERROR: nothing is listening on port {port} — start the run first.")
        return 2, []
    if not is_armed(pid):
        log(f"ERROR: pid {pid} is NOT armed (no --heapsnapshot-signal=SIGUSR2 in NODE_OPTIONS).")
        log("       Signalling it would KILL the server. Restart with E2E_DEV_HEAP_SNAPSHOT=1.")
        return 2, []

    log(f"server pid={pid} on :{port}, armed. thresholds: "
        + ", ".join(f"{t:.0f} MB" for t in thresholds))

    state = {"offset": os.path.getsize(trace) if os.path.exists(trace) else 0,
             "partial": "", "pending": []}
    log(f"following {trace} from byte {state['offset']:,}")

    taken = []
    peak = 0.0
    deadline = time.time() + timeout
    last_report = 0.0

    while thresholds and time.time() < deadline:
        cur_pid = listener_pid(port)
        if cur_pid != pid:
            if cur_pid is None:
                log("server is gone — the run ended or the process died. Stopping.")
                break
            log(f"server RESTARTED (pid {pid} -> {cur_pid}); the heap reset, "
                f"remaining thresholds now measure the NEW lifetime.")
            pid = cur_pid
            peak = 0.0
            if not is_armed(pid):
                log("ERROR: the new server is not armed. Stopping rather than killing it.")
                break

        follow_heap(trace, state)
        while state["pending"] and thresholds:
            used = state["pending"].pop(0)
            peak = max(peak, used)
            if used < thresholds[0]:
                continue
            target = thresholds.pop(0)
            log(f"heapUsed {used:.0f} MB crossed {target:.0f} MB — SIGUSR2 to {pid}")
            t0 = time.time()
            os.kill(pid, signal.SIGUSR2)
            dest = wait_for_snapshot(cwd, pid, t0, out_dir)
            if dest:
                log(f"wrote {dest} ({os.path.getsize(dest) / MB:.0f} MB) "
                    f"in {time.time() - t0:.0f}s")
                taken.append((target, used, dest))
            else:
                log("ERROR: no snapshot file appeared — is the process really armed?")

        if thresholds and time.time() - last_report > 60:
            log(f"waiting — peak heapUsed so far {peak:.0f} MB, "
                f"next threshold {thresholds[0]:.0f} MB")
            last_report = time.time()
        time.sleep(poll)

    print()
    if not taken:
        log("no snapshots taken.")
        return 1, taken
    log(f"{len(taken)} snapshot(s):")
    for target, used, dest in taken:
        log(f"  at {used:.0f} MB (target {target:.0f}): {dest}")
    if len(taken) >= 2:
        log("diff them with:")
        log(f"  python3 tools/next-heap/heap-classes.py --diff '{taken[0][2]}' '{taken[-1][2]}'")
    else:
        log("only one snapshot — a pair is needed to separate baseline from growth.")
    return 0, taken


def self_test():
    """Drive the whole chain against a stand-in server, with no dev server needed.

    What this proves, and it is the part worth proving before spending a run:
    the listener is found by PORT (not by a name match that would pick the
    supervisor), the arming guard reads the real process environment, a rising
    `heapUsed` in a trace fires at the right sample, and the file lands in the
    output directory. What it does not prove is anything about Next — the
    stand-in is a plain Node server.

    It also exercises the guard in the direction that matters: an UNARMED
    process must be refused, because signalling one kills it.
    """
    import tempfile
    import threading

    rc = 0
    with tempfile.TemporaryDirectory() as d:
        srv = os.path.join(d, "srv.js")
        with open(srv, "w") as fh:
            fh.write(
                'const http=require("http"),fs=require("fs");'
                'const s=http.createServer((q,r)=>r.end("ok"));'
                's.listen(0,"127.0.0.1",()=>{'
                'fs.writeFileSync("port",String(s.address().port));});'
                'const keep=[];setInterval(()=>{for(let i=0;i<1000;i++)'
                'keep.push({i,s:"z".repeat(64)});},50);'
            )
        trace = os.path.join(d, "trace")
        open(trace, "w").close()
        out = os.path.join(d, "out")

        def start(armed):
            env = dict(os.environ)
            env["NODE_OPTIONS"] = "--heapsnapshot-signal=SIGUSR2" if armed else ""
            p = subprocess.Popen(["node", srv], cwd=d, env=env,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            port = None
            for _ in range(100):
                try:
                    port = int(open(os.path.join(d, "port")).read())
                    break
                except (OSError, ValueError):
                    time.sleep(0.1)
            return p, port

        # 1. an UNARMED process must be refused, not signalled.
        p, port = start(armed=False)
        try:
            code, _ = run(port, [10.0], trace, out, d, timeout=5, poll=0.2)
            if code != 2:
                print(f"SELF-TEST FAIL: unarmed process was not refused (rc={code})")
                rc = 1
            elif p.poll() is not None:
                print("SELF-TEST FAIL: the unarmed process died — it WAS signalled")
                rc = 1
        finally:
            p.kill()
            p.wait()
            os.remove(os.path.join(d, "port"))

        # 2. an armed process, with heapUsed rising past two thresholds.
        p, port = start(armed=True)

        def feed():
            for used_mb in (50, 120, 260, 400, 700):
                time.sleep(0.6)
                with open(trace, "a") as fh:
                    fh.write(json.dumps([{
                        "name": "memory-usage",
                        "tags": {"url": "/", "memory.heapUsed": str(int(used_mb * MB))},
                    }]) + "\n")

        t = threading.Thread(target=feed, daemon=True)
        t.start()
        try:
            code, taken = run(port, [100.0, 500.0], trace, out, d, timeout=60, poll=0.3)
            if code != 0 or len(taken) != 2:
                print(f"SELF-TEST FAIL: expected 2 snapshots, got {len(taken)} (rc={code})")
                rc = 1
            else:
                firsts = [round(u) for _, u, _ in taken]
                if firsts != [120, 700]:
                    print(f"SELF-TEST FAIL: fired at {firsts} MB, expected [120, 700] "
                          "(the first sample AT or ABOVE each threshold)")
                    rc = 1
                for _, _, dest in taken:
                    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
                        print(f"SELF-TEST FAIL: {dest} missing or empty")
                        rc = 1
                left = glob.glob(os.path.join(d, "*.heapsnapshot"))
                if left:
                    print(f"SELF-TEST FAIL: {len(left)} snapshot(s) left in the server cwd")
                    rc = 1
        finally:
            p.kill()
            p.wait()

    if rc == 0:
        print("SELF-TEST PASS: unarmed refused; armed fired at both thresholds; "
              "both files moved out of the server cwd")
    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("JOBSYNC_PORT", "3737")))
    ap.add_argument("--at", type=float, action="append",
                    help="heapUsed in MB at which to take a snapshot (repeat; default 1000 2400)")
    ap.add_argument("--trace", default=".next/trace")
    ap.add_argument("--out", default="heap-snapshots")
    ap.add_argument("--cwd", default=".", help="working directory of the server (where node writes)")
    ap.add_argument("--timeout", type=int, default=3600, help="give up after N seconds")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()

    if a.self_test:
        return self_test()

    code, _ = run(a.port, a.at or [1000.0, 2400.0], a.trace, a.out, a.cwd, a.timeout)
    return code


if __name__ == "__main__":
    sys.exit(main())
