# DaylightLab: Browser-Based Daylight Analysis Tool

## Project Overview

**DaylightLab** is a lightweight, browser-based daylight analysis tool designed for architects using ArchiCAD. It allows quick early-stage assessment of daylight levels in building designs by loading IFC files directly in the browser and calculating daylight factor distributions across room floor plates.

### Design Philosophy

- **Quick and simple** — Early-stage sketch tool, not compliance documentation
- **No server required** — All processing happens client-side in the browser
- **ArchiCAD-friendly** — Optimised for IFC exports from ArchiCAD
- **Educational** — Clear visualisation of how design decisions affect daylight
- **Open source** — Freely available, donation-supported model (similar to My-Turn)

### Target Users

- Architects checking daylight levels during design development
- Students learning about daylight design principles
- Planning consultants doing preliminary assessments

---

## Core Features (MVP)

1. **IFC File Loading**
   - Drag-and-drop IFC files exported from ArchiCAD
   - Parse and display 3D geometry in browser
   - Extract IfcSpace (room) geometry automatically

2. **Room Selection**
   - Click to select individual rooms/spaces
   - Display room properties (name, area, volume)
   - Highlight selected room in 3D view

3. **Window Detection**
   - Automatically identify windows belonging to selected room
   - Calculate glazed area and glazing-to-floor ratio
   - Display window orientation

4. **Daylight Factor Calculation**
   - Calculate Daylight Factor (DF) on a grid across the floor plate
   - Use simplified split-flux method for speed
   - Display results as colour-coded heatmap

5. **Results Visualisation**
   - 2D plan view with DF heatmap overlay
   - 3D view with room context
   - Statistics panel (average DF, min DF, % area above thresholds)

6. **Basic Reporting**
   - Export results as PNG image
   - Summary statistics display

---

## Technical Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| IFC Parsing | web-ifc | Parse IFC files in browser via WASM |
| 3D Rendering | Three.js | WebGL-based 3D visualisation |
| IFC + Three.js | @AECgeeks (ThatOpen) components | Bridge IFC data to Three.js geometry |
| Sun Position | SunCalc | Calculate sun azimuth/altitude |
| UI Framework | Vanilla JS + HTML/CSS | Keep dependencies minimal |
| Build Tool | Vite | Fast development server and bundling |

### Application Structure

```
daylightlab/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js                 # Application entry point
│   ├── styles.css              # Global styles
│   ├── components/
│   │   ├── Viewer.js           # Three.js scene management
│   │   ├── IFCLoader.js        # IFC file loading and parsing
│   │   ├── RoomSelector.js     # Room selection and highlighting
│   │   ├── WindowDetector.js   # Window geometry extraction
│   │   ├── UI.js               # User interface components
│   │   └── ResultsPanel.js     # Statistics and results display
│   ├── analysis/
│   │   ├── DaylightCalculator.js   # Main daylight calculation engine
│   │   ├── SkyComponent.js         # Sky component calculation
│   │   ├── ReflectedComponent.js   # Internally reflected component
│   │   ├── GridGenerator.js        # Analysis grid creation
│   │   └── SunPosition.js          # Sun position wrapper
│   ├── visualisation/
│   │   ├── Heatmap.js          # Daylight factor heatmap rendering
│   │   ├── Legend.js           # Colour scale legend
│   │   └── FloorPlanView.js    # 2D plan view rendering
│   └── utils/
│       ├── geometry.js         # Geometry helper functions
│       ├── materials.js        # Default material properties
│       └── constants.js        # Application constants
├── public/
│   ├── wasm/                   # web-ifc WASM files
│   └── sample-models/          # Example IFC files for testing
└── docs/
    ├── SPECIFICATION.md        # This file
    ├── ALGORITHMS.md           # Daylight calculation methodology
    └── USER_GUIDE.md           # End-user documentation
```

---

## Development Phases

### Phase 1: Foundation (IFC Viewer)

**Goal:** Load and display ArchiCAD IFC files in browser

**Tasks:**
1. Set up Vite project with Three.js
2. Integrate web-ifc for IFC parsing
3. Create basic 3D viewer with orbit controls
4. Implement drag-and-drop file loading
5. Display all IFC geometry with basic materials
6. Add simple UI shell (toolbar, panels)

