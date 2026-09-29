#!/usr/bin/env python3
"""Read the heap floors out of a Next.js dev `.next/trace`.

Why floors and not peaks: a peak says the collector had not run yet. What decides
whether a dev server leaks is where memory settles AFTER each collection, so this
takes `heapUsed` following every drop greater than --drop MB and reports the
sequence. Flat floors mean the growth is garbage awaiting collection; rising
floors mean it is retained.

Method from docs/e2e-dev-server-restart-analysis.md sec. 3. Each line of the
trace is a JSON array of events; `memory-usage` events carry the numbers.
"""
import json, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument("trace", nargs="?", default=".next/trace")
ap.add_argument("--drop", type=float, default=100.0, help="MB drop that counts as a collection")
a = ap.parse_args()

MB = 1024 * 1024
samples = []
with open(a.trace) as fh:
    for line in fh:
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
            tags = ev.get("tags") or {}
            used = tags.get("memory.heapUsed") or tags.get("heapUsed")
            if used is None and ev.get("name") == "memory-usage":
                used = ev.get("heapUsed")
            if used is not None:
                try:
                    samples.append(int(used) / MB)
                except (TypeError, ValueError):
                    pass

if not samples:
    print(f"trace-floors: no heapUsed samples in {a.trace} — wrong file, or the dev server wrote no memory-usage events")
    sys.exit(2)

floors, prev = [], samples[0]
for cur in samples[1:]:
    if prev - cur >= a.drop:
        floors.append(cur)
    prev = cur

print(f"trace-floors: {len(samples)} samples, {len(floors)} collections >{a.drop:.0f} MB, "
      f"peak {max(samples):.0f} MB")
if not floors:
    print("  no collection that large — nothing to read a trend from")
    sys.exit(0)
print("  floors (MB): " + ", ".join(f"{f:.0f}" for f in floors))
first, last = floors[0], floors[-1]
verdict = "RISING — retained, not garbage" if last - first > 200 else "FLAT — growth was collectable"
print(f"  first {first:.0f} -> last {last:.0f}  ({last-first:+.0f} MB)  {verdict}")
