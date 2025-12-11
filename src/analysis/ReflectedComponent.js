/**
 * Internally Reflected Component Calculator for DaylightLab
 * Calculates the IRC of Daylight Factor using the BRE split-flux method
 */
import { DEFAULT_REFLECTANCES } from '../utils/constants.js';
import { vectorLength, subtractVectors } from '../utils/geometry.js';

/**
 * Calculate Internally Reflected Component for a room
 * Uses the BRE split-flux method
 * @param {Object} room - Room geometry object
 * @param {Array} windows - Windows in the room
 * @param {Object} reflectances - Surface reflectance values
 * @returns {number} IRC as percentage
 */
export function calculateIRC(room, windows, reflectances = DEFAULT_REFLECTANCES) {
  if (!windows || windows.length === 0) {
    return 0;
  }

  // Total window area and average transmittance
  const totalWindowArea = windows.reduce((sum, w) => sum + w.glazedArea, 0);

  if (totalWindowArea === 0) {
    return 0;
  }

  // Weighted average transmittance
  const avgTransmittance = windows.reduce(
    (sum, w) => sum + w.transmittance * w.glazedArea, 0
  ) / totalWindowArea;

  // Room surface areas
  const floorArea = room.floorArea || 0;
  const ceilingArea = floorArea; // Assume same as floor
  const wallArea = (room.perimeter || 0) * (room.height || 2.7);

  // Subtract window area from wall area
  const netWallArea = Math.max(0, wallArea - totalWindowArea);

  const totalSurfaceArea = floorArea + ceilingArea + netWallArea;

  if (totalSurfaceArea === 0) {
    return 0;
  }

  // Area-weighted average reflectance
  const avgReflectance = (
    floorArea * reflectances.floor +
    ceilingArea * reflectances.ceiling +
    netWallArea * reflectances.walls
  ) / totalSurfaceArea;

  // BRE formula for IRC
  // IRC = 0.85 × W × T × R / (A × (1 - R²))
  const denominator = totalSurfaceArea * (1 - avgReflectance * avgReflectance);

  if (denominator <= 0) {
    return 0;
  }

  const IRC = (0.85 * totalWindowArea * avgTransmittance * avgReflectance) / denominator;

  return IRC * 100; // Convert to percentage
}

/**
 * Calculate position-dependent IRC
 * Applies a boost factor for points closer to windows
 * @param {Object} point - Grid point position
 * @param {number} baseIRC - Base IRC from BRE formula
 * @param {Array} windows - Window objects
 * @param {Object} room - Room geometry
 * @returns {number} Adjusted IRC as percentage
 */
export function calculatePositionalIRC(point, baseIRC, windows, room) {
  if (!windows || windows.length === 0 || baseIRC === 0) {
    return baseIRC;
  }

  // Calculate weighted average distance from point to windows
  let avgDistance = 0;
  let totalWindowArea = 0;

  for (const window of windows) {
    const distance = vectorLength(subtractVectors(point, window.centre));
    avgDistance += distance * window.glazedArea;
    totalWindowArea += window.glazedArea;
  }

  if (totalWindowArea === 0) {
    return baseIRC;
  }

  avgDistance /= totalWindowArea;

  // Room diagonal as reference
  let roomDiagonal = 10; // Default

  if (room.boundingBox) {
    const dx = room.boundingBox.maxX - room.boundingBox.minX;
    const dz = room.boundingBox.maxZ - room.boundingBox.minZ;
    roomDiagonal = Math.sqrt(dx * dx + dz * dz);
  }

  // Proximity factor: 1.0 at far end, up to 1.5 near windows
  // Points closer to windows get more reflected light
  const normalizedDistance = Math.min(1, avgDistance / roomDiagonal);
  const proximityFactor = 1 + 0.5 * (1 - normalizedDistance);

  return baseIRC * proximityFactor;
}

/**
 * Calculate room surface area breakdown
 * @param {Object} room - Room geometry object
 * @returns {Object} Surface area breakdown
 */
export function calculateSurfaceAreas(room) {
  const floorArea = room.floorArea || 0;
  const ceilingArea = floorArea;
  const height = room.height || 2.7;
  const perimeter = room.perimeter || 0;
  const wallArea = perimeter * height;
  const totalArea = floorArea + ceilingArea + wallArea;

  return {
    floor: floorArea,
    ceiling: ceilingArea,
    walls: wallArea,
    total: totalArea,
  };
}

/**
 * Calculate effective window area considering position
 * Windows higher on wall may contribute more to reflected component
 * @param {Array} windows - Window objects
 * @param {number} roomHeight - Room height
 * @returns {number} Effective window area
 */
export function calculateEffectiveWindowArea(windows, roomHeight = 2.7) {
  if (!windows || windows.length === 0) return 0;

  let effectiveArea = 0;

  for (const window of windows) {
    // Windows positioned higher contribute more to reflected light
    const windowMidHeight = window.sillHeight + (window.overallHeight / 2);
    const heightFactor = 1 + 0.2 * (windowMidHeight / roomHeight);

    effectiveArea += window.glazedArea * heightFactor;
  }

  return effectiveArea;
}
