# Figma Plugin

**Cầu nối Figma cục bộ cho ControlMux, Codex, Claude Code và các MCP client.**

Figma Plugin cho agent làm việc trực tiếp với Figma Design, FigJam hoặc Slides qua native Figma Plugin API. Surface local giữ các seam rõ trách nhiệm: `figma_status`, read-only `figma_query`, guarded `figma_apply`, raw `figma_exec` escape hatch, và `figma_export` cho typed artifact egress không nhồi binary lớn vào model context.

```text
Agent / Skill
    │
    ├─ figma_status
    ├─ figma_query
    ├─ figma_apply
    ├─ figma_exec
    └─ figma_export
          │
          ▼
    local MCP runtime
          │
          ▼
    Figma plugin instance
          │
          ▼
    native Figma Plugin API
```

Runtime cố ý chỉ giữ năm tool nhỏ: `figma_status` cho routing/health, `figma_query` cho typed read-only inventory, `figma_apply` cho mutation có dry-run/confirm guard, `figma_exec` làm native escape hatch, và `figma_export` làm typed egress primitive. Chúng không thay thế Design Skill. Design intelligence nằm ở bộ Skill chuyên sâu: scene/2.5D, layout, tokens, typography, visual system, components, prototype, motion, design system, design authoring, verification và ba chiều code bridge. Xem `docs/CAPABILITIES.md` để biết ownership/reuse contract, `docs/DESIGN-LIFECYCLE.md` cho library/cross-file lifecycle, `docs/EXPORT.md` cho typed egress, `docs/DISTILLATION.md` để truy provenance, và `docs/SOURCE-ARCHITECTURE.md` cho source ownership.

Live capability findings and the system-level upgrade path are recorded in `docs/CAPABILITY-UPGRADE.md`; the report keeps local component reuse, cross-file library reuse, visual self-review, design-to-code parity and behavioral qualification as separate evidence claims.

## Cài đặt nhanh

Yêu cầu: Node.js 18+ và Figma Desktop.

```bash
npm ci
npm run build
node dist/server/index.js doctor
```

`doctor` không thay đổi Figma hay cấu hình MCP. Nó kiểm tra bundle cục bộ, các file package/plugin/MCP bắt buộc, version giữa `package.json` và hai plugin manifest, đủ 16 Figma capability Skills, rồi in **đường dẫn tuyệt đối** tới `plugin/manifest.json` cùng bước tiếp theo. Đây là setup/static validation, không phải bằng chứng Figma live. Khi package đã được cài qua npm/bin, có thể dùng `figma-plugin doctor` hoặc `figma-plugin doctor --json`.

Trong Figma Desktop:

1. Mở file/cửa sổ đích.
2. Mở **Plugins → Development → Import plugin from manifest…**.
3. Chọn đúng đường dẫn manifest do `doctor` in ra.
4. Chạy **Figma Plugin** trong mỗi cửa sổ/tab Figma mà bạn muốn agent điều khiển.
5. Giữ panel Figma Plugin mở trong lúc agent làm việc.

Sau khi MCP client đã nạp server, agent phải gọi `figma_status` để xác minh kết nối. Nếu tool chưa xuất hiện, cần xử lý registration/reload của MCP client trước; nếu tool có nhưng chưa có Figma instance, agent phải hướng dẫn đúng bước import/run plugin ở trên rồi kiểm tra lại.

### MCP client bất kỳ

Chạy server qua stdio:

```bash
node /absolute/path/to/figma-plugin/dist/server/index.js
```

Nếu cần đổi port bắt đầu, `CONTROLMUX_FIGMA_PORT` phải nằm trong `38470-38479`. Runtime sẽ thử các port còn lại theo vòng trong đúng dải này để Figma plugin luôn có thể discover server.

Khi nâng từ bản cũ lên `0.7.0`, hãy dừng các process Figma Plugin cũ đang chạy và reload companion từ `plugin/manifest.json` trước khi start runtime mới. Protocol 10 từ chối typed work khi bundle/capability negotiation còn stale.

### Codex

Repo đã chứa Codex plugin manifest, MCP config và toàn bộ Figma Skill topology:

```text
.codex-plugin/plugin.json
.mcp.json
skills/figma-native/
skills/figma-scene/
skills/figma-layout/
skills/figma-tokens/
skills/figma-typography/
skills/figma-visual-system/
skills/figma-components/
skills/figma-prototype/
skills/figma-motion/
skills/figma-design-system/
skills/figma-design-authoring/
skills/figma-verification/
skills/figma-code-connect/
skills/figma-code-to-design/
skills/figma-design-to-design/
skills/figma-design-to-code/
```

