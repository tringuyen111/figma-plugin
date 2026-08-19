# Token System Method

## Collection boundary test

Create/separate collections when one or more of these differ materially:

- mode governance;
- publishing/ownership boundary;
- semantic layer;
- platform/brand inheritance strategy;
- consumer scope and change cadence.

Do not create a collection merely to mirror every code folder.

## Layer decision

| Source truth | Recommended representation |
|---|---|
| flat small token list | flat variables, no fake aliases |
| primitives + semantics | primitive collection/layer + semantic aliases |
| stable component contracts | optional component aliases after semantics |
| multi-brand shared roles | shared parent roles + supported brand override mechanism |

## Role/value falsifier

```text
space/region/separation = 24
space/component/padding = 24
```

Same value, different relationship. A compact mode may change only one.

Conversely:

```text
color/surface/canvas
```

may resolve to different raw values in light/dark/brand modes while remaining one semantic role.

## Naming test

A good token path answers most of:

- what semantic category?
- what target/role?
- what state/variant if material?
- would the name still make sense if the literal value changed?
- can code/design map it without screen-specific knowledge?

## Proof matrix

Validate:

- variable existence and uniqueness within intended collection;
- alias graph resolves;
- scopes are intentional;
- modes have all required values;
- code syntax is verified where used;
- representative consumers are actually bound;
- light/dark/brand/density context resolves correctly when supported;
- deprecated tokens have no unintended active consumers.
