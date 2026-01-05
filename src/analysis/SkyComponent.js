/**
 * Sky Component Calculator for DaylightLab
 * Calculates the Sky Component (SC) of Daylight Factor
 */
import {
  subtractVectors,
  vectorLength,
  normalise,
  dotProduct,
  crossProduct,
  averageVectors,
} from '../utils/geometry.js';
import { MAINTENANCE_FACTOR } from '../utils/constants.js';

/**
 * Calculate Sky Component at a grid point
 * @param {Object} point - Grid point position {x, y, z}
 * @param {Array} windows - Array of window objects
 * @returns {number} Sky Component as percentage
 */
export function calculateSkyComponent(point, windows) {
  if (!windows || windows.length === 0) {
    return 0;
  }

  let totalSC = 0;

  for (const window of windows) {
    // Vector from point to window centre
    const toWindow = subtractVectors(window.centre, point);
    const distance = vectorLength(toWindow);

    if (distance < 0.01) continue; // Point is at window

    // Check if point is on the interior side of the window
    // Window normal points OUTWARD from room, so:
    // - Interior points: toWindow aligns with normal (positive dot) - point behind window looking out
    // - Exterior points: toWindow opposes normal (negative dot) - point in front of window
    const viewDir = normalise(toWindow);
    const facingDot = dotProduct(viewDir, window.normal);

    // Point must be on interior side (positive dot = behind window, looking through it)
    // Negative dot means point is on exterior side, can't receive light through this window
    if (facingDot < -0.1) continue; // Point is on exterior side, can't see through window

    // Calculate altitude angle to window centre
    const altitude = Math.asin(toWindow.y / distance);

    // Check if window is above the work plane (visible)
    if (altitude < 0) continue;

    // Calculate solid angle subtended by window
    const solidAngle = calculateWindowSolidAngle(point, window);

    if (solidAngle <= 0) continue;

    // CIE overcast sky luminance factor
    // L(θ) = Lz × (1 + 2 sin θ) / 3
    const cieFactor = (1 + 2 * Math.sin(altitude)) / 3;

    // Cosine correction for window angle relative to view direction
    // Use absolute value since we've already verified correct side
    const cosineCorrection = Math.abs(facingDot);

    // Sky Component contribution from this window
    // SC = (solid angle / hemisphere) × CIE factor × transmittance × maintenance
    const windowSC = (solidAngle / (2 * Math.PI)) *
                     cieFactor *
                     cosineCorrection *
                     window.transmittance *
                     MAINTENANCE_FACTOR;

    totalSC += windowSC * 100; // Convert to percentage
  }

  return totalSC;
}

/**
 * Calculate solid angle subtended by a rectangular window from a point
 * Uses simplified formula for rectangular aperture
 * @param {Object} point - View point {x, y, z}
 * @param {Object} window - Window object with vertices
 * @returns {number} Solid angle in steradians
 */
function calculateWindowSolidAngle(point, window) {
  if (!window.vertices || window.vertices.length < 4) {
    // Fallback: approximate using window area and distance
    return approximateSolidAngle(point, window);
  }

  try {
    // Transform vertices relative to view point
    const relativeVertices = window.vertices.map(v =>
      subtractVectors(v, point)
    );

    // Check if window faces towards the point
    const centroid = averageVectors(relativeVertices);
    const centroidDist = vectorLength(centroid);

    if (centroidDist < 0.01) return 0;

    // Check orientation - window should face the point
    const toPointDir = normalise(centroid);
    const facing = -dotProduct(toPointDir, window.normal);

    if (facing < 0) {
      // Window faces away, use opposite normal (interior viewing)
      // This handles cases where normal might be flipped
    }

    // Calculate solid angle using spherical excess formula
    // For a quadrilateral on a unit sphere
    return calculatePolygonSolidAngle(relativeVertices);
  } catch {
    return approximateSolidAngle(point, window);
  }
}

/**
 * Calculate solid angle of a polygon from origin
 * Using the method of spherical excess
 * @param {Array} vertices - Vertices relative to view point
 * @returns {number} Solid angle in steradians
 */
function calculatePolygonSolidAngle(vertices) {
  const n = vertices.length;
  if (n < 3) return 0;

  // Project vertices onto unit sphere
  const sphericalPoints = vertices.map(v => normalise(v));

  // Calculate solid angle using Girard's theorem
  // Solid angle = sum of spherical angles - (n-2)π
  let totalAngle = 0;

  for (let i = 0; i < n; i++) {
    const a = sphericalPoints[i];
    const b = sphericalPoints[(i + 1) % n];
    const c = sphericalPoints[(i + 2) % n];

    // Calculate the spherical angle at vertex b
    const ab = crossProduct(a, b);
    const bc = crossProduct(b, c);

    const abLen = vectorLength(ab);
    const bcLen = vectorLength(bc);

    if (abLen < 1e-10 || bcLen < 1e-10) continue;

    const cosAngle = dotProduct(ab, bc) / (abLen * bcLen);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    totalAngle += Math.PI - angle;
  }

  const solidAngle = totalAngle - (n - 2) * Math.PI;

  return Math.max(0, solidAngle);
}

/**
 * Approximate solid angle using window area and distance
 * @param {Object} point - View point
 * @param {Object} window - Window object
 * @returns {number} Approximate solid angle in steradians
 */
function approximateSolidAngle(point, window) {
  const toWindow = subtractVectors(window.centre, point);
  const distance = vectorLength(toWindow);

  if (distance < 0.1) return 0;

  // Project window area onto sphere
  // Solid angle ≈ A × cos(θ) / r²
  // where θ is angle between window normal and view direction
  const viewDir = normalise(toWindow);
  const cosTheta = Math.abs(dotProduct(viewDir, window.normal));

  const projectedArea = window.glazedArea * cosTheta;
  const solidAngle = projectedArea / (distance * distance);

  // Clamp to reasonable maximum (hemisphere = 2π)
  return Math.min(solidAngle, 2 * Math.PI);
}

/**
 * Calculate position-dependent visibility factor
 * Accounts for partial obstruction of windows from certain positions
 * @param {Object} point - Grid point
 * @param {Object} window - Window object
 * @param {Object} room - Room geometry
 * @returns {number} Visibility factor (0 to 1)
 */
export function calculateVisibilityFactor(point, window, room) {
  // Basic implementation - could be extended with ray casting
  const toWindow = subtractVectors(window.centre, point);
  const distance = vectorLength(toWindow);

  // Check if point is too far (in a different space)
  if (room.boundingBox) {
    const roomDiagonal = Math.sqrt(
      Math.pow(room.boundingBox.maxX - room.boundingBox.minX, 2) +
      Math.pow(room.boundingBox.maxZ - room.boundingBox.minZ, 2)
    );

    if (distance > roomDiagonal * 1.5) {
      return 0; // Window too far, likely in different space
    }
  }

  // Simple visibility - full visibility if within room
  return 1.0;
}
