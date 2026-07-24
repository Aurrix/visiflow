# VisiFlow

VisiFlow is a browser-based application request atlas. It reconstructs app screens from screenshots or declarative components, separates background tasks into an app-runtime rail, maps calls to external systems, and documents protocols, endpoints, schedules, polling, push behavior, and scenario states.

[Open the hosted demo](https://aurrix.github.io/visiflow/)

## Run and build

```bash
npm install
npm run dev
npm run verify
```

`npm run build` produces:

- `dist/index.html`: the unified viewer and visual folder editor.
- `dist/demo/`: the external Markdown demo project.
- `dist/schemas/`: generated JSON Schemas.

The HTML file contains application code but no embedded project configuration. When hosted, it loads `demo/project.visiflow.md` read-only. Open a folder to enable View/Edit switching and filesystem persistence.

## Markdown projects

Projects use YAML front matter plus rendered Markdown documentation:

```text
project.visiflow.md
screens/
  home/
    balance-card.visiflow.md
assets/
  screens/
  components/
```

The v2 root manifest owns app-wide settings, screens, background tasks, systems, scenarios, and the hosted component-file list. Each nested component document owns its metadata, visual definition, documentation body, and calls.

See [the complete project format](docs/project-format.md) and [the runnable demo](public/demo/project.visiflow.md).

## Viewer loading

- Hosted default: `demo/project.visiflow.md`
- Hosted override: `index.html?project=path/to/project.visiflow.md`
- Local folders: **Open Folder**

Folder loading recursively discovers case-insensitive `*.visiflow.md` files and requires exactly one `kind: project` manifest.

## Visual editor

Open `dist/index.html` in a Chromium-based browser, select **Open Folder**, then switch to **Edit**. The viewer and editor share one in-memory project session, including the active screen, scenario, and compatible selection. The editor can:

- Draw, move, resize, duplicate, and delete components.
- Mix screenshot regions, relative component images, and schema-rendered UI.
- Edit app, screen, background-task, system, scenario, connection, state, and layout metadata.
- Edit protocols, methods, endpoints, directions, peers, and cadence directly inside a component.
- Import screenshots and active/inactive assets into project-relative asset folders.
- Automatically save valid changes at completed interaction boundaries.
- Undo and redo session changes, including changes already written by autosave.

Component Markdown bodies are safely rendered without enabling raw HTML. Compact cards use plain-text excerpts.

## Schemas

```bash
npm run schema
```

This generates Draft 2020-12 schemas:

- `schemas/visiflow-frontmatter.schema.json`
- `schemas/visiflow-runtime.schema.json`

JSON Schema describes the parsed metadata/runtime shapes. Runtime project assembly additionally validates duplicate IDs, paths, bounds, and cross-file references.
