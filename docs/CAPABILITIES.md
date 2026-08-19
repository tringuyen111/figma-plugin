# Kiến trúc capability — Figma Plugin 0.5.6

Figma Plugin tách **Design cognition**, **verification**, **provider evidence** và **runtime kernel** thành các lớp khác nhau.

```text
Product / Design / Code truth
          ↓
Figma capability Skills
          ↓
provider-aware execution / evidence selection
          ↓
figma-native execution contract
          ↓
figma_status + figma_query + figma_apply + figma_exec + figma_export
          ↓
local MCP/runtime bridge
          ↓
Figma Plugin API
```

Ba MCP primitive local vẫn cố ý nhỏ:

- `figma_status`: connection/target/routing/runtime health.
- `figma_exec`: primitive thực thi native Figma Plugin API.
- `figma_export`: typed artifact egress; lưu bytes local và trả metadata/path thay vì đưa binary lớn vào model context.

Không tạo một catalog local kiểu `create_frame`, `set_color`, `make_component`, `check_contrast`. Semantic job nằm trong Skill; structured provider tool được delegate khi nó cung cấp evidence/output mạnh hơn generic execution.

## Canonical Skill topology — 16 Skills

| Skill | Accountable outcome | Deep editor scope |
|---|---|---|
| `figma-native` | setup/connection, target routing, Plugin API execution, compact postcondition evidence | Figma Design, FigJam, Slides |
| `figma-scene` | scene structure, plane/depth, clipping, surface/silhouette ownership | Figma Design |
| `figma-layout` | Auto Layout/Grid/constraints/sizing/responsive geometry | Figma Design |
| `figma-tokens` | Variables, collections, modes, aliases, scopes, code syntax, token reuse | Figma Design |
| `figma-typography` | font/Text Style/text role/typography geometry | Figma Design |
| `figma-visual-system` | color/material/shape/effect/depth composition | Figma Design |
| `figma-components` | component API, variants, properties, Slots, instances, reuse | Figma Design |
| `figma-prototype` | reaction/trigger/action/condition/navigation/overlay/interactive state paths | Figma Design |
| `figma-motion` | Motion timeline/keyframes/timing/easing/animation styles/animated components | Figma Design |
| `figma-design-system` | foundations, libraries, naming, publishing, propagation, cross-system coherence | Figma Design |
| `figma-design-authoring` | approved Product Design truth -> coherent Figma view | Figma Design |
| `figma-verification` | fixed-artifact audit/lint/acceptance verdict with bounded evidence | Figma Design |
| `figma-code-connect` | deterministic Figma component <-> code component mapping | Figma Design |
| `figma-code-to-design` | production system/code semantics -> native reusable Figma truth | Figma Design |
| `figma-design-to-design` | Figma -> Figma reuse/wrap/fork/migrate/sync với identity/update-path rõ ràng | Figma Design |
| `figma-design-to-code` | Figma design -> implementation in the real codebase | Figma Design |

`plugin/manifest.json` có thể chạy low-level runtime trong FigJam/Slides, nhưng điều đó **không có nghĩa** mọi domain Skill phía trên có deep methodology cho hai editor đó. `src/capabilities/skill-registry.ts` ghi rõ deep editor scope để package không overclaim.

## Topology migration 0.5.2

Hai proposal 0.5.1 đã được user approve và materialize:

```text
figma-motion (Prototype + Motion)
          ↓ split
figma-prototype        figma-motion
interaction graph      temporal choreography

verification logic rải rác
          ↓ promote independent terminal job
figma-verification
```

### Tại sao Prototype tách khỏi Motion

Prototype hỏi:

```text
source state
-> trigger/input
-> condition/variable
-> action
-> destination/state change
-> context/focus/recovery
```

Motion hỏi:

```text
rest/source state
-> animated property/subject
-> keyframe phases
-> timing/easing
-> timeline coordination
-> settle/final state
```

