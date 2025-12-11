# DaylightLab: Calculation Algorithms

This document provides detailed technical information on the daylight calculation algorithms used in DaylightLab.

---

## 1. Daylight Factor Overview

The **Daylight Factor (DF)** is defined as:

```
DF = (Ei / Eo) × 100%
```

Where:
- `Ei` = Illuminance at a point indoors (lux)
- `Eo` = Simultaneous illuminance outdoors from unobstructed sky (lux)

The DF is calculated under a **CIE Standard Overcast Sky**, which assumes:
- The sky is uniformly cloudy
- No direct sunlight
- Zenith is brightest (3× horizon luminance)

### Components of Daylight Factor

```
DF = SC + ERC + IRC
```

| Component | Description | Included in MVP |
|-----------|-------------|-----------------|
| SC | Sky Component — direct from visible sky | ✓ |
| ERC | Externally Reflected Component — from external surfaces | ✗ (future) |
| IRC | Internally Reflected Component — from room surfaces | ✓ (simplified) |

---

## 2. Sky Component (SC) Calculation

### 2.1 Theoretical Basis

The Sky Component represents daylight reaching a point directly from the visible portion of the sky through windows. Under a CIE Overcast Sky, the luminance at altitude angle θ above the horizon is:

```
L(θ) = Lz × (1 + 2 sin θ) / 3
```

Where `Lz` is the zenith luminance.

### 2.2 Simplified Method (MVP Implementation)

For speed, we use a simplified solid-angle approach:

```javascript
/**
 * Calculate Sky Component at a grid point
 * @param {Object} point - Grid point {x, y, z}
 * @param {Array} windows - Array of window objects
 * @returns {number} Sky Component as percentage
 */
function calculateSkyComponent(point, windows) {
  let totalSC = 0;
  
  for (const window of windows) {
    // Vector from point to window centre
    const toWindow = subtractVectors(window.centre, point);
    const distance = vectorLength(toWindow);
    
    // Check if window is visible from point (not blocked by walls)
    if (!isWindowVisible(point, window)) continue;
    
    // Calculate altitude angle to window centre
    const altitude = Math.asin(toWindow.z / distance);
    
    // Calculate solid angle subtended by window
    // Simplified: treat window as rectangle
    const solidAngle = calculateRectangleSolidAngle(
      point, 
      window.vertices,
      window.normal
    );
    
    // CIE overcast sky factor at this altitude
    const cieFactor = (1 + 2 * Math.sin(altitude)) / 3;
    
    // Cosine correction for window angle to point
    const cosineCorrection = Math.max(0, dotProduct(
      normalise(toWindow),
      window.normal
    ));
    
    // Sky Component contribution from this window
    const windowSC = (solidAngle / (2 * Math.PI)) * 
                     cieFactor * 
                     cosineCorrection *
                     window.transmittance *
                     MAINTENANCE_FACTOR;
    
    totalSC += windowSC * 100; // Convert to percentage
  }
  
  return totalSC;
}
```

### 2.3 Solid Angle Calculation

For a rectangular window, the solid angle from a point is calculated using:

```javascript
/**
 * Calculate solid angle subtended by a rectangle from a point
 * Uses the formula for solid angle of a polygon
 * @param {Object} point - View point
 * @param {Array} vertices - Window corner vertices (4 points)
 * @param {Object} normal - Window normal vector
 * @returns {number} Solid angle in steradians
 */
function calculateRectangleSolidAngle(point, vertices, normal) {
  // Transform vertices relative to view point
  const relativeVertices = vertices.map(v => subtractVectors(v, point));
  
  // Check if window faces towards the point
  const centroid = averageVectors(relativeVertices);
  if (dotProduct(centroid, normal) > 0) {
    return 0; // Window faces away
  }
  
  // Calculate solid angle using spherical excess formula
  // For a quadrilateral, sum of spherical angles - 2π
  let solidAngle = 0;
  const n = relativeVertices.length;
  
  for (let i = 0; i < n; i++) {
    const v1 = normalise(relativeVertices[i]);
    const v2 = normalise(relativeVertices[(i + 1) % n]);
    const v3 = normalise(relativeVertices[(i + 2) % n]);
    
    // Spherical angle at vertex
    const edge1 = crossProduct(v1, v2);
    const edge2 = crossProduct(v2, v3);
    
    const angle = Math.acos(
      dotProduct(normalise(edge1), normalise(edge2))
    );
    
    solidAngle += angle;
  }
  
  solidAngle -= (n - 2) * Math.PI;
  
  return Math.max(0, solidAngle);
}
```

