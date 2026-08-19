#!/usr/bin/env python3
"""Validate the stable ControlMux Design-to-Code HANDOFF packet invariants."""
import json, sys
from pathlib import Path

STRATEGIES = {"REUSE", "ADAPT", "CREATE"}

def req(obj, key, typ=None):
    if key not in obj: raise ValueError(f"missing required key: {key}")
    value=obj[key]
    if typ and not isinstance(value, typ): raise ValueError(f"{key} must be {typ.__name__}")
    return value

def main():
    if len(sys.argv) != 2: raise ValueError("usage: validate_translation_packet.py packet.json")
    data=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if req(data,"mode",str)!="HANDOFF": raise ValueError("mode must be HANDOFF")
    src=req(data,"source",dict); req(src,"nodeId",str); req(src,"evidenceBoundary",str)
    if "fileKey" not in src or not (src["fileKey"] is None or isinstance(src["fileKey"],str)): raise ValueError("source.fileKey must be string|null")
    tgt=req(data,"target",dict); req(tgt,"platform",str)
    mappings=req(data,"mappings",list)
    for i,m in enumerate(mappings):
        if not isinstance(m,dict): raise ValueError(f"mappings[{i}] must be object")
        req(m,"figmaIdentity",str); req(m,"semanticRole",str)
        if req(m,"strategy",str) not in STRATEGIES: raise ValueError(f"mappings[{i}].strategy invalid")
    for key in ("tokens","assets","interactions","motion","unresolved","proofRequired"): req(data,key,list)
    print(f"OK translation packet: {sys.argv[1]}")

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print(f"FAIL: {exc}",file=sys.stderr); sys.exit(1)
