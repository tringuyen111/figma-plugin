# Typography Method

## Hierarchy method

1. Identify orientation roles (page/section).
2. Identify repeated comparison/value roles.
3. Identify supporting/metadata/control/status roles.
4. Allocate strongest type mass to the few roles users must notice/decide from first.
5. Inspect repeated whole-page mass, not only individual components.
6. Tune typography together with spacing and color hierarchy.

## Text-slot pressure contract

For each slot define:

- expected content kind;
- single-line vs wrapping;
- max useful lines or truncation behavior;
- what neighboring actions/values do when text grows;
- localization/RTL behavior;
- accessibility scaling behavior;
- whether numeric alignment/features matter.

## Re-entry graph

When typography causes visible failure:

```text
content -> information role -> Text Style -> component slot -> layout owner -> whole scene
```

Fix the smallest shared owner that explains the evidence.

## Stress cases

Use at least one relevant case from each material class:

- long and short labels;
- Vietnamese diacritics / CJK / RTL or actual target locale;
- larger text scale;
- wide numeric values/time strings;
- alternate supported font/fallback;
- dense repeated list/table consumer.