**Acceptance Criteria:**
- Can load IFC file exported from ArchiCAD
- 3D model displays correctly with walls, floors, windows visible
- Can orbit, pan, zoom the view
- File loading shows progress indicator

**Key Files:**
- `src/main.js`
- `src/components/Viewer.js`
- `src/components/IFCLoader.js`

---

### Phase 2: Room Selection

**Goal:** Select and isolate individual rooms for analysis

**Tasks:**
1. Query IFC for all IfcSpace entities
2. Create selectable mesh for each room
3. Implement click-to-select with raycasting
4. Highlight selected room (transparent overlay)
5. Display room properties in side panel
6. Add room list for selection via UI

**Acceptance Criteria:**
- All rooms from IFC are listed in UI
- Clicking room in 3D or list selects it
- Selected room is visually highlighted
- Room name, area, height displayed

**Key Files:**
- `src/components/RoomSelector.js`
- `src/components/UI.js`

**IFC Entities to Query:**
```javascript
// IfcSpace properties needed:
// - GlobalId
// - Name
// - LongName
// - ObjectType
// - Geometry (for floor boundary)
// - Height / ElevationWithFlooring
```

---

### Phase 3: Window Detection

**Goal:** Identify windows associated with selected room

**Tasks:**
1. Query IFC for IfcWindow entities
2. Determine spatial relationship between windows and selected room
3. Extract window geometry (position, size, orientation)
4. Calculate glazed area (accounting for frame if data available)
5. Display window properties in UI
6. Visualise windows in 3D (highlight glazing)

**Acceptance Criteria:**
- Windows belonging to selected room are identified
- Window area, orientation displayed
- Glazing-to-floor ratio calculated
- Windows highlighted in 3D view

**Key Files:**
- `src/components/WindowDetector.js`

**Technical Notes:**
- Windows may not be directly contained in IfcSpace
- Use geometric proximity or IfcRelSpaceBoundary if available
- Fall back to bounding box intersection test

---

### Phase 4: Daylight Calculation Engine

**Goal:** Calculate daylight factor distribution across room floor

**Tasks:**
1. Generate analysis grid on room floor plane
2. Implement Sky Component (SC) calculation
3. Implement Internally Reflected Component (IRC) calculation
4. Combine components for total Daylight Factor
5. Store results in grid data structure
6. Add progress indicator for calculation

**Acceptance Criteria:**
- Grid covers room floor at configurable spacing (default 0.5m)
- DF calculated at each grid point
- Calculation completes in reasonable time (<5s for typical room)
- Results stored for visualisation

**Key Files:**
- `src/analysis/DaylightCalculator.js`
- `src/analysis/SkyComponent.js`
- `src/analysis/ReflectedComponent.js`
- `src/analysis/GridGenerator.js`

**Algorithm Overview:**

See ALGORITHMS.md for detailed methodology. Summary:

```
Daylight Factor (DF) = Sky Component (SC) + Internally Reflected Component (IRC)

SC = Sky luminance visible through windows from each grid point
IRC = Light reflected from internal room surfaces

Simplified calculation:
SC ≈ (Visible sky angle / hemisphere) × glazing transmittance × maintenance factor
IRC ≈ (0.85 × W × T × R) / (A × (1 - R²))

Where:
W = total window area
T = glazing transmittance (default 0.7)
R = average surface reflectance (default 0.5)
A = total internal surface area
```

---

### Phase 5: Visualisation

**Goal:** Display daylight results as intuitive heatmap

**Tasks:**
1. Create colour scale (red-yellow-green or similar)
2. Render heatmap on floor plane in 3D view
3. Create 2D plan view option
4. Add interactive legend with thresholds
5. Display statistics (average, min, max, % above 2%)
6. Add contour lines option

**Acceptance Criteria:**
- Heatmap clearly shows DF distribution
- Colour scale is intuitive (green = good daylight)
- Can toggle between 3D and 2D views
- Statistics panel shows key metrics
- Legend explains colour mapping

**Key Files:**
- `src/visualisation/Heatmap.js`
- `src/visualisation/Legend.js`
- `src/visualisation/FloorPlanView.js`
- `src/components/ResultsPanel.js`

