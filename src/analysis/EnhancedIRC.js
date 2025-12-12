/**
 * Enhanced Internally Reflected Component Calculator for DaylightLab
 * Provides more accurate position-dependent IRC using multi-surface analysis
 */
import { DEFAULT_REFLECTANCES } from '../utils/constants.js';
import { vectorLength, subtractVectors, dotProduct, normalise } from '../utils/geometry.js';

/**
 * Calculate enhanced IRC with multi-surface position weighting
 * Considers contribution from each major surface (ceiling, walls, floor)
 * @param {Object} point - Grid point position {x, y, z}
 * @param {Object} room - Room geometry object
 * @param {Array} windows - Windows in the room
 * @param {Object} reflectances - Surface reflectance values
 * @returns {number} IRC as percentage
 */
export function calculateEnhancedIRC(point, room, windows, reflectances = DEFAULT_REFLECTANCES) {
  if (!windows || windows.length === 0) {
    return 0;
  }

  // Calculate the first-bounce light distribution
  const firstBounce = calculateFirstBounceDistribution(room, windows, reflectances);

  // Calculate view factors from point to each surface
  const viewFactors = calculateViewFactors(point, room);

  // Calculate IRC contribution from each surface
  let totalIRC = 0;

  // Ceiling contribution (usually the brightest after first bounce)
  totalIRC += firstBounce.ceiling * viewFactors.ceiling * reflectances.ceiling;

  // Wall contributions
  totalIRC += firstBounce.walls * viewFactors.walls * reflectances.walls;

  // Floor contribution (usually minor)
  totalIRC += firstBounce.floor * viewFactors.floor * reflectances.floor;

  // Second bounce approximation (adds ~10-20% in typical rooms)
  const avgReflectance = calculateAverageReflectance(room, windows, reflectances);
  const secondBounce = totalIRC * avgReflectance;

  return (totalIRC + secondBounce) * 100; // Convert to percentage
}

/**
 * Calculate first bounce light distribution on room surfaces
 * Based on how much direct sky light hits each surface through windows
 * @param {Object} room - Room geometry
 * @param {Array} windows - Windows
 * @param {Object} reflectances - Surface reflectances
 * @returns {Object} {ceiling, walls, floor} first bounce illuminance factors
 */
function calculateFirstBounceDistribution(room, windows, reflectances) {
  const totalWindowArea = windows.reduce((sum, w) => sum + w.glazedArea, 0);
  const avgTransmittance = windows.reduce(
    (sum, w) => sum + w.transmittance * w.glazedArea, 0
  ) / (totalWindowArea || 1);

  // Light entering room
  const incidentLight = totalWindowArea * avgTransmittance;

  // Estimate distribution based on window positions
  // Higher windows send more light to floor, lower windows to ceiling
  let ceilingFraction = 0.15; // Default: 15% to ceiling
  let floorFraction = 0.45;   // Default: 45% to floor
  let wallFraction = 0.40;    // Default: 40% to walls

  // Adjust based on average window height
  const roomHeight = room.height || 2.7;
  const avgSillHeight = windows.reduce(
    (sum, w) => sum + (w.sillHeight || 0.9), 0
  ) / windows.length;
  const avgWindowMidHeight = avgSillHeight + (windows[0]?.overallHeight || 1.2) / 2;

  // Windows higher in wall send more light to floor
  const heightRatio = avgWindowMidHeight / roomHeight;
  if (heightRatio > 0.5) {
    floorFraction = 0.50 + (heightRatio - 0.5) * 0.2;
    ceilingFraction = 0.10;
    wallFraction = 1 - floorFraction - ceilingFraction;
  } else {
    ceilingFraction = 0.20 + (0.5 - heightRatio) * 0.2;
    floorFraction = 0.40;
    wallFraction = 1 - floorFraction - ceilingFraction;
  }

  // Calculate surface areas
  const floorArea = room.floorArea || 20;
  const ceilingArea = floorArea;
  const wallArea = (room.perimeter || 16) * roomHeight - totalWindowArea;

  return {
    ceiling: (incidentLight * ceilingFraction) / ceilingArea,
    walls: (incidentLight * wallFraction) / wallArea,
    floor: (incidentLight * floorFraction) / floorArea,
  };
}

/**
 * Calculate view factors from a point to room surfaces
 * View factor = fraction of hemisphere "seen" by each surface from the point
 * @param {Object} point - Grid point position
 * @param {Object} room - Room geometry with bounding box
 * @returns {Object} {ceiling, walls, floor} view factors (sum ≈ 1)
 */
