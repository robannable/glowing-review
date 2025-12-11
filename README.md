# DaylightLab

A lightweight, browser-based daylight analysis tool for architects.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)

## Overview

DaylightLab allows architects to quickly assess daylight levels in building designs by loading IFC files directly in the browser. It calculates daylight factor distributions across room floor plates and displays results as intuitive heatmaps.

**Key Features:**
- 🏠 Load IFC files exported from ArchiCAD (and other BIM software)
- 🖱️ Select rooms to analyse
- 🪟 Automatic window detection
- 📊 Daylight factor calculation
- 🎨 Visual heatmap display
- 📈 Statistics and threshold compliance

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

## Documentation

- [Specification](./docs/SPECIFICATION.md) — Full project specification
- [Algorithms](./docs/ALGORITHMS.md) — Daylight calculation methodology
- [User Guide](./docs/USER_GUIDE.md) — How to use the tool

## Development

See [CLAUDE_INSTRUCTIONS.md](./docs/CLAUDE_INSTRUCTIONS.md) for development guidance.

### Project Structure

```
daylightlab/
├── src/
│   ├── main.js              # Entry point
│   ├── components/          # UI and scene components
│   ├── analysis/            # Daylight calculations
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
- **SunCalc** — Sun position calculations
- **Vite** — Build tool

## Limitations

This is an early-stage design tool, not for compliance documentation:

- Uses simplified daylight factor calculation (BRE method)
- Assumes CIE overcast sky
- Does not account for external obstructions
- Limited to diffuse light (no direct sun)

For detailed compliance calculations, use validated tools like VELUX Daylight Visualizer or Radiance.

## Contributing

Contributions welcome! Please read the specification documents before starting.

## License

MIT License — Free to use, modify, and distribute.

## Acknowledgements

- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) by That Open Company
- [Three.js](https://threejs.org/)
- [SunCalc](https://github.com/mourner/suncalc) by Vladimir Agafonkin
- Daylight calculation methods from BRE and CIBSE guidance