**Colour Scale:**
```javascript
const DF_COLOUR_SCALE = [
  { threshold: 0, colour: '#1a1a2e' },    // Very dark blue (< 0.5%)
  { threshold: 0.5, colour: '#c23616' },  // Red (0.5-1%)
  { threshold: 1, colour: '#e58e26' },    // Orange (1-2%)
  { threshold: 2, colour: '#f6e58d' },    // Yellow (2-3%)
  { threshold: 3, colour: '#b8e994' },    // Light green (3-5%)
  { threshold: 5, colour: '#27ae60' },    // Green (>5%)
];
```

**Threshold References (UK):**
- < 2% — Inadequate, artificial lighting required
- 2-5% — Adequately lit
- > 5% — Well lit

---

### Phase 6: Polish and Export

**Goal:** Refine UI and add export capabilities

**Tasks:**
1. Add settings panel (grid spacing, reflectances, transmittance)
2. Implement PNG export of results view
3. Add project location input (lat/long for sun position)
4. Create simple summary report display
5. Add keyboard shortcuts
6. Mobile/responsive layout adjustments
7. Error handling and user feedback
8. Loading states and progress indicators

**Acceptance Criteria:**
- Settings can be adjusted and recalculated
- Can export current view as image
- Location affects sun position calculations
- UI is polished and intuitive
- Errors are handled gracefully with user feedback

---

## Future Enhancements (Post-MVP)

These features are out of scope for initial development but should be considered in architecture:

1. **Climate-Based Daylight Modelling**
   - Annual simulation using weather files
   - Spatial Daylight Autonomy (sDA) calculation
   - Useful Daylight Illuminance (UDI)

2. **Sun Path and Shadows**
   - Animated sun path diagram
   - Shadow studies at specific times

3. **External Obstructions**
   - Account for surrounding buildings
   - Site context from IFC or manual input

4. **Advanced Window Properties**
   - BSDF data for complex glazing
   - Shading device modelling

5. **Compliance Checking**
   - EN 17037 assessment
   - UK Approved Document O checks
   - BREEAM/LEED daylight credits

6. **Collaboration Features**
   - Shareable links to results
   - Cloud storage for projects

---

## Daylight Calculation Methodology

### Overview

The tool uses a simplified daylight factor calculation based on the BRE split-flux method. This trades some accuracy for speed, making it suitable for early-stage design assessment.

### Assumptions

1. **CIE Overcast Sky** — Standard overcast sky distribution (brightest at zenith)
2. **Diffuse Light Only** — Direct sunlight not considered in DF
3. **Simple Room Geometry** — Rectangular or near-rectangular rooms
4. **Uniform Surfaces** — Single reflectance value per surface type
5. **No External Obstructions** — Unobstructed sky view (can be refined later)

### Sky Component (SC) Calculation

For each grid point, calculate the solid angle of sky visible through each window:

```javascript
function calculateSkyComponent(gridPoint, windows, roomGeometry) {
  let totalSC = 0;
  
  for (const window of windows) {
    // Calculate solid angle subtended by window from grid point
    const solidAngle = calculateWindowSolidAngle(gridPoint, window);
    
    // Apply CIE overcast sky luminance distribution
    const skyLuminanceFactor = calculateCIEOvercastFactor(window.altitude);
    
    // Account for glazing transmittance and window position
    const SC = solidAngle * skyLuminanceFactor * window.transmittance;
    
    totalSC += SC;
  }
  
  return totalSC;
}
```

### Internally Reflected Component (IRC)

Simplified calculation based on room geometry and average reflectances:

```javascript
function calculateIRC(roomGeometry, windows, surfaceReflectances) {
  const W = windows.reduce((sum, w) => sum + w.area, 0);  // Total window area
  const T = 0.7;  // Glazing transmittance (default)
  const A = roomGeometry.totalSurfaceArea;
  const R = calculateAverageReflectance(surfaceReflectances);
  
  // BRE formula for IRC
  const IRC = (0.85 * W * T * R) / (A * (1 - R * R));
  
  return IRC;
}
```

### Default Material Properties

```javascript
const DEFAULT_REFLECTANCES = {
  ceiling: 0.8,     // White ceiling
  walls: 0.5,       // Light-coloured walls
  floor: 0.2,       // Carpet/wood floor
  external: 0.1,    // External ground/buildings
};

const DEFAULT_TRANSMITTANCE = 0.7;  // Double glazing
const MAINTENANCE_FACTOR = 0.9;     // Dirt/degradation allowance
```

