# Token inspection recipes

Start with typed `figma_query(kind=entity_graph, scope=variables)` for collection/name/type identity. Add `projection:["variable_details"]` only when mode values, aliases, scopes, code syntax, description, or publishing visibility are material. Use `figma_query(kind=binding_inventory)` for bounded consumer evidence. The raw `figma_exec` recipes below are fallback evidence only when the typed query does not expose the needed relationship; always fingerprint/rescan after raw execution.

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
