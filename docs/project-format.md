# VisiFlow Markdown Project Format

A VisiFlow project is a folder containing exactly one `project.visiflow.md` manifest, nested component documents ending in `.visiflow.md`, and optional relative assets.

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
      login-card-inactive.png
```

## Project manifest

The v2 root manifest owns application metadata, screens, background tasks, external systems, scenarios, paths to component documents, and connections that are not owned by a component.

```md
---
visiflow: 2
kind: project
app:
  id: my-app
  name: My App
  platform: Android
  device: android
  initialScreenId: login
  accent: "#7c8cff"
screens:
  - id: login
    name: Login
    group: Account
    order: 1
    width: 390
    height: 844
    backgroundImage: assets/screens/login.png
  - id: recovery
    name: Password recovery
    parentId: login
    order: 1
    width: 390
    height: 844
tasks:
  - id: session-refresh
    name: Refresh session
    type: Session worker
    description: Keeps the application session current.
    scope: { kind: app }
    trigger:
      kind: recurring
      label: Every 15 minutes
      intervalMs: 900000
    defaultState: active
systems:
  - id: identity
    name: Identity Service
    type: OIDC
    description: Authenticates users.
scenarios:
  - id: default
    name: Default
    screenId: login
    componentStates: {}
    taskStates: {}
initialScenarioId: default
componentFiles:
  - screens/login/login-card.visiflow.md
connections: []
---

# My application

This Markdown body documents the project and becomes its rendered application description.
```

### Screen navigation hierarchy

The viewer and editor render screens as a grouped navigation tree. Existing flat screen arrays remain valid.

- `group` assigns a root screen to a top-level group. Descendants inherit the root group.
- `parentId` nests a screen beneath another screen and may be used to create trees of any depth.
- `order` is an optional integer used to order roots or siblings. Manifest order is the stable fallback.
- Parent references must exist and cannot contain self-references or cycles.
- A child may omit `group` or repeat its root group, but it cannot declare a conflicting group.

Groups are sorted alphabetically, with ungrouped roots last. The visual editor exposes parent, group, and sibling-order controls in the screen inspector.

Paths are relative to the project root, use `/`, and cannot contain `..`.

## Component documents

One component document owns the component's visual metadata, state overrides, calls, and rendered Markdown documentation.

```md
---
visiflow: 2
kind: component
id: login-card
screenId: login
name: Login card
type: Authentication
tags: [login, identity]
defaultState: active
visual:
  kind: image
  x: 44
  y: 160
  width: 302
  height: 420
  src: assets/components/login-card.png
  imageFit: contain
  states:
    inactive:
      src: assets/components/login-card-inactive.png
      opacity: 0.6
calls:
  - id: authenticate
    name: Authenticate user
    direction: outgoing
    peer: { kind: system, id: identity }
    protocol: HTTPS
    method: POST
    endpoint: /oauth/token
    description: Establishes an application session.
    cadence:
      kind: user-event
      label: On submit
---

## Login

Collects credentials and starts the **authentication flow**.
```

`direction: outgoing` makes the component the request source. `direction: incoming` makes it the target. `peer` can reference a component, task, or system. Component-owned calls are assembled into the global runtime connection model; connections without a component remain in the project manifest.

## Background tasks

Tasks are first-class runtime nodes rendered below the phone. A task is either app-wide or assigned to one screen:

```yaml
tasks:
  - id: offers-refresh
    name: Refresh offers
    type: Data refresh
    description: Loads current offers.
    scope: { kind: screen, screenId: offers }
    trigger: { kind: lifecycle, label: When the offers screen opens }
    defaultState: active
```

The task owns its trigger. Connections involving a task therefore omit `cadence`. Use `protocol: Internal` for component-to-task or task-to-task control flow, and the real protocol for task-to-system requests. Direct connections without a task still require `cadence`.

Each scenario has both `componentStates` and `taskStates`. Missing entries fall back to the node's `defaultState`, then to `active`.

## Migrating v1 projects

VisiFlow v2 deliberately does not guess which cadence-bearing paths are background work:

1. Change `visiflow: 1` to `visiflow: 2` in the project manifest and every component document.
2. Add a `tasks` array to the project manifest.
3. Add `taskStates: {}` to every scenario.
4. For each background path, create a task and move its cadence into the task's `trigger`.
5. Split UI-driven work into an `Internal` component-to-task connection and a task-to-system connection. Remove `cadence` from both task-related connections.
6. Leave direct component/system and system/system paths intact with their existing cadence.

Opening v1 content returns an explicit migration error.

## Visuals and assets

Supported visual kinds are `hotspot`, `container`, `text`, `button`, `input`, `badge`, and `image`. A hotspot without its own `src` uses its rectangle to crop a preview from the parent screen screenshot.

The editor stores imported files under:

- `assets/screens/<screen-id>.<ext>`
- `assets/components/<component-id>.<ext>`
- `assets/components/<component-id>-active.<ext>`
- `assets/components/<component-id>-inactive.<ext>`

Relative files are preferred. `data:image/...` URLs remain valid when an image must be embedded directly into a state or component.

## Texture layers

Projects may define `textureLayers` in the project manifest. A texture layer is a reusable, positioned source image for editor-only crop authoring:

```yaml
textureLayers:
  - id: checkout-reference
    name: Checkout reference
    src: assets/textures/checkout-reference.png
    x: 40
    y: 40
    width: 900
    height: 1800
    order: 0
```

Components can retain an editable `visual.textureCrop` with a `textureId` and crop rectangle. On save, the editor bakes that crop into `visual.src` as an inline PNG data URL, so viewer rendering does not depend on the texture board.

## Loading

- The unified viewer/editor loads `demo/project.visiflow.md` read-only when hosted.
- Add `?project=path/to/project.visiflow.md` to load another hosted manifest.
- Local projects use **Open Folder** because browsers cannot silently enumerate local files.
- Folder projects can switch between View and Edit and share one in-memory configuration. Editing requires the File System Access API and saves valid changes at completed interaction boundaries.
- A folder containing zero or multiple `kind: project` manifests is rejected.

Local folder loading scans component documents recursively. Hosted manifests must list `componentFiles` explicitly because static HTTP hosting cannot enumerate directories.

## JSON Schemas

Run:

```bash
npm run schema
```

Generated schemas:

- `schemas/visiflow-frontmatter.schema.json`
- `schemas/visiflow-runtime.schema.json`

The front-matter schema validates the YAML metadata after parsing. Cross-file IDs and references are validated when the project is assembled.

For a YAML-aware editor, associate the front-matter schema with `*.visiflow.md` metadata using the editor's YAML schema configuration. The schema URL published with the build is `schemas/visiflow-frontmatter.schema.json`.