Sau khi cài/register local plugin theo workflow Codex của bạn, mở thread mới để Codex nạp plugin/Skills hiện tại. Figma Desktop vẫn cần companion plugin ở `plugin/manifest.json`.

### Claude Code

Repo có Claude plugin manifest với MCP server được bundle theo plugin root. Khi phát triển local có thể chạy:

```bash
claude --plugin-dir /absolute/path/to/figma-plugin
```

Figma Desktop vẫn dùng cùng `plugin/manifest.json` ở trên.

## Dùng cơ bản

### 1. Kiểm tra target

Gọi `figma_status` khi mới kết nối, khi đổi cửa sổ/page, hoặc khi target chưa rõ.

Kết quả cho biết:

- các Figma window/plugin instance đang online;
- file và page hiện tại của từng instance;
- session agent đang bind vào instance nào;
- queue, latency và lỗi gần đây.

### 2. Đọc hoặc chỉnh Figma

Dùng `figma_exec` với JavaScript native Figma Plugin API.

Ví dụ đọc selection:

```js
return figma.currentPage.selection.map(node => ({
  id: node.id,
  type: node.type,
  name: node.name,
}));
```

Ví dụ tạo frame và tự kiểm tra kết quả:

```js
const frame = figma.createFrame();
frame.name = "Settings";
frame.layoutMode = "VERTICAL";
frame.itemSpacing = 16;
return {
  id: frame.id,
  name: frame.name,
  layoutMode: frame.layoutMode,
  itemSpacing: frame.itemSpacing,
};
```

Ảnh raster có thể trả dưới dạng `{ format, bytes }`. Bytes đi qua local bridge bằng binary WebSocket và chỉ được chuyển thành base64 tại MCP image boundary, tránh encode ảnh lớn trên Figma main thread.

### 3. Export artifact

Dùng `figma_export` khi cần artifact durable thay vì immediate visual evidence. Runtime hỗ trợ PNG/JPG/SVG/PDF/JSON/MP4/GIF/WEBM, persist bytes ở **leader**, rồi trả descriptor nhỏ + local `resource_link`; follower không nhận base64 artifact. Default budget là 32 MiB và hard ceiling được chừa overhead cho binary frame. Export mặc định nằm trong private ControlMux runtime directory với retention 24 giờ; `CONTROLMUX_FIGMA_EXPORT_DIR` chuyển sang thư mục tuyệt đối do user quản lý.

### Operation contract bắt buộc cho mutation/export

Từ candidate `0.7.0`, `figma_exec`, `figma_apply` và `figma_export` bắt buộc gửi `traceId + operation`; `capability` và `attempt` vẫn tùy chọn. Đây là omission gate ở MCP boundary: raw JavaScript, mutation typed và artifact export không được chạy khi thiếu intent có trách nhiệm. `figma_query` read-only vẫn có thể chạy không cần operation metadata.

```json
{
  "traceId": "checkout:primary-button",
  "capability": "figma-components",
  "attempt": 1,
  "operation": {
      "label": "Reuse primary Button",
      "kind": "write",
      "phase": "execute",
      "planId": "checkout-refresh",
      "stepId": "reuse-primary-button",
      "representation": "component-specimen",
      "target": "Checkout / Primary action",
    "postconditions": [
      "Node is an instance",
      "Main component key matches registry"
    ]
  }
}
```

`operation` yêu cầu `traceId` ổn định; các retry dùng cùng `traceId` và tăng `attempt`. `kind` là `read / write / export / other`; `phase` là `inspect / plan / execute / verify / recover`. `planId + stepId` là cặp tùy chọn để bind operation vào work graph; `representation` ghi dạng biểu đạt đã chọn như flow, table, bar, tree, wireframe hoặc component specimen. Telemetry chỉ quan sát identity này, không sở hữu plan. Với `figma_export`, `operation.kind` bắt buộc là `export`.

`postconditions` chỉ là kỳ vọng để con người/agent biết cần kiểm tra gì; chúng **không tự tạo PASS**. Metadata không chọn Skill, không cấp quyền, không đổi target/JavaScript semantics. Runtime tách `queue` khỏi `execution`, theo dõi request/response bytes, attributed count và retry count. Chỉ gắn attribution khi biết chắc; attribution sai tệ hơn bỏ trống.

