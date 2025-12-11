# Claude Code Instructions

## Project: DaylightLab

This document provides specific instructions for Claude Code to follow when building this project. Read this alongside `SPECIFICATION.md` and `ALGORITHMS.md`.

---

## Development Approach

### General Principles

1. **Build incrementally** — Complete each phase before moving to the next
2. **Test early** — Create simple test cases as you build
3. **Keep it simple** — Prioritise working code over perfection
4. **Document as you go** — Add JSDoc comments to functions
5. **Commit regularly** — Logical commits at each milestone

### Code Style

- Use ES6+ JavaScript (modules, async/await, arrow functions)
- Use JSDoc comments for all public functions
- Prefer `const` over `let`, avoid `var`
- Use descriptive variable names
- Keep functions small and focused
- Handle errors gracefully with try/catch

---

## Phase 1: Foundation

### Step 1.1: Project Setup

Create a new Vite project with vanilla JavaScript:

```bash
npm create vite@latest daylightlab -- --template vanilla
cd daylightlab
npm install
```

Install dependencies:

```bash
npm install three web-ifc suncalc
```

### Step 1.2: Basic File Structure

Create the directory structure as specified in SPECIFICATION.md:

```
src/
├── main.js
├── styles.css
├── components/
├── analysis/
├── visualisation/
└── utils/
```

### Step 1.3: Create Basic Viewer

**File: `src/components/Viewer.js`**

Create a Three.js viewer class that:
- Initialises a Three.js scene, camera, and renderer
- Adds orbit controls for navigation
- Includes ambient and directional lighting
- Has a ground plane for reference
- Handles window resize
- Provides methods to add/remove objects

Key methods:
```javascript
class Viewer {
  constructor(containerElement)
  init()
  animate()
  addObject(object)
  removeObject(object)
  fitCameraToObject(object)
  resetView()
  dispose()
}
```

### Step 1.4: Create IFC Loader

**File: `src/components/IFCLoader.js`**

Create an IFC loader that:
- Initialises web-ifc API
- Loads WASM files from correct path
- Accepts File object from drag-drop or file input
- Parses IFC and creates Three.js geometry
- Returns structured data about the model
- Emits progress events during loading

Key methods:
```javascript
class IFCLoader {
  constructor()
  async init()
  async loadFile(file)
  async loadFromURL(url)
  getModelData()
  dispose()
}
```

**Important:** web-ifc requires WASM files. Copy them to `public/wasm/`:
- web-ifc.wasm
- web-ifc-mt.wasm (optional, for multi-threading)

### Step 1.5: Basic UI Shell

**File: `src/components/UI.js`**

Create a basic UI with:
- Toolbar at top (empty buttons for now)
- Side panel on right (collapsible)
- Status bar at bottom
- Drop zone overlay for file loading

Use vanilla JS DOM manipulation. Keep CSS in `styles.css`.

### Step 1.6: Wire It Together

**File: `src/main.js`**

- Create Viewer instance
- Create IFCLoader instance
- Set up drag-drop event listeners
- Load file when dropped
- Display geometry in viewer

**Test:** Load a sample IFC file and verify it displays correctly.

---

## Phase 2: Room Selection

### Step 2.1: Extract Spaces from IFC

**File: `src/components/RoomSelector.js`**

Add functionality to:
- Query IFC model for all IfcSpace entities
- Extract properties (name, longName, area, height)
- Extract floor polygon geometry
- Store rooms in an array

### Step 2.2: Create Room List UI

Update `UI.js` to:
- Display list of rooms in side panel
- Show room name and area
- Highlight on hover
- Select on click

### Step 2.3: Implement Room Selection

In `RoomSelector.js`:
- Create transparent mesh for each room
- Implement raycasting for click selection
- Highlight selected room (change material)
- Emit 'roomSelected' event with room data

### Step 2.4: Display Room Properties

When room is selected, show in side panel:
- Name / LongName
- Floor area (m²)
- Height (m)
- Volume (m³)
- Perimeter (m)

**Test:** Load IFC, click a room, verify properties display correctly.

---

