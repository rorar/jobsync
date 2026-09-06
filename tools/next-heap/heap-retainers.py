#!/usr/bin/env python3
"""Name what POINTS AT a class of objects in a V8 heap snapshot.

`heap-classes.py` answers "what grew". That is where an investigation starts,
not where it ends: knowing there are 1.1 million more `WeakRef`s says nothing
about who is collecting them, and a class that grows is only actionable once its
holder has a name.

This walks the edge array and reports, for every node of the target class, the
class of the node pointing at it and the edge's own name. So the output reads
"NNN edges named `items` from `object: ModuleRegistry`" rather than "there are a
lot of WeakRefs".

Method, and its limit. This is INCOMING EDGES, one hop, not a dominator tree.
It answers "who references this" and NOT "who is ultimately responsible for
keeping it alive" — for a structure held through three layers of arrays, the
immediate parent is a backing store and the useful answer is one more hop up
(use --hop-through to follow those). Retained-size attribution is a different and
far more expensive computation; this is the cheap question that is usually
enough.

Memory: three int arrays over the node count (type, name, edge_count), about
170 MB for a 14-million-node snapshot. The edge array is streamed, never held.

Usage:
    heap-retainers.py SNAPSHOT --of "object:WeakRef"
    heap-retainers.py SNAPSHOT --of "object:WeakRef" --hop-through "object:Array"
    heap-retainers.py --self-test
"""
import argparse
import json
import os
import sys
from array import array

CHUNK = 8 << 20


def _find_array_start(fh, key):
    needle = f'"{key}":['
    carry = ""
    while True:
        chunk = fh.read(CHUNK)
        if not chunk:
            return False
        hay = carry + chunk
        idx = hay.find(needle)
        if idx >= 0:
            consumed = idx + len(needle)
            fh.seek(fh.tell() - (len(hay) - consumed))
            return True
        carry = hay[-len(needle):]


def _stream_ints(fh):
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
    out = {}
    idx = 0
    in_str = False
    esc = False
    cur = []
    remaining = set(wanted)
    while remaining:
        chunk = fh.read(CHUNK)
        if not chunk:
            break
        for ch in chunk:
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


