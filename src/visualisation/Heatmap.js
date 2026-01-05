/**
 * Heatmap Renderer for DaylightLab
 * Creates Three.js meshes for visualizing daylight factor results
 */
import * as THREE from 'three';
import { daylightFactorToColor, createHeatmapMaterial } from '../utils/materials.js';

/**
 * Create a heatmap mesh from grid results
 * @param {Array} grid - Grid points with daylightFactor values
 * @param {number} spacing - Grid spacing in meters
 * @returns {THREE.Mesh} Heatmap mesh
 */
export function createHeatmapMesh(grid, spacing = 0.5) {
  if (!grid || grid.length === 0) {
    return null;
  }

  const validPoints = grid.filter(p => p.daylightFactor !== null && !isNaN(p.daylightFactor));

  if (validPoints.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];

  const halfSize = spacing * 0.4; // Gap between cells to prevent boundary overflow

  for (const point of validPoints) {
    const x = point.position.x;
    const y = point.position.y + 0.01; // Slightly above work plane
    const z = point.position.z;

    // Create quad (two triangles) for each grid point
    // Triangle 1
    vertices.push(
      x - halfSize, y, z - halfSize,
      x + halfSize, y, z - halfSize,
      x + halfSize, y, z + halfSize,
    );

    // Triangle 2
    vertices.push(
      x - halfSize, y, z - halfSize,
      x + halfSize, y, z + halfSize,
      x - halfSize, y, z + halfSize,
    );

    // Get color for this daylight factor
    const color = daylightFactorToColor(point.daylightFactor);

    // Apply color to all 6 vertices (2 triangles × 3 vertices)
    for (let i = 0; i < 6; i++) {
      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 3)
  );

  geometry.computeVertexNormals();

  const material = createHeatmapMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'heatmap';

  return mesh;
}

/**
 * Create interpolated heatmap mesh (smoother visualization)
 * Uses a plane geometry with interpolated colors
 * @param {Array} grid - Grid points with daylightFactor values
 * @param {Object} bounds - Bounding box of the room
 * @param {number} resolution - Number of interpolation points per axis
 * @returns {THREE.Mesh} Interpolated heatmap mesh
 */
export function createInterpolatedHeatmap(grid, bounds, resolution = 50) {
  if (!grid || grid.length === 0 || !bounds) {
    return null;
  }

  const validPoints = grid.filter(p => p.daylightFactor !== null && !isNaN(p.daylightFactor));

  if (validPoints.length === 0) {
    return null;
  }

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const geometry = new THREE.PlaneGeometry(width, depth, resolution - 1, resolution - 1);
  geometry.rotateX(-Math.PI / 2); // Make horizontal
  geometry.translate(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + 0.85 + 0.02), // Slightly above work plane
    (bounds.minZ + bounds.maxZ) / 2
  );

  const colors = [];
  const positions = geometry.attributes.position.array;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];

    // Interpolate daylight factor at this position
    const df = interpolateDaylightFactor(x, z, validPoints);
    const color = daylightFactorToColor(df);

    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'heatmap-interpolated';

  return mesh;
}

/**
 * Interpolate daylight factor at a point using inverse distance weighting
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {Array} points - Grid points with daylight factor values
 * @returns {number} Interpolated daylight factor
 */
function interpolateDaylightFactor(x, z, points) {
  const power = 2; // IDW power parameter
  let weightSum = 0;
  let valueSum = 0;

  for (const point of points) {
    const dx = x - point.position.x;
    const dz = z - point.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.001) {
      // Very close to a known point
      return point.daylightFactor;
    }

    const weight = 1 / Math.pow(dist, power);
    weightSum += weight;
    valueSum += weight * point.daylightFactor;
  }

  return weightSum > 0 ? valueSum / weightSum : 0;
}

/**
 * Create contour lines for daylight factor thresholds
 * @param {Array} grid - Grid points with daylightFactor values
 * @param {number} spacing - Grid spacing
 * @param {Array} thresholds - DF thresholds to draw contours at
 * @returns {THREE.Group} Group containing contour lines
 */
export function createContourLines(grid, spacing, thresholds = [1, 2, 5]) {
  const group = new THREE.Group();
  group.name = 'contours';

  // Simplified contour implementation
  // For a more accurate implementation, consider using marching squares

  const contourColors = {
    1: 0xe74c3c, // Red
    2: 0xf39c12, // Orange
    5: 0x27ae60, // Green
  };

  for (const threshold of thresholds) {
    const points = [];

    // Find points near the threshold
    for (const point of grid) {
      if (point.daylightFactor === null) continue;

      // Check if this point is near the threshold
      const diff = Math.abs(point.daylightFactor - threshold);
      if (diff < 0.3) {
        points.push(
          new THREE.Vector3(
            point.position.x,
            point.position.y + 0.02,
            point.position.z
          )
        );
      }
    }

    if (points.length > 0) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.PointsMaterial({
        color: contourColors[threshold] || 0xffffff,
        size: spacing * 0.3,
      });

      const contourPoints = new THREE.Points(geometry, material);
      contourPoints.name = `contour-${threshold}`;
      group.add(contourPoints);
    }
  }

  return group;
}

/**
 * Create room outline for 2D view
 * @param {Array} floorPolygon - Room floor polygon vertices
 * @param {number} height - Height above floor
 * @returns {THREE.Line} Room outline line
 */
export function createRoomOutline(floorPolygon, height = 0.86) {
  if (!floorPolygon || floorPolygon.length < 3) {
    return null;
  }

  const points = [];

  // Create closed loop
  for (const vertex of floorPolygon) {
    points.push(new THREE.Vector3(vertex.x, height, vertex.y));
  }
  // Close the loop
  points.push(new THREE.Vector3(floorPolygon[0].x, height, floorPolygon[0].y));

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 2,
  });

  const line = new THREE.Line(geometry, material);
  line.name = 'room-outline';

  return line;
}

/**
 * Create window indicators for 2D view
 * @param {Array} windows - Window objects
 * @param {number} height - Height above floor
 * @returns {THREE.Group} Group containing window indicators
 */
export function createWindowIndicators(windows, height = 0.86) {
  const group = new THREE.Group();
  group.name = 'window-indicators';

  for (const window of windows) {
    // Create a thick line representing the window
    const halfWidth = window.overallWidth / 2;
    const points = [];

    if (Math.abs(window.normal.x) > 0.5) {
      // Window on East/West wall
      points.push(
        new THREE.Vector3(window.centre.x, height, window.centre.z - halfWidth),
        new THREE.Vector3(window.centre.x, height, window.centre.z + halfWidth)
      );
    } else {
      // Window on North/South wall
      points.push(
        new THREE.Vector3(window.centre.x - halfWidth, height, window.centre.z),
        new THREE.Vector3(window.centre.x + halfWidth, height, window.centre.z)
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x3498db,
      linewidth: 4,
    });

    const line = new THREE.Line(geometry, material);
    line.name = `window-indicator-${window.expressID}`;
    group.add(line);
  }

  return group;
}