Khi cần deterministic provider mechanics, `figma_exec` có thể opt-in latest `runtimeSdk: "v2"`; v1 vẫn được giữ tương thích. Code nhận object `figmaPlugin` cho targeted page loading, đầy đủ async style/variable binding, append-before-sizing Auto Layout, idempotent cleanup, native CSS/component/Dev Resource handoff inspection, undo boundaries, font-safe text mutation, structure measurement và compact checkpoints. Caller cũ không truyền field này vẫn chạy plain native JavaScript như trước. Xem `skills/figma-native/references/runtime-sdk.md`.

## Nhiều cửa sổ và nhiều page

Mỗi lần Figma Plugin chạy trong một Figma window/tab là một **instance riêng** có `instanceId` riêng. `fileKey` chỉ là metadata, vì vậy cùng một file có thể mở ở nhiều tab mà không ghi đè connection của nhau.

Quy tắc routing:

- **0 instance** → `NOT_CONNECTED` ngay, không chờ ngầm.
- **1 instance** → tự chọn instance đó.
- **Nhiều instance, chưa bind/chưa chỉ định target** → `AMBIGUOUS_TARGET`.
- Truyền `instanceId` để chọn đúng cửa sổ.
- Truyền `pageId` khi muốn target page khác page hiện tại của cửa sổ đó.

`figma_status({ verbose: true })` trả thêm page list và runtime metrics phục vụ routing/diagnostics.

## Trạng thái và lỗi quan trọng

| Code | Ý nghĩa | Cách xử lý |
|---|---|---|
| `NOT_CONNECTED` | Không có Figma instance online | Mở Figma Plugin trong cửa sổ đích rồi thử lại |
| `AMBIGUOUS_TARGET` | Có nhiều instance nhưng chưa chọn target | Dùng `instanceId` hoặc bind session vào cửa sổ đích |
| `TARGET_NOT_FOUND` | `instanceId` không còn tồn tại | Gọi lại `figma_status` |
| `PAGE_NOT_FOUND` | `pageId` không tồn tại trong target instance | Đọc lại page list rồi chọn page hợp lệ |
| `QUEUE_FULL` | Queue của instance đã đầy | Đợi tác vụ hiện tại hoàn tất hoặc clear queued work |
| `PLUGIN_TIMEOUT` | Tổng deadline của request đã hết | Kiểm tra status trước khi retry; code đã dispatch có thể vẫn đang chạy trong Figma |
| `CONNECTION_LOST` | Plugin instance bị mất kết nối | Mở/reconnect plugin rồi kiểm tra lại target |

Timeout được tính từ lúc request vào queue. Nếu JavaScript synchronous đã dispatch nhưng quá deadline, caller nhận timeout nhưng runtime **không** chạy request kế tiếp trên cùng instance cho tới khi execution cũ trả late response hoặc connection đóng. Điều này tránh side effect chồng lấn.

## UI và trạng thái runtime

Companion UI là **một live observability surface duy nhất**, không phải control plane và không có Home/Route/Health navigation. Mục tiêu là để người dùng liếc nhanh biết hệ thống có kết nối, request đang chạy ra sao, và mở chi tiết chỉ khi cần.

- **Connection** trả lời câu hỏi người dùng: Figma hiện có nối được tới local ControlMux bridge không? Mặt chính chỉ hiện trạng thái, tín hiệu gần nhất, thời gian kết nối và số agent session. Port/transport/protocol nằm trong Technical details.
- **Requests** tóm tắt lượng request từ lúc plugin instance kết nối, tải hiện tại (running/waiting), reliability, latency và mix `Read / Write / Export / Other`. Chỉ giữ một segmented bar vì nó có giá trị so sánh trực tiếp; không dùng biểu đồ trang trí.
- **Operation log** nằm dưới cùng và sở hữu vùng cuộn riêng. Các request có cùng `traceId` được gộp thành một logical operation; mỗi dòng cho thấy intent, phase, capability, số attempt và end-to-end latency. UI giữ evidence của 100 request nhưng chỉ dựng 24 operation gần nhất vào DOM, debounce update và cho mở thêm theo batch để relay WebSocket không bị log rendering chặn. Bridge gửi full telemetry khi connect/resync và delta có sequence trong luồng thường; UI tự yêu cầu resync nếu phát hiện mất delta. Click mở target, postconditions và từng request attempt với queue/run/bytes/error evidence. Pause chỉ dừng live view chứ không dừng runtime; filter chỉ đổi view; Clear log chỉ xóa history gần đây và giữ nguyên aggregate counters.

