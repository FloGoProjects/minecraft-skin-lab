# Skin Lab – Minecraft-Skin-Editor (Java + Bedrock)

Ein-Datei-HTML-Editor: 3D-Figur bemalen (untere/obere Schicht), Ebenen-Stapel, Teile als PNG speichern/laden.
Anforderungen: `requirements.json` (IDs D/F/L/P/S/T/V). Skin-Format-Wissen: `../bedrock-docs/skins.md`.

## Befehle
- `npm test` – vitest (Kernlogik, `tests/`)
- `npm run build` – bündelt alles nach **`dist/SkinEditor.html`** (offline, three.js eingebettet). Das ist die Datei zum Weitergeben.
- `npm run serve` – liefert dist/ auf http://localhost:5178 (Browser-Pane: launch-Name `skinlab` in `../.claude/launch.json`)

## Datei-Landkarte
| Pfad | Zweck |
|---|---|
| `src/core/layout.js` | UV-Layout, Flächen-3D-Lage, Pixel→Teil |
| `src/core/layers.js` | Ebenen, Zusammenführen, Füllen |
| `src/core/history.js` | Undo/Redo-Stapel |
| `src/core/mirror.js` | Spiegelpixel links↔rechts |
| `src/core/scale.js` | 64↔128 umrechnen |
| `src/core/gaps.js` | Lücken, Füll-Ebene, Arm-/Slim-Erkennung |
| `src/core/pngmeta.js` | tEXt-Metadaten in PNG |
| `src/core/project.js` | .skinproj (de)serialisieren |
| `src/ui/viewer.js` | three.js-Figur, Kamera, Picking |
| `src/ui/world.js` | Blockwelt-Hintergrund, Holo-Plattform |
| `src/ui/icons.js` | Inline-SVG-Icons |
| `src/main.js` | App-Zustand, UI-Verdrahtung |
| `src/index.html`, `src/style.css` | Gerüst + Look (Platzhalter `<!--STYLE-->`/`<!--SCRIPT-->`) |
| `scripts/build.mjs`, `scripts/serve.mjs` | Build / Testserver |

## Konventionen
- Kernlogik (`src/core`) ist DOM-frei und wird test-first gebaut; UI nur im Browser prüfen.
- Ebenen-Pixel sind **Copy-on-Write**: vor jeder Pixeländerung `commit()` und dann `layer.pixels = layer.pixels.slice()`, sonst verändern sich Undo-Schnappschüsse mit.
- Alpha ist immer 0 oder 255 (`thresholdAlpha` beim Import).
- Ebenen-Array: Index 0 = unten. Die UI zeigt es umgekehrt an (oben = vorne).
- Teil-PNG-Metadaten: tEXt-Key `MCSkinPart`, JSON `{app,version,name,category,model,resolution}`.
- Keine Mojang-Assets einbetten (Datei wird weitergegeben).
- Debug im Browser: `window.__skinlab` (state, viewer, importPngs, pixelsToPng, undo, redo …).
- Texturgröße wechselt mit der Auflösung (512 ↔ 1024 px). three.js/WebGL2 reserviert Texturspeicher fest → `Viewer.textureChanged()` legt die Textur bei Größenwechsel neu an. Nicht durch bloßes `needsUpdate` ersetzen.
- Neu-Dialog = Live-Vorschau über `showPreviewProject()`; währenddessen `previewing = true` (kein Autosave), Abbrechen stellt den alten Zustand wieder her.