### 2.4 Window Visibility Check

Determine if a window is visible from a grid point (not blocked by walls):

```javascript
/**
 * Check if window is visible from point
 * Simple approach: check if line from point to window centre
 * intersects any wall surfaces
 * @param {Object} point - Grid point
 * @param {Object} window - Window object
 * @param {Array} walls - Room wall geometry
 * @returns {boolean} True if visible
 */
function isWindowVisible(point, window, walls) {
  const ray = {
    origin: point,
    direction: normalise(subtractVectors(window.centre, point))
  };
  
  const distanceToWindow = vectorLength(
    subtractVectors(window.centre, point)
  );
  
  for (const wall of walls) {
    // Skip the wall containing this window
    if (wall.containsWindow(window)) continue;
    
    const intersection = rayPlaneIntersection(ray, wall.plane);
    
    if (intersection && intersection.distance < distanceToWindow - 0.01) {
      // Check if intersection point is within wall bounds
      if (isPointInPolygon(intersection.point, wall.polygon)) {
        return false; // Blocked
      }
    }
  }
  
  return true;
}
```

---

## 3. Internally Reflected Component (IRC)

### 3.1 BRE Split-Flux Method

The IRC accounts for light that enters through windows and reflects off internal surfaces before reaching the grid point. The simplified BRE formula:

```
IRC = 0.85 × W × T × R / (A × (1 - R²))
```

Where:
- `W` = Total window area (m²)
- `T` = Glazing transmittance (typically 0.6-0.8)
- `R` = Average surface reflectance (weighted by area)
- `A` = Total internal surface area (m²)
- `0.85` = Empirical correction factor

### 3.2 Implementation

```javascript
/**
 * Calculate Internally Reflected Component
 * Uses BRE split-flux method
 * @param {Object} room - Room geometry and properties
 * @param {Array} windows - Window objects
 * @param {Object} reflectances - Surface reflectance values
 * @returns {number} IRC as percentage (uniform across room)
 */
function calculateIRC(room, windows, reflectances) {
  // Total window area
  const W = windows.reduce((sum, w) => sum + w.area, 0);
  
  // Average transmittance
  const T = windows.reduce((sum, w) => sum + w.transmittance * w.area, 0) / W;
  
  // Calculate room surface areas
  const floorArea = room.floorArea;
  const ceilingArea = room.floorArea; // Assume same as floor
  const wallArea = room.perimeter * room.height;
  const totalArea = floorArea + ceilingArea + wallArea;
  
  // Area-weighted average reflectance
  const R = (
    floorArea * reflectances.floor +
    ceilingArea * reflectances.ceiling +
    wallArea * reflectances.walls
  ) / totalArea;
  
  // BRE formula
  const IRC = (0.85 * W * T * R) / (totalArea * (1 - R * R));
  
  return IRC * 100; // Convert to percentage
}
```

### 3.3 Refined IRC (Optional Enhancement)

For more accuracy, IRC can vary across the room (higher near windows):

```javascript
/**
 * Calculate position-dependent IRC
 * Higher values near windows where first-bounce light is stronger
 * @param {Object} point - Grid point
 * @param {number} baseIRC - Base IRC from BRE formula
 * @param {Array} windows - Window objects
 * @param {Object} room - Room geometry
 * @returns {number} Adjusted IRC
 */
function calculatePositionalIRC(point, baseIRC, windows, room) {
  // Calculate average distance from point to all windows
  let avgDistance = 0;
  let totalWindowArea = 0;
  
  for (const window of windows) {
    const distance = vectorLength(subtractVectors(point, window.centre));
    avgDistance += distance * window.area;
    totalWindowArea += window.area;
  }
  avgDistance /= totalWindowArea;
  
  // Room diagonal as reference
  const roomDiagonal = Math.sqrt(
    room.width ** 2 + room.depth ** 2
  );
  
  // Boost factor for points near windows (1.0 to 1.5)
  const proximityFactor = 1 + 0.5 * (1 - avgDistance / roomDiagonal);
  
  return baseIRC * proximityFactor;
}
```

---

## 4. Grid Generation

### 4.1 Standard Grid

Generate analysis points on the work plane within the room boundary:

