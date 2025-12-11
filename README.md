# DaylightLab

A lightweight, browser-based daylight analysis tool for architects.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)

## Overview

DaylightLab allows architects to quickly assess daylight levels in building designs by loading IFC files directly in the browser. It calculates daylight factor distributions across room floor plates and displays results as intuitive heatmaps.

**Key Features:**
- Load IFC files exported from ArchiCAD (and other BIM software)
- Select rooms to analyse individually or batch analyze all rooms
- Automatic window detection
- Daylight factor calculation with Sky Component and Internally Reflected Component
- Visual heatmap display with solid/wireframe/hidden building toggle
- Section cuts to slice through multi-storey buildings
- BREEAM compliance checking with pass/marginal/fail status
- Window optimization recommendations
- Model comparison to track design iteration improvements
- Annotations for client presentations
- CSV and PDF report export

## Quick Start

```bash
# Clone the repository
git clone [repo-url]
cd daylightlab

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 and drag-drop an IFC file to begin.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| O | Open IFC file |
| C | Calculate (selected room) |
| A | Analyze all rooms |
| V | Toggle display mode (solid/wireframe/hidden) |
| S | Toggle section cut |
| N | Toggle annotation mode |
| 2 | 2D plan view |
| 3 | 3D perspective view |
| R | Reset camera view |
| Esc | Deselect room |

## Features

### Single Room Analysis
Select a room from the dropdown and click Calculate to see:
- Average, minimum, maximum daylight factor
- Uniformity ratio
- Percentage of area meeting thresholds (1%, 2%, 5%)
- Color-coded heatmap visualization

### Batch Analysis
Click "All Rooms" to analyze every room in the model and see:
- Comparison table with all rooms
- BREEAM compliance status per room
- Optimization recommendations (e.g., "Add 2.5m² glazing")
- Overall project statistics

### Export Options
- **CSV** — Spreadsheet with all room metrics for further analysis
- **PDF** — Professional report for client presentations
- **Image** — Screenshot of current view

### Section Cuts
Slice through the building model to view internal heatmaps:
- Press **S** or click the Section button to enable
- Choose axis: Horizontal (Y), Vertical X, or Vertical Z
- Use the slider to move the cutting plane through the model
- Helps visualize daylight distribution at different floor levels

### Model Comparison
Compare daylight performance between design iterations:
1. Load your baseline IFC model
2. Run "All Rooms" batch analysis to create the baseline
3. Click "Compare" and select a revised IFC file
4. View side-by-side metrics showing improvements/regressions
5. Per-room comparison with change indicators

### Annotations
Add notes to specific points on the model for presentations:
- Press **N** or click Annotate to enter annotation mode
- Click anywhere on the model to place a marker
- Enter your note text and choose a color
- Click existing annotations to delete them
- Markers appear as colored pins in 3D space

## Documentation

- [ArchiCAD Export Guide](./HOWTO_ARCHICAD_EXPORT.md) — How to export IFC correctly from ArchiCAD
- [Specification](./docs/SPECIFICATION.md) — Full project specification
- [Algorithms](./docs/ALGORITHMS.md) — Daylight calculation methodology

## Development

See [CLAUDE_INSTRUCTIONS.md](./docs/CLAUDE_INSTRUCTIONS.md) for development guidance.

### Project Structure

```
daylightlab/
├── src/
│   ├── main.js              # Entry point
│   ├── components/          # UI and scene components
│   ├── analysis/            # Daylight calculations
│   │   ├── DaylightCalculator.js
│   │   ├── SkyComponent.js
│   │   ├── ReflectedComponent.js
│   │   ├── GridGenerator.js
│   │   └── BatchAnalysis.js  # Multi-room analysis & exports
│   ├── visualisation/       # Heatmap rendering
│   └── utils/               # Helper functions
├── public/
│   ├── wasm/                # web-ifc WASM files
│   └── sample-models/       # Test IFC files
└── docs/                    # Documentation
```

### Tech Stack

- **Three.js** — 3D rendering
- **web-ifc** — IFC parsing
- **Vite** — Build tool

## Roadmap

### Planned Features

- [x] **Section Cuts** — Slice through the model to view heatmaps from different angles
- [x] **Comparison Mode** — Load two IFC versions side-by-side to compare design changes
- [x] **Annotations** — Add notes to specific points for client presentations

### Future Development

- [ ] **Spatial Daylight Autonomy (sDA)** — Annual metric showing % of space achieving 300 lux for 50% of occupied hours
- [ ] **Annual Sunlight Exposure (ASE)** — Glare risk metric
- [ ] **Useful Daylight Illuminance (UDI)** — Balance between too dark and too bright
- [ ] **External Obstructions** — Import surrounding buildings from IFC or simple box inputs
- [ ] **Horizon Shading** — Account for external obstructions blocking sky
- [ ] **Web Workers** — Move calculations off main thread for responsive UI
- [ ] **GPU Ray Tracing** — WebGPU for faster, more accurate sky visibility calculation

### Long-term Vision

- [ ] **Cloud Collaboration** — Share projects, team annotations
- [ ] **Design Optimization** — AI-suggested window placements to meet targets
- [ ] **Real-time Preview** — Update heatmap as you modify window sizes in ArchiCAD
- [ ] **BIM Write-back** — Export daylight data as IFC properties

## Limitations

This is an early-stage design tool, not for compliance documentation:

- Uses simplified daylight factor calculation (BRE split-flux method)
- Assumes CIE overcast sky
- Does not account for external obstructions (yet)
- Limited to diffuse light (no direct sun)

For detailed compliance calculations, use validated tools like VELUX Daylight Visualizer or Radiance.

## Contributing

Contributions welcome! Please read the specification documents before starting.

## License

MIT License — Free to use, modify, and distribute.

## Acknowledgements

- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) by That Open Company
- [Three.js](https://threejs.org/)
- Daylight calculation methods from BRE and CIBSE guidance
