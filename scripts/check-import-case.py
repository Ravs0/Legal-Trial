#!/usr/bin/env python3
"""Audit relative (and @-aliased) JS/TS imports for filename case mismatches.

macOS's case-insensitive filesystem hides wrong-case imports that fail on
Vercel's Linux builders. This script resolves every relative import in
components/, screens/, services/, hooks/, utils/, api/ (plus repo-root entry
files) and verifies each path segment against the EXACT on-disk name via
os.listdir (never os.path.exists, which lies on case-insensitive FS).

Usage:
    python3 scripts/check-import-case.py [--fix]

--fix rewrites only the path specifier segment(s) to the on-disk case.
Exit code: 0 if clean, 1 if mismatches/unresolved found.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN_DIRS = ["components", "screens", "services", "hooks", "utils", "api"]
SRC_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")
TRY_EXTS = [".tsx", ".ts", ".mts", ".cts", ".jsx", ".js", ".mjs", ".cjs",
            ".json", ".css"]
# import x from 'p' | import 'p' | export x from 'p' | import('p') | require('p')
SPEC_RE = re.compile(
    r"""(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+|import\s*\(\s*|require\s*\(\s*)"""  # noqa: E501
    r"""['"]([^'"]+)['"]""",
)


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    out = []
    for line in src.splitlines():
        i = 0
        in_s = in_d = in_t = False
        buf = []
        while i < len(line):
            c = line[i]
            nxt = line[i + 1] if i + 1 < len(line) else ""
            if c == "\\" and (in_s or in_d):
                buf += [c, nxt]
                i += 2
                continue
            if c == "'" and not in_d and not in_t:
                in_s = not in_s
            elif c == '"' and not in_s and not in_t:
                in_d = not in_d
            elif c == "`" and not in_s and not in_d:
                in_t = not in_t
            elif c == "/" and nxt == "/" and not (in_s or in_d or in_t):
                break
            buf.append(c)
            i += 1
        out.append("".join(buf))
    return "\n".join(out)


def listdir_exact(d):
    import time
    for attempt in range(4):
        try:
            return os.listdir(d)
        except (NotADirectoryError, FileNotFoundError, PermissionError):
            return []
        except (OSError, InterruptedError):
            time.sleep(0.05 * (attempt + 1))
    try:
        return os.listdir(d)
    except OSError:
        return []


def match_case_insensitive(entries, seg):
    for e in entries:
        if e.lower() == seg.lower():
            return e
    return None


def resolve_case(base_dir, parts):
    """Walk parts from base_dir. Returns (status, detail).

    status: 'ok' | 'mismatch' | 'missing'
    mismatch detail: (expected_rel, actual_rel); missing detail: bad segment rel.
    """
    cur = base_dir
    fixed = []
    mismatch_at = None
    for seg in parts:
        if seg in ("", "."):
            continue
        if seg == "..":
            cur = os.path.dirname(cur)
            fixed.append("..")
            continue
        entries = listdir_exact(cur)
        if seg in entries:
            fixed.append(seg)
            cur = os.path.join(cur, seg)
        else:
            hit = match_case_insensitive(entries, seg)
            if hit is not None:
                if mismatch_at is None:
                    mismatch_at = (seg, hit)
                fixed.append(hit)
                cur = os.path.join(cur, hit)
            else:
                return ("missing", os.path.join(*fixed, seg) if fixed else seg)
    if mismatch_at:
        return ("mismatch", mismatch_at)
    return ("ok", None)


def check_spec(importer, spec_line, spec):
    """Return list of issue dicts for one import specifier."""
    issues = []
    s = spec.split("?")[0].split("#")[0].strip()
    if not s or not (s.startswith(".") or s.startswith("@/")):
        return issues  # bare package or absolute URL: out of scope
    if s.startswith("@/"):
        base = ROOT
        rel = s[2:]
    else:
        base = os.path.dirname(importer)
        rel = os.path.normpath(os.path.join(os.path.relpath(base, ROOT), s)) \
            if False else None  # resolved below
        _ = rel
        target = os.path.normpath(os.path.join(base, s))
        try:
            rel = os.path.relpath(target, ROOT)
        except ValueError:
            return issues
        if rel.startswith(".."):
            return issues  # escapes repo; out of scope
        base = ROOT
    # never flag paths inside ignored trees
    if rel.split(os.sep)[0] in ("node_modules", "dist", ".git", ".vercel"):
        return issues
    parts = [p for p in rel.split(os.sep) if p not in ("", ".")]

    def report(kind, expected, actual, note=""):
        issues.append({
            "file": os.path.relpath(importer, ROOT),
            "line": spec_line,
            "spec": spec,
            "kind": kind,  # 'case' or 'missing'
            "expected": expected,
            "actual": actual,
            "note": note,
        })

    # 1) direct file match (spec already has an extension or exact name)
    st, det = resolve_case(ROOT, parts)
    if st == "ok":
        # extensionless file/dir that resolved to an exact dir or file: fine
        # but extensionless import of a FILE needs an index/file probe below
        # only if the resolved path is a directory or non-file.
        full = os.path.join(ROOT, *parts)
        if os.path.isfile(full):
            return issues
        # dir import -> need index file (case of dir itself already verified)
        if os.path.isdir(full):
            for ext in TRY_EXTS:
                cand = os.path.join(full, "index" + ext)
                if os.path.isfile(cand):
                    return issues
            report("missing", spec, spec,
                   f"directory '{rel}' has no index file")
            return issues
        # exact path exists as neither? fall through to extension probes
    elif st == "mismatch":
        exp_seg, act_seg = det
        fixed_spec = spec.replace(exp_seg, act_seg, 1)
        report("case", spec, fixed_spec,
               f"segment '{exp_seg}' on disk is '{act_seg}'")
        # continue with corrected parts for extension probing
        parts = [act_seg if p == exp_seg else p for p in parts]
        full = os.path.join(ROOT, *parts)
        if os.path.isfile(full):
            return issues
    else:  # missing segment
        # maybe extensionless file: probe extensions on the parent
        parent_parts, last = parts[:-1], parts[-1]
        pst, _ = resolve_case(ROOT, parent_parts)
        if pst == "ok":
            parent = os.path.join(ROOT, *parent_parts) if parent_parts else ROOT
            entries = listdir_exact(parent)
            for ext in TRY_EXTS:
                if last + ext in entries:
                    return issues
            # case-insensitive file probe
            for ext in TRY_EXTS:
                hit = match_case_insensitive(entries, last + ext)
                if hit:
                    report("case", spec,
                           spec.replace(last, hit[:-len(ext)], 1),
                           f"file on disk is '{hit}'")
                    return issues
            # directory probe (case-insensitive)
            hit = match_case_insensitive(entries, last)
            if hit and os.path.isdir(os.path.join(parent, hit)):
                report("case", spec, spec.replace(last, hit, 1),
                       f"directory on disk is '{hit}'")
                return issues
        report("missing", spec, spec,
               f"no file/dir matches '{rel}' (tried {TRY_EXTS} + /index)")
        return issues

    # reached only when st was ok/mismatch but full is not a file:
    # extensionless file probe with exact parent
    parent = os.path.dirname(os.path.join(ROOT, *parts))
    last = parts[-1]
    entries = listdir_exact(parent)
    for ext in TRY_EXTS:
        if last + ext in entries:
            return issues
    for ext in TRY_EXTS:
        hit = match_case_insensitive(entries, last + ext)
        if hit:
            report("case", spec, spec.replace(last, hit[:-len(ext)], 1),
                   f"file on disk is '{hit}'")
            return issues
    report("missing", spec, spec,
           f"no file/dir matches '{rel}' (tried {TRY_EXTS} + /index)")
    return issues


def collect_files():
    files = []
    for d in SCAN_DIRS:
        top = os.path.join(ROOT, d)
        if not os.path.isdir(top):
            print(f"WARN: missing dir {d}/", file=sys.stderr)
            continue
        for dp, _, fns in os.walk(top):
            if any(x in dp.split(os.sep)
                   for x in ("node_modules", "__pycache__", "dist")):
                continue
            for fn in fns:
                if fn.endswith(SRC_EXTS):
                    files.append(os.path.join(dp, fn))
    # repo-root entry files (App.tsx, index.tsx, ...) import into these dirs
    for fn in sorted(os.listdir(ROOT)):
        if fn.endswith(SRC_EXTS) and os.path.isfile(os.path.join(ROOT, fn)):
            files.append(os.path.join(ROOT, fn))
    return sorted(files)


def main():
    fix = "--fix" in sys.argv
    files = collect_files()
    case_issues, missing = [], []
    n_imports = 0
    for f in files:
        with open(f, encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        code = strip_comments(raw)
        for m in SPEC_RE.finditer(code):
            spec = m.group(1)
            line = code.count("\n", 0, m.start()) + 1
            n_imports += 1
            for iss in check_spec(f, line, spec):
                (case_issues if iss["kind"] == "case" else missing).append(iss)

    print(f"Scanned {len(files)} files, {n_imports} import specifiers "
          f"({', '.join(SCAN_DIRS)} + repo-root entries).")
    if case_issues:
        print(f"\nCASE MISMATCHES ({len(case_issues)}):")
        for i in case_issues:
            print(f"  {i['file']}:{i['line']}: '{i['spec']}' -> "
                  f"'{i['actual']}'  [{i['note']}]")
    else:
        print("\nCASE MISMATCHES (0) — all relative imports match disk case.")
    if missing:
        print(f"\nUNRESOLVED ({len(missing)}):")
        for i in missing:
            print(f"  {i['file']}:{i['line']}: '{i['spec']}'  [{i['note']}]")

    if fix and case_issues:
        by_file = {}
        for i in case_issues:
            by_file.setdefault(i["file"], []).append(i)
        for rel, iss_list in by_file.items():
            p = os.path.join(ROOT, rel)
            with open(p, encoding="utf-8") as fh:
                content = fh.read()
            for i in iss_list:
                # replace only the quoted specifier occurrence
                content = content.replace(f"'{i['spec']}'",
                                          f"'{i['actual']}'")
                content = content.replace(f'"{i["spec"]}"',
                                          f'"{i["actual"]}"')
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"FIXED {rel}: {len(iss_list)} specifier(s)")
    elif case_issues:
        print("\nRe-run with --fix to auto-correct specifiers to on-disk case.")

    return 1 if (case_issues or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
