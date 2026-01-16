/**
 * Obstruction Manager for DaylightLab
 * Handles solid building fabric geometry for overshading analysis
 * Performs ray-casting to detect if light paths are blocked by walls, slabs, etc.
 */
import * as THREE from 'three';
import {
  subtractVectors,
  normalise,
  vectorLength,
} from '../utils/geometry.js';

/**
 * Manages obstruction geometry for daylight calculations
 * Uses Three.js raycasting for efficient intersection testing
 */
export class ObstructionManager {
  constructor() {
    this.obstructionMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.isInitialized = false;

    // Set raycaster precision for accurate near-surface detection
    this.raycaster.params.Mesh.threshold = 0.001;
  }

  /**
   * Initialize with obstruction meshes from IFC loader
   * @param {Array} meshes - Array of Three.js meshes representing solid building fabric
   */
  setObstructionMeshes(meshes) {
    this.obstructionMeshes = meshes.filter(m => m && m.geometry);
    this.isInitialized = this.obstructionMeshes.length > 0;

    // Ensure all meshes have up-to-date world matrices
    for (const mesh of this.obstructionMeshes) {
      mesh.updateMatrixWorld(true);
    }

    console.log(`ObstructionManager: Loaded ${this.obstructionMeshes.length} obstruction meshes`);
  }

  /**
   * Check if a ray from a point to a target is blocked by any obstruction
   * @param {Object} origin - Ray origin {x, y, z}
   * @param {Object} target - Ray target {x, y, z}
   * @param {number} tolerance - Distance tolerance to avoid self-intersection (default 0.05m)
   * @returns {Object} { blocked: boolean, hitPoint: Object|null, hitDistance: number|null }
   */
  isRayBlocked(origin, target, tolerance = 0.05) {
    if (!this.isInitialized || this.obstructionMeshes.length === 0) {
      return { blocked: false, hitPoint: null, hitDistance: null };
    }

    const direction = subtractVectors(target, origin);
    const maxDistance = vectorLength(direction);

    if (maxDistance < tolerance * 2) {
      // Origin and target too close, no meaningful obstruction check
      return { blocked: false, hitPoint: null, hitDistance: null };
    }

    const normalizedDir = normalise(direction);

    // Set up raycaster
    const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
    const rayDirection = new THREE.Vector3(normalizedDir.x, normalizedDir.y, normalizedDir.z);

    // Offset origin slightly along direction to avoid self-intersection
    rayOrigin.add(rayDirection.clone().multiplyScalar(tolerance));

    this.raycaster.set(rayOrigin, rayDirection);
    this.raycaster.far = maxDistance - tolerance * 2;

    // Test intersections with all obstruction meshes
    const intersections = this.raycaster.intersectObjects(this.obstructionMeshes, false);

    if (intersections.length > 0) {
      const hit = intersections[0];
      return {
        blocked: true,
        hitPoint: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        hitDistance: hit.distance,
      };
    }

    return { blocked: false, hitPoint: null, hitDistance: null };
  }

  /**
   * Check if a point can see a window (considering obstructions)
   * Returns visibility factor between 0 and 1
   * @param {Object} point - View point {x, y, z}
   * @param {Object} window - Window object with centre and vertices
   * @param {number} sampleCount - Number of sample points on window (default 5)
   * @returns {number} Visibility factor 0-1
   */
  calculateWindowVisibility(point, window, sampleCount = 5) {
    if (!this.isInitialized) {
      return 1.0; // No obstructions loaded, full visibility
    }

    // Sample points on the window
    const samplePoints = this._generateWindowSamplePoints(window, sampleCount);

    let visibleCount = 0;

    for (const sample of samplePoints) {
      const result = this.isRayBlocked(point, sample);
      if (!result.blocked) {
        visibleCount++;
      }
    }

    return visibleCount / samplePoints.length;
  }

