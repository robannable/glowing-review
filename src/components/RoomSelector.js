/**
 * Room Selector for DaylightLab
 * Handles room selection and highlighting
 */
import * as THREE from 'three';
import { createHighlightMaterial } from '../utils/materials.js';

export class RoomSelector {
  constructor(viewer, ifcLoader) {
    this.viewer = viewer;
    this.ifcLoader = ifcLoader;

    this.rooms = [];
    this.roomMeshes = new Map();
    this.selectedRoom = null;
    this.selectedMesh = null;
    this.originalMaterial = null;

    this.highlightMaterial = createHighlightMaterial();

    this.onRoomSelected = null;
  }

  /**
   * Initialize room selector with spaces from IFC
   */
  init() {
    this.rooms = this.ifcLoader.getSpaces();
    this._createRoomMeshes();
    this._setupClickHandler();
  }

  /**
   * Create highlight meshes for each room
   * @private
   */
  _createRoomMeshes() {
    // Skip if no viewer (e.g., during comparison analysis)
    if (!this.viewer) return;

    this.viewer.clearRooms();
    this.roomMeshes.clear();

    for (const room of this.rooms) {
      if (!room.boundingBox) continue;

      // Create a box mesh to represent the room volume for selection
      const bbox = room.boundingBox;
      const width = bbox.maxX - bbox.minX;
      const height = bbox.maxY - bbox.minY;
      const depth = bbox.maxZ - bbox.minZ;

      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshBasicMaterial({
        color: 0x4a90d9,
        transparent: true,
        opacity: 0.0, // Invisible by default
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (bbox.minX + bbox.maxX) / 2,
        (bbox.minY + bbox.maxY) / 2,
        (bbox.minZ + bbox.maxZ) / 2
      );

      mesh.userData.roomId = room.expressID;
      mesh.userData.room = room;
      mesh.name = `room-${room.expressID}`;

      this.roomMeshes.set(room.expressID, mesh);
      this.viewer.addRoomMesh(mesh);
    }
  }

  /**
   * Setup click event handler for room selection
   * @private
   */
  _setupClickHandler() {
    // Skip if no viewer (e.g., during comparison analysis)
    if (!this.viewer) return;

    const canvas = this.viewer.renderer.domElement;

    canvas.addEventListener('click', (event) => {
      this._handleClick(event);
    });

    // Hover effect
    canvas.addEventListener('mousemove', (event) => {
      this._handleHover(event);
    });
  }

  /**
   * Handle click on room
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  _handleClick(event) {
    const meshes = Array.from(this.roomMeshes.values());
    const intersects = this.viewer.raycast(event, meshes);

    if (intersects.length > 0) {
      const roomId = intersects[0].object.userData.roomId;
      this.selectRoom(roomId);
    }
  }

  /**
   * Handle hover for cursor feedback
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  _handleHover(event) {
    const meshes = Array.from(this.roomMeshes.values());
    const intersects = this.viewer.raycast(event, meshes);

    const canvas = this.viewer.renderer.domElement;
    canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
  }

  /**
   * Select a room by ID
   * @param {number} roomId - Room express ID
   */
  selectRoom(roomId) {
    // Deselect previous
    if (this.selectedMesh) {
      this.selectedMesh.material.opacity = 0;
    }

    // Also restore original IFC mesh material
    if (this.selectedRoom && this.selectedRoom.mesh && this.originalMaterial) {
      this.selectedRoom.mesh.material = this.originalMaterial;
      this.originalMaterial = null;
    }

    if (roomId === null) {
      this.selectedRoom = null;
      this.selectedMesh = null;
      if (this.onRoomSelected) {
        this.onRoomSelected(null);
      }
      return;
    }

    // Select new room
    const room = this.rooms.find(r => r.expressID === roomId);
    const mesh = this.roomMeshes.get(roomId);

    if (room && mesh) {
      this.selectedRoom = room;
      this.selectedMesh = mesh;

      // Show selection box
      mesh.material.opacity = 0.3;
      mesh.material.color.set(0xe94560);

      // Highlight the IFC mesh
      if (room.mesh) {
        this.originalMaterial = room.mesh.material;
        room.mesh.material = this.highlightMaterial;
      }

      if (this.onRoomSelected) {
        this.onRoomSelected(room);
      }
    }
  }

  /**
   * Get the currently selected room
   * @returns {Object|null} Selected room or null
   */
  getSelectedRoom() {
    return this.selectedRoom;
  }

  /**
   * Get all rooms
   * @returns {Array} Array of room objects
   */
  getRooms() {
    return this.rooms;
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.selectRoom(null);
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.roomMeshes.clear();
    this.highlightMaterial.dispose();
    this.selectedRoom = null;
    this.selectedMesh = null;
  }
}
