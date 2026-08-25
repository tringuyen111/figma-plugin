# Observable Trajectory Evidence

This contract records **what an execution actually did** without making the compact review surface carry full tool payloads.

## Surfaces

- `*.trajectory.jsonl` — bounded review evidence. Each entry carries run/sequence/step identity, observed state, tool/action classification, elapsed time when known, request/response UTF-8 JSON byte counts, stable hashes, bounded affected identities, and a compact result summary.
- `*.raw.jsonl` — inspectable sanitized request/response sidecar. Binary buffers, `bytes`, `base64`, and base64 data URLs are redacted; metadata and references remain. Entries link to compact evidence by `runId`, `sequence`, and payload hashes.
- `*.summary.json` — recipe-owned outcome plus `trajectory`, which aggregates observed tool counts, query/apply/exec/export/status calls, raw `figma_exec` escapes, explicit retry/requery tags, request/response bytes, and provenance.

`requestBytes`/`responseBytes` measure serialized JSON payload bytes at the recipe/client boundary. They are **not billed-token measurements**. Payload hashes cover sanitized evidence content so binary redaction cannot be mistaken for an exact binary hash.

## Provenance

Recorder provenance keeps candidate, runner, model, and runtime identity separate. Unknown or unexecuted dimensions stay explicit, for example `model.state = NOT_RUN` and `runtime.state = NOT_RUN`.

A general dogfood run may omit a candidate hash or expected bundle revision. Such a run can still produce process evidence, but it **does not qualify an exact candidate**.

For a current-candidate qualification run:

1. bind the exact candidate archive SHA-256;
2. pass `--candidate-sha256 <sha256>` to the live recipe;
3. pin the exact companion bundle with `--bundle-revision <revision>`; every qualification recipe must require that revision explicitly, while non-qualification dogfood must keep its weaker scope visible;
4. require the observed runtime status to match the pinned bundle/protocol/instance before relying on provider evidence;
5. record model identity only when a model actually executed the frozen case.

Historical evidence keeps its historical runtime/candidate identity. Never rebind an old JSONL/summary to newer source bytes.

## Evidence strength

The recorder can prove only the process facts it actually observed. Deterministic recorder tests or native Skill/package validation do not prove design quality or Skill uplift. Candidate-vs-baseline behavioral claims remain `NOT_RUN` until the same frozen cases execute under declared comparable candidate/baseline conditions with inspectable trajectory evidence.

Retries and requeries are counted only when callers explicitly tag `retry: true` or `requery: true`; the recorder does not infer hidden intent from repeated calls.
