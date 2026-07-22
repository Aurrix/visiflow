# VisiFlow Application Request Visualizer

## Summary

Build a read-only React viewer driven by declarative JSON. It models one primary application, its screens and components, external systems, component states, and declared request paths. Production emits a self-contained `dist/index.html`; users customize it by replacing the inline `<script id="visiflow-config" type="application/json">` block.

## Configuration and behavior

- Define a versioned `VisiFlowConfig` containing application metadata, device type, screens, components, external systems, connections, and named state scenarios.
- Support hybrid screen reconstruction: an optional background image plus positioned hotspots and rendered primitives (`container`, `text`, `button`, `input`, `badge`, and `image`). Coordinates use each screen's native design dimensions and scale responsively.
- Describe each request with typed source/target references, protocol, operation, endpoint, description, and cadence. Cadence covers user events, lifecycle work, schedules, recurring work, polling, push, continuous connections, and custom behavior.
- Validate JSON shape, duplicate IDs, references, scenario overrides, and component bounds. Render actionable property-path errors instead of crashing.
- Treat scenarios as transient viewer state. Inactive nodes and their declared paths remain inspectable and are visually distinguished.

## Interface

- Provide an App Map with device shell, screen/scenario selectors, external-system nodes, SVG request paths, zoom controls, filters, and a detail panel. Show all paths subtly and animate/emphasize those related to the selected node.
- Provide a Component Catalog with searchable/filterable cards, current state, tags, request counts, protocols, destinations, cadence metadata, and navigation back to the corresponding map location.
- Keep selection and filters consistent across views. Support keyboard navigation, visible focus, responsive layouts, and reduced motion.
- Keep the viewer local and deterministic: no backend, persistence, telemetry ingestion, authentication, or browser-side configuration editing.

## Packaging and documentation

- Inline compiled JavaScript and CSS with `vite-plugin-singlefile`; remove all runtime public-asset references.
- Ship an embedded representative mobile-app configuration and document how to replace it, including data-URL guidance for portable images and escaping `</script>` inside JSON strings.
- Add an artifact check requiring `dist/index.html` to be the only production file and forbidding external scripts, stylesheets, or generated asset references.

## Verification

- Unit-test parsing, cross-reference validation, bounds validation, state derivation, filters, and request indexing.
- Component-test view switching, selection, scenario rendering, catalog-to-map navigation, details, and configuration errors.
- Run TypeScript, ESLint, Vitest, production build, and the single-file artifact check.

## Assumptions

- One configuration represents one primary app with multiple screens and any number of external systems; system-to-system connections are allowed.
- Request animations illustrate declared architecture rather than live traffic.
- Modern evergreen browsers are targeted, with desktop exploration prioritized and smaller screens supported.