```javascript
/**
 * Generate analysis grid for room
 * @param {Array} floorPolygon - Room floor boundary vertices
 * @param {Object} options - Grid options
 * @returns {Array} Array of grid points
 */
function generateGrid(floorPolygon, options = {}) {
  const {
    spacing = 0.5,           // Grid spacing in metres
    workPlaneHeight = 0.85,  // Height above floor
    wallOffset = 0.5,        // Offset from walls
  } = options;
  
  const bounds = calculateBoundingBox(floorPolygon);
  const grid = [];
  
  // Inset the polygon to create wall offset
  const insetPolygon = offsetPolygon(floorPolygon, -wallOffset);
  
  // Generate regular grid within bounds
  for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
    for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
      const point = { x, y, z: workPlaneHeight };
      
      // Check if point is inside the (inset) room boundary
      if (isPointInPolygon2D(point, insetPolygon)) {
        grid.push({
          position: point,
          daylightFactor: null, // To be calculated
          skyComponent: null,
          irc: null,
        });
      }
    }
  }
  
  return grid;
}
```

### 4.2 Point-in-Polygon Test

```javascript
/**
 * Test if point is inside polygon (2D)
 * Uses ray casting algorithm
 * @param {Object} point - Point to test {x, y}
 * @param {Array} polygon - Polygon vertices [{x, y}, ...]
 * @returns {boolean} True if inside
 */
function isPointInPolygon2D(point, polygon) {
  let inside = false;
  const n = polygon.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}
```

---

## 5. Window Data Extraction from IFC

### 5.1 Window Properties Needed

```javascript
/**
 * Window object structure
 */
const windowSchema = {
  id: 'string',              // IFC GlobalId
  name: 'string',            // Window name/reference
  
  // Geometry
  centre: { x: 0, y: 0, z: 0 },  // Centre point in world coords
  vertices: [],                   // 4 corner points
  normal: { x: 0, y: 0, z: 0 },  // Outward normal
  width: 0,                       // Overall width (m)
  height: 0,                      // Overall height (m)
  area: 0,                        // Glazed area (m²)
  sillHeight: 0,                  // Height from floor to sill
  
  // Properties
  transmittance: 0.7,        // Light transmittance
  frameRatio: 0.15,          // Frame to total area ratio
  orientation: 'N',          // Cardinal direction
  
  // Relationships
  wallId: 'string',          // Parent wall IFC id
  spaceId: 'string',         // Related space (if available)
};
```

### 5.2 Extracting Windows from IFC

```javascript
/**
 * Extract window data from IFC model
 * @param {Object} ifcApi - web-ifc API instance
 * @param {number} modelID - Model identifier
 * @returns {Array} Array of window objects
 */
async function extractWindows(ifcApi, modelID) {
  const windowIDs = ifcApi.GetLineIDsWithType(modelID, IFCWINDOW);
  const windows = [];
  
  for (const id of windowIDs) {
    const ifcWindow = ifcApi.GetLine(modelID, id);
    
    // Get placement and geometry
    const placement = await getLocalPlacement(ifcApi, modelID, ifcWindow);
    const geometry = await getWindowGeometry(ifcApi, modelID, ifcWindow);
    
    // Get properties
    const overallWidth = ifcWindow.OverallWidth?.value || 1.0;
    const overallHeight = ifcWindow.OverallHeight?.value || 1.2;
    
    // Calculate glazed area (subtract frame)
    const frameRatio = 0.15; // Default assumption
    const glazedArea = overallWidth * overallHeight * (1 - frameRatio);
    
    // Determine orientation from placement
    const normal = extractWindowNormal(placement);
    const orientation = normalToCardinal(normal);
    
    windows.push({
      id: ifcWindow.GlobalId?.value,
      name: ifcWindow.Name?.value || 'Window',
      centre: placement.location,
      vertices: calculateWindowVertices(placement, overallWidth, overallHeight),
      normal: normal,
      width: overallWidth,
      height: overallHeight,
      area: glazedArea,
      sillHeight: placement.location.z - (overallHeight / 2),
      transmittance: 0.7, // Default - could be extracted from IfcPropertySet
      frameRatio: frameRatio,
      orientation: orientation,
    });
  }
  
  return windows;
}
```

### 5.3 Associating Windows with Rooms

IFC doesn't always have explicit window-to-space relationships. Use geometric proximity:

