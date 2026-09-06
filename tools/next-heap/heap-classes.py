#!/usr/bin/env python3
"""Aggregate a V8 heap snapshot by object class, and diff two aggregates.

Why this exists: attributing the E2E dev server's retention needs two snapshots
taken at different points of the same run, and the later one is a multi-gigabyte
JSON document. `json.load` on it would need several times its size in RAM on a
host that has ~12 GB free — the measurement would take the machine down before
it produced an answer. So this streams.

What it reads. A `.heapsnapshot` is one JSON object whose members appear in a
fixed order: `snapshot` (the schema), `nodes` (a FLAT array of integers, N
fields per node), `edges`, the trace/sample tables, and `strings` LAST. Only two
of those are needed here, and both can be consumed as a token stream without
building a Python object for the document.

What it reports: SHALLOW self-size per class. Not retained size — that needs a
dominator tree over the edge array, which is a different and much more expensive
computation. Shallow size answers the question actually being asked ("what is
there more of at 2.5 GB than at 1 GB"); retained size answers "who is holding
it", which is the follow-up once a class has been named.

String-valued nodes are aggregated by TYPE only. Their `name` IS their content,
so keying on it would put one dictionary entry per distinct string in the heap —
millions of entries, and the aggregation would blow up exactly the way the naive
parse does.

Usage:
    heap-classes.py SNAPSHOT [-o agg.json] [--top N]
    heap-classes.py --diff early.json late.json [--top N]
    heap-classes.py --self-test
"""
import argparse
import json
import os
import sys

CHUNK = 8 << 20  # 8 MiB

# Node types whose `name` field is the string's own content.
CONTENT_NAMED = {"string", "concatenated string", "sliced string"}


def _find_array_start(fh, key):
    """Position `fh` just after `"<key>":[` and return True, or False at EOF.

    Scans forward from the current position. The needle can straddle a chunk
    boundary, so the tail of each chunk is carried into the next.
    """
    needle = f'"{key}":['
    carry = ""
    while True:
        chunk = fh.read(CHUNK)
        if not chunk:
            return False
        hay = carry + chunk
        idx = hay.find(needle)
        if idx >= 0:
            # Rewind to just past the '[' — file position is at the end of the
            # chunk, so seek back by however much of `hay` is unconsumed.
            consumed = idx + len(needle)
            fh.seek(fh.tell() - (len(hay) - consumed))
            return True
        carry = hay[-len(needle):]


def _stream_ints(fh):
    """Yield integers until the closing ']' of the current array."""
    tok = ""
    while True:
        chunk = fh.read(CHUNK)
        if not chunk:
            if tok:
                yield int(tok)
            return
        for ch in chunk:
            if ch.isdigit() or ch == "-":
                tok += ch
            elif ch == "]":
                if tok:
                    yield int(tok)
                return
            else:
                if tok:
                    yield int(tok)
                    tok = ""


def _stream_strings(fh, wanted):
    """Yield (index, value) for indices in `wanted` from the current array.

    Reads the array element by element so the full strings table — which for a
    large heap is itself larger than RAM allows — is never materialised.
    """
    out = {}
    idx = 0
    buf = ""
    in_str = False
    esc = False
    cur = []
    remaining = set(wanted)
    while remaining:
        chunk = fh.read(CHUNK)
        if not chunk:
            break
        buf = chunk
        for ch in buf:
            if in_str:
                if esc:
                    cur.append(ch)
                    esc = False
                elif ch == "\\":
                    cur.append(ch)
                    esc = True
                elif ch == '"':
                    in_str = False
                    if idx in remaining:
                        raw = "".join(cur)
                        try:
                            out[idx] = json.loads(f'"{raw}"')
                        except json.JSONDecodeError:
                            out[idx] = raw
                        remaining.discard(idx)
                    cur = []
                    idx += 1
                else:
                    cur.append(ch)
            elif ch == '"':
                in_str = True
                cur = []
            elif ch == "]":
                return out
    return out