class Snapshot:
    def __init__(self, path):
        self.path = path
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            head = fh.read(CHUNK)
            at = head.find('"nodes"')
            if at < 0:
                raise SystemExit(f"heap-retainers: {path} is not a heap snapshot")
            obj = json.loads(head[: head.rindex(",", 0, at)] + "}")
            meta = obj["snapshot"]["meta"]
            self.declared_nodes = obj["snapshot"].get("node_count")
            nf = meta["node_fields"]
            self.node_types = meta["node_types"][nf.index("type")]
            self.nwidth = len(nf)
            self.i_type, self.i_name, self.i_edges = (
                nf.index("type"), nf.index("name"), nf.index("edge_count"))
            ef = meta["edge_fields"]
            self.ewidth = len(ef)
            self.edge_types = meta["edge_types"][ef.index("type")]
            self.e_type, self.e_name, self.e_to = (
                ef.index("type"), ef.index("name_or_index"), ef.index("to_node"))

            fh.seek(0)
            if not _find_array_start(fh, "nodes"):
                raise SystemExit("heap-retainers: could not position at nodes")
            self.ntype = array("i")
            self.nname = array("i")
            self.necount = array("i")
            rec = []
            for v in _stream_ints(fh):
                rec.append(v)
                if len(rec) < self.nwidth:
                    continue
                self.ntype.append(rec[self.i_type])
                self.nname.append(rec[self.i_name])
                self.necount.append(rec[self.i_edges])
                rec = []
            if self.declared_nodes is not None and len(self.ntype) != self.declared_nodes:
                raise SystemExit(
                    f"heap-retainers: {path} is TRUNCATED — header declares "
                    f"{self.declared_nodes:,} nodes, read {len(self.ntype):,}.")

    def name_indices(self, names):
        """String-table indices for the given literal names (may be empty)."""
        if getattr(self, "_name_idx", None) is None:
            self._name_idx = {}
        missing = {n for n in names if n not in self._name_idx}
        if missing:
            found = {}
            with open(self.path, "r", encoding="utf-8", errors="replace") as fh:
                if _find_array_start(fh, "strings"):
                    idx = 0
                    in_str = False
                    esc = False
                    cur = []
                    done = False
                    while not done:
                        chunk = fh.read(CHUNK)
                        if not chunk:
                            break
                        for ch in chunk:
                            if in_str:
                                if esc:
                                    cur.append(ch)
                                    esc = False
                                elif ch == "\\":
                                    cur.append(ch)
                                    esc = True
                                elif ch == '"':
                                    in_str = False
                                    v = "".join(cur)
                                    if v in missing and v not in found:
                                        found[v] = idx
                                    cur = []
                                    idx += 1
                                else:
                                    cur.append(ch)
                            elif ch == '"':
                                in_str = True
                                cur = []
                            elif ch == "]":
                                done = True
                                break
            for n in missing:
                self._name_idx[n] = found.get(n)
        return {self._name_idx[n] for n in names if self._name_idx.get(n) is not None}

    def type_name(self, i):
        t = self.ntype[i]
        return self.node_types[t] if t < len(self.node_types) else f"type#{t}"

    def resolve(self, indices):
        with open(self.path, "r", encoding="utf-8", errors="replace") as fh:
            if not _find_array_start(fh, "strings"):
                return {}
            return _stream_strings(fh, indices)

    def label(self, i, strings):
        """`type: name`, with string-valued nodes collapsed the way heap-classes does."""
        t = self.type_name(i)
        if t in ("string", "concatenated string", "sliced string"):
            return f"{t}: <content>"
        return f"{t}: {strings.get(self.nname[i], f'str#{self.nname[i]}')}"

    def select(self, spec):
        """Node indices matching `type` or `type:name`."""
        if ":" in spec:
            want_t, want_n = (p.strip() for p in spec.split(":", 1))
        else:
            want_t, want_n = spec.strip(), None
        # Resolve names lazily: collect candidates by type first, then filter.
        cand = [i for i in range(len(self.ntype)) if self.type_name(i) == want_t]
        if want_n is None:
            return set(cand)
        strings = self.resolve({self.nname[i] for i in cand})
        return {i for i in cand if strings.get(self.nname[i]) == want_n}

    def incoming(self, targets, structural=False):
        """{(from_node_index, edge_name_index_or_-1): count} for edges into `targets`.

        Aggregated by the SOURCE node so a caller can hop further; the caller
        turns node indices into class labels.

        STRUCTURAL EDGES ARE EXCLUDED unless asked for, and that is not a
        cosmetic choice. Every instance of a class carries a `__proto__` edge to
        its shared prototype, and the prototype is an instance of that class --
        so a query for "who holds the WeakRefs" answers "1,102,347 WeakRefs do",
        which is true, useless, and outranks the real holder. Measured on the
        synthetic case: 20,011 `__proto__` edges against the 20,000 element
        edges from the one array that actually retains them.
        """
        # Resolved ONCE into string indices, so the per-edge test is an integer
        # membership check. Resolving per edge would re-scan the whole strings
        # table for every distinct name — a full pass over a gigabyte file, and
        # there are hundreds of distinct names.
        skip_idx = set() if structural else self.name_indices(
            {"__proto__", "map", "prototype"})
        hits = {}
        with open(self.path, "r", encoding="utf-8", errors="replace") as fh:
            if not _find_array_start(fh, "edges"):
                raise SystemExit("heap-retainers: could not position at edges")
            src = 0
            left = self.necount[0] if self.necount else 0
            rec = []
            for v in _stream_ints(fh):
                rec.append(v)
                if len(rec) < self.ewidth:
                    continue
                etype, ename, eto = rec[self.e_type], rec[self.e_name], rec[self.e_to]
                rec = []
                while left == 0:
                    src += 1
                    if src >= len(self.necount):
                        return hits
                    left = self.necount[src]
                left -= 1
                to_idx = eto // self.nwidth
                if to_idx in targets:
                    if ename in skip_idx and self.edge_types[etype] == "property":
                        continue
                    # Edge names are string indices for named edges and plain
                    # integers for element/index edges; -1 keeps them apart.
                    key = (src, ename if self.edge_types[etype] not in ("element", "hidden") else -1)
                    hits[key] = hits.get(key, 0) + 1
        return hits


def report(snap, targets, hits, top, hop_through=None):
    strings = snap.resolve(
        {snap.nname[src] for (src, _) in hits} | {n for (_, n) in hits if n >= 0})
    rows = {}
    for (src, ename), n in hits.items():
        key = (snap.label(src, strings),
               strings.get(ename, str(ename)) if ename >= 0 else "<element>")
        e = rows.setdefault(key, [0, 0])
        e[0] += n
        e[1] += 1
    print(f"{len(targets):,} target node(s); {sum(hits.values()):,} incoming edge(s) "
          f"from {len(hits):,} distinct source/name pairs")
    print(f"  top {top} holders (edges, distinct sources):")
    for (label, ename), (n, srcs) in sorted(rows.items(), key=lambda kv: -kv[1][0])[:top]:
        print(f"    {n:>12,}  {srcs:>10,}  {label[:60]}  --{ename}->")

    if hop_through:
        if ":" in hop_through:
            ht_t, ht_n = (x.strip() for x in hop_through.split(":", 1))
        else:
            ht_t, ht_n = hop_through.strip(), None
        src_names = snap.resolve({snap.nname[src] for (src, _) in hits}) if ht_n else {}
        promoted = {src for (src, _) in hits
                    if snap.type_name(src) == ht_t
                    and (ht_n is None or src_names.get(snap.nname[src]) == ht_n)}
        if not promoted:
            print(f"  (nothing to hop: no source of type '{hop_through}')")
            return
        print()
        print(f"  hopping through {len(promoted):,} '{hop_through}' node(s) to their holders:")
        report(snap, promoted, snap.incoming(promoted), top)