Runtime giữ tối đa **100 request gần nhất cho mỗi plugin connection** và tối đa 100 latency samples. Metrics tách queue/execute/total latency (p50/p95), bytes, error/timeout, attributed count và retry count. Aggregate counters và traffic là in-memory kể từ lúc plugin instance kết nối; chúng reset khi connection/runtime tương ứng được tạo lại. Không có database hoặc durable telemetry history trong plugin này.

Comment tương thích ở đầu code (`// @controlmux read <label>`, `write`, hoặc `export`) chỉ còn là label fallback ở bridge cũ; nó không thay thế `traceId + operation` tại MCP boundary. Binary image result vẫn được reclassify thành `Export`, nhưng declared postconditions chỉ là nghĩa vụ cần readback chứ không tự tạo PASS.

Plugin mở ở **390×720** và cho phép resize trong biên 620–820px; đây là geometry của một desktop companion panel cao, không phải mô phỏng thiết bị mobile. Khi thiếu chiều cao, operation log co/scroll trong chính vùng của nó thay vì biến cả UI thành một trang dài.

## Local trust

Bridge chỉ listen trên loopback. WebSocket sử dụng client identity được lưu qua Figma `clientStorage` để giữ zero-click trust continuity giữa các window của cùng plugin installation, cùng với handshake timeout, client cap và payload limits.

Discovery/health giữa các process Figma Plugin dùng token của leader record và xác minh service/protocol/version trước khi nhận một process khác làm leader.

Đây là **local continuity guard**, không phải security sandbox chống một process độc hại đã chạy dưới cùng OS user. Với workstation chia sẻ hoặc threat model cao hơn, cần một lớp pairing/authentication mạnh hơn ở ControlMux/runtime layer.

## Figma Skills

0.5 tách Design cognition khỏi runtime kernel. `figma-native` chỉ sở hữu setup/connection, target routing và Plugin API execution; các domain Design có Skill riêng để tránh một Skill khổng lồ vừa quyết định UX vừa gọi API.

Các nguyên tắc xuyên suốt:

- chọn representation theo **responsibility**, không theo API noun;
- naming là API cho người, agent, library search và code bridge;
- reuse có nhiều cấp: Variable/Mode/Alias, Text/Paint/Effect Style, Component/Property/Variant/Slot/Instance Swap, motion role/animated component, Library và Code Connect;
- Product Design được giữ theo các graph semantic/layout/component/style-type/plane-input/state-time rồi mới compile xuống Figma;
- token đúng không tự chứng minh phối màu đẹp; scene sạch không tự chứng minh depth/plane đúng; screenshot đẹp không tự chứng minh component/system structure tốt.
- task nhiều bước dùng progressive work graph: một active packet, specialist depth tải just-in-time, note ngay sau mỗi context load, rồi shed context trước packet tiếp theo;
- representation theo reasoning shape: sequence/branch/state/ownership/comparison/progress/reuse/layout ưu tiên flow/tree/state graph/typed graph/table/bar/component specimen/wireframe khi trực quan hơn prose;
- reuse qua session/file/library dùng Reuse Registry và giữ `LOCAL_VERIFIED`, library discovery, imported cross-file proof, stale/missing và `NOT_RUN` riêng biệt.

Chi tiết: `docs/CAPABILITIES.md`.

0.5.4 giữ **15 Skill sâu** và tiếp tục nguyên tắc capability quality trước I/O performance. 5 craft-core Skill (`figma-design-authoring`, `figma-layout`, `figma-scene`, `figma-visual-system`, `figma-typography`) được thêm Golden Teaching Cases chi tiết: mediocre/default attempt -> expert diagnosis -> alternatives -> exact Figma construction -> render critique -> causal correction -> anti-copy rule. Methodology không bị ép ngắn vì token; example literal không được cargo-cult thành template. Xem `docs/CRAFT-EXEMPLARS.md` và `docs/AGENT-SKILL-VALUE.md`.

## Phát triển và kiểm thử

```bash
npm run typecheck
npm test
npm run check:capabilities
npm run build:bundle
npm run test:bundle
npm run inspect:figma-file
npm run benchmark:figma
npm run test:typed-tools-live
```

`npm run clear:figma-file` là mutation rõ ràng: nó kiểm kê trước, xóa toàn bộ direct page children cùng local styles/variable collections, tạo undo checkpoint và hậu kiểm mọi count về zero. `npm run test:runtime-sdk-v2-live` là core smoke: tạo fixture native tạm, kiểm tra v2 helpers không gọi provider network, rồi cleanup trong `finally`. `npm run test:runtime-sdk-v2-provider-live` mới bật thêm Dev Resource/publish probes; các probe này có thể bị giới hạn hoặc timeout theo quyền Figma.
`figma_query` là read-only typed surface; `figma_apply` mặc định dry-run và yêu cầu `confirm: true` trước mutation.