Hai capability có trigger, mechanism, failure mode và proof khác nhau. Một interaction có thể compose cả hai nhưng không có nghĩa chúng có cùng source of truth.

### Tại sao Verification là Skill riêng

Authoring kết thúc ở **changed artifact + proof**. Verification kết thúc ở **fixed artifact + evidence-backed verdict** và mặc định read-only. Nó không redesign trong acceptance.

## Capability value trước, I/O performance sau

0.5.3 đã tách hai câu hỏi không được đánh đổi cho nhau; 0.5.4 giữ nguyên:

```text
CAPABILITY VALUE
mental model -> decision mechanism -> trade-off -> failure -> correction -> proof

SKILL I/O FITNESS
minimum evidence -> deliberate escalation -> compact result packet -> bounded execution/proof
```

Không đặt token budget lên methodology. Một Skill chỉ được rút gọn khi nội dung không tạo behavioral delta hoặc là duplicate truth. I/O efficiency chỉ được tối ưu **sau khi** capability quality và proof correctness không giảm. Ít token/call hơn không thể bù cho quyết định, artifact, recovery hoặc verdict kém hơn.

Mỗi Skill vì vậy có hai section local:

- `Decision advantage`: điều agent làm tốt hơn nhờ Skill, đặc biệt ở near-miss và trade-off không thể giải bằng API knowledge đơn thuần.
- `Skill I/O contract`: evidence tối thiểu, điều kiện escalation, output packet và giới hạn proof phù hợp với chính accountable outcome đó.

`evals/skill-value.json` đóng băng thứ tự đánh giá `capability-quality -> proof-correctness -> io-fitness`; context size của Skill chỉ là diagnostic metric, không phải quality target.

## Evidence vector

Không còn một cờ `PASS/FAIL` chung cho mọi claim. Skill/eval dùng các dimension:

```text
runtime
structure
system-reuse
visual
interaction
temporal
accessibility
translation-parity
```

Evidence state giữ nguyên nghĩa:

```text
PASS | FAIL | NOT_RUN | INCONCLUSIVE | MISSING | BLOCKED
```

Ví dụ:

```text
structure: PASS
system-reuse: FAIL
visual: PASS
accessibility: NOT_RUN
```

Không được chuyển thành “PASS overall”. `figma-verification` chỉ verdict những dimension request thực sự yêu cầu và đã có evidence đủ loại.

## System Plane / capability-engineering invariants

Mỗi Skill phải xác định:

```text
trigger/input
-> owner/source of truth
-> decision mechanism
-> reusable unit
-> allowed variation
-> side effect/authority
-> propagation scope
-> evidence dimensions
-> completion proof
```

Không tách Skill chỉ vì Figma có noun/API/tool. Provider interface là một lớp khác với domain capability.

## Reuse contract

Reuse không đồng nghĩa Component:

```text
value             -> Variable / alias / mode
composite visual  -> Text/Paint/Effect Style
structure         -> Component / nested component
variation         -> property / variant / Slot / Instance Swap
layout relation   -> component anatomy + layout/token contract
interaction       -> reusable interactive component/state path when semantic job matches
motion            -> Timing/Easing role, animation style, animated component
brand/theme       -> semantic roles + modes/Extended Collection when supported
code bridge       -> code syntax + Code Connect
```

Trước khi tạo mới, xác định:

```text
IDENTITY
OWNER/SOURCE
NAME
REUSE UNIT
VARIATION
CONSUMERS
OVERRIDE RULE
PROPAGATION
DEPRECATION/MIGRATION
PROOF
```

Naming là API cho designer, agent, library search và code bridge; không đặt theo raw value hoặc thứ tự tool sinh ra.

## Product Design được compile xuống Figma

`figma-design-authoring` giữ đồng thời:

```text
SEMANTIC
LAYOUT
COMPONENT
STYLE / TYPE
PLANE / INPUT
STATE / TIME
```

