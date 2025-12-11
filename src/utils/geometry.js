/**
 * Geometry helper functions for DaylightLab
 */

/**
 * Subtract two vectors
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {Object} Result vector
 */
export function subtractVectors(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

/**
 * Add two vectors
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {Object} Result vector
 */
export function addVectors(a, b) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

/**
 * Scale a vector
 * @param {Object} v - Vector {x, y, z}
 * @param {number} s - Scale factor
 * @returns {Object} Scaled vector
 */
export function scaleVector(v, s) {
  return {
    x: v.x * s,
    y: v.y * s,
    z: v.z * s,
  };
}

/**
 * Calculate vector length
 * @param {Object} v - Vector {x, y, z}
 * @returns {number} Length
 */
export function vectorLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Normalise a vector
 * @param {Object} v - Vector {x, y, z}
 * @returns {Object} Normalized vector
 */
export function normalise(v) {
  const len = vectorLength(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len,
  };
}

/**
 * Dot product of two vectors
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {number} Dot product
 */
export function dotProduct(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cross product of two vectors
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {Object} Cross product vector
 */
export function crossProduct(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Calculate average of vectors
 * @param {Array} vectors - Array of vectors
 * @returns {Object} Average vector
 */
export function averageVectors(vectors) {
  if (vectors.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = vectors.reduce((acc, v) => addVectors(acc, v), { x: 0, y: 0, z: 0 });
  return scaleVector(sum, 1 / vectors.length);
}

/**
 * Calculate bounding box of points
 * @param {Array} points - Array of points {x, y, z}
 * @returns {Object} Bounding box {minX, minY, minZ, maxX, maxY, maxZ}
 */
export function calculateBoundingBox(points) {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z ?? 0);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z ?? 0);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Expand bounding box by amount
 * @param {Object} bounds - Bounding box
 * @param {number} amount - Amount to expand
 * @returns {Object} Expanded bounding box
 */
export function expandBoundingBox(bounds, amount) {
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    minZ: bounds.minZ - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
    maxZ: bounds.maxZ + amount,
  };
}

/**
 * Check if point is inside bounding box
 * @param {Object} point - Point {x, y, z}
 * @param {Object} bounds - Bounding box
 * @returns {boolean} True if inside
 */
export function isPointInBox(point, bounds) {
  return (
    point.x >= bounds.minX && point.x <= bounds.maxX &&
    point.y >= bounds.minY && point.y <= bounds.maxY &&
    point.z >= bounds.minZ && point.z <= bounds.maxZ
  );
}

/**
 * Check if point is inside 2D polygon (ray casting algorithm)
 * @param {Object} point - Point {x, y}
 * @param {Array} polygon - Array of vertices {x, y}
 * @returns {boolean} True if inside
 */
export function isPointInPolygon2D(point, polygon) {
  if (!polygon || polygon.length < 3) return false;

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

/**
 * Calculate 2D polygon area using shoelace formula
 * @param {Array} polygon - Array of vertices {x, y}
 * @returns {number} Area (absolute value)
 */
export function calculatePolygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;

  let area = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * Calculate polygon perimeter
 * @param {Array} polygon - Array of vertices {x, y}
 * @returns {number} Perimeter
 */
export function calculatePolygonPerimeter(polygon) {
  if (!polygon || polygon.length < 2) return 0;

  let perimeter = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  return perimeter;
}

/**
 * Offset a polygon inward (simplified - works best for convex polygons)
 * @param {Array} polygon - Array of vertices {x, y}
 * @param {number} offset - Offset distance (negative for inward)
 * @returns {Array} Offset polygon
 */
export function offsetPolygon(polygon, offset) {
  if (!polygon || polygon.length < 3) return polygon;

  const n = polygon.length;
  const result = [];

  // Calculate centroid
  const centroid = {
    x: polygon.reduce((sum, p) => sum + p.x, 0) / n,
    y: polygon.reduce((sum, p) => sum + p.y, 0) / n,
  };

  // Move each vertex toward/away from centroid
  for (const p of polygon) {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) {
      result.push({ x: p.x, y: p.y });
    } else {
      const scale = (dist + offset) / dist;
      result.push({
        x: centroid.x + dx * scale,
        y: centroid.y + dy * scale,
      });
    }
  }

  return result;
}

/**
 * Convert cardinal direction to vector
 * @param {string} direction - Cardinal direction (N, NE, E, SE, S, SW, W, NW)
 * @returns {Object} Direction vector {x, y}
 */
export function cardinalToVector(direction) {
  const directions = {
    'N': { x: 0, y: 1 },
    'NE': { x: 0.707, y: 0.707 },
    'E': { x: 1, y: 0 },
    'SE': { x: 0.707, y: -0.707 },
    'S': { x: 0, y: -1 },
    'SW': { x: -0.707, y: -0.707 },
    'W': { x: -1, y: 0 },
    'NW': { x: -0.707, y: 0.707 },
  };
  return directions[direction] || { x: 0, y: 1 };
}

/**
 * Convert vector to cardinal direction
 * @param {Object} vector - Direction vector {x, y} or {x, y, z}
 * @returns {string} Cardinal direction
 */
export function vectorToCardinal(vector) {
  const angle = Math.atan2(vector.y, vector.x) * 180 / Math.PI;
  const normalizedAngle = ((angle % 360) + 360) % 360;

  if (normalizedAngle >= 337.5 || normalizedAngle < 22.5) return 'E';
  if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) return 'NE';
  if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) return 'N';
  if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) return 'NW';
  if (normalizedAngle >= 157.5 && normalizedAngle < 202.5) return 'W';
  if (normalizedAngle >= 202.5 && normalizedAngle < 247.5) return 'SW';
  if (normalizedAngle >= 247.5 && normalizedAngle < 292.5) return 'S';
  return 'SE';
}

/**
 * Distance between two 3D points
 * @param {Object} a - Point {x, y, z}
 * @param {Object} b - Point {x, y, z}
 * @returns {number} Distance
 */
export function distance3D(a, b) {
  return vectorLength(subtractVectors(a, b));
}

/**
 * Distance between two 2D points
 * @param {Object} a - Point {x, y}
 * @param {Object} b - Point {x, y}
 * @returns {number} Distance
 */
export function distance2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
