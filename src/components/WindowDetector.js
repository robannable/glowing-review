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
    this.allGlazedDoors = [];
    this.roomWindows = [];
    this.roomGlazedDoors = [];
    this.highlightedMeshes = [];
    this.originalMaterials = new Map();

    this.highlightMaterial = createWindowHighlightMaterial();
  }

  /**
   * Initialize with windows and glazed doors from IFC
   */
  init() {
    this.allWindows = this.ifcLoader.getWindows();
    this.allGlazedDoors = this.ifcLoader.getGlazedDoors();
  }

  /**
   * Find windows and glazed doors belonging to a room
   * @param {Object} room - Room object with boundingBox
   * @returns {Array} Array of window/glazed door objects (combined for daylight calculation)
   */
  findRoomWindows(room) {
    if (!room || !room.boundingBox) {
      this.roomWindows = [];
      this.roomGlazedDoors = [];
      return [];
    }

    // Expand room bounds to catch windows/doors in walls
    const expandedBounds = expandBoundingBox(room.boundingBox, 0.5);

    // Find windows in room
    this.roomWindows = this.allWindows.filter(window => {
      return isPointInBox(window.centre, expandedBounds);
    });

    // Find glazed doors in room
    this.roomGlazedDoors = this.allGlazedDoors.filter(door => {
      return isPointInBox(door.centre, expandedBounds);
    });

    // Combine windows and glazed doors for orientation update
    const allGlazingSources = [...this.roomWindows, ...this.roomGlazedDoors];

    // Determine orientation relative to room
    this._updateWindowOrientations(room, allGlazingSources);

    // Return combined array (glazed doors are treated as windows for daylight calc)
    return allGlazingSources;
  }

  /**
   * Update window/door orientations based on room geometry
   * @param {Object} room - Room object
   * @param {Array} glazingSources - Array of windows and glazed doors
   * @private
   */
  _updateWindowOrientations(room, glazingSources) {
    if (!room.boundingBox) return;

    const roomCentreX = (room.boundingBox.minX + room.boundingBox.maxX) / 2;
    const roomCentreZ = (room.boundingBox.minZ + room.boundingBox.maxZ) / 2;

    for (const item of glazingSources) {
      // Determine which wall the window/door is on
      const dx = item.centre.x - roomCentreX;
      const dz = item.centre.z - roomCentreZ;

      // Update normal to point outward from room
      if (Math.abs(dx) > Math.abs(dz)) {
        // Item is on east or west wall
        if (dx > 0) {
          item.normal = { x: 1, y: 0, z: 0 };
          item.orientation = 'E';
        } else {
          item.normal = { x: -1, y: 0, z: 0 };
          item.orientation = 'W';
        }
      } else {
        // Item is on north or south wall
        if (dz > 0) {
          item.normal = { x: 0, y: 0, z: 1 };
          item.orientation = 'N';
        } else {
          item.normal = { x: 0, y: 0, z: -1 };
          item.orientation = 'S';
        }
      }

      // Recalculate vertices based on updated normal
      this._updateWindowVertices(item);
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
   * Highlight windows and glazed doors in the 3D view
   */
  highlightWindows() {
    // Clear previous highlights
    this.clearHighlights();

    // Highlight windows
    for (const window of this.roomWindows) {
      if (window.mesh) {
        this.originalMaterials.set(window.expressID, window.mesh.material);
        window.mesh.material = this.highlightMaterial;
        this.highlightedMeshes.push(window.mesh);
      }
    }

    // Highlight glazed doors
    for (const door of this.roomGlazedDoors) {
      if (door.mesh) {
        this.originalMaterials.set(door.expressID, door.mesh.material);
        door.mesh.material = this.highlightMaterial;
        this.highlightedMeshes.push(door.mesh);
      }
    }
  }

  /**
   * Clear window and door highlights
   */
  clearHighlights() {
    // Restore window materials
    for (const window of this.allWindows) {
      if (window.mesh && this.originalMaterials.has(window.expressID)) {
        window.mesh.material = this.originalMaterials.get(window.expressID);
      }
    }
    // Restore glazed door materials
    for (const door of this.allGlazedDoors) {
      if (door.mesh && this.originalMaterials.has(door.expressID)) {
        door.mesh.material = this.originalMaterials.get(door.expressID);
      }
    }
    this.originalMaterials.clear();
    this.highlightedMeshes = [];
  }

  /**
   * Get windows and glazed doors for current room (combined)
   * @returns {Array} Array of window and glazed door objects
   */
  getRoomWindows() {
    return [...this.roomWindows, ...this.roomGlazedDoors];
  }

  /**
   * Get all windows and glazed doors
   * @returns {Array} Array of all window and glazed door objects
   */
  getAllWindows() {
    return [...this.allWindows, ...this.allGlazedDoors];
  }

  /**
   * Calculate glazing statistics for room (windows + glazed doors)
   * @param {number} floorArea - Room floor area
   * @returns {Object} Glazing statistics
   */
  getGlazingStats(floorArea = 0) {
    const allSources = [...this.roomWindows, ...this.roomGlazedDoors];
    const totalArea = allSources.reduce((sum, w) => sum + w.area, 0);
    const totalGlazedArea = allSources.reduce((sum, w) => sum + w.glazedArea, 0);

    return {
      windowCount: this.roomWindows.length,
      glazedDoorCount: this.roomGlazedDoors.length,
      totalCount: allSources.length,
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
    this.roomGlazedDoors = [];
  }
}