def self_test():
    """Prove the edge walk finds a holder that is known by construction."""
    import subprocess
    import tempfile
    import glob
    import time

    with tempfile.TemporaryDirectory() as d:
        js = os.path.join(d, "t.js")
        with open(js, "w") as fh:
            fh.write(
                'const fs=require("fs");'
                'class HolderOfRefs{constructor(){this.refs=[];}}'
                'const holder=new HolderOfRefs();'
                'const alive=[];'
                'for(let i=0;i<20000;i++){const o={i};alive.push(o);'
                'holder.refs.push(new WeakRef(o));}'
                'globalThis.__keep=[holder,alive];'
                'fs.writeFileSync("t.pid",String(process.pid));'
                'setInterval(()=>{},1000);'
            )
        env = dict(os.environ, NODE_OPTIONS="--heapsnapshot-signal=SIGUSR2")
        p = subprocess.Popen(["node", js], cwd=d, env=env,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        snap = None
        try:
            for _ in range(60):
                if os.path.exists(os.path.join(d, "t.pid")):
                    break
                time.sleep(0.1)
            os.kill(p.pid, 12)
            for _ in range(200):
                found = glob.glob(os.path.join(d, "*.heapsnapshot"))
                if found and os.path.getsize(found[0]) > 0:
                    time.sleep(1.5)
                    snap = found[0]
                    break
                time.sleep(0.1)
        finally:
            p.kill()
            p.wait()
        if not snap:
            print("SELF-TEST FAIL: no snapshot produced")
            return 1

        s = Snapshot(snap)
        targets = s.select("object:WeakRef")
        if len(targets) < 20000:
            print(f"SELF-TEST FAIL: found {len(targets):,} WeakRefs, expected >= 20,000")
            return 1
        hits = s.incoming(targets)
        strings = s.resolve({s.nname[src] for (src, _) in hits})
        labels = {}
        for (src, _), n in hits.items():
            labels[s.label(src, strings)] = labels.get(s.label(src, strings), 0) + n
        top = max(labels.items(), key=lambda kv: kv[1])[0] if labels else "<none>"
        # The immediate holder is the ARRAY the WeakRefs were pushed into, not
        # `HolderOfRefs` itself -- correct one-hop behaviour, and asserting
        # otherwise would bake a wrong expectation into the test. Getting to the
        # named class takes the hop.
        if top != "object: Array":
            print(f"SELF-TEST FAIL: top holder was '{top}', expected 'object: Array'")
            return 1
        arr_names = s.resolve({s.nname[src] for (src, _) in hits})
        promoted = {src for (src, _) in hits
                    if s.type_name(src) == "object"
                    and arr_names.get(s.nname[src]) == "Array"}
        up = s.incoming(promoted)
        strings2 = s.resolve({s.nname[src] for (src, _) in up} | {n for (_, n) in up if n >= 0})
        up_labels = {}
        for (src, ename), n in up.items():
            up_labels[s.label(src, strings2)] = up_labels.get(s.label(src, strings2), 0) + n
        if not any("HolderOfRefs" in k for k in up_labels):
            print(f"SELF-TEST FAIL: hop did not reach HolderOfRefs; saw {list(up_labels)[:5]}")
            return 1
        print(f"SELF-TEST PASS: {len(targets):,} WeakRefs, immediate holder is the array "
              f"backing store, one hop up names HolderOfRefs")
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot", nargs="?")
    ap.add_argument("--of", help='class to find holders of, e.g. "object:WeakRef"')
    ap.add_argument("--hop-through",
                    help='follow sources matching TYPE[:NAME] one more hop, e.g. "object:Array"')
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()

    if a.self_test:
        return self_test()
    if not a.snapshot or not a.of:
        ap.error("give SNAPSHOT --of TYPE[:NAME], or --self-test")

    s = Snapshot(a.snapshot)
    targets = s.select(a.of)
    if not targets:
        print(f"heap-retainers: no node matches {a.of!r}")
        return 1
    report(s, targets, s.incoming(targets), a.top, a.hop_through)
    return 0


if __name__ == "__main__":
    sys.exit(main())