### Grid Generation

```javascript
function generateAnalysisGrid(roomFloorPolygon, spacing = 0.5) {
  const bounds = calculateBoundingBox(roomFloorPolygon);
  const grid = [];
  
  // Offset from walls (typically 0.5m from perimeter)
  const WALL_OFFSET = 0.5;
  
  for (let x = bounds.minX + WALL_OFFSET; x <= bounds.maxX - WALL_OFFSET; x += spacing) {
    for (let y = bounds.minY + WALL_OFFSET; y <= bounds.maxY - WALL_OFFSET; y += spacing) {
      const point = { x, y, z: WORK_PLANE_HEIGHT };  // Typically 0.85m
      
      if (isPointInPolygon(point, roomFloorPolygon)) {
        grid.push(point);
      }
    }
  }
  
  return grid;
}
```

---

## IFC Data Extraction

### Required IFC Entities

| Entity | Data Needed | Purpose |
|--------|-------------|---------|
| IfcSpace | Geometry, Name, LongName, Height | Room boundaries and properties |
| IfcWindow | Geometry, Position, OverallWidth, OverallHeight | Aperture data |
| IfcDoor | Geometry (if glazed) | Additional apertures |
| IfcWall | Geometry | Room enclosure context |
| IfcSlab | Geometry | Floor/ceiling surfaces |
| IfcRelSpaceBoundary | Relationships | Link windows to spaces |

### ArchiCAD IFC Export Settings

Recommend the following translator settings for best results:

1. **Schema:** IFC4 or IFC2x3
2. **MVD:** Coordination View (Surface Geometry)
3. **Geometry:** Precise BREP or Extruded
4. **Include:** Zones/Spaces must be exported
5. **Properties:** Include base quantities

### Extracting Room Geometry

```javascript
async function extractRoomData(ifcApi, modelID) {
  const spaces = ifcApi.GetLineIDsWithType(modelID, IFCSPACE);
  const rooms = [];
  
  for (const spaceID of spaces) {
    const space = ifcApi.GetLine(modelID, spaceID);
    
    // Get geometric representation
    const geometry = await ifcApi.CreateIfcPropertySet(modelID, spaceID);
    
    rooms.push({
      id: spaceID,
      name: space.Name?.value || 'Unnamed',
      longName: space.LongName?.value || '',
      geometry: geometry,
      // Extract floor polygon from geometry
      floorPolygon: extractFloorPolygon(geometry),
      height: extractRoomHeight(space),
    });
  }
  
  return rooms;
}
```

---

