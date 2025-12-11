/**
 * Enhanced Sky Component Calculator for DaylightLab
 * Uses Monte Carlo hemisphere sampling for improved accuracy
 */
import {
  subtractVectors,
  normalise,
  dotProduct,
  crossProduct,
  vectorLength,
} from '../utils/geometry.js';
import { MAINTENANCE_FACTOR } from '../utils/constants.js';

// Default number of hemisphere samples
const DEFAULT_SAMPLE_COUNT = 144; // 12 altitude × 12 azimuth bands

/**
 * Calculate Sky Component using Monte Carlo hemisphere sampling
 * More accurate than analytical solid angle, especially for complex geometries
 * @param {Object} point - Grid point position {x, y, z}
 * @param {Array} windows - Array of window objects
 * @param {Object} options - Calculation options
 * @returns {number} Sky Component as percentage
 */
export function calculateEnhancedSkyComponent(point, windows, options = {}) {
  if (!windows || windows.length === 0) {
    return 0;
  }

  const sampleCount = options.sampleCount || DEFAULT_SAMPLE_COUNT;
  const useStratified = options.stratified !== false;

  // Generate hemisphere sample directions
  const samples = useStratified
    ? generateStratifiedHemisphereSamples(sampleCount)
    : generateRandomHemisphereSamples(sampleCount);

  let totalContribution = 0;
  let totalWeight = 0;

  for (const sample of samples) {
    // Check if this ray direction hits any window
    const windowHit = traceRayToWindows(point, sample.direction, windows);

    if (windowHit) {
      // CIE overcast sky luminance factor for this altitude
      // L(θ) = Lz × (1 + 2 sin θ) / 3
      const cieFactor = (1 + 2 * Math.sin(sample.altitude)) / 3;

      // Cosine weighting (Lambert's cosine law)
      const cosineWeight = Math.sin(sample.altitude);

      // Window transmittance and reveal correction
      const transmittance = windowHit.window.transmittance || 0.7;
      const revealFactor = windowHit.revealFactor || 1.0;

      // Contribution from this sample
      const contribution = cieFactor * cosineWeight * transmittance * revealFactor * MAINTENANCE_FACTOR;

      totalContribution += contribution * sample.weight;
    }

    totalWeight += sample.weight;
  }

  // Normalise and convert to percentage
  // Factor of 100 for percentage, divided by π for hemisphere solid angle normalisation
  const skyComponent = (totalContribution / totalWeight) * 100 / Math.PI;

  return Math.max(0, skyComponent);
}

/**
 * Generate stratified hemisphere samples using spherical coordinates
 * Provides better coverage than random sampling
 * @param {number} count - Approximate number of samples
 * @returns {Array} Array of {direction, altitude, azimuth, weight}
 */
function generateStratifiedHemisphereSamples(count) {
  const samples = [];

  // Calculate grid dimensions for stratification
  const altitudeBands = Math.ceil(Math.sqrt(count / 2));
  const azimuthBands = Math.ceil(count / altitudeBands);

  for (let i = 0; i < altitudeBands; i++) {
    // Altitude from 0 (horizon) to π/2 (zenith)
    // Use cosine-weighted distribution for better sampling
    const altMin = (i / altitudeBands) * (Math.PI / 2);
    const altMax = ((i + 1) / altitudeBands) * (Math.PI / 2);
    const altitude = (altMin + altMax) / 2;

    for (let j = 0; j < azimuthBands; j++) {
      // Azimuth from 0 to 2π
      const azMin = (j / azimuthBands) * 2 * Math.PI;
      const azMax = ((j + 1) / azimuthBands) * 2 * Math.PI;
      const azimuth = (azMin + azMax) / 2;

      // Convert spherical to Cartesian (Y-up coordinate system)
      const cosAlt = Math.cos(altitude);
      const direction = {
        x: Math.sin(azimuth) * cosAlt,
        y: Math.sin(altitude),
        z: Math.cos(azimuth) * cosAlt,
      };

      // Weight based on solid angle of this patch
      // Solid angle element = cos(alt) × dalt × daz
      const weight = Math.cos(altitude) * (altMax - altMin) * (azMax - azMin);

      samples.push({
        direction,
        altitude,
        azimuth,
        weight,
      });
    }
  }

  return samples;
}

/**
 * Generate random hemisphere samples (fallback method)
 * @param {number} count - Number of samples
 * @returns {Array} Array of {direction, altitude, azimuth, weight}
 */
function generateRandomHemisphereSamples(count) {
  const samples = [];

  for (let i = 0; i < count; i++) {
    // Cosine-weighted hemisphere sampling
    const u1 = Math.random();
    const u2 = Math.random();

    const altitude = Math.asin(Math.sqrt(u1));
    const azimuth = 2 * Math.PI * u2;

    const cosAlt = Math.cos(altitude);
    const direction = {
      x: Math.sin(azimuth) * cosAlt,
      y: Math.sin(altitude),
      z: Math.cos(azimuth) * cosAlt,
    };

    samples.push({
      direction,
      altitude,
      azimuth,
      weight: 1.0, // Equal weights for random sampling
    });
  }

  return samples;
}

/**
 * Trace a ray from a point in a direction to check window intersection
 * @param {Object} origin - Ray origin {x, y, z}
 * @param {Object} direction - Ray direction {x, y, z}
 * @param {Array} windows - Array of window objects
 * @returns {Object|null} Hit info with window and reveal factor, or null
 */