```javascript
/**
 * Find windows belonging to a room
 * @param {Object} room - Room object with geometry
 * @param {Array} allWindows - All windows in model
 * @returns {Array} Windows associated with this room
 */
function findRoomWindows(room, allWindows) {
  const roomWindows = [];
  
  // Expand room bounds slightly to catch windows in walls
  const expandedBounds = expandBoundingBox(room.boundingBox, 0.5);
  
  for (const window of allWindows) {
    // Check if window centre is within expanded room bounds
    if (isPointInBox(window.centre, expandedBounds)) {
      // Additional check: window normal should point inward or outward
      // (not parallel to room's long axis)
      
      roomWindows.push(window);
    }
  }
  
  return roomWindows;
}

/**
 * Alternative: Use IfcRelSpaceBoundary if available
 */
async function findRoomWindowsFromRelationships(ifcApi, modelID, spaceId) {
  const boundaries = ifcApi.GetLineIDsWithType(modelID, IFCRELSPACEBOUNDARY);
  const windowIds = [];
  
  for (const boundaryId of boundaries) {
    const boundary = ifcApi.GetLine(modelID, boundaryId);
    
    if (boundary.RelatingSpace?.value === spaceId) {
      const element = boundary.RelatedBuildingElement;
      if (element?.type === 'IFCWINDOW') {
        windowIds.push(element.value);
      }
    }
  }
  
  return windowIds;
}
```

---

## 6. Room Geometry Extraction

### 6.1 Room Properties from IfcSpace

```javascript
/**
 * Extract room geometry from IfcSpace
 * @param {Object} ifcApi - web-ifc API instance
 * @param {number} modelID - Model identifier
 * @param {number} spaceId - IfcSpace express ID
 * @returns {Object} Room geometry object
 */
async function extractRoomGeometry(ifcApi, modelID, spaceId) {
  const space = ifcApi.GetLine(modelID, spaceId);
  
  // Get geometric representation
  const representation = space.Representation;
  let floorPolygon = null;
  let height = 2.7; // Default
  
  // Find the 'Body' or 'FootPrint' representation
  for (const rep of representation.Representations) {
    if (rep.RepresentationIdentifier === 'FootPrint') {
      floorPolygon = extractPolygonFromRepresentation(rep);
    } else if (rep.RepresentationIdentifier === 'Body') {
      // Extract from swept solid
      const result = extractFromSweptSolid(rep);
      floorPolygon = result.profile;
      height = result.depth;
    }
  }
  
  // Calculate derived properties
  const bounds = calculateBoundingBox(floorPolygon);
  const area = calculatePolygonArea(floorPolygon);
  const perimeter = calculatePolygonPerimeter(floorPolygon);
  
  return {
    id: space.GlobalId?.value,
    name: space.Name?.value || 'Room',
    longName: space.LongName?.value || '',
    
    floorPolygon: floorPolygon,
    height: height,
    floorArea: area,
    perimeter: perimeter,
    volume: area * height,
    
    boundingBox: bounds,
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxY - bounds.minY,
  };
}
```

---

## 7. Results Interpretation

### 7.1 UK Threshold Values

Based on CIBSE and BRE guidance:

| Average DF | Classification | Typical Use |
|------------|----------------|-------------|
| < 1% | Very dark | Storage only |
| 1-2% | Dark | Artificial light needed |
| 2-5% | Adequately lit | Offices, classrooms |
| 5-10% | Well lit | Studios, workshops |
| > 10% | Very bright | May need glare control |

### 7.2 Statistics Calculation

```javascript
/**
 * Calculate daylight statistics for room
 * @param {Array} grid - Calculated grid points
 * @returns {Object} Statistics object
 */
function calculateStatistics(grid) {
  const values = grid.map(p => p.daylightFactor).filter(v => v !== null);
  const n = values.length;
  
  if (n === 0) return null;
  
  // Sort for percentile calculations
  const sorted = [...values].sort((a, b) => a - b);
  
  // Basic statistics
  const sum = values.reduce((a, b) => a + b, 0);
  const average = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = sorted[Math.floor(n / 2)];
  
  // Threshold compliance
  const aboveThresholds = {
    above1: values.filter(v => v >= 1).length / n * 100,
    above2: values.filter(v => v >= 2).length / n * 100,
    above3: values.filter(v => v >= 3).length / n * 100,
    above5: values.filter(v => v >= 5).length / n * 100,
  };
  
  // Uniformity ratio (min/average)
  const uniformity = min / average;
  
  return {
    count: n,
    average: average,
    min: min,
    max: max,
    median: median,
    standardDeviation: calculateStdDev(values, average),
    uniformity: uniformity,
    ...aboveThresholds,
  };
}
```

