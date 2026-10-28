# Lithobox Creator

Design a lithophane light box in the browser and download it ready to print.
Pick one of nine shapes, add photos from your device, set the sizes and
closures, and export print ready STL or 3MF files. Any size works, from a
small ornament to a 21 cm box.

**Live version:** https://lithobox.app

## Shapes

- **Box:** up to five pictures (four sides plus one on top), five lid closures,
  lamp seat, cable options, optional battery tray and base text.
- **Flat picture:** light box, open stand, plain picture with a hanging loop,
  or a slim frame with a groove for an LED strip.
- **Cylinder lamp:** one picture wrapped around a tube, optional top ring.
- **Arc:** one picture bent in a shallow curve.
- **Polygon lamp:** 3, 5, 6 or 8 sides, same lid closures as the box.
- **Lampshade:** cone or cylinder, hanging or standing.
- **Ball lamp:** a photo band around a ball, with an optional second photo on
  the back.
- **Ornament:** small flat picture cut to a circle, star, hexagon or heart,
  printing lying flat.
- **Heart:** flat picture with a heart outline and a flat bottom.

## Features

- Photo library with crop, tone, exposure and flips per side.
- Lamp preview lights every picture from inside.
- Brightness curve: the relief thickness follows the photo brightness, so mid
  tones and highlights keep more steps.
- Colour lithophanes: cyan, magenta and yellow layers behind a white relief.
  Flat pictures only, and it needs a printer with four filaments.
- Battery tray options for power banks, cable exits and base text.
- 3MF for Bambu Studio and OrcaSlicer with per object settings, plain 3MF and
  STL (one file per part, zipped).
- Project files (`.lithobox`) save photos and settings, and share links carry
  all settings in the URL.
- Five languages: English, German, French, Spanish, Italian.

Everything runs locally in the browser: no server, no upload, photos never
leave the device. The live site counts anonymous usage (visits, chosen shapes,
presets and download formats) with a self-hosted Umami: no cookies, no photos,
no settings.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # builds every test variant and checks the solids are watertight
npm run build    # static site in dist/
```

`EXPORT_DIR=/some/dir npm test` also writes the test variants as STL files.

## How it is put together

| Path | What it does |
|---|---|
| `src/core/` | Shared types, the parameter schema and the `ShapeDefinition` interface |
| `src/geometry/` | manifold-3d kernel (memory scopes, primitives) and the Web Worker that builds models |
| `src/shapes/` | One folder per shape. Register new shapes in `shapes/index.ts` |
| `src/shapes/common/` | Shared lid closures, lamp base, battery tray and outlines |
| `src/litho/` | Relief mesh, brightness curve, colour separation and image sampling |
| `src/export/` | STL, 3MF and zip writers, and the `.lithobox` project file |
| `src/ui/` | Settings panel (generated from the schema), picture library and the three.js viewer |
| `src/i18n/` | Translations. Add a language by dropping `xx.json` next to `locales/en.json` |

### Adding a shape

Write a module that exports a `ShapeDefinition` (`id`, parameter `groups`,
`build()`), add it to `src/shapes/index.ts` and add its texts under
`shape.<id>.*` in the locale files. `build()` returns the printable parts plus
`slots`, the places where picture panels go: the lithophane builder fills each
slot so the panels fit exactly.

## Deployment

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every push to `main`
(enable Pages with "GitHub Actions" as the source in the repository settings).

## Licence

The code is licensed under the GNU Affero General Public License v3.0 or later
(see `LICENSE`). The fonts bundled in `src/assets/fonts/` keep their own SIL
Open Font License: each licence file sits next to its font.