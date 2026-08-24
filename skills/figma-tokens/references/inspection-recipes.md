# Token inspection recipes

Use `figma_query(kind=binding_inventory)` first and typed variable/collection patches when the property is stable. Use these only when native `figma_exec` evidence is the best available source. Prefer structured provider variable/library tools when they already return the semantic evidence required by the task, and always fingerprint/rescan after raw execution.

## Filtered local variable inventory

Start with a collection/name filter rather than dumping every token.

```js
const prefix = "color/";
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variables = await figma.variables.getLocalVariablesAsync();
const byCollection = new Map(collections.map(c => [c.id, c]));
return variables
  .filter(v => v.name.startsWith(prefix))
  .slice(0, 200)
  .map(v => ({
    id: v.id,
    key: v.key,
    name: v.name,
    type: v.resolvedType,
    remote: v.remote,
    collection: byCollection.get(v.variableCollectionId)?.name ?? null,
    scopes: v.scopes,
    codeSyntax: v.codeSyntax,
    valuesByMode: v.valuesByMode,
  }));
```

If aliases or all modes are not material to the decision, project only names/types/scopes first and escalate later.

## Consumer binding projection

Inspect bindings on an exact subtree instead of searching the whole file.

```js
const root = await figma.getNodeByIdAsync("ROOT_ID");
if (!root || !("findAll" in root)) throw new Error("Target must be a scene subtree");
const nodes = [root, ...root.findAll(() => true)].slice(0, 300);
return nodes.map(node => ({
  id: node.id,
  type: node.type,
  name: node.name,
  boundVariables: "boundVariables" in node ? node.boundVariables : null,
})).filter(row => row.boundVariables && Object.keys(row.boundVariables).length > 0);
```

Use the consumer graph to decide role/propagation; do not infer semantic token identity from repeated raw values.
