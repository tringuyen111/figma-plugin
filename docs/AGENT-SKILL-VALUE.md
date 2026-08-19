# Agent / Skill value and I/O performance — Figma Plugin 0.5.6

## Governing rule

Figma Plugin does **not** optimize a Skill by weakening its methodology to save tokens.

Use a lexicographic quality order:

```text
1. capability / decision quality
2. proof correctness
3. I/O fitness and runtime performance
```

I/O improvements are accepted only when capability quality and proof do not regress. `SKILL.md`/reference size is diagnostic, not a score to minimize.

## What counts as Skill value

A Skill must create behavioral advantage through at least one of:

- a non-obvious mental model or representation;
- a decision mechanism that chooses differently from generic tool use;
- failure discrimination and causal re-entry;
- reusable system/authority/propagation reasoning;
- domain-specific completion/proof semantics;
- deterministic support for fragile/repetitive evidence gathering.

Knowing more Plugin API names is not sufficient value when the provider already exposes those mechanics.

## What counts as I/O fitness

Optimize the evidence/tool boundary around the Skill:

```text
user/source truth
-> Skill decision frontier
-> smallest sufficient evidence request
-> provider/local execution
-> bounded result projection
-> decision / mutation / verdict
-> minimum sufficient proof
-> compact handoff packet
```

Measure:

- evidence input and result output tokens when the host exposes them;
- tool/provider/local execution call counts;
- retries and escalation count;
- bridge request/response bytes;
- queue, execution, and total latency.

Activated Skill/reference context tokens may be recorded diagnostically but are not a reason to remove decision-critical methodology.

## Evidence acquisition rule

Choose evidence by claim:

| Need | Prefer |
|---|---|
| runtime/target ambiguity | `figma_status` / local runtime evidence |
| sparse structure/orientation | metadata or compact native projection |
| design-system/library reuse | structured library/design-system/variable evidence |
| design-to-code exact node | design context for the bounded node |
| component API | structured component context or compact property/anatomy projection |
| visual craft | screenshot/render at relevant scale/state |
| prototype | reachable reaction/state-path evidence |
| Motion | animated-node/timeline evidence; temporal render only when required |
| custom/native property gap | bounded `figma_exec` projection |

Do not use a cheaper evidence type when it cannot prove the claim, and do not use a richer type when it cannot change the decision.

## Local execution attribution

`figma_exec` and `figma_export` accept optional measurement/intent metadata:

```text
capability  canonical primary Figma Plugin Skill id
traceId     stable logical-operation id
attempt     1-based retry attempt; normal sequential steps remain attempt=1
operation   label + kind + phase + target + expected postconditions
```

`operation` requires `traceId`; retries retain the trace and increment `attempt`. These fields do not change Figma execution. They let local telemetry distinguish capability-attributed traffic, retries, and logical outcomes. Runtime metrics separate queue, execution, total latency and request/response bytes. Declared postconditions remain expectations until matching evidence is actually collected. This is execution evidence, not proof that the Skill improved behavior.

## Evaluation

`evals/skill-value.json` freezes same-task comparisons:

1. base agent with the same tools;
2. current official Figma guidance with the same tools;
3. ControlMux Skill with the same tools;
4. ControlMux Skill with the intended hybrid provider/local posture.

A ControlMux Skill earns continued complexity when it improves decisions/artifacts/recovery/proof, or preserves those outcomes while materially improving I/O. No aggregate weighted score may allow lower capability quality to be offset by fewer tokens or calls.

## Progressive execution and representation

Multi-skill authoring now has a separate mechanism contract in `skills/figma-design-authoring/references/progressive-workflow.md`: work is packetized by observable outcome/proof, only decision-critical specialist depth is activated, and a rolling note is written before more context is loaded. The deterministic work-plan validator constrains active deep resources to at most two; this is a context-horizon guard, not a token-based quality score.

Representation is selected by reasoning shape. Sequence/branch/state/ownership/comparison/progress/reuse/layout use a flow, tree, state diagram, typed graph, table, bar, component specimen, or wireframe when that exposes the relation better than prose; one local fact stays text. `evals/agent-execution.json` freezes overload, planning, representation, provider recovery, and reuse cases. Its mechanism tests may pass while behavioral Skill comparison remains `NOT_RUN`.

## Craft examples are capability depth, not token decoration

0.5.4 adds detailed Golden Teaching Cases to the five craft-core Design Skills. These references are intentionally allowed to be long because they encode decision-space exploration and correction, not generic prose. They are progressive-loaded only when a craft ambiguity/near-miss makes them useful.

A teaching case must model the path from product truth through a mediocre/default attempt, expert observation, alternatives, exact Figma construction, render critique, correction, and an anti-copy boundary. Literal specimen values do not become reusable truth. Example quality is guarded by `evals/craft-exemplars.json` and project render evidence under `design/exemplars/`.

Rendered self-review is evidence about the exemplar, not proof that the Skill improves agent behavior. Behavioral uplift remains frozen until same-task executions are run.

## Deterministic evidence recipes

Where repeated Plugin API inspection is predictable, keep compact projections close to the Skill rather than asking the model to rebuild verbose traversal every run. 0.5.3 adds bounded recipes for components, tokens, prototypes, design-system inventories, and verification evidence. They are evidence collectors, not replacement decision logic.

## Motion-to-code disposition

0.5.3 keeps Motion implementation as a conditional deep reference under `figma-design-to-code`. This is the smaller artifact while the accountable outcome remains production implementation of a Figma design. `figma-motion-to-code` remains unqualified as a first-class Skill until representative behavioral evidence proves independent value.


## 0.5.5 lifecycle I/O

Design→Design optimizes around identity/library evidence instead of copying node trees. Design→Code returns changed production bytes or a bounded handoff packet. `figma_export` moves binary cost out of model context by persisting typed artifacts locally; this is I/O fitness and must not reduce design/translation capability depth.


## 0.5.6 lifecycle reliability I/O

0.5.6 tiếp tục nguyên tắc capability-first: không giảm Skill depth để tiết kiệm token. Reliability được tối ưu ở execution edge. Durable export bytes kết thúc ở leader persistence; follower chỉ nhận artifact descriptor nhỏ, nên RPC cost không còn tăng theo artifact size. Plugin→leader hiện vẫn dùng **một bounded binary WebSocket frame**; chunked streaming chưa được implement và không được overclaim.

Design→Design/Design→Code dùng schema + deterministic validator cho packet/ledger để output có machine-checkable shape mà không làm methodology nông đi. Schema validity chỉ chứng minh cấu trúc, không chứng minh semantic correctness hay behavioral uplift.
