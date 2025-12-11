/**
 * Grid Generator for DaylightLab
 * Creates analysis grid points within a room floor polygon
 */
import {
  calculateBoundingBox,
  isPointInPolygon2D,
  offsetPolygon,
} from '../utils/geometry.js';
import {
  DEFAULT_GRID_SPACING,
  DEFAULT_WORK_PLANE_HEIGHT,
  DEFAULT_WALL_OFFSET,
} from '../utils/constants.js';

/**
 * Generate analysis grid for a room
 * @param {Array} floorPolygon - Room floor boundary vertices [{x, y}, ...]
 * @param {Object} options - Grid options
 * @returns {Array} Array of grid points
 */
export function generateGrid(floorPolygon, options = {}) {
  const {
    spacing = DEFAULT_GRID_SPACING,
    workPlaneHeight = DEFAULT_WORK_PLANE_HEIGHT,
    wallOffset = DEFAULT_WALL_OFFSET,
    floorLevel = 0, // Room floor level in world coordinates
  } = options;

  if (!floorPolygon || floorPolygon.length < 3) {
    console.warn('Invalid floor polygon for grid generation');
    return [];
  }

  const bounds = calculateBoundingBox(floorPolygon);
  const grid = [];

  // Calculate absolute Y position: floor level + work plane height
  const absoluteY = floorLevel + workPlaneHeight;

  // Inset the polygon to create wall offset
  const insetPolygon = offsetPolygon(floorPolygon, -wallOffset);

  // Check if inset polygon is valid (not collapsed)
  if (!insetPolygon || insetPolygon.length < 3) {
    // Room too small for offset, use original polygon with reduced offset
    const smallerInset = offsetPolygon(floorPolygon, -wallOffset / 2);
    if (smallerInset && smallerInset.length >= 3) {
      return generateGridInPolygon(smallerInset, bounds, spacing, absoluteY);
    }
    // If still invalid, use original polygon
    return generateGridInPolygon(floorPolygon, bounds, spacing, absoluteY);
  }

  return generateGridInPolygon(insetPolygon, bounds, spacing, absoluteY);
}

/**
 * Generate grid points within a polygon
 * @param {Array} polygon - Polygon vertices
 * @param {Object} bounds - Bounding box of original polygon
 * @param {number} spacing - Grid spacing
 * @param {number} absoluteY - Absolute Y position for grid points (floor level + work plane height)
 * @returns {Array} Array of grid points
 * @private
 */
function generateGridInPolygon(polygon, bounds, spacing, absoluteY) {
  const grid = [];

  // Generate regular grid within bounds
  for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
    for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
      const point2D = { x, y };

      // Check if point is inside the room boundary
      if (isPointInPolygon2D(point2D, polygon)) {
        grid.push({
          position: {
            x: x,
            y: absoluteY, // Y is up in Three.js (floor level + work plane height)
            z: y, // Z is the horizontal plane
          },
          // Results to be calculated
          daylightFactor: null,
          skyComponent: null,
          irc: null,
        });
      }
    }
  }

  return grid;
}

/**
 * Generate grid from bounding box (fallback for complex rooms)
 * @param {Object} boundingBox - Room bounding box
 * @param {Object} options - Grid options
 * @returns {Array} Array of grid points
 */
export function generateGridFromBoundingBox(boundingBox, options = {}) {
  const {
    spacing = DEFAULT_GRID_SPACING,
    workPlaneHeight = DEFAULT_WORK_PLANE_HEIGHT,
    wallOffset = DEFAULT_WALL_OFFSET,
  } = options;

  if (!boundingBox) {
    return [];
  }

  const grid = [];

  // Use bounding box minY as floor level
  const floorLevel = boundingBox.minY || 0;
  const absoluteY = floorLevel + workPlaneHeight;

  const minX = boundingBox.minX + wallOffset;
  const maxX = boundingBox.maxX - wallOffset;
  const minZ = boundingBox.minZ + wallOffset;
  const maxZ = boundingBox.maxZ - wallOffset;

  // Check if room is large enough
  if (maxX <= minX || maxZ <= minZ) {
    // Room too small, place single point in centre
    grid.push({
      position: {
        x: (boundingBox.minX + boundingBox.maxX) / 2,
        y: absoluteY,
        z: (boundingBox.minZ + boundingBox.maxZ) / 2,
      },
      daylightFactor: null,
      skyComponent: null,
      irc: null,
    });
    return grid;
  }

  for (let x = minX; x <= maxX; x += spacing) {
    for (let z = minZ; z <= maxZ; z += spacing) {
      grid.push({
        position: {
          x: x,
          y: absoluteY,
          z: z,
        },
        daylightFactor: null,
        skyComponent: null,
        irc: null,
      });
    }
  }

  return grid;
}

/**
 * Estimate grid count for a room (for progress estimation)
 * @param {Object} room - Room object
 * @param {number} spacing - Grid spacing
 * @returns {number} Estimated number of grid points
 */
export function estimateGridCount(room, spacing = DEFAULT_GRID_SPACING) {
  if (!room || !room.boundingBox) return 0;

  const bbox = room.boundingBox;
  const width = (bbox.maxX - bbox.minX) - (DEFAULT_WALL_OFFSET * 2);
  const depth = (bbox.maxZ - bbox.minZ) - (DEFAULT_WALL_OFFSET * 2);

  if (width <= 0 || depth <= 0) return 1;

  const pointsX = Math.ceil(width / spacing);
  const pointsZ = Math.ceil(depth / spacing);

  // Assume about 70% coverage for polygon vs bounding box
  return Math.ceil(pointsX * pointsZ * 0.7);
}
