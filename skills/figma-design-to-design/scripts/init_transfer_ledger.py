#!/usr/bin/env python3
"""Create a deterministic empty ControlMux Design-to-Design Transfer Ledger."""
import argparse
import json
from pathlib import Path

STRATEGIES = ("REUSE_REMOTE", "WRAP", "FORK", "MIGRATE", "SYNC")


def endpoint(instance_id: str, file_key: str | None, evidence_boundary: str) -> dict:
    return {
        "instanceId": instance_id,
        "fileKey": file_key if file_key else None,
        "evidenceBoundary": evidence_boundary,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--source-instance", required=True)
    ap.add_argument("--source-file-key")
    ap.add_argument("--source-evidence", required=True)
    ap.add_argument("--target-instance", required=True)
    ap.add_argument("--target-file-key")
    ap.add_argument("--target-evidence", required=True)
    ap.add_argument("--strategy", required=True, choices=STRATEGIES)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    ledger = {
        "runId": args.run_id,
        "source": endpoint(args.source_instance, args.source_file_key, args.source_evidence),
        "target": endpoint(args.target_instance, args.target_file_key, args.target_evidence),
        "strategy": args.strategy,
        "mapping": [],
        "completedWrites": [],
        "pendingProof": [],
        "status": "PLANNED",
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK ledger initialized: {out}")


if __name__ == "__main__":
    main()