---

## 8. Visualisation Mapping

### 8.1 Colour Scale

```javascript
/**
 * Map daylight factor to colour
 * Uses smooth gradient between threshold colours
 * @param {number} df - Daylight factor percentage
 * @returns {string} Hex colour code
 */
function daylightFactorToColour(df) {
  const colourStops = [
    { value: 0, colour: { r: 26, g: 26, b: 46 } },      // Dark blue
    { value: 0.5, colour: { r: 194, g: 54, b: 22 } },   // Dark red
    { value: 1, colour: { r: 230, g: 126, b: 34 } },    // Orange
    { value: 2, colour: { r: 241, g: 196, b: 15 } },    // Yellow
    { value: 3, colour: { r: 46, g: 204, b: 113 } },    // Green
    { value: 5, colour: { r: 39, g: 174, b: 96 } },     // Darker green
    { value: 10, colour: { r: 22, g: 160, b: 133 } },   // Teal
  ];
  
  // Find surrounding stops
  let lower = colourStops[0];
  let upper = colourStops[colourStops.length - 1];
  
  for (let i = 0; i < colourStops.length - 1; i++) {
    if (df >= colourStops[i].value && df < colourStops[i + 1].value) {
      lower = colourStops[i];
      upper = colourStops[i + 1];
      break;
    }
  }
  
  // Interpolate
  const t = (df - lower.value) / (upper.value - lower.value);
  const r = Math.round(lower.colour.r + t * (upper.colour.r - lower.colour.r));
  const g = Math.round(lower.colour.g + t * (upper.colour.g - lower.colour.g));
  const b = Math.round(lower.colour.b + t * (upper.colour.b - lower.colour.b));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
```

### 8.2 Heatmap Mesh Generation

```javascript
/**
 * Create Three.js mesh for heatmap visualisation
 * @param {Array} grid - Calculated grid points
 * @param {number} spacing - Grid spacing
 * @returns {THREE.Mesh} Heatmap mesh
 */
function createHeatmapMesh(grid, spacing) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colours = [];
  
  for (const point of grid) {
    if (point.daylightFactor === null) continue;
    
    // Create small quad at each grid point
    const halfSize = spacing * 0.45; // Slight gap between cells
    const z = point.position.z + 0.01; // Slightly above work plane
    
    // Two triangles for quad
    const quadVertices = [
      point.position.x - halfSize, point.position.y - halfSize, z,
      point.position.x + halfSize, point.position.y - halfSize, z,
      point.position.x + halfSize, point.position.y + halfSize, z,
      
      point.position.x - halfSize, point.position.y - halfSize, z,
      point.position.x + halfSize, point.position.y + halfSize, z,
      point.position.x - halfSize, point.position.y + halfSize, z,
    ];
    
    vertices.push(...quadVertices);
    
    // Colour for all 6 vertices
    const colour = new THREE.Color(daylightFactorToColour(point.daylightFactor));
    for (let i = 0; i < 6; i++) {
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  
  return new THREE.Mesh(geometry, material);
}
```

---

## 9. Validation

### 9.1 Test Cases

Simple rectangular room for validation:

| Room | Dimensions | Window | Expected DF |
|------|------------|--------|-------------|
| Test 1 | 4×4×2.7m | 2×1.5m, south wall | ~3-4% centre |
| Test 2 | 6×4×2.7m | 2×1.5m, south wall | ~2% at 4m depth |
| Test 3 | 4×4×2.7m | No windows | ~0.5% (IRC only) |

### 9.2 Reference Comparison

Compare results against VELUX Daylight Visualizer or manual BRE calculations for the same geometry to validate implementation.

---

## 10. Limitations and Future Improvements

### Current Limitations (MVP)

1. No external obstructions considered
2. Simplified IRC (uniform distribution)
3. No direct sunlight component
4. Limited material property extraction from IFC
5. Rectangular window assumption

### Potential Improvements

1. **Ray tracing for SC** — More accurate sky visibility
2. **Multi-bounce IRC** — Radiosity-based calculation
3. **Climate-based metrics** — Annual simulation with weather data
4. **Glare assessment** — Luminance calculations
5. **Parametric studies** — Optimisation suggestions
