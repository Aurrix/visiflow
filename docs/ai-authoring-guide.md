# VisiFlow AI Authoring Guide

Use this guide when creating, editing, or reviewing a VisiFlow project. Prefer small, internally consistent changes: update every reference affected by a renamed or removed ID, and keep the Markdown body useful to a human reader.

## Project layout

Each project folder must contain exactly one root manifest named `project.visiflow.md`. Component documents may live in nested folders.

```text
my-app/
  project.visiflow.md
  screens/
    login/
      login-card.visiflow.md
  assets/
    screens/
      login.png
    components/
      login-card.png
```

All file references are relative to the project root, use `/`, and must not contain `..`.

## Documents to create

### 1. Root project manifest

Create one `project.visiflow.md` with front matter beginning:

```yaml
visiflow: 2
kind: project
```

The root manifest owns:

- `app`: application identity and initial screen;
- `screens`: device canvases and navigation hierarchy;
- `tasks`: background/runtime work;
- `systems`: external services or systems;
- `scenarios`: state combinations for viewing;
- `componentFiles`: every component document path when hosted;
- `connections`: connections not owned by a component.

The Markdown body should describe the application as a whole: its purpose, audience, and notable flows.

### 2. Component documents

Create one `*.visiflow.md` file per UI component. Its front matter begins:

```yaml
visiflow: 2
kind: component
```

A component requires stable `id`, `screenId`, `name`, `type`, and `visual` metadata. It owns UI-originated calls in `calls`. Its Markdown body documents what the component does, what a user sees, and any meaningful behavior or constraints.

## IDs and references

- Use stable, lowercase kebab-case IDs such as `login-card`, `session-refresh`, and `identity-service`.
- IDs must be unique within their relevant collection.
- `app.initialScreenId`, `scenario.screenId`, `component.screenId`, `task.scope.screenId`, and connection peers must reference existing IDs.
- When adding a component file, also add its relative path to `componentFiles`.
- When deleting or renaming an item, update every reference before considering the edit complete.

## Screens and visuals

Each screen has `id`, `name`, `width`, and `height`. Use `parentId` to nest screens and `group` only on root screens (children inherit their root group). `order` controls sibling order.

Supported visual kinds are:

```text
hotspot, container, text, button, input, badge, image
```

Use coordinates in the screen's pixel space. Keep visuals within the screen bounds. Prefer relative image assets such as `assets/components/login-card.png`; do not invent asset paths without creating the asset.

## Connections and runtime behavior

Use a component's `calls` array for connections it owns. Use root `connections` only when no component owns the connection.

- `direction: outgoing` means the documented node initiates the request.
- `direction: incoming` means the documented node receives it.
- `peer` may reference a `component`, `task`, or `system`.
- Use a real protocol (`HTTPS`, `gRPC`, etc.) for external requests.
- Use `Internal` for component-to-task or task-to-task control flow.
- Direct connections without a task require a `cadence`.
- Connections involving a task omit `cadence`; the task's `trigger` owns timing.

For each task, choose `scope: { kind: app }` or `scope: { kind: screen, screenId: ... }`, add a `trigger`, and set a sensible `defaultState`.

## Scenarios and states

Every project needs at least one scenario and `initialScenarioId` must reference it. Each scenario contains both maps:

```yaml
componentStates: {}
taskStates: {}
```

State entries override a component or task's `defaultState`; omitted entries fall back to that default and then to `active`.

## Schemas and validation

Use these generated schemas:

| Purpose | File | Use it for |
| --- | --- | --- |
| YAML front matter | `schemas/visiflow-frontmatter.schema.json` | Each `*.visiflow.md` document's metadata |
| Assembled runtime model | `schemas/visiflow-runtime.schema.json` | Whole-project/runtime validation and tooling |

Regenerate schemas after changing schema-producing code:

```bash
npm run schema
```

The front-matter schema validates one document at a time. It cannot verify cross-file IDs; validate the assembled project as well by running:

```bash
npm test
npm run build
```

## AI completion checklist

Before handing off a project edit, verify:

1. Every document has `visiflow: 2` and the correct `kind`.
2. There is exactly one root `kind: project` manifest named `project.visiflow.md`.
3. Every component file is listed in `componentFiles`.
4. All IDs and cross-file references resolve.
5. Task timing lives in `trigger`; task-related connections do not declare `cadence`.
6. Every scenario has both `componentStates` and `taskStates`.
7. Asset paths are relative, slash-separated, and exist.
8. Markdown bodies explain the item instead of duplicating raw YAML.

For the complete field-level format reference, see [project-format.md](project-format.md).
