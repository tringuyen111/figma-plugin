# Craft depth & Golden Teaching Cases — Figma Plugin 0.5.6

## Nguyên tắc

Design/UI Skill không được tối ưu theo hướng “nhiều guardrail hơn là đủ”. Một Skill mạnh phải dạy agent **nhìn ra vấn đề, cân các phương án, chọn cách làm tốt, tự critique và sửa lại**.

Với example:

> Không có example còn tốt hơn một example trung bình khiến model cargo-cult sai pattern.

Golden Teaching Case vì vậy không chỉ là `prompt -> output`. Nó phải expose đường suy luận:

```text
product truth
-> mediocre/default attempt
-> expert observation
-> decision variables
-> plausible alternatives
-> reject/select with reasons
-> exact Figma construction
-> render critique
-> causal correction
-> final rationale
-> anti-copy transfer rule
```

Literal pixel/color/type values chỉ là **specimen evidence**. Chúng không trở thành reusable truth nếu task/system mới không có cùng quan hệ.

## 5 craft-core Skills trong 0.5.4

0.5.4 giữ nguyên topology 15 Skill và deepens 5 Skill có ảnh hưởng trực tiếp nhất tới chất lượng Design/UI:

- `figma-design-authoring` — task hierarchy -> whole-scene composition -> native Figma compile -> craft proof.
- `figma-layout` — geometric responsibility, scan/comparison axes, density, flexible-space ownership và pressure/recomposition.
- `figma-scene` — semantic containment vs plane/input relation, silhouette ownership và cue economy.
- `figma-visual-system` — system role vs perception, occupied chroma area, repetition, surface/depth/shape distribution.
- `figma-typography` — information role, whole-scene type mass, font metrics, numeric scanning, localization và geometry pressure.

Mỗi Skill có `references/golden-teaching-cases.md` riêng để giữ local methodological sufficiency. Không tạo một shared “design cookbook” bắt Skill khác phải load ngầm.

## Quality ladder

`figma-design-authoring` dùng ladder:

```text
VALID
  native/relationship truth không broken

COHERENT
  semantic/layout/type/color/plane/state cùng kể một câu chuyện

CRAFTED
  rhythm, density, optical alignment, type/color mass, negative space,
  silhouette và state treatment đã được refine có chủ đích

PRODUCT-FIT
  composition phản ánh đúng task frequency, information pressure,
  audience và product character thay vì generic UI pattern
```

User yêu cầu polished/high-quality thì `VALID` không phải điểm dừng hợp lệ nếu còn đủ truth/render capability để tiếp tục.

## Example qualification

Project-level evidence nằm ở:

```text
design/direction-approved.md

design/exemplars/
  README.md
  controlmux-observability-golden.html
  controlmux-request-sheet-golden.html
  renders/
    controlmux-observability-golden.png
    controlmux-request-sheet-golden.png

evals/craft-exemplars.json
```

Main specimen dùng product truth thật của Figma Plugin companion thay vì bịa một dashboard mẫu. Render đã được self-review về task hierarchy, density, type mass, semantic chroma, surface/plane ownership và request-row comparison axes.

Proof state vẫn tách rõ:

```text
product-truth binding       PASS
rendered visual self-review PASS
structure/method review     PASS
independent expert review   NOT_RUN
behavioral Skill A/B        NOT_RUN
```

Không được gọi self-review là independent qualification. Không được gọi Skill behavioral uplift PASS chỉ vì example nhìn tốt hoặc native validator PASS.

## Anti-cargo-cult rule

Mỗi detailed reference phải có anti-copy/counterexample để model học **relation** thay vì học layout/template:

- ControlMux log ưu tiên một working surface lớn vì điều tra request là task chính; peer-comparison analytics có thể cần symmetry.
- Request detail dùng bottom sheet trong compact companion; desktop workspace rộng có thể cần persistent inspector.
- Operational UI dùng quiet neutral field; brand/marketing surface có thể chủ động dùng chroma lớn hơn.
- Dense observability typography không phải scale cho editorial onboarding.

## Performance boundary

Craft depth không bị token-budget cắt ngắn. Các case dài được progressive-load chỉ khi ambiguity/craft calibration cần chúng.

Performance vẫn nằm ở I/O quanh Skill:

```text
strong reasoning
-> smallest sufficient evidence
-> bounded provider/local execution
-> render/proof đúng claim
-> compact decision packet
```

Không đổi quality lấy token/call reduction.


## 0.5.6 behavioral-component exemplars

Hai capability có ảnh hưởng trực tiếp tới reusable behavior được nâng từ HOW sang HOW + SHOW:

- `figma-components/references/golden-teaching-cases.md`: interactive Toggle, constrained Slot và component API migration. Case bắt buộc dùng exact component-property keys từ API (`#…` suffix), đọc Slot constraints/`limitViolations`, và không giả rằng `setProperties()` set được SLOT content.
- `figma-prototype/references/golden-teaching-cases.md`: inherited/instance-trigger precedence, transient Select recovery, và local conditional validation không giả backend. Prototype tự giữ accessibility proof boundary: authored interaction/focus/recovery evidence không chứng minh production DOM/accessibility tree, complete keyboard/screen-reader hay real assistive-technology behavior.

`evals/craft-exemplars.json` giữ `methodReview: PASS` nhưng `figmaExecution: NOT_RUN` và `independentExpertReview: NOT_RUN`. Detailed example không được tự nâng thành behavioral proof.