  /**
   * Generate sample points across a window surface
   * @param {Object} window - Window object with centre, vertices, or dimensions
   * @param {number} count - Approximate number of sample points
   * @returns {Array} Array of sample points {x, y, z}
   * @private
   */
  _generateWindowSamplePoints(window, count) {
    const samples = [];

    // Always include window centre
    samples.push({ ...window.centre });

    if (count <= 1) {
      return samples;
    }

    // If window has vertices, sample from those
    if (window.vertices && window.vertices.length === 4) {
      const [bl, br, tr, tl] = window.vertices;

      // Add corner points (slightly inset to avoid edge issues)
      const inset = 0.1;
      const corners = [
        this._lerpPoint(window.centre, bl, 1 - inset),
        this._lerpPoint(window.centre, br, 1 - inset),
        this._lerpPoint(window.centre, tr, 1 - inset),
        this._lerpPoint(window.centre, tl, 1 - inset),
      ];

      if (count <= 5) {
        return [...samples, ...corners];
      }

      // Add midpoints of edges
      const midpoints = [
        this._midpoint(bl, br),
        this._midpoint(br, tr),
        this._midpoint(tr, tl),
        this._midpoint(tl, bl),
      ];

      return [...samples, ...corners, ...midpoints];
    }

    // Fallback: generate points based on window dimensions
    const hw = (window.overallWidth || 1) / 2 * 0.8; // 80% to avoid edges
    const hh = (window.overallHeight || 1) / 2 * 0.8;
    const normal = window.normal || { x: 0, y: 0, z: 1 };

    // Determine window plane orientation
    if (Math.abs(normal.x) > 0.5) {
      // Window faces X direction
      samples.push(
        { x: window.centre.x, y: window.centre.y - hh, z: window.centre.z - hw },
        { x: window.centre.x, y: window.centre.y - hh, z: window.centre.z + hw },
        { x: window.centre.x, y: window.centre.y + hh, z: window.centre.z + hw },
        { x: window.centre.x, y: window.centre.y + hh, z: window.centre.z - hw },
      );
    } else {
      // Window faces Z direction
      samples.push(
        { x: window.centre.x - hw, y: window.centre.y - hh, z: window.centre.z },
        { x: window.centre.x + hw, y: window.centre.y - hh, z: window.centre.z },
        { x: window.centre.x + hw, y: window.centre.y + hh, z: window.centre.z },
        { x: window.centre.x - hw, y: window.centre.y + hh, z: window.centre.z },
      );
    }

    return samples;
  }

  /**
   * Linear interpolation between two points
   * @private
   */
  _lerpPoint(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  /**
   * Calculate midpoint between two points
   * @private
   */
  _midpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
    };
  }

  /**
   * Trace a ray in a direction and check for obstruction
   * Used for hemisphere sampling in enhanced sky component
   * @param {Object} origin - Ray origin {x, y, z}
   * @param {Object} direction - Ray direction (normalized) {x, y, z}
   * @param {number} maxDistance - Maximum ray distance
   * @returns {Object|null} Hit info or null if no obstruction
   */
  traceRay(origin, direction, maxDistance = 100) {
    if (!this.isInitialized || this.obstructionMeshes.length === 0) {
      return null;
    }

    const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
    const rayDirection = new THREE.Vector3(direction.x, direction.y, direction.z);

    // Small offset to avoid self-intersection
    rayOrigin.add(rayDirection.clone().multiplyScalar(0.05));

    this.raycaster.set(rayOrigin, rayDirection);
    this.raycaster.far = maxDistance;

    const intersections = this.raycaster.intersectObjects(this.obstructionMeshes, false);

    if (intersections.length > 0) {
      const hit = intersections[0];
      return {
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        distance: hit.distance,
        normal: hit.face ? {
          x: hit.face.normal.x,
          y: hit.face.normal.y,
          z: hit.face.normal.z,
        } : null,
      };
    }

    return null;
  }

  /**
   * Get statistics about obstruction geometry
   * @returns {Object} Statistics
   */
  getStats() {
    let totalTriangles = 0;
    let totalVertices = 0;

    for (const mesh of this.obstructionMeshes) {
      if (mesh.geometry) {
        const index = mesh.geometry.index;
        if (index) {
          totalTriangles += index.count / 3;
        }
        const positions = mesh.geometry.attributes.position;
        if (positions) {
          totalVertices += positions.count;
        }
      }
    }

    return {
      meshCount: this.obstructionMeshes.length,
      triangleCount: Math.floor(totalTriangles),
      vertexCount: totalVertices,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Clear all obstruction data
   */
  clear() {
    this.obstructionMeshes = [];
    this.isInitialized = false;
  }
}

// Singleton instance for global use
let obstructionManagerInstance = null;

/**
 * Get the global obstruction manager instance
 * @returns {ObstructionManager}
 */
export function getObstructionManager() {
  if (!obstructionManagerInstance) {
    obstructionManagerInstance = new ObstructionManager();
  }
  return obstructionManagerInstance;
}

/**
 * Create a new obstruction manager instance (for testing or isolation)
 * @returns {ObstructionManager}
 */
export function createObstructionManager() {
  return new ObstructionManager();
}