## Phase 3: Window Detection

### Step 3.1: Extract Windows from IFC

**File: `src/components/WindowDetector.js`**

- Query IFC for IfcWindow entities
- Extract geometry (position, size, normal)
- Extract properties (name, type)
- Calculate glazed area

### Step 3.2: Associate Windows with Rooms

Implement `findRoomWindows()` function that:
- Takes selected room and all windows
- Returns windows that belong to room
- Use bounding box proximity check
- Fall back to IfcRelSpaceBoundary if available

### Step 3.3: Display Window Information

When room is selected, show windows in side panel:
- Number of windows
- Total glazed area (m²)
- Glazing-to-floor ratio (%)
- Orientation(s)

### Step 3.4: Highlight Windows

When room is selected:
- Highlight windows in that room (blue tint)
- Draw window normal vectors (optional, for debugging)

**Test:** Select room, verify correct windows are identified and displayed.

---

## Phase 4: Daylight Calculation

### Step 4.1: Grid Generator

**File: `src/analysis/GridGenerator.js`**

Implement `generateGrid()` function:
- Input: room floor polygon, options (spacing, height, offset)
- Output: array of grid points
- Use point-in-polygon test
- Apply wall offset

### Step 4.2: Sky Component Calculator

**File: `src/analysis/SkyComponent.js`**

Implement `calculateSkyComponent()`:
- Input: grid point, windows array
- Output: SC value (percentage)
- Use simplified solid angle method from ALGORITHMS.md

Start simple:
1. First, just calculate based on window area ratio
2. Then add distance falloff
3. Finally add proper solid angle calculation

### Step 4.3: IRC Calculator

**File: `src/analysis/ReflectedComponent.js`**

Implement `calculateIRC()`:
- Input: room geometry, windows, surface reflectances
- Output: IRC value (percentage)
- Use BRE formula from ALGORITHMS.md

### Step 4.4: Main Calculator

**File: `src/analysis/DaylightCalculator.js`**

Orchestrate the calculation:
```javascript
class DaylightCalculator {
  constructor(room, windows, options)
  
  async calculate() {
    // 1. Generate grid
    // 2. For each point, calculate SC
    // 3. Calculate IRC (once for room)
    // 4. Combine: DF = SC + IRC
    // 5. Return results
  }
  
  getStatistics()
}
```

Use Web Worker if possible to avoid blocking UI.

### Step 4.5: Add Calculate Button

- Add "Calculate" button to toolbar
- Disable until room is selected
- Show progress during calculation
- Store results for visualisation

**Test:** Select room, click calculate, verify reasonable DF values.

---

## Phase 5: Visualisation

### Step 5.1: Heatmap Renderer

**File: `src/visualisation/Heatmap.js`**

Implement `createHeatmap()`:
- Input: calculated grid results
- Output: Three.js mesh
- Use vertex colours for smooth gradient
- Position at work plane height + small offset

### Step 5.2: Colour Legend

**File: `src/visualisation/Legend.js`**

Create legend component:
- Vertical colour gradient
- Tick marks at thresholds (1%, 2%, 5%)
- Labels with percentage values
- Position fixed in corner of viewport

### Step 5.3: Results Panel

**File: `src/components/ResultsPanel.js`**

Display statistics:
- Average DF
- Min DF
- Max DF
- % area above 2%
- % area above 5%
- Uniformity ratio

Use colour coding (red/amber/green) for values.

### Step 5.4: 2D Plan View

**File: `src/visualisation/FloorPlanView.js`**

Add option to switch to orthographic top-down view:
- Set camera to look straight down
- Disable orbit controls vertical rotation
- Add room outline
- Add window positions
- Add north arrow

**Test:** Calculate daylight, verify heatmap displays correctly in both views.

---

## Phase 6: Polish

### Step 6.1: Settings Panel

Add settings dialog with:
- Grid spacing (0.25m / 0.5m / 1.0m)
- Work plane height (default 0.85m)
- Glazing transmittance (default 0.7)
- Surface reflectances (ceiling, walls, floor)

Store settings in localStorage.

### Step 6.2: Export Function