def aggregate(path):
    """Return {"types": {...}, "classes": {...}, "node_count": n, "total": bytes}."""
    size = os.path.getsize(path)
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        head = fh.read(CHUNK)
        meta_end = head.find('"nodes"')
        if meta_end < 0:
            raise SystemExit(f"heap-classes: no 'nodes' member in {path} — not a heap snapshot?")
        # The `snapshot` member is small; parse it on its own.
        obj = json.loads(head[: head.rindex(",", 0, meta_end)] + "}")
        meta = obj["snapshot"]["meta"]
        fields = meta["node_fields"]
        types = meta["node_types"][fields.index("type")]
        f_type = fields.index("type")
        f_name = fields.index("name")
        f_size = fields.index("self_size")
        width = len(fields)

        fh.seek(0)
        if not _find_array_start(fh, "nodes"):
            raise SystemExit("heap-classes: could not position at the nodes array")

        by_class = {}
        by_type = {}
        node_count = 0
        total = 0
        rec = []
        for v in _stream_ints(fh):
            rec.append(v)
            if len(rec) < width:
                continue
            t, nm, sz = rec[f_type], rec[f_name], rec[f_size]
            rec = []
            node_count += 1
            total += sz
            tname = types[t] if t < len(types) else f"type#{t}"
            e = by_type.setdefault(tname, [0, 0])
            e[0] += 1
            e[1] += sz
            key = (tname, -1) if tname in CONTENT_NAMED else (tname, nm)
            c = by_class.setdefault(key, [0, 0])
            c[0] += 1
            c[1] += sz

        # Resolve only the names that will be printed or diffed.
        wanted = {nm for (_, nm) in by_class if nm >= 0}
        strings = {}
        if wanted:
            fh.seek(0)
            if _find_array_start(fh, "strings"):
                strings = _stream_strings(fh, wanted)

    classes = {}
    for (tname, nm), (cnt, sz) in by_class.items():
        label = "<content>" if nm < 0 else strings.get(nm, f"str#{nm}")
        classes[f"{tname}\t{label}"] = [cnt, sz]

    return {
        "file": os.path.abspath(path),
        "file_bytes": size,
        "node_count": node_count,
        "total_self_size": total,
        "types": {k: v for k, v in by_type.items()},
        "classes": classes,
    }


def _fmt(n):
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024 or unit == "GB":
            return f"{n:,.0f} {unit}" if unit == "B" else f"{n:,.1f} {unit}"
        n /= 1024.0


def report(agg, top):
    print(f"{agg['file']}")
    print(f"  {agg['node_count']:,} nodes, {_fmt(agg['total_self_size'])} shallow, "
          f"file {_fmt(agg['file_bytes'])}")
    print("  by type:")
    for name, (cnt, sz) in sorted(agg["types"].items(), key=lambda kv: -kv[1][1]):
        print(f"    {_fmt(sz):>12}  {cnt:>10,}  {name}")
    print(f"  top {top} classes by shallow size:")
    rows = sorted(agg["classes"].items(), key=lambda kv: -kv[1][1])[:top]
    for key, (cnt, sz) in rows:
        t, label = key.split("\t", 1)
        print(f"    {_fmt(sz):>12}  {cnt:>10,}  {t}: {label[:70]}")


def diff(a, b, top):
    print(f"early: {a['file']}  {_fmt(a['total_self_size'])} shallow, {a['node_count']:,} nodes")
    print(f"late : {b['file']}  {_fmt(b['total_self_size'])} shallow, {b['node_count']:,} nodes")
    print(f"delta: {_fmt(b['total_self_size'] - a['total_self_size'])} shallow, "
          f"{b['node_count'] - a['node_count']:+,} nodes")
    print()
    print("  growth by type:")
    keys = set(a["types"]) | set(b["types"])
    rows = []
    for k in keys:
        ac, asz = a["types"].get(k, [0, 0])
        bc, bsz = b["types"].get(k, [0, 0])
        rows.append((bsz - asz, bc - ac, k))
    for d, dc, k in sorted(rows, key=lambda r: -r[0]):
        if d == 0:
            continue
        print(f"    {_fmt(d):>12}  {dc:>+11,}  {k}")
    print()
    print(f"  top {top} GROWING classes:")
    keys = set(a["classes"]) | set(b["classes"])
    rows = []
    for k in keys:
        ac, asz = a["classes"].get(k, [0, 0])
        bc, bsz = b["classes"].get(k, [0, 0])
        rows.append((bsz - asz, bc - ac, ac, bc, k))
    for d, dc, ac, bc, k in sorted(rows, key=lambda r: -r[0])[:top]:
        if d <= 0:
            continue
        t, label = k.split("\t", 1)
        print(f"    {_fmt(d):>12}  {dc:>+11,}  ({ac:,} -> {bc:,})  {t}: {label[:60]}")


