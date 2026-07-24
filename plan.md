# Folder-Based Markdown Project Format

## Summary

Replace embedded and standalone JSON configuration files with folder-based Markdown projects using YAML front matter. Markdown is the better fit here because each component combines structured metadata with human-readable documentation; JSON Schema will still validate the machine-readable front matter.

The viewer will auto-load a demo project when hosted and otherwise offer **Open Folder**. The editor will operate directly on project folders and expose calls inside each component inspector.

## Project Format and APIs

- Use exactly one root `project.visiflow.md`:

```md
---
visiflow: 1
kind: project
app:
  id: orbit
  name: Orbit
  platform: iOS
  device: ios
  initialScreenId: home
screens: []
systems: []
scenarios: []
initialScenarioId: default
componentFiles:
  - screens/home/login-card.visiflow.md
connections: []
---

Project documentation and application description.
```

- Use nested `*.visiflow.md` component documents:
  - YAML front matter stores identity, screen, tags, visual configuration, state overrides, and owned calls.
  - Markdown body becomes the component description/documentation.
  - Paths use project-root-relative `/` separators and cannot escape through `..`.
- Component calls use:

```yaml
calls:
  - id: authenticate
    name: Authenticate user
    direction: outgoing
    peer: { kind: system, id: identity-service }
    protocol: HTTPS
    method: POST
    endpoint: /oauth/token
    description: Establishes the user session
    cadence:
      kind: user-event
      label: On submit
```

- `direction` determines whether the component is the normalized connection source or target. The manifest retains `connections` only for paths not owned by a component, such as system-to-system traffic.
- Keep the existing assembled `VisiFlowConfig` and `schemaVersion: 1` as the internal runtime model.

## Loader, Editor, and Viewer Changes

- Add a shared project loader:
  - `loadProjectFromDirectory()` recursively scans case-insensitive `*.visiflow.md` files and requires exactly one `kind: project` manifest.
  - Reject folders containing multiple project manifests.
  - Include locally discovered component documents and synchronize `componentFiles` on save.
  - `loadProjectFromHttp()` fetches `project.visiflow.md` and follows its explicit `componentFiles`, because static hosting cannot enumerate directories.
  - Parse YAML front matter, assemble calls into normalized connections, validate references, and report errors with file paths and front-matter fields.
- Remove the embedded configuration block and legacy JSON opening/saving.
  - The viewer starts asynchronously.
  - `?project=<relative-or-absolute-url>` overrides the default hosted project.
  - Hosted builds auto-load `demo/project.visiflow.md`.
  - `file://` and failed hosted loads show Open Folder/Open Project controls.
  - Add a toolbar action for switching projects.
- Refactor the editor around an opened directory:
  - Replace Open JSON with Open Folder.
  - Add a Calls section inside the component inspector with add/edit/delete controls for direction, peer, protocol, method, endpoint, description, and cadence.
  - Show derived incoming calls owned by another component as read-only with an action to open their owner.
  - Keep the global Connections section as an overview editing the same canonical records.
  - Save component changes to their owning Markdown files and project-wide changes to the manifest.
  - New component files default to `screens/<screen-id>/<component-id>.visiflow.md`.
  - ID renames stage a new path; saving writes new files before removing old ones.
  - Component deletion requires confirmation, removes related calls/scenario states, and deletes its document only after successful manifest updates.
- Store imported images as relative assets:
  - Screens: `assets/screens/<screen-id>.<ext>`.
  - Components: `assets/components/<component-id>.<ext>`.
  - State variants: `assets/components/<component-id>-active.<ext>` and `-inactive.<ext>`.
  - Data URLs remain valid for deliberately embedded state or component assets, but relative files are the editor default.
  - Resolve local assets through object URLs without replacing their saved relative paths.
- Save in dependency-safe order: new assets and component documents, then the manifest, then obsolete documents. Preserve dirty state and report partial-write failures.
- Safely render basic Markdown documentation without enabling raw HTML. Use plain-text excerpts in compact cards and headers.

## Schemas, Demo, and Documentation

- Refactor Zod definitions into reusable exported schemas and generate:
  - `schemas/visiflow-frontmatter.schema.json` for `kind: project` and `kind: component` metadata.
  - `schemas/visiflow-runtime.schema.json` for the assembled runtime configuration.
- Generate schemas with Zod’s JSON Schema support during `npm run build`, using JSON Schema Draft 2020-12 and stable `$id` values.
- Publish schema files with production artifacts. Cross-file reference checks remain runtime validation because JSON Schema cannot validate the assembled folder graph.
- Add a self-contained `demo/` subproject used by local hosting and GitHub Pages, including component Markdown files and relative assets.
- Replace the JSON example documentation with:
  - A project-format guide explaining directory structure, front matter, calls, assets, state images, folder loading, and hosted loading.
  - A ready-to-copy Markdown demo project.
  - JSON Schema editor-association examples for YAML tooling.

## Test Plan

- Parse and serialize project/component front matter while preserving Markdown bodies.
- Recursively discover component files, reject multiple manifests, detect duplicate IDs, missing files, invalid paths, and broken references.
- Normalize incoming/outgoing component calls and project-level connections without duplicates.
- Verify component call editing updates the owning document and derived incoming calls remain read-only.
- Verify relative and data-URL assets in base and active/inactive states.
- Verify safe save ordering, component creation, rename, cascade deletion, and failed-write dirty state.
- Verify hosted auto-loading, query-string override, Open Folder fallback, and the external demo.
- Validate generated schemas against representative valid and invalid metadata/runtime documents.
- Verify both compiled HTML shells contain no embedded configuration and production output includes the demo and schema artifacts.

## Assumptions

- Markdown/YAML becomes the only writable project format; legacy JSON import is removed.
- YAML front matter is structured configuration, while Markdown bodies are rendered documentation.
- Local folder editing targets browsers supporting the File System Access API; unsupported browsers may open hosted projects read-only.
- An opened folder contains exactly one VisiFlow project manifest.
- The compiled HTML remains self-contained application code, but configuration, Markdown documents, schemas, and project assets remain external.