function calculateViewFactors(point, room) {
  if (!room.boundingBox) {
    // Default view factors for unknown geometry
    return { ceiling: 0.3, walls: 0.5, floor: 0.2 };
  }

  const bbox = room.boundingBox;
  const roomHeight = room.height || (bbox.maxY - bbox.minY);

  // Height of point above floor
  const floorY = bbox.minY;
  const ceilingY = bbox.maxY;
  const pointHeight = point.y - floorY;

  // Vertical position ratio (0 = floor, 1 = ceiling)
  const verticalRatio = Math.max(0, Math.min(1, pointHeight / roomHeight));

  // Ceiling view factor increases as point gets closer to floor
  // (more of hemisphere above point sees ceiling)
  const ceilingVF = 0.15 + 0.25 * (1 - verticalRatio);

  // Floor view factor increases as point gets closer to ceiling
  // At work plane height (0.85m in 2.7m room), floor is ~0.15
  const floorVF = 0.10 + 0.15 * verticalRatio;

  // Walls get the remainder
  // Also affected by horizontal position - points near walls see more wall
  const centreX = (bbox.minX + bbox.maxX) / 2;
  const centreZ = (bbox.minZ + bbox.maxZ) / 2;
  const roomWidth = bbox.maxX - bbox.minX;
  const roomDepth = bbox.maxZ - bbox.minZ;

  const distFromCentreX = Math.abs(point.x - centreX) / (roomWidth / 2);
  const distFromCentreZ = Math.abs(point.z - centreZ) / (roomDepth / 2);
  const distFromCentre = Math.max(distFromCentreX, distFromCentreZ);

  // Points near walls see more wall surface
  const wallBoost = 0.1 * distFromCentre;

  const wallVF = 1 - ceilingVF - floorVF + wallBoost;

  // Normalise to ensure sum = 1
  const total = ceilingVF + wallVF + floorVF;

  return {
    ceiling: ceilingVF / total,
    walls: wallVF / total,
    floor: floorVF / total,
  };
}

/**
 * Calculate area-weighted average reflectance
 * @param {Object} room - Room geometry
 * @param {Array} windows - Windows (area subtracted from walls)
 * @param {Object} reflectances - Surface reflectances
 * @returns {number} Average reflectance
 */
function calculateAverageReflectance(room, windows, reflectances) {
  const floorArea = room.floorArea || 20;
  const ceilingArea = floorArea;
  const roomHeight = room.height || 2.7;
  const totalWindowArea = windows.reduce((sum, w) => sum + w.glazedArea, 0);
  const wallArea = (room.perimeter || 16) * roomHeight - totalWindowArea;

  const totalArea = floorArea + ceilingArea + wallArea;

  return (
    floorArea * reflectances.floor +
    ceilingArea * reflectances.ceiling +
    wallArea * reflectances.walls
  ) / totalArea;
}

/**
 * Calculate IRC with window proximity boost
 * Points closer to windows receive more reflected light from adjacent surfaces
 * @param {Object} point - Grid point position
 * @param {number} baseIRC - Base IRC from enhanced calculation
 * @param {Array} windows - Window objects
 * @param {Object} room - Room geometry
 * @returns {number} Adjusted IRC as percentage
 */
export function applyWindowProximityBoost(point, baseIRC, windows, room) {
  if (!windows || windows.length === 0 || baseIRC === 0) {
    return baseIRC;
  }

  // Calculate minimum distance to any window
  let minDistance = Infinity;
  for (const window of windows) {
    const distance = vectorLength(subtractVectors(point, window.centre));
    minDistance = Math.min(minDistance, distance);
  }

  // Room diagonal as reference
  let roomDiagonal = 10;
  if (room.boundingBox) {
    const dx = room.boundingBox.maxX - room.boundingBox.minX;
    const dz = room.boundingBox.maxZ - room.boundingBox.minZ;
    roomDiagonal = Math.sqrt(dx * dx + dz * dz);
  }

  // Proximity factor: boost for points near windows
  // Light reflects off window reveals and adjacent walls
  const normalizedDistance = Math.min(1, minDistance / roomDiagonal);

  // Up to 30% boost for points very close to windows
  const proximityFactor = 1 + 0.3 * Math.pow(1 - normalizedDistance, 2);

  return baseIRC * proximityFactor;
}

/**
 * Full enhanced IRC calculation combining all factors
 * @param {Object} point - Grid point position
 * @param {Object} room - Room geometry
 * @param {Array} windows - Windows
 * @param {Object} options - {reflectances, applyProximityBoost}
 * @returns {number} IRC as percentage
 */
export function calculateFullEnhancedIRC(point, room, windows, options = {}) {
  const reflectances = options.reflectances || DEFAULT_REFLECTANCES;

  // Calculate base enhanced IRC
  let irc = calculateEnhancedIRC(point, room, windows, reflectances);

  // Apply proximity boost if enabled (default: true)
  if (options.applyProximityBoost !== false) {
    irc = applyWindowProximityBoost(point, irc, windows, room);
  }

  return irc;
}
