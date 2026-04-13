# Fantasy Roleplaying Games | frpg.games

System-agnostic, multiversal, modular VTT content creation tools.

## Overview

FRPG.games is a browser-based tool for creating 3D Virtual Tabletop (VTT) assets without a 3D renderer. It provides a Blender-inspired interface backed by:

- **SNG (Scriptable Network Graphics)** — programmatic 2D tile and isometric 3D cube design; outputs PNG and APNG
- **Prolog game logic engine** — evaluates game rules (modifiers, spell slots, attack rolls, etc.) in real time
- **Game system support** — D&D SRD 5.2.1 (CC BY 4.0), Pathfinder 2e (ORC), Black Flag RPG (CC BY 4.0)
- **Animation pipeline** — SNG frames → PNG → APNG via `apngasm` WebAssembly in a Cloudflare Worker
- **Browser extension** (Manifest V3) — persistent asset storage, Cloudflare Worker relay, keyboard shortcuts
- **Hex & polyhedron honeycombs** — hex grid and 3D polyhedra for non-square map layouts
- **Miniature asset system** — mini playables that understand their own rules and modifiers

## Structure

```
frpg.games/
├── manifest.json           # Browser extension (MV3)
├── src/
│   ├── background/         # Extension service worker
│   ├── content/            # Content script (frpg.games site bridge)
│   ├── popup/              # Extension popup UI
│   ├── editor/             # Main VTT asset editor (HTML/CSS/JS)
│   ├── core/
│   │   ├── sng/            # SNG engine, tile2d, cube3d, hex support
│   │   ├── animation/      # APNG assembly pipeline
│   │   └── prolog/         # Prolog logic engine (unification, backtracking)
│   ├── systems/            # Game system plugins
│   │   ├── srd521/         # D&D SRD 5.2.1 (CC BY 4.0)
│   │   ├── pathfinder/     # Pathfinder 2e (ORC License)
│   │   └── blackflag/      # Black Flag RPG (CC BY 4.0)
│   └── cloudflare/         # Cloudflare Worker (APNG assembly via apngasm WASM)
├── web/                    # Demo website (frpg.games)
└── tests/                  # Jest test suite
```

## Game System Licenses

| System | License | Publisher |
|--------|---------|-----------|
| D&D SRD 5.2.1 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Wizards of the Coast |
| Pathfinder 2e | [ORC License](https://paizo.com/orclicense) | Paizo Inc. |
| Black Flag RPG | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Kobold Press |

> This product is not affiliated with or endorsed by Wizards of the Coast, Paizo Inc., or Kobold Press.

## Quick Start

```bash
npm install
npm test          # Run the test suite
```

To load as a browser extension (Chrome/Firefox):
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

## Technology

- **Vanilla ES Modules** — no build step required in the browser
- **SNG Buffer** — pure-JS RGBA pixel buffer, renders to OffscreenCanvas → PNG
- **Prolog Engine** — unification-based logic with backtracking, built-ins (`is`, `assert`, `findall`, etc.)
- **APNG Assembly** — frames rendered by SNG, assembled by `apngasm` WASM in a Cloudflare Worker
- **Cloudflare Worker** — handles `POST /apng` requests, returns `image/apng` binary

## Contributing

PRs welcome for additional game systems (ORC, CC, or similarly permissive licenses only).
