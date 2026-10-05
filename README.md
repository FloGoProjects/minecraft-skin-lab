# Skin Lab – Minecraft-Skin-Editor

Ein Skin-Editor für **Minecraft Java und Bedrock** als **eine einzige HTML-Datei**: herunterladen, doppelklicken, malen.
Funktioniert offline, braucht keine Installation.

## Funktionen
- **3D-Figur** drehen und zoomen (Zoom zum Mauszeiger), direkt auf dem Modell malen
- **Untere und obere Schicht** getrennt bemalbar (Hut, Jacke, Ärmel, Hosenbeine)
- **64×64** (Java + Bedrock) oder **128×128** (nur Bedrock), Modell **Classic** oder **Slim**
- **Ebenen** wie in einem Bildprogramm: ein-/ausblenden, umbenennen, duplizieren, per Drag & Drop umsortieren
- **Teile speichern und laden**: Frisur, T-Shirt, Gürtel usw. als PNG mit eingebetteten Metadaten (Name, Kategorie, Modell);
  mehrere Teile auf einmal laden, das zuletzt geladene liegt oben
- Werkzeuge: Stift, Radierer, Pipette, Füllen, **Spiegeln links/rechts**, Rückgängig/Wiederholen
- **Lücken-Prüfung** vor dem Export: leere Pixel der unteren Schicht werden markiert und können mit einer Farbe gefüllt werden
- Projekte als `.skinproj` speichern, automatische Sicherung im Browser
- Hintergrund: selbst erzeugte Blockwelt (keine Mojang-Grafiken) oder ein eigenes Bild

## Benutzen
**Direkt im Browser:** https://flogoprojects.github.io/minecraft-skin-lab/

**Offline:** [`SkinEditor.html`](https://flogoprojects.github.io/minecraft-skin-lab/SkinEditor.html) per Rechtsklick
→ „Link speichern unter…“ herunterladen und doppelklicken. Die Datei enthält alles und läuft ohne Internet.
Den exportierten Skin lädst du wie gewohnt im Minecraft-Launcher bzw. im Bedrock-Character-Creator hoch.

| Taste | Funktion |
|---|---|
| B / E / I / G | Stift / Radierer / Pipette / Füllen |
| Alt gedrückt | Pipette vorübergehend |
| M | Spiegeln an/aus |
| O | untere ↔ obere Schicht |
| Strg+Z / Strg+Y | Rückgängig / Wiederholen |
| Strg+S | Projekt speichern |

## Entwickeln
Voraussetzung: Node.js 20+.

```bash
npm install
npm test          # Tests der Kernlogik (vitest)
npm run build     # erzeugt dist/SkinEditor.html
npm run serve     # liefert dist/ auf http://localhost:5178
```

Aufbau: `src/core/` enthält die DOM-freie Logik (UV-Layout, Ebenen, PNG-Metadaten …) und ist getestet,
`src/ui/` die 3D-Ansicht (three.js), `src/main.js` die Oberfläche. Details in `CLAUDE.md`.

---
Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.