Hoặc chạy toàn bộ gate:

```bash
npm run build
```

Source UI nằm ở `src/ui/template.html`, `src/ui/styles.css` và các phần script có thứ tự trong `src/ui/script/`; `plugin/ui.html` là generated artifact.

Output chính:

```text
plugin/code.js          Figma plugin main bundle
plugin/ui.html          generated Figma runtime UI
dist/server/index.js    MCP/local bridge server
```

Khi chạy `npm run build`, UI được regenerate trước khi bundle và source map được generate cùng bundle.

## Tác giả và License

**Tri Nguyen**  
Email: `nguyenmanhtri2907@gmail.com`  
LinkedIn: `https://www.linkedin.com/in/nguyenmanhtri2907`

MIT License — xem `LICENSE`.


## 0.5.5 — Design lifecycle, reuse, export, behavior

0.5.5 bổ sung `figma-design-to-design` cho reuse/wrap/fork/migrate/sync giữa Figma files/libraries; formalize `figma-design-to-code` thành `IMPLEMENT` hoặc `HANDOFF`; thêm typed local `figma_export` cho PNG/JPG/SVG/PDF/JSON/MP4/GIF/WEBM; và deepen composition giữa Components × Prototype × Motion. `teamlibrary` permission chỉ cho inspection/discovery cần thiết; publish/enable library vẫn là user/Figma authority.


## 0.5.6 — Lifecycle reliability + behavioral components

0.5.6 giữ đúng **16 Skill** và 5 local MCP tools (`figma_status`, `figma_query`, `figma_apply`, `figma_exec`, `figma_export`). Durable `figma_export` giờ persist artifact ở leader trước khi follower RPC, dùng operation deadline xuyên leader/follower, framing-safe byte ceiling, private artifact permissions và 24h ephemeral cleanup mặc định. Design→Design có Transfer Ledger + Design Transfer Packet để bind source/target instance, resume idempotently và proof future relationship. Design→Code HANDOFF có schema/validator riêng. `figma-components` và `figma-prototype` được thêm Golden Teaching Cases chi tiết; behavioral Figma execution vẫn `NOT_RUN` cho tới khi representative executions thực sự chạy.


## 0.6.0 — Typed Figma library lifecycle

0.6.0 thêm `figma_query(kind=library_inventory)` để đọc exact component/style/variable identity, publish status, remote state, enabled library-variable descriptors và publish/enable boundary. `figma_apply(action=import_library_asset)` hỗ trợ import component, component set, style và variable theo published key với dry-run mặc định, `confirm:true`, undo boundary, idempotency theo source identity và typed readback. Preflight/import recipes đã chuyển khỏi raw JavaScript sang typed query/apply. Library publish/enable vẫn không được giả lập: khi source còn `UNPUBLISHED`, workflow dừng ở `READY_FOR_PUBLISH`.


## 0.7.0 — Typed entity graph, sync và strict audit

0.7.0 giữ nguyên đúng năm public tools nhưng nâng protocol lên 10. `figma_query` có artifact manifest, paginated entity graph, change feed, component/binding/prototype/motion/accessibility design facts; `figma_apply(action=apply_entity_patch)` hỗ trợ create/update/move/clone/delete và typed command groups với dry-run `planHash`, optimistic preconditions, non-overlapping rebase, delete guard, undo/readback và rollback state. Plugin-managed node identity dùng `controlId` trong shared plugin data; duplicate IDs được fork có quan hệ `forkedFrom`.

Companion đăng ký document/style change events, coalesce journal tối đa 2.000 records, phân loại agent/local/remote theo mức Figma cho phép, fingerprint variables định kỳ và buộc cursor resync sau reconnect. Figma vẫn là source of truth; graph/journal chỉ là cache/evidence. `figma_exec` là escape hatch cuối cùng và luôn đi qua rescan/readback.

Strict audit tách `AuditProfile`, `AuditReport` và `UpgradeRun`. Runtime chỉ trả facts; `figma-verification` là owner duy nhất của verdict và validator từ chối false-PASS, evidence thiếu target/snapshot/hash, checklist có verdict, hoặc lẫn local reuse với cross-file publication. Fixture Luma Bank nằm ở `evals/fixtures/luma-bank-strict-audit.profile.json`; profile chưa phải report đã chạy. Live UI two-way proof và behavioral uplift comparison vẫn phải được chạy trên companion bundle đúng revision mới được claim.
