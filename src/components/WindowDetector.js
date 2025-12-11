/**
 * Window Detector for DaylightLab
 * Finds and highlights windows belonging to a room
 */
import * as THREE from 'three';
import { expandBoundingBox, isPointInBox } from '../utils/geometry.js';
import { createWindowHighlightMaterial } from '../utils/materials.js';

export class WindowDetector {
  constructor(ifcLoader) {
    this.ifcLoader = ifcLoader;
    this.allWindows = [];
    this.roomWindows = [];
    this.highlightedMeshes = [];
    this.originalMaterials = new Map();

    this.highlightMaterial = createWindowHighlightMaterial();
  }

  /**
   * Initialize with windows from IFC
   */
  init() {
    this.allWindows = this.ifcLoader.getWindows();
  }

  /**
   * Find windows belonging to a room
   * @param {Object} room - Room object with boundingBox
   * @returns {Array} Array of window objects
   */
  findRoomWindows(room) {
    if (!room || !room.boundingBox) {
      this.roomWindows = [];
      return [];
    }

    // Expand room bounds to catch windows in walls
    const expandedBounds = expandBoundingBox(room.boundingBox, 0.5);

    this.roomWindows = this.allWindows.filter(window => {
      // Check if window centre is within expanded room bounds
      return isPointInBox(window.centre, expandedBounds);
    });

    // Determine window orientation relative to room
    this._updateWindowOrientations(room);

    return this.roomWindows;
  }

  /**
   * Update window orientations based on room geometry
   * @param {Object} room - Room object
   * @private
   */
  _updateWindowOrientations(room) {
    if (!room.boundingBox) return;

    const roomCentreX = (room.boundingBox.minX + room.boundingBox.maxX) / 2;
    const roomCentreZ = (room.boundingBox.minZ + room.boundingBox.maxZ) / 2;

    for (const window of this.roomWindows) {
      // Determine which wall the window is on
      const dx = window.centre.x - roomCentreX;
      const dz = window.centre.z - roomCentreZ;

      // Update normal to point outward from room
      if (Math.abs(dx) > Math.abs(dz)) {
        // Window is on east or west wall
        if (dx > 0) {
          window.normal = { x: 1, y: 0, z: 0 };
          window.orientation = 'E';
        } else {
          window.normal = { x: -1, y: 0, z: 0 };
          window.orientation = 'W';
        }
      } else {
        // Window is on north or south wall
        if (dz > 0) {
          window.normal = { x: 0, y: 0, z: 1 };
          window.orientation = 'N';
        } else {
          window.normal = { x: 0, y: 0, z: -1 };
          window.orientation = 'S';
        }
      }

      // Recalculate vertices based on updated normal
      this._updateWindowVertices(window);
    }
  }

  /**
   * Update window vertices based on orientation
   * @param {Object} window - Window object
   * @private
   */
  _updateWindowVertices(window) {
    const hw = window.overallWidth / 2;
    const hh = window.overallHeight / 2;
    const cy = window.centre.y;

    if (Math.abs(window.normal.x) > 0.5) {
      // Facing X (East/West)
      window.vertices = [
        { x: window.centre.x, y: cy - hh, z: window.centre.z - hw },
        { x: window.centre.x, y: cy - hh, z: window.centre.z + hw },
        { x: window.centre.x, y: cy + hh, z: window.centre.z + hw },
        { x: window.centre.x, y: cy + hh, z: window.centre.z - hw },
      ];
    } else {
      // Facing Z (North/South)
      window.vertices = [
        { x: window.centre.x - hw, y: cy - hh, z: window.centre.z },
        { x: window.centre.x + hw, y: cy - hh, z: window.centre.z },
        { x: window.centre.x + hw, y: cy + hh, z: window.centre.z },
        { x: window.centre.x - hw, y: cy + hh, z: window.centre.z },
      ];
    }
  }

  /**
   * Highlight windows in the 3D view
   */
  highlightWindows() {
    // Clear previous highlights
    this.clearHighlights();

    for (const window of this.roomWindows) {
      if (window.mesh) {
        // Store original material
        this.originalMaterials.set(window.expressID, window.mesh.material);

        // Apply highlight material
        window.mesh.material = this.highlightMaterial;
        this.highlightedMeshes.push(window.mesh);
      }
    }
  }

  /**
   * Clear window highlights
   */
  clearHighlights() {
    for (const window of this.allWindows) {
      if (window.mesh && this.originalMaterials.has(window.expressID)) {
        window.mesh.material = this.originalMaterials.get(window.expressID);
      }
    }
    this.originalMaterials.clear();
    this.highlightedMeshes = [];
  }

  /**
   * Get windows for current room
   * @returns {Array} Array of window objects
   */
  getRoomWindows() {
    return this.roomWindows;
  }

  /**
   * Get all windows
   * @returns {Array} Array of all window objects
   */
  getAllWindows() {
    return this.allWindows;
  }

  /**
   * Calculate glazing statistics for room
   * @param {number} floorArea - Room floor area
   * @returns {Object} Glazing statistics
   */
  getGlazingStats(floorArea = 0) {
    const totalArea = this.roomWindows.reduce((sum, w) => sum + w.area, 0);
    const totalGlazedArea = this.roomWindows.reduce((sum, w) => sum + w.glazedArea, 0);

    return {
      windowCount: this.roomWindows.length,
      totalArea,
      totalGlazedArea,
      glazingToFloorRatio: floorArea > 0 ? (totalGlazedArea / floorArea) : 0,
    };
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.clearHighlights();
    this.highlightMaterial.dispose();
    this.roomWindows = [];
  }
}
