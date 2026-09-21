---
"blume": major
---

Replace the top-level `openapi`, `asyncapi`, and `graphql` config blocks with a single `reference` list of adapters imported from `blume/reference`. Where the config used to enable each kind with its own keyed block, it now lists what to render, in order:

```ts
import { defineConfig } from "blume";
import { asyncapi, graphql, openapi, scalar } from "blume/reference";

export default defineConfig({
  reference: [
    openapi({ spec: "./openapi.yaml" }),
    asyncapi({ spec: "./asyncapi.yaml" }),
    graphql({
      spec: "./schema.graphql",
      endpoint: "https://api.example.com/graphql",
    }),
    scalar({ spec: "./legacy.yaml", route: "/legacy", theme: "purple" }),
  ],
});
```

Each adapter returns a plain, serializable descriptor (`kind`, `options`, `runtimeDeps`, `requiredSecrets`) that the config schema validates and the generated site reads as a literal; the reference resolver, the generated `package.json`, `blume doctor`, and the secrets check iterate the list instead of switching on a kind. The same kind can appear more than once, each entry with its own route and display options. `spec` stays the shorthand for a single source and resolves into `sources` at parse, so an adapter always has at least one source. The embedded Scalar reference is its own adapter rather than a `renderer` option: `scalar({ spec, sources, route, theme, …options })` takes an OpenAPI or AsyncAPI document, forwards every other key verbatim to the embed, and declares `@scalar/astro` as its runtime dependency — `openapi()` and `asyncapi()` always render Blume's own pages, and `graphql()` has no embed counterpart. The old keys are gone: a config that still uses them fails validation with a hint pointing at the list form, and a `renderer` left on `openapi()` or `asyncapi()` fails with a hint naming `scalar()`.

To migrate, move each block onto its factory and drop `enabled`:

- `openapi: { enabled: true, spec, sources, route, codeSamples, expandSchemas, playground }` → `openapi({ spec, sources, route, codeSamples, expandSchemas, playground })`.
- `asyncapi: { enabled: true, … }` → `asyncapi({ … })`, with the same options.
- `graphql: { enabled: true, spec, endpoint, sources, route, codeSamples, playground }` → `graphql({ spec, endpoint, sources, route, codeSamples, playground })`.
- `renderer: "scalar"` with `theme: "purple"` and `scalar: { localization }` → a separate `scalar({ spec, theme: "purple", localization })` entry in the list, keeping the block's `route`, `sources`, and `noindex`; the native display options don't apply to the embed.
- `enabled: false` → leave the adapter out of the list.