## User Interface Specification

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TOOLBAR                                                        │
│  [Open IFC] [Select Room ▼] [Calculate] [Settings] [Export]     │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │  SIDE PANEL         │
│                                           │                     │
│                                           │  Room: Living Room  │
│                                           │  Area: 24.5 m²      │
│                                           │  Height: 2.7 m      │
│                                           │                     │
│          3D / 2D VIEWPORT                 │  ─────────────────  │
│                                           │  Windows: 2         │
│                                           │  Glazed Area: 4.2m² │
│                                           │  G/F Ratio: 17%     │
│                                           │                     │
│                                           │  ─────────────────  │
│                                           │  RESULTS            │
│                                           │  Avg DF: 2.4%       │
│                                           │  Min DF: 0.8%       │
│                                           │  >2% Area: 65%      │
│                                           │                     │
├───────────────────────────────────────────┤  [LEGEND]           │
│  STATUS BAR: Ready | Room selected | ...  │  ■ 5%+ Well lit     │
└───────────────────────────────────────────┴─────────────────────┘
```

### Interaction States

1. **Initial** — Empty viewport, "Drop IFC file here" message
2. **Loading** — Progress bar, "Loading model..."
3. **Model Loaded** — 3D view active, room list populated
4. **Room Selected** — Room highlighted, properties shown
5. **Calculating** — Progress indicator, "Calculating daylight..."
6. **Results** — Heatmap displayed, statistics shown

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| O | Open file dialog |
| R | Reset view |
| 2 | Switch to 2D plan view |
| 3 | Switch to 3D view |
| C | Calculate (when room selected) |
| Esc | Deselect room |

---

## Testing Strategy

### Unit Tests

- Grid generation with various room shapes
- Daylight factor calculation against known values
- Geometry helper functions

### Integration Tests

- Load sample IFC files
- Extract room and window data correctly
- End-to-end calculation produces reasonable results

### Test Models

Include sample IFC files in `/public/sample-models/`:

1. `simple-room.ifc` — Single rectangular room with one window
2. `two-rooms.ifc` — Two adjacent rooms, different orientations
3. `complex-room.ifc` — L-shaped room with multiple windows
4. `archicad-export.ifc` — Real ArchiCAD export for compatibility testing

### Validation

Compare results against:
- VELUX Daylight Visualizer (for same geometry)
- Manual calculations for simple rooms
- Published case studies with known DF values

---

## Performance Considerations

### Target Performance

- IFC file loading: < 10 seconds for typical residential model
- Room selection: < 100ms response
- DF calculation: < 5 seconds for typical room (500 grid points)
- UI interactions: 60 fps in 3D viewport

### Optimisation Strategies

1. **Web Workers** — Run calculations off main thread
2. **Progressive Loading** — Show geometry as it loads
3. **Level of Detail** — Simplify distant geometry
4. **Caching** — Store calculated results per room
5. **Instancing** — Use Three.js instancing for repeated elements

---

## Browser Compatibility

### Minimum Requirements

- Chrome 90+ / Firefox 88+ / Safari 14+ / Edge 90+
- WebGL 2.0 support
- WebAssembly support
- ES2020 JavaScript support

### Not Supported

- Internet Explorer (no WebAssembly)
- Mobile browsers (viewport too small, but may work)

---

## Deployment

### Build Process

```bash
npm run build    # Creates production bundle in /dist
```

### Hosting Options

- GitHub Pages (static hosting)
- Netlify / Vercel (static with CDN)
- Self-hosted on VPS

### Required Files

The `/dist` folder will contain:
- `index.html`
- `assets/` (bundled JS/CSS)
- `wasm/` (web-ifc WASM files)

**Important:** WASM files must be served with correct MIME type (`application/wasm`)

---

## Development Setup Instructions

### Prerequisites

- Node.js 18+
- npm or yarn

### Getting Started

```bash
# Clone repository
git clone [repo-url]
cd daylightlab

# Install dependencies
npm install

# Start development server
npm run dev

# Open browser at http://localhost:5173
```

### Key Development Commands

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Production build
npm run preview  # Preview production build locally
npm run test     # Run tests
npm run lint     # Check code style
```

---

## References and Resources

### Daylight Calculation

- BRE Digest 310: Estimating daylight in buildings
- CIBSE Lighting Guide LG10: Daylighting
- EN 17037:2018 Daylight in buildings
- Tregenza, P. & Wilson, M. (2011) Daylighting: Architecture and Lighting Design

### Technical Documentation

- web-ifc: https://github.com/ThatOpen/engine_web-ifc
- Three.js: https://threejs.org/docs/
- SunCalc: https://github.com/mourner/suncalc
- IFC Schema: https://standards.buildingsmart.org/IFC/

### Similar Tools (for reference)

- Andrew Marsh Dynamic Daylighting: https://andrewmarsh.com/software/daylight-box-web/
- VELUX Daylight Visualizer: https://www.velux.com/what-we-do/digital-tools/daylight-visualizer
- LightStanza: https://www.graphisoft.com/partner-solutions/lightstanza/

---

## Glossary

| Term | Definition |
|------|------------|
| Daylight Factor (DF) | Ratio of indoor to outdoor illuminance under overcast sky (%) |
| Sky Component (SC) | Direct daylight from visible sky |
| Internally Reflected Component (IRC) | Daylight reflected from room surfaces |
| Externally Reflected Component (ERC) | Light reflected from external surfaces (not included in MVP) |
| IfcSpace | IFC entity representing a room or zone |
| CIE Overcast Sky | Standard sky luminance distribution for daylight calculations |
| Glazing Transmittance | Fraction of light passing through glass (typically 0.6-0.8) |
| Work Plane | Height at which daylight is assessed (typically 0.85m desk height) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | Dec 2024 | Initial specification |

---

## Licence

MIT License — Free to use, modify, and distribute.

---

## Contact

[Your contact details / project repository URL]
