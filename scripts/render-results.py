#!/usr/bin/env python3
"""Puts the measured numbers into README.md from the files the tools wrote, so every number in the README
comes from a run that can be repeated:

  .lighthouseci/manifest.json and its LHR files  (npm run lhci)   -> load/results/lighthouse-latest.json + table
  load/results/latest.json                        (make load)      -> table

    python scripts/render-results.py            # print the Markdown
    python scripts/render-results.py --write    # replace the blocks between the markers in README.md
"""

import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LH_START, LH_END = "<!-- LIGHTHOUSE -->", "<!-- /LIGHTHOUSE -->"
K6_START, K6_END = "<!-- K6 -->", "<!-- /K6 -->"


def lighthouse() -> tuple[str, dict]:
    manifest_path = ROOT / ".lighthouseci" / "manifest.json"
    if not manifest_path.exists():
        return "(no Lighthouse run yet: `npm run lhci`)\n", {}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    by_url: dict[str, list[dict]] = {}
    for entry in manifest:
        lhr = json.loads(pathlib.Path(entry["jsonPath"]).read_text(encoding="utf-8"))
        by_url.setdefault(entry["url"], []).append(
            {
                "performance": lhr["categories"]["performance"]["score"],
                "accessibility": lhr["categories"]["accessibility"]["score"],
                "best_practices": lhr["categories"]["best-practices"]["score"],
                "seo": lhr["categories"]["seo"]["score"],
                "lcp_ms": lhr["audits"]["largest-contentful-paint"]["numericValue"],
                "fcp_ms": lhr["audits"]["first-contentful-paint"]["numericValue"],
                "tbt_ms": lhr["audits"]["total-blocking-time"]["numericValue"],
                "cls": lhr["audits"]["cumulative-layout-shift"]["numericValue"],
                "form_factor": lhr["configSettings"]["formFactor"],
                "lighthouse_version": lhr["lighthouseVersion"],
            }
        )
    rows = ["| Page | Performance | Accessibility | Best practices | SEO | LCP (median) | TBT (median) | CLS |", "|---|---|---|---|---|---|---|---|"]
    summary = {"form_factor": None, "lighthouse_version": None, "runs_per_page": 0, "pages": []}
    for url, runs in by_url.items():
        path = url.split("//", 1)[1].split("/", 1)[1] if "//" in url else url
        med = lambda k: statistics.median(r[k] for r in runs)  # noqa: E731
        page = {
            "page": "/" + path,
            "runs": len(runs),
            "performance": med("performance"),
            "accessibility": med("accessibility"),
            "best_practices": med("best_practices"),
            "seo": med("seo"),
            "lcp_ms": med("lcp_ms"),
            "fcp_ms": med("fcp_ms"),
            "tbt_ms": med("tbt_ms"),
            "cls": med("cls"),
        }
        summary["pages"].append(page)
        summary["form_factor"] = runs[0]["form_factor"]
        summary["lighthouse_version"] = runs[0]["lighthouse_version"]
        summary["runs_per_page"] = len(runs)
        rows.append(
            f"| `{page['page']}` | {page['performance'] * 100:.0f} | {page['accessibility'] * 100:.0f} | {page['best_practices'] * 100:.0f} | "
            f"{page['seo'] * 100:.0f} | {page['lcp_ms'] / 1000:.1f} s | {page['tbt_ms']:.0f} ms | {page['cls']:.2f} |"
        )
    note = (
        f"\nLighthouse {summary['lighthouse_version']}, {summary['form_factor']} form factor with Lighthouse's default throttling, "
        f"{summary['runs_per_page']} runs per page, median shown; scores are out of 100. Collected by `npm run lhci` against "
        "`npm run start` on one machine; the raw reports are in `.lighthouseci/`, the summary in `load/results/lighthouse-latest.json`.\n"
    )
    (ROOT / "load" / "results").mkdir(parents=True, exist_ok=True)
    (ROOT / "load" / "results" / "lighthouse-latest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return "\n".join(rows) + "\n" + note, summary


def k6() -> str:
    path = ROOT / "load" / "results" / "latest.json"
    if not path.exists():
        return "(no k6 run yet: `make load`)\n"
    run = json.loads(path.read_text(encoding="utf-8"))
    rows = ["| Page | p50 | p95 | p99 |", "|---|---|---|---|"]
    for p in run["pages"]:
        rows.append(f"| `{p['page']}` | {p['p50_ms']:.0f} ms | {p['p95_ms']:.0f} ms | {p['p99_ms']:.0f} ms |")
    note = (
        f"\n{run['requests']:,} requests, {run['failed_rate'] * 100:.2f}% failed, overall p95 {run['overall_ms']['p95']:.0f} ms, "
        f"{run['vus']} virtual users for {run['duration']}, run {run['run_utc']} UTC. {run['method']}.\n"
    )
    return "\n".join(rows) + "\n" + note


def replace(text: str, start: str, end: str, body: str) -> str:
    a, b = text.index(start) + len(start), text.index(end)
    return text[:a] + "\n" + body + text[b:]


def main() -> None:
    lh_md, _ = lighthouse()
    k6_md = k6()
    if "--write" in sys.argv:
        readme = ROOT / "README.md"
        text = readme.read_text(encoding="utf-8")
        text = replace(text, LH_START, LH_END, lh_md)
        text = replace(text, K6_START, K6_END, k6_md)
        readme.write_text(text, encoding="utf-8", newline="\n")
        print("wrote README.md")
    else:
        print(lh_md)
        print(k6_md)


if __name__ == "__main__":
    main()
