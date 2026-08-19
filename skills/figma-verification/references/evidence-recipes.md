# Verification evidence recipes

The goal is **smallest sufficient proof**, not maximum collection.

## Evidence selection order

1. Bind exact target/revision and expected source.
2. Select only dimensions requested by the claim.
3. For each dimension, choose the cheapest evidence type that can actually prove it.
4. Escalate only when the finding remains `INCONCLUSIVE` or the claim generalizes beyond the sampled state.
5. Preserve raw IDs/revision references needed to reproduce a finding; summarize bulk payloads.

## Bounded structural projection

When a structured provider tool is unavailable, project only properties tied to the obligation:

```js
const root = await figma.getNodeByIdAsync("ROOT_ID");
if (!root) throw new Error("Target not found");
const nodes = "findAll" in root ? [root, ...root.findAll(() => true)] : [root];
return nodes.slice(0, 250).map(node => ({
  id: node.id,
  type: node.type,
  name: node.name,
  visible: "visible" in node ? node.visible : null,
  x: "x" in node ? node.x : null,
  y: "y" in node ? node.y : null,
  width: "width" in node ? node.width : null,
  height: "height" in node ? node.height : null,
  layoutMode: "layoutMode" in node ? node.layoutMode : null,
  boundVariables: "boundVariables" in node ? node.boundVariables : null,
}));
```

Do not use this projection to claim visual composition, accessibility beyond inspectable design-only obligations, or prototype/motion correctness.

## Sampling rule

A shared-system claim normally needs at least one source object plus representative consumers that exercise materially different state/content/mode/pressure. Sampling is invalid when the obligation is exhaustive (for example, “every variant value is mapped”).
