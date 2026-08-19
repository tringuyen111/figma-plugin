#!/usr/bin/env python3
"""Validate the stable ControlMux Design-to-Design packet/ledger invariants without third-party deps."""
import argparse, json, sys
from pathlib import Path

STRATEGIES = {"REUSE_REMOTE", "WRAP", "FORK", "MIGRATE", "SYNC"}
RELATIONSHIPS = {"FOLLOW", "WRAPPED", "NONE", "RECONCILED"}
ASSET_STATES = {"PLANNED", "IN_PROGRESS", "MATERIALIZED", "VERIFIED", "BLOCKED", "FAILED"}
LEDGER_STATES = {"PLANNED", "IN_PROGRESS", "PARTIAL", "VERIFIED", "BLOCKED", "FAILED"}

def require(obj, key, kind=None):
    if key not in obj:
        raise ValueError(f"missing required key: {key}")
    value = obj[key]
    if kind and not isinstance(value, kind):
        raise ValueError(f"{key} must be {kind.__name__}")
    return value

def validate_endpoint(obj, label, require_boundary=False):
    if not isinstance(obj, dict): raise ValueError(f"{label} must be object")
    require(obj, "instanceId", str)
    if "fileKey" not in obj or not (obj["fileKey"] is None or isinstance(obj["fileKey"], str)):
        raise ValueError(f"{label}.fileKey must be string|null")
    if require_boundary: require(obj, "evidenceBoundary", str)

def validate_packet(data):
    validate_endpoint(require(data, "source", dict), "source", True)
    validate_endpoint(require(data, "target", dict), "target", True)
    assets = require(data, "assets", list)
    require(data, "unresolved", list); require(data, "proofRequired", list)
    for i, asset in enumerate(assets):
        if not isinstance(asset, dict): raise ValueError(f"assets[{i}] must be object")
        require(asset, "sourceIdentity", str); require(asset, "semanticJob", str)
        if require(asset, "strategy", str) not in STRATEGIES: raise ValueError(f"assets[{i}].strategy invalid")
        if require(asset, "upstreamRelationship", str) not in RELATIONSHIPS: raise ValueError(f"assets[{i}].upstreamRelationship invalid")
        if require(asset, "status", str) not in ASSET_STATES: raise ValueError(f"assets[{i}].status invalid")

def validate_ledger(data):
    require(data, "runId", str)
    validate_endpoint(require(data, "source", dict), "source", True)
    validate_endpoint(require(data, "target", dict), "target", True)
    if require(data, "strategy", str) not in STRATEGIES: raise ValueError("strategy invalid")
    require(data, "mapping", list); require(data, "completedWrites", list); require(data, "pendingProof", list)
    if require(data, "status", str) not in LEDGER_STATES: raise ValueError("status invalid")
    for i, item in enumerate(data["completedWrites"]):
        if not isinstance(item, dict): raise ValueError(f"completedWrites[{i}] must be object")
        for key in ("id", "targetInstanceId", "targetIdentity", "postcondition"): require(item, key, str)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["packet", "ledger"])
    ap.add_argument("path")
    args = ap.parse_args()
    data = json.loads(Path(args.path).read_text(encoding="utf-8"))
    (validate_packet if args.kind == "packet" else validate_ledger)(data)
    print(f"OK {args.kind}: {args.path}")

if __name__ == "__main__":
    try: main()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr); sys.exit(1)
