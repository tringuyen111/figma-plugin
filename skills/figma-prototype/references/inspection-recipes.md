# Prototype inspection recipes

Use compact reaction projections before expanding to a whole prototype graph.

## Reaction projection for exact nodes

```js
const ids = ["NODE_ID"];
const rows = [];
for (const id of ids) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node || !("reactions" in node)) continue;
  const reactions = node.reactions.map((reaction, reactionIndex) => ({
    reactionIndex,
    trigger: reaction.trigger,
    actions: (reaction.actions ?? (reaction.action ? [reaction.action] : [])).map((action, actionIndex) => ({
      actionIndex,
      type: action.type,
      navigation: "navigation" in action ? action.navigation : null,
      destinationId: "destinationId" in action ? action.destinationId : null,
      variableId: "variableId" in action ? action.variableId : null,
      conditionalBlocks: "conditionalBlocks" in action ? action.conditionalBlocks : null,
      transition: "transition" in action ? action.transition : null,
    })),
  }));
  rows.push({ id: node.id, type: node.type, name: node.name, reactions });
}
return rows;
```

`Reaction.actions` is the current multi-action contract; treat deprecated single `action` only as compatibility evidence. Preserve action order when behavior depends on it.

## Escalation rule

Start from the approved path's source nodes. Add destinations and conditional branches only when they are reachable from that path. A full-file reaction dump is justified only for an explicit whole-flow audit.
