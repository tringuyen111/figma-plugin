# Reuse Registry

Use a registry when component identity/reuse must survive more than one operation, context/session, file, or library boundary. Do not create one for a disposable local component edit with no future consumer.

The registry records **identity and evidence**, not visual similarity:

```text
semantic job
  -> component / component-set identity
      -> source file or published library
          -> contract summary
              -> verified consumers
                  -> current evidence state
```

## Identity states

| State | Meaning |
|---|---|
| `LOCAL_VERIFIED` | exact local node exists and listed consumers resolve to its component identity |
| `LIBRARY_DISCOVERED` | published key/source was discovered, but no consumer import was verified |
| `LIBRARY_IMPORTED_VERIFIED` | exact published key was consumed in another file and the resulting instance link was read back |
| `STALE` | source or consumer evidence no longer matches the recorded revision/identity |
| `MISSING` | the recorded source identity cannot be resolved |
| `NOT_RUN` | the claimed path has not been executed |

`LOCAL_VERIFIED` is not cross-file proof. `LIBRARY_DISCOVERED` is not consumption proof. A visual match is not identity proof.

## Workflow

1. Inspect local and accessible library candidates by semantic job, component key/node identity, anatomy, properties/states and source.
2. Reuse/extend/wrap/create according to the component contract—not nearest appearance.
3. Record only the selected canonical identity and bounded contract summary.
4. Create or update representative consumers.
5. Read each consumer's main component/key after mutation; record `LINKED / DETACHED / UNKNOWN`.
6. Assign an evidence state. Missing source/consumer truth stays `NOT_RUN`, `MISSING`, `STALE` or `BLOCKED`; never silently create a replacement and call it reuse.

Use `references/reuse-registry.schema.json` and validate with:

```bash
node skills/figma-components/scripts/validate-reuse-registry.mjs path/to/reuse-registry.json
```

The registry does not publish libraries, authorize cross-file writes, or certify visual/product fit. Publishing/enabling remains user/Figma authority; visual/system coherence requires matching Design evidence.