Sau đó chọn representation theo responsibility. Ví dụ:

- bounds + child flow + clipping -> Frame/Auto Layout;
- reusable semantic job -> Component;
- flexible semantic region -> Slot;
- shared semantic value -> Variable;
- transient plane -> owned frame + overlay relation;
- interaction path -> `figma-prototype`;
- keyframe/timing choreography -> `figma-motion`.

### 2.5D / depth

Semantic containment không đồng nghĩa plane. Surface, stroke, clipping, overlap, shadow, scrim, blur, opacity, radius và motion chỉ dùng khi biểu diễn focus/persistence/occlusion/material relation thật.

### Color

Tách `SYSTEM COLOR` khỏi `PERCEPTUAL COLOR`. Token đúng chưa chứng minh composition tốt; inspect hue, temperature, lightness, chroma, occupied area, repetition và backdrop.

### Typography

Text role -> Text Style/variables -> font metrics -> component slot -> layout pressure. Font là geometry, không chỉ brand decoration.

## Craft depth + Golden Teaching Cases — 0.5.4

0.5.4 không thêm Skill mới. Nó nâng **positive craft guidance** cho 5 capability tác động mạnh nhất tới chất lượng UI: `figma-design-authoring`, `figma-layout`, `figma-scene`, `figma-visual-system`, `figma-typography`.

Mỗi Skill giữ `references/golden-teaching-cases.md` local và chỉ load khi craft calibration/ambiguity cần. Một case tốt phải dạy:

```text
product truth
-> mediocre/default attempt
-> expert observation
-> decision variables
-> plausible alternatives
-> selection rationale
-> exact Figma construction
-> render critique
-> causal correction
-> anti-copy transfer
```

Không có example còn tốt hơn một example trung bình có thể khiến agent cargo-cult sai pattern. Literal pixels/colors/type metrics là specimen evidence, không phải reusable design truth. `evals/craft-exemplars.json` giữ qualification truth riêng: rendered self-review có thể PASS trong khi independent expert review và behavioral Skill A/B vẫn `NOT_RUN`.

`figma-design-authoring` dùng quality ladder `VALID -> COHERENT -> CRAFTED -> PRODUCT-FIT`; yêu cầu polished/high-quality không được tự dừng ở `VALID` nếu vẫn có đủ product/render evidence để refine.

Xem `docs/CRAFT-EXEMPLARS.md`.

## Provider Evidence Registry

`src/capabilities/provider-evidence.ts` lưu **observed provider snapshot**, không phải ontology và không phải runtime guarantee.

Authority khi provider capability ảnh hưởng execution:

```text
live connected provider schema/runtime
        >
current official docs
        >
installed provider Skill guidance
        >
packaged snapshot / memory
```

Snapshot 2026-08-19 ghi nhận các surface có giá trị như `use_figma`, design context/metadata/screenshot, variable/library/design-system discovery, Motion context/video proof, capture và structured Code Connect operations. Provider có thể thay đổi sau khi package được phát hành; `runtimeRevalidationRequired` luôn true.

ControlMux posture:

- **kernel**: local `figma_status` + typed `figma_query`/`figma_apply` + raw `figma_exec` + `figma_export` và target/routing/egress semantics mà ControlMux sở hữu;
- **delegate**: structured official provider surface có semantic evidence/output mạnh hơn local reimplementation;
- **supplement**: provider general executor có thể hỗ trợ host khác nhưng không thay local ControlMux runtime ownership.

`doctor` chỉ báo snapshot như một warning/information check; nó không thể chứng minh host hiện tại có tool đó.

## Figma provider evidence dùng để thiết kế topology

Các provider facts cần reverify khi có thay đổi:

- MCP semantic surfaces + general-purpose executor;
- Component properties gồm Boolean, Instance Swap, Text, Variant, Slot;
- Variables/modes/aliases/scopes/code syntax, Timing/Easing và Extended Collections khi plan hỗ trợ;
- Motion timelines/keyframes/animation styles/animated components;
- Code Connect template-first direction và structured mappings;
- Libraries phân phối Components, Variables, Styles với propagation theo plan/support.

