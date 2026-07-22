# VisiFlow

VisiFlow is a self-contained application request atlas. It reconstructs app screens from images and declarative UI regions, maps components to external systems, and documents protocols, endpoints, triggers, schedules, polling, and push behavior.

[Open VisiFlow on GitHub Pages](https://aurrix.github.io/visiflow/)

## Run and build

```bash
npm run dev
npm run verify
```

`npm run build` produces one portable file at `dist/index.html`. It can be opened directly with `file://` and does not require a web server.

## Supply production data

A complete, ready-to-customize configuration is available at [docs/visiflow-config.example.json](docs/visiflow-config.example.json). Copy its JSON into the production configuration block, then replace the example IDs, screens, components, systems, and connections with your project data.

Open `dist/index.html`, find the configuration block, and replace its contents:

```html
<script id="visiflow-config" type="application/json">
{
  "schemaVersion": 1,
  "app": {
    "id": "my-app",
    "name": "My App",
    "platform": "Android",
    "description": "Request map for My App",
    "device": "android",
    "initialScreenId": "home"
  },
  "screens": [{ "id": "home", "name": "Home", "width": 390, "height": 844 }],
  "components": [],
  "systems": [],
  "connections": [],
  "scenarios": [{ "id": "default", "name": "Default", "componentStates": {} }]
}
</script>
```

The block contains data, not executable JavaScript. If a JSON string contains `</script>`, write it as `<\/script>` so the browser does not end the block early.

## Configuration reference

- `app`: identity, description, arbitrary platform label, device preset (`ios`, `android`, `web`, `desktop`, or `custom`), initial screen, and optional accent color.
- `screens`: `id`, `name`, native viewport `width`/`height`, optional scrollable `contentHeight`, CSS `background` or `backgroundImage`, image sizing/position, and `showSystemUi`.
- `components`: screen assignment, metadata, tags, default state, and a visual definition.
- `systems`: external services with metadata, color/icon, and optional left/right placement.
- `connections`: source and target references, protocol, optional method and endpoint, description, and cadence.
- `scenarios`: named maps of component IDs to `active` or `inactive`, plus an optional screen to open.

Component visuals use design-space `x`, `y`, `width`, and `height` values. Supported kinds are `hotspot`, `container`, `text`, `button`, `input`, `badge`, and `image`. Common style properties include `background`, `color`, `borderColor`, `borderRadius`, `opacity`, and `text`. Put overrides under `states.active` or `states.inactive`.

At 100% zoom, the device is automatically fitted to the available map workspace. If components extend below the screen viewport, the app screen becomes scrollable automatically. Set `contentHeight` explicitly when matching a known long screenshot or design canvas.

### Screenshots and component images

Images can be embedded directly in the JSON as standard `data:image/<format>;base64,...` URLs. They remain entirely inline when using the live configuration editor or the generated single-file build.

Use a screen image as the app canvas while retaining interactive component hotspots:

```json
{
  "id": "checkout",
  "name": "Checkout",
  "width": 390,
  "height": 844,
  "contentHeight": 1400,
  "backgroundImage": "data:image/png;base64,REPLACE_WITH_SCREENSHOT_DATA",
  "backgroundSize": "100% auto",
  "backgroundPosition": "top center",
  "showSystemUi": false
}
```

Every visual kind can also contain an image layer, so cards and buttons can use real exported assets while retaining text, state, request, and selection behavior:

```json
{
  "kind": "button",
  "x": 24,
  "y": 520,
  "width": 342,
  "height": 56,
  "text": "Continue",
  "src": "data:image/png;base64,REPLACE_WITH_COMPONENT_IMAGE",
  "imageFit": "cover",
  "imagePosition": "center",
  "imageOpacity": 1,
  "states": {
    "inactive": {
      "src": "data:image/png;base64,REPLACE_WITH_DISABLED_IMAGE",
      "imageOpacity": 0.55
    }
  }
}
```

For image-only components, use `kind: "image"`. For a complete screenshot with clickable regions, use `kind: "hotspot"` components over the screen background.

### Component layout

Coordinates remain the default, but `visual.layout` can align components without manually calculating `x` values. Center a component horizontally while keeping its configured `y`, width, and height:

```json
"layout": { "horizontal": "center" }
```

Place multiple components on the same line by giving them the same row name. The row uses the lowest configured `y` value from its members:

```json
{
  "kind": "button",
  "x": 0,
  "y": 300,
  "width": 160,
  "height": 52,
  "layout": {
    "row": "account-actions",
    "order": 1,
    "justify": "center",
    "gap": 12
  }
}
```

Other row members only need the same `row` plus their `order`. `justify` accepts `start`, `center`, `end`, or `space-between`. Non-row horizontal alignment accepts `absolute`, `start`, `center`, or `end`. Existing configurations without `layout` keep their absolute positioning.

Connection endpoints have the shape `{ "kind": "component" | "system", "id": "..." }`. Cadence kinds are `user-event`, `lifecycle`, `scheduled`, `recurring`, `polling`, `push`, `continuous`, and `custom`; every cadence has a readable `label` and can include `intervalMs` or `cron`.

Images may use data URLs, relative URLs, or HTTPS URLs. Use data URLs inside the JSON when the final HTML must remain completely portable and offline. `imageFit` accepts `cover`, `contain`, or `fill`; `imagePosition` accepts a CSS object-position value, and `imageOpacity` ranges from `0` to `1`.

Files placed in `docs/assets/` can be referenced with project-relative paths such as `docs/assets/login_card.png`. Vite discovers these files during the build: development uses the local asset, while the production build converts it into an inlined URL inside `dist/index.html`. Rebuild after adding or changing an asset.

Invalid JSON and invalid references are shown as an in-app diagnostic report with exact property paths.