def self_test():
    """Prove the streaming parser agrees with json.load on a small snapshot.

    A parser that silently mis-splits the flat node array would produce a
    plausible-looking table of nonsense, which is the failure mode this guards.
    """
    import subprocess
    import tempfile
    import glob
    import time

    with tempfile.TemporaryDirectory() as d:
        js = os.path.join(d, "t.js")
        with open(js, "w") as fh:
            fh.write(
                'const fs=require("fs");const keep=[];'
                'for(let i=0;i<5000;i++)keep.push({i,s:"y".repeat(32)});'
                'fs.writeFileSync("t.pid",String(process.pid));'
                'setInterval(()=>{},1000);'
            )
        env = dict(os.environ, NODE_OPTIONS="--heapsnapshot-signal=SIGUSR2")
        p = subprocess.Popen(["node", js], cwd=d, env=env,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                if os.path.exists(os.path.join(d, "t.pid")):
                    break
                time.sleep(0.1)
            os.kill(p.pid, 12)  # SIGUSR2
            snap = None
            for _ in range(100):
                found = glob.glob(os.path.join(d, "*.heapsnapshot"))
                if found and os.path.getsize(found[0]) > 0:
                    time.sleep(1.0)
                    snap = found[0]
                    break
                time.sleep(0.1)
        finally:
            p.kill()
            p.wait()

        if not snap:
            print("SELF-TEST FAIL: node produced no snapshot")
            return 1

        mine = aggregate(snap)
        with open(snap) as fh:
            doc = json.load(fh)
        meta = doc["snapshot"]["meta"]
        w = len(meta["node_fields"])
        fi = meta["node_fields"].index
        nodes = doc["nodes"]
        ref_count = len(nodes) // w
        ref_total = sum(nodes[i + fi("self_size")] for i in range(0, len(nodes), w))
        ref_types = {}
        tnames = meta["node_types"][fi("type")]
        for i in range(0, len(nodes), w):
            t = tnames[nodes[i + fi("type")]]
            e = ref_types.setdefault(t, [0, 0])
            e[0] += 1
            e[1] += nodes[i + fi("self_size")]

        ok = True
        if mine["node_count"] != ref_count:
            print(f"SELF-TEST FAIL: node_count {mine['node_count']} != {ref_count}")
            ok = False
        if mine["total_self_size"] != ref_total:
            print(f"SELF-TEST FAIL: total {mine['total_self_size']} != {ref_total}")
            ok = False
        if mine["types"] != ref_types:
            print("SELF-TEST FAIL: per-type aggregation differs from json.load")
            ok = False
        # A resolved class name must come back as a real identifier, not str#N.
        named = [k for k in mine["classes"] if k.startswith("object\t") and "str#" not in k]
        if not named:
            print("SELF-TEST FAIL: no object class name resolved out of the strings table")
            ok = False
        if ok:
            print(f"SELF-TEST PASS: {ref_count:,} nodes, {_fmt(ref_total)} shallow, "
                  f"{len(ref_types)} types agree with json.load; "
                  f"{len(named)} object classes named")
        return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot", nargs="?")
    ap.add_argument("-o", "--out", help="write the aggregate as JSON")
    ap.add_argument("--top", type=int, default=30)
    ap.add_argument("--diff", nargs=2, metavar=("EARLY", "LATE"),
                    help="two aggregate JSONs (or snapshots) to compare")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()

    if a.self_test:
        sys.exit(self_test())

    def load(p):
        with open(p, "rb") as fh:
            first = fh.read(64)
        if b'"snapshot"' in first:
            return aggregate(p)
        with open(p) as fh:
            return json.load(fh)

    if a.diff:
        diff(load(a.diff[0]), load(a.diff[1]), a.top)
        return

    if not a.snapshot:
        ap.error("give a snapshot, or --diff EARLY LATE, or --self-test")

    agg = aggregate(a.snapshot)
    if a.out:
        with open(a.out, "w") as fh:
            json.dump(agg, fh)
        print(f"wrote {a.out}")
    report(agg, a.top)


if __name__ == "__main__":
    main()
