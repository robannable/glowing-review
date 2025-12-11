/**
 * Material utilities for Three.js rendering
 */
import * as THREE from 'three';
import { COLORS, DF_COLOUR_STOPS } from './constants.js';

/**
 * Create default materials for IFC elements
 * @returns {Object} Map of material type to Three.js material
 */
export function createDefaultMaterials() {
  return {
    wall: new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    window: new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      roughness: 0.1,
      metalness: 0.0,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
    door: new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
    space: new THREE.MeshStandardMaterial({
      color: 0x4a90d9,
      roughness: 0.5,
      metalness: 0.0,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    }),
    default: new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
  };
}

/**
 * Create highlight material for selected elements
 * @param {number} color - Highlight color (hex)
 * @returns {THREE.Material} Highlight material
 */
export function createHighlightMaterial(color = COLORS.highlight) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.5,
    metalness: 0.0,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    emissive: color,
    emissiveIntensity: 0.2,
  });
}

/**
 * Create window highlight material
 * @returns {THREE.Material} Window highlight material
 */
export function createWindowHighlightMaterial() {
  return new THREE.MeshStandardMaterial({
    color: COLORS.window,
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    emissive: COLORS.window,
    emissiveIntensity: 0.3,
  });
}

/**
 * Convert daylight factor to color
 * @param {number} df - Daylight factor percentage
 * @returns {THREE.Color} Color for the daylight factor
 */
export function daylightFactorToColor(df) {
  const stops = DF_COLOUR_STOPS;

  // Clamp to range
  if (df <= stops[0].value) {
    return new THREE.Color(stops[0].r / 255, stops[0].g / 255, stops[0].b / 255);
  }
  if (df >= stops[stops.length - 1].value) {
    const last = stops[stops.length - 1];
    return new THREE.Color(last.r / 255, last.g / 255, last.b / 255);
  }

  // Find surrounding stops
  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (df >= stops[i].value && df < stops[i + 1].value) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  // Interpolate
  const t = (df - lower.value) / (upper.value - lower.value);
  const r = (lower.r + t * (upper.r - lower.r)) / 255;
  const g = (lower.g + t * (upper.g - lower.g)) / 255;
  const b = (lower.b + t * (upper.b - lower.b)) / 255;

  return new THREE.Color(r, g, b);
}

/**
 * Convert daylight factor to hex color string
 * @param {number} df - Daylight factor percentage
 * @returns {string} Hex color string
 */
export function daylightFactorToHexColor(df) {
  const color = daylightFactorToColor(df);
  return '#' + color.getHexString();
}

/**
 * Create heatmap material
 * @returns {THREE.Material} Heatmap material with vertex colors
 */
export function createHeatmapMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/**
 * Create line material for outlines
 * @param {number} color - Line color (hex)
 * @returns {THREE.LineBasicMaterial} Line material
 */
export function createLineMaterial(color = 0xffffff) {
  return new THREE.LineBasicMaterial({
    color: color,
    linewidth: 1,
  });
}