Add "Export" button that:
- Captures current viewport as PNG
- Downloads image with timestamp filename
- Optionally overlays statistics text

Use `renderer.domElement.toDataURL()`.

### Step 6.3: Location Input

Add location input (lat/long):
- Text inputs or map picker
- Default to UK (52°N, 0°W)
- Store in localStorage
- (For future sun position features)

### Step 6.4: Keyboard Shortcuts

Implement shortcuts as per SPECIFICATION.md:
- O: Open file
- R: Reset view
- 2: 2D view
- 3: 3D view
- C: Calculate
- Esc: Deselect

### Step 6.5: Error Handling

Add error handling for:
- Invalid IFC file
- IFC with no spaces
- Calculation errors
- WebGL not supported

Show user-friendly error messages.

### Step 6.6: Loading States

Add visual feedback:
- File loading progress bar
- "Processing..." overlay during parsing
- "Calculating..." with percentage during analysis
- Skeleton UI while loading

---

## Testing

### Manual Test Cases

1. **Simple room** — Single rectangular room, one window
2. **Multi-window** — Room with multiple windows on different walls
3. **Large room** — Performance test with fine grid
4. **No windows** — Room with no windows (should show IRC only)
5. **Complex shape** — L-shaped or irregular room

### Sample IFC Files

Create or find test IFC files. If needed, create simple geometry in ArchiCAD or use online IFC samples.

Place in `public/sample-models/`.

---

## Deployment

### Build for Production

```bash
npm run build
```

### Verify WASM Loading

Ensure WASM files are copied to dist and served with correct MIME type.

### Test Production Build

```bash
npm run preview
```

---

## Common Issues and Solutions

### WASM Loading Fails

- Check file paths in IFCLoader
- Ensure WASM files are in public folder
- Check browser console for CORS errors

### IFC Parsing Errors

- Some IFC features may not be supported
- Try different IFC schema (IFC2x3 vs IFC4)
- Check web-ifc GitHub issues

### Performance Issues

- Reduce grid density for large rooms
- Use Web Worker for calculations
- Simplify geometry for display

### Three.js Coordinate System

- IFC uses different axis conventions
- May need to rotate model on import
- Y-up vs Z-up differences

---

## Resources

- Three.js docs: https://threejs.org/docs/
- web-ifc examples: https://github.com/ThatOpen/engine_web-ifc/tree/main/examples
- IFC specification: https://standards.buildingsmart.org/IFC/

---

## Checklist

### Phase 1
- [ ] Vite project created
- [ ] Dependencies installed
- [ ] Basic viewer working
- [ ] IFC file loads and displays
- [ ] Drag-drop working

### Phase 2
- [ ] Rooms extracted from IFC
- [ ] Room list displayed in UI
- [ ] Room selection working
- [ ] Room properties displayed

### Phase 3
- [ ] Windows extracted from IFC
- [ ] Windows associated with rooms
- [ ] Window info displayed
- [ ] Windows highlighted

### Phase 4
- [ ] Grid generated correctly
- [ ] Sky Component calculated
- [ ] IRC calculated
- [ ] Total DF calculated
- [ ] Progress indicator working

### Phase 5
- [ ] Heatmap displays correctly
- [ ] Colour scale correct
- [ ] Legend visible
- [ ] Statistics displayed
- [ ] 2D view working

### Phase 6
- [ ] Settings panel working
- [ ] Export working
- [ ] Keyboard shortcuts working
- [ ] Error handling complete
- [ ] Loading states complete

---

## Notes for Claude Code

1. **Start with Phase 1** — Get the basics working before adding complexity

2. **Test frequently** — After each significant change, test in browser

3. **Use console.log** — Debug values during development, remove later

4. **Keep state simple** — Don't over-engineer state management

5. **Reference the algorithms** — ALGORITHMS.md has the math you need

6. **Ask for sample IFC** — If no test files available, ask user to provide one

7. **Iterate** — It's okay to refactor as you learn more about the problem

8. **Document blockers** — If something isn't working, document what you tried

Good luck! This is an ambitious but achievable project.