Official anchors:

- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/create-skills/
- https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/
- https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties
- https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- https://developers.figma.com/docs/code-connect/templates-migration-guide/

## Candidate chưa materialize

`figma-motion-to-code` vẫn **không** là Skill canonical. 0.5.3 materialize motion implementation thành conditional deep reference `skills/figma-design-to-code/references/motion-translation.md`; trạng thái là `REFERENCE_BRANCH_MATERIALIZED_NOT_RUN`. Chỉ split thành Skill riêng nếu representative executions chứng minh independent trigger/outcome/proof và behavioral gain vượt một branch của `figma-design-to-code`, thay vì chỉ wrapper `get_motion_context`.


## 0.5.5 Design lifecycle breakthrough

```text
AUTHOR -> PACKAGE/IDENTITY -> REUSE/MIGRATE/SYNC -> PROTOTYPE/MOTION -> VERIFY -> EXPORT
                     \-> DESIGN <-> CODE
```

### Design → Code output

`figma-design-to-code` chọn mode từ authority thực tế:

- `IMPLEMENT`: production repository bytes thực sự thay đổi; return compact changed-files/component/token/asset/state/motion + proof record.
- `HANDOFF`: không giả vờ đã implement; return Design Translation Packet với source/target identity, `REUSE|ADAPT|CREATE` mapping, conflicts và proofRequired.

Provider `get_design_context`/reference code là input evidence, không phải terminal output.

### Design → Design

`figma-design-to-design` sở hữu 5 strategy: `REUSE_REMOTE`, `WRAP`, `FORK`, `MIGRATE`, `SYNC`. Completion không phải “pixel giống”; phải chứng minh target identity, consumers và **future update relationship**. `figma-design-system` vẫn sở hữu source/governance/publication readiness; Design-to-Design sở hữu consumption/transfer/migration giữa files.

### Components × Prototype × Motion

- Components: semantic job, anatomy, configuration API, state vocabulary.
- Prototype: triggers/actions/conditions/Change-to/state progression.
- Motion: timing/keyframes/easing/temporal choreography.

Interactive-component variant reactions được reuse như behavior contract; instance interaction cùng trigger có thể override inherited variant interaction, nên precedence là một failure mode phải diagnose.

### Export

`figma_export` là runtime egress primitive, không phải Skill. Formats local: PNG/JPG/SVG/PDF/JSON/MP4/GIF/WEBM. Default transport ceiling 32 MiB, hard max 64 MiB. Artifact được lưu dưới local export directory và MCP chỉ nhận metadata/path. Hosted provider asset/video surfaces vẫn được delegate khi phù hợp.

### Library authority

Manifest có `teamlibrary` permission cho local inspection cần thiết. Library publish/enable vẫn là user/Figma authority; ControlMux chỉ được claim readiness/status nếu đó là evidence thực tế, không suy publish từ local state.


## 0.5.6 Lifecycle reliability + behavioral components

Topology giữ **16 Skill**; không thêm provider/tool-shaped Skill. Runtime có `figma_status`, typed `figma_query`/`figma_apply`, raw `figma_exec`, và `figma_export`. `figma_export` có terminal egress semantics riêng: leader persist typed artifact, follower nhận compact descriptor, MCP result có text descriptor + `resource_link` + `structuredContent`. Local file resource link không đồng nghĩa remote host portability.

`figma-design-to-design` bổ sung transactional Transfer Ledger và Design Transfer Packet để bind exact source/target instance + file + evidence boundary, record writes/postconditions và resume idempotently. `figma-design-to-code` HANDOFF có Design Translation Packet schema. Components/Prototype được thêm behavioral Golden Teaching Cases nhưng execution qualification vẫn `NOT_RUN`.