function traceRayToWindows(origin, direction, windows) {
  let closestHit = null;
  let closestDistance = Infinity;

  for (const window of windows) {
    const hit = rayWindowIntersection(origin, direction, window);

    if (hit && hit.distance < closestDistance) {
      closestDistance = hit.distance;
      closestHit = {
        window,
        distance: hit.distance,
        point: hit.point,
        revealFactor: calculateRevealFactor(hit, window),
      };
    }
  }

  return closestHit;
}

/**
 * Test ray intersection with a rectangular window
 * @param {Object} origin - Ray origin {x, y, z}
 * @param {Object} direction - Ray direction {x, y, z}
 * @param {Object} window - Window object with centre, normal, width, height
 * @returns {Object|null} {distance, point} or null if no intersection
 */
function rayWindowIntersection(origin, direction, window) {
  // Window plane equation: dot(P - centre, normal) = 0
  const normal = window.normal;
  const centre = window.centre;

  // Check ray is heading toward window (not away)
  const denom = dotProduct(direction, normal);

  // Ray parallel to plane or facing away
  if (Math.abs(denom) < 1e-6) {
    return null;
  }

  // Calculate intersection distance
  const diff = subtractVectors(centre, origin);
  const t = dotProduct(diff, normal) / denom;

  // Intersection behind ray origin
  if (t < 0.01) {
    return null;
  }

  // Calculate intersection point
  const point = {
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t,
  };

  // Check if point is within window bounds
  if (!isPointInWindowBounds(point, window)) {
    return null;
  }

  return { distance: t, point };
}

/**
 * Check if a point lies within the window rectangle
 * @param {Object} point - Point to test {x, y, z}
 * @param {Object} window - Window object
 * @returns {boolean} True if point is within window bounds
 */
function isPointInWindowBounds(point, window) {
  const centre = window.centre;
  const halfWidth = (window.overallWidth || 1) / 2;
  const halfHeight = (window.overallHeight || 1) / 2;

  // Vector from centre to point
  const toPoint = subtractVectors(point, centre);

  // Get window local coordinate system
  const { uAxis, vAxis } = getWindowAxes(window);

  // Project onto window plane axes
  const u = dotProduct(toPoint, uAxis);
  const v = dotProduct(toPoint, vAxis);

  // Check bounds with small tolerance
  const tolerance = 0.01;
  return (
    Math.abs(u) <= halfWidth + tolerance &&
    Math.abs(v) <= halfHeight + tolerance
  );
}

/**
 * Get local coordinate axes for a window
 * @param {Object} window - Window object with normal
 * @returns {Object} {uAxis, vAxis} local axes
 */
function getWindowAxes(window) {
  const normal = window.normal;

  // Choose an up vector that isn't parallel to normal
  let up = { x: 0, y: 1, z: 0 };
  if (Math.abs(dotProduct(normal, up)) > 0.9) {
    up = { x: 1, y: 0, z: 0 };
  }

  // U axis = cross(up, normal), normalised
  const uAxis = normalise(crossProduct(up, normal));

  // V axis = cross(normal, uAxis)
  const vAxis = crossProduct(normal, uAxis);

  return { uAxis, vAxis };
}

/**
 * Calculate reveal factor for light loss through window depth
 * Windows set back in thick walls lose some sky visibility
 * @param {Object} hit - Ray hit information
 * @param {Object} window - Window object
 * @returns {number} Factor 0-1 representing light transmission through reveal
 */
function calculateRevealFactor(hit, window) {
  // If no reveal depth specified, assume flush window
  const revealDepth = window.revealDepth || 0;

  if (revealDepth <= 0) {
    return 1.0;
  }

  // Calculate angle of incidence
  const rayDir = normalise(subtractVectors(hit.point, hit.point)); // This needs the original ray direction
  // For now, use a simplified model based on window properties

  // Simplified: deeper reveals lose more light at grazing angles
  // This is an approximation; real calculation would need ray angle
  const baseLoss = Math.min(0.3, revealDepth * 0.1);

  return 1.0 - baseLoss;
}

/**
 * Calculate enhanced sky component with reveal depth consideration
 * @param {Object} point - Grid point
 * @param {Array} windows - Windows with revealDepth property
 * @param {Object} options - Options including revealDepth handling
 * @returns {number} Sky component percentage
 */
export function calculateSkyComponentWithReveals(point, windows, options = {}) {
  // Pre-process windows to add reveal information if not present
  const processedWindows = windows.map(w => ({
    ...w,
    revealDepth: w.revealDepth || options.defaultRevealDepth || 0,
  }));

  return calculateEnhancedSkyComponent(point, processedWindows, options);
}

/**
 * Batch calculate sky component for multiple points (for progress reporting)
 * @param {Array} points - Array of grid points
 * @param {Array} windows - Array of windows
 * @param {Object} options - Calculation options
 * @param {Function} onProgress - Progress callback (pointIndex, total)
 * @returns {Array} Array of sky component values
 */
export async function batchCalculateEnhancedSkyComponent(points, windows, options = {}, onProgress = null) {
  const results = [];
  const total = points.length;

  for (let i = 0; i < total; i++) {
    const sc = calculateEnhancedSkyComponent(points[i].position, windows, options);
    results.push(sc);

    // Report progress and yield to main thread periodically
    if (onProgress && (i % 10 === 0 || i === total - 1)) {
      onProgress(i + 1, total);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}
