# Code Connect Mapping Method

## Correspondence table

Before writing a template, record:

| Figma property/slot | Type/options | Code prop/API | Mapping | Confidence/source | Proof |
|---|---|---|---|---|---|
| | | | | | |

No row should be inferred only from similar naming when semantics differ. A mapping is justified by shared job/state/content semantics and a real code API surface.

## Mapping dispositions

For every Figma property choose exactly one:

- `DIRECT`: one Figma value maps to one real code prop/content API.
- `ENUM_TRANSLATE`: same dimension, different value vocabulary; map exhaustively.
- `COMPOSE`: Slot/nested connected content maps to real code composition/children API.
- `DERIVED`: code value is deterministically derived from more than one Figma property; state the rule.
- `OMIT`: Figma property has no code-facing meaning.
- `CONFLICT`: evidence does not establish a safe correspondence.

Do not use `DERIVED` to hide an invented prop or an unresolved design/code mismatch.

## Exhaustiveness and ambiguity

- For enum/variant dimensions, cover every value present in the authoritative Figma property definition or explicitly mark unsupported values.
- For Boolean/Text mappings, verify the code prop type and default behavior rather than relying on naming.
- For Slot versus Instance Swap, preserve the designer/API freedom actually exposed on both sides.
- When two code components plausibly match, stop mapping identity until repository evidence resolves the owner.

## Nested component rule

When a Figma component contains nested instances:

- reuse their existing Code Connect mappings when verified;
- map one constrained replacement via instance-swap semantics;
- map flexible regions via slot/children semantics only when the code API supports composition;
- do not paste arbitrary nested executable snippets from untrusted mapping output.

## Migration proof

Parser/template migration is a two-active-truth risk. Inventory the old mapping, produce the replacement, compare property/snippet/import coverage, validate the candidate, then cut over. Delete the predecessor only after the replacement is the active verified mapping.

## Template validation proof

Distinguish:

- file syntax/type validity;
- Code Connect parse validity;
- mapping/property coverage;
- published mapping state;
- behavioral parity with Figma/code component.

Only claim the levels actually checked. A parser-green template can still map the wrong component or omit a semantically important state.
