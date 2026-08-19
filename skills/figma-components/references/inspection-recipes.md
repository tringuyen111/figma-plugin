# Component inspection recipes

Use these as **bounded projections** for `figma_exec` when a structured provider surface is unavailable or insufficient. Replace literal IDs/prefixes before execution. Do not treat the snippet as the decision method; it only supplies evidence to `figma-components`.

## Component API projection

Return the public designer-facing API and only a shallow anatomy summary before requesting a deep tree.

```js
const node = await figma.getNodeByIdAsync("NODE_ID");
if (!node || (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")) {
  throw new Error("Target must be a COMPONENT or COMPONENT_SET");
}
const defs = node.componentPropertyDefinitions ?? {};
const properties = Object.entries(defs).map(([name, def]) => ({
  name,
  type: def.type,
  defaultValue: def.defaultValue,
  variantOptions: def.variantOptions ?? null,
  preferredValues: def.preferredValues?.map(v => ({ type: v.type, key: v.key })) ?? null,
  slotSettings: def.slotSettings ?? null,
  boundVariableId: def.boundVariables?.defaultValue?.id ?? null,
}));
const children = "children" in node
  ? node.children.slice(0, 60).map(child => ({ id: child.id, type: child.type, name: child.name, visible: child.visible }))
  : [];
return { id: node.id, type: node.type, name: node.name, properties, children, childCount: "children" in node ? node.children.length : 0 };
```

Escalate to descendant traversal only when anatomy/slot ownership cannot be decided from this projection.

## Representative instance projection

Use a real instance to inspect consumer-facing property values and override pressure.

```js
const node = await figma.getNodeByIdAsync("INSTANCE_ID");
if (!node || node.type !== "INSTANCE") throw new Error("Target must be an INSTANCE");
const component = await node.getMainComponentAsync();
return {
  id: node.id,
  name: node.name,
  mainComponent: component ? { id: component.id, name: component.name, key: component.key } : null,
  properties: Object.entries(node.componentProperties).map(([name, prop]) => ({
    name,
    type: prop.type,
    value: prop.value,
    preferredValues: prop.preferredValues?.map(v => ({ type: v.type, key: v.key })) ?? null,
    boundVariableId: prop.boundVariables?.value?.id ?? null,
  })),
};
```

If the decision is about detach/override drift, sample a few materially different consumers instead of returning every instance in the file.
