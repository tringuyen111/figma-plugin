# Bounded design-system inventory recipes

Inventory is evidence for a system decision, not the terminal outcome. Prefer structured library/design-system provider search when available; use local projections for file-local truth or when provider coverage is insufficient.

## Foundation summary

```js
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variables = await figma.variables.getLocalVariablesAsync();
const textStyles = await figma.getLocalTextStylesAsync();
const paintStyles = await figma.getLocalPaintStylesAsync();
const effectStyles = await figma.getLocalEffectStylesAsync();
return {
  collections: collections.map(c => ({ id: c.id, name: c.name, modes: c.modes.map(m => m.name), variableCount: c.variableIds.length })),
  variableCount: variables.length,
  styles: {
    text: textStyles.map(s => ({ id: s.id, name: s.name, key: s.key })),
    paint: paintStyles.map(s => ({ id: s.id, name: s.name, key: s.key })),
    effect: effectStyles.map(s => ({ id: s.id, name: s.name, key: s.key })),
  },
};
```

## Page-local component summary

```js
const components = figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
return components.slice(0, 300).map(node => ({
  id: node.id,
  type: node.type,
  name: node.name,
  key: "key" in node ? node.key : null,
  propertyCount: "componentPropertyDefinitions" in node ? Object.keys(node.componentPropertyDefinitions ?? {}).length : 0,
}));
```

For multi-page inventories, resolve page IDs first and inspect each relevant page deliberately. Do not switch every page inside one giant mutation/inspection script when page context cost or failure isolation matters.
