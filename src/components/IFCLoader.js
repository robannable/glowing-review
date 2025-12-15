/**
 * IFC File Loader for DaylightLab
 * Handles loading and parsing IFC files using web-ifc
 */
import * as THREE from 'three';
import * as WebIFC from 'web-ifc';
import {
  IFCSPACE,
  IFCWINDOW,
  IFCDOOR,
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCPRODUCT,
  IFCBUILDINGELEMENTPROXY,
} from '../utils/constants.js';
import { createDefaultMaterials } from '../utils/materials.js';

export class IFCLoader {
  constructor() {
    this.ifcAPI = null;
    this.modelID = null;
    this.isInitialized = false;
    this.onProgress = null;
    this.currentFileName = null;

    this.meshes = new Map();
    this.spaces = [];
    this.windows = [];
    this.materials = createDefaultMaterials();
  }

  /**
   * Initialize the web-ifc API
   */
  async init() {
    if (this.isInitialized) return;

    this.ifcAPI = new WebIFC.IfcAPI();

    // Set WASM path
    this.ifcAPI.SetWasmPath('/wasm/');

    await this.ifcAPI.Init();
    this.isInitialized = true;

    console.log('web-ifc initialized');
  }

  /**
   * Load an IFC file
   * @param {File} file - File object from file input or drop
   * @returns {Promise<THREE.Group>} Group containing the loaded geometry
   */
  async loadFile(file) {
    if (!this.isInitialized) {
      await this.init();
    }

    this.currentFileName = file.name;
    this._reportProgress('Reading file...', 0);

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    this._reportProgress('Parsing IFC...', 10);

    // Open the IFC model
    this.modelID = this.ifcAPI.OpenModel(uint8Array);

    this._reportProgress('Extracting geometry...', 30);

    // Create Three.js group for the model
    const modelGroup = new THREE.Group();
    modelGroup.name = 'IFC Model';

    // Get all geometry
    await this._extractAllGeometry(modelGroup);

    this._reportProgress('Processing spaces...', 70);

    // Extract spaces (rooms)
    await this._extractSpaces();

    this._reportProgress('Processing windows...', 85);

    // Extract windows
    await this._extractWindows();

    this._reportProgress('Complete', 100);

    return modelGroup;
  }

  /**
   * Extract all geometry from the IFC model
   * @param {THREE.Group} group - Group to add geometry to
   * @private
   */
  async _extractAllGeometry(group) {
    // Get all meshes using web-ifc's geometry processing
    this.ifcAPI.StreamAllMeshes(this.modelID, (mesh) => {
      const placedGeometry = mesh.geometries;

      for (let i = 0; i < placedGeometry.size(); i++) {
        const geometry = placedGeometry.get(i);
        const meshObj = this._createMesh(geometry);

        if (meshObj) {
          // Get element type for material
          const expressID = mesh.expressID;
          const elementType = this._getElementType(expressID);
          meshObj.material = this._getMaterialForType(elementType);

          meshObj.userData.expressID = expressID;
          meshObj.userData.elementType = elementType;

          // Store reference
          this.meshes.set(expressID, meshObj);

          group.add(meshObj);
        }
      }
    });
  }

  /**
   * Create a Three.js mesh from web-ifc geometry
   * @param {Object} placedGeometry - Placed geometry from web-ifc
   * @returns {THREE.Mesh} Three.js mesh
   * @private
   */
  _createMesh(placedGeometry) {
    const geometry = this.ifcAPI.GetGeometry(this.modelID, placedGeometry.geometryExpressID);
    const vertices = this.ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
    const indices = this.ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

    if (vertices.length === 0 || indices.length === 0) {
      return null;
    }

    // Create Three.js geometry
    const bufferGeometry = new THREE.BufferGeometry();

    // Vertices: position (3), normal (3) per vertex = 6 floats
    const positionArray = new Float32Array(vertices.length / 2);
    const normalArray = new Float32Array(vertices.length / 2);

    for (let i = 0; i < vertices.length; i += 6) {
      const idx = i / 2;
      positionArray[idx] = vertices[i];
      positionArray[idx + 1] = vertices[i + 1];
      positionArray[idx + 2] = vertices[i + 2];
      normalArray[idx] = vertices[i + 3];
      normalArray[idx + 1] = vertices[i + 4];
      normalArray[idx + 2] = vertices[i + 5];
    }

    bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    bufferGeometry.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
    bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Apply transformation matrix
    const matrix = new THREE.Matrix4();
    matrix.fromArray(placedGeometry.flatTransformation);
    bufferGeometry.applyMatrix4(matrix);

    // Create mesh with default material
    const mesh = new THREE.Mesh(bufferGeometry, this.materials.default);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Get the IFC element type for an express ID
   * @param {number} expressID - Express ID
   * @returns {string} Element type string
   * @private
   */
  _getElementType(expressID) {
    try {
      const element = this.ifcAPI.GetLine(this.modelID, expressID);
      const typeID = element?.type;

      switch (typeID) {
        case IFCWALL:
        case IFCWALLSTANDARDCASE:
          return 'wall';
        case IFCWINDOW:
          return 'window';
        case IFCDOOR:
          return 'door';
        case IFCSLAB:
          return 'slab';
        case IFCSPACE:
          return 'space';
        default:
          return 'default';
      }
    } catch {
      return 'default';
    }
  }

  /**
   * Get material for element type
   * @param {string} type - Element type
   * @returns {THREE.Material} Material
   * @private
   */
  _getMaterialForType(type) {
    return this.materials[type] || this.materials.default;
  }

  /**
   * Extract IfcSpace entities (rooms)
   * @private
   */
  async _extractSpaces() {
    this.spaces = [];

    try {
      const spaceIDs = this.ifcAPI.GetLineIDsWithType(this.modelID, IFCSPACE);

      for (let i = 0; i < spaceIDs.size(); i++) {
        const spaceID = spaceIDs.get(i);
        const space = this.ifcAPI.GetLine(this.modelID, spaceID);

        // Extract properties
        const spaceData = {
          expressID: spaceID,
          globalId: space.GlobalId?.value || '',
          name: space.Name?.value || `Space ${i + 1}`,
          longName: space.LongName?.value || '',
          objectType: space.ObjectType?.value || '',
          floorPolygon: null,
          boundingBox: null,
          floorArea: 0,
          height: 2.7, // Default
          perimeter: 0,
          volume: 0,
          mesh: this.meshes.get(spaceID) || null,
        };

        // Try to extract floor polygon from geometry
        await this._extractSpaceGeometry(spaceData);

        this.spaces.push(spaceData);
      }
    } catch (error) {
      console.warn('Error extracting spaces:', error);
    }

    console.log(`Extracted ${this.spaces.length} spaces`);
  }

  /**
   * Extract geometry data for a space
   * @param {Object} spaceData - Space data object
   * @private
   */
  async _extractSpaceGeometry(spaceData) {
    // First try to get geometry from the mesh
    const mesh = spaceData.mesh;

    if (mesh && mesh.geometry) {
      this._extractGeometryFromMesh(spaceData, mesh);
      return;
    }

    // Fallback: Extract geometry directly from web-ifc
    try {
      const flatMesh = this.ifcAPI.GetFlatMesh(this.modelID, spaceData.expressID);

      if (flatMesh.geometries.size() > 0) {
        // Get the first geometry
        const placedGeom = flatMesh.geometries.get(0);
        const geom = this.ifcAPI.GetGeometry(this.modelID, placedGeom.geometryExpressID);

        const vertices = this.ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());

        if (vertices.length > 0) {
          // Get transformation matrix
          const matrix = new THREE.Matrix4();
          matrix.fromArray(placedGeom.flatTransformation);

          // Find bounding box from vertices (position is every 6 floats: x,y,z,nx,ny,nz)
          let minX = Infinity, minY = Infinity, minZ = Infinity;
          let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

          for (let i = 0; i < vertices.length; i += 6) {
            // Apply transformation to vertex
            const v = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
            v.applyMatrix4(matrix);

            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            minZ = Math.min(minZ, v.z);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
            maxZ = Math.max(maxZ, v.z);
          }

          if (minX !== Infinity) {
            spaceData.boundingBox = { minX, minY, minZ, maxX, maxY, maxZ };

            const width = maxX - minX;
            const depth = maxZ - minZ;
            const height = maxY - minY;

            spaceData.height = height > 0 ? height : 2.7;
            spaceData.floorArea = width * depth;
            spaceData.perimeter = 2 * (width + depth);
            spaceData.volume = spaceData.floorArea * spaceData.height;

            spaceData.floorPolygon = [
              { x: minX, y: minZ },
              { x: maxX, y: minZ },
              { x: maxX, y: maxZ },
              { x: minX, y: maxZ },
            ];

            console.log(`Space "${spaceData.name}": ${spaceData.floorArea.toFixed(2)} m² (${width.toFixed(2)} x ${depth.toFixed(2)} m)`);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not extract geometry for space ${spaceData.name}:`, error);
    }
  }

  /**
   * Extract geometry from a Three.js mesh
   * @param {Object} spaceData - Space data object
   * @param {THREE.Mesh} mesh - Mesh to extract from
   * @private
   */
  _extractGeometryFromMesh(spaceData, mesh) {
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();

    const bbox = geometry.boundingBox;
    spaceData.boundingBox = {
      minX: bbox.min.x,
      minY: bbox.min.y,
      minZ: bbox.min.z,
      maxX: bbox.max.x,
      maxY: bbox.max.y,
      maxZ: bbox.max.z,
    };

    // Estimate dimensions
    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.z - bbox.min.z;
    const height = bbox.max.y - bbox.min.y;

    spaceData.height = height > 0 ? height : 2.7;
    spaceData.floorArea = width * depth;
    spaceData.perimeter = 2 * (width + depth);
    spaceData.volume = spaceData.floorArea * spaceData.height;

    // Create simplified floor polygon (rectangular approximation)
    spaceData.floorPolygon = [
      { x: bbox.min.x, y: bbox.min.z },
      { x: bbox.max.x, y: bbox.min.z },
      { x: bbox.max.x, y: bbox.max.z },
      { x: bbox.min.x, y: bbox.max.z },
    ];

    console.log(`Space "${spaceData.name}" (from mesh): ${spaceData.floorArea.toFixed(2)} m²`);
  }

  /**
   * Extract IfcWindow entities and ArchiCAD BuildingElementProxy windows
   * @private
   */
  async _extractWindows() {
    this.windows = [];

    try {
      // First, try standard IFCWINDOW entities
      const windowIDs = this.ifcAPI.GetLineIDsWithType(this.modelID, IFCWINDOW);

      for (let i = 0; i < windowIDs.size(); i++) {
        const windowID = windowIDs.get(i);
        const window = this.ifcAPI.GetLine(this.modelID, windowID);

        const windowData = this._createWindowData(windowID, window, i);
        await this._extractWindowGeometry(windowData);
        windowData.area = windowData.overallWidth * windowData.overallHeight;
        windowData.glazedArea = windowData.area * (1 - windowData.frameRatio);

        this.windows.push(windowData);
      }

      // Also check for ArchiCAD-style BuildingElementProxy windows
      // ArchiCAD exports windows as IFCBUILDINGELEMENTPROXY with names like "WIND-001"
      const proxyIDs = this.ifcAPI.GetLineIDsWithType(this.modelID, IFCBUILDINGELEMENTPROXY);

      for (let i = 0; i < proxyIDs.size(); i++) {
        const proxyID = proxyIDs.get(i);
        const proxy = this.ifcAPI.GetLine(this.modelID, proxyID);
        const name = proxy.Name?.value || '';

        // Check if this proxy is a window (ArchiCAD naming convention)
        if (name.toUpperCase().startsWith('WIND')) {
          const windowData = this._createWindowData(proxyID, proxy, this.windows.length);
          await this._extractWindowGeometry(windowData);
          windowData.area = windowData.overallWidth * windowData.overallHeight;
          windowData.glazedArea = windowData.area * (1 - windowData.frameRatio);

          this.windows.push(windowData);
        }
      }
    } catch (error) {
      console.warn('Error extracting windows:', error);
    }

    console.log(`Extracted ${this.windows.length} windows`);
  }

  /**
   * Create window data object from IFC entity
   * @param {number} id - Express ID
   * @param {Object} element - IFC element
   * @param {number} index - Window index
   * @returns {Object} Window data object
   * @private
   */
  _createWindowData(id, element, index) {
    return {
      expressID: id,
      globalId: element.GlobalId?.value || '',
      name: element.Name?.value || `Window ${index + 1}`,
      overallWidth: element.OverallWidth?.value || 1.0,
      overallHeight: element.OverallHeight?.value || 1.2,
      area: 0,
      glazedArea: 0,
      centre: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      vertices: [],
      transmittance: 0.7,
      frameRatio: 0.15,
      orientation: 'N',
      sillHeight: 0.9,
      mesh: this.meshes.get(id) || null,
    };
  }

  /**
   * Extract geometry data for a window
   * @param {Object} windowData - Window data object
   * @private
   */
  async _extractWindowGeometry(windowData) {
    const mesh = windowData.mesh;

    if (mesh && mesh.geometry) {
      const geometry = mesh.geometry;
      geometry.computeBoundingBox();

      const bbox = geometry.boundingBox;

      // Calculate centre
      windowData.centre = {
        x: (bbox.min.x + bbox.max.x) / 2,
        y: (bbox.min.y + bbox.max.y) / 2,
        z: (bbox.min.z + bbox.max.z) / 2,
      };

      // Determine orientation from geometry extent
      const dx = bbox.max.x - bbox.min.x;
      const dz = bbox.max.z - bbox.min.z;

      // Window normal is perpendicular to the thinnest dimension
      if (dx < dz) {
        // Window faces X direction
        windowData.normal = { x: 1, y: 0, z: 0 };
        windowData.orientation = 'E'; // or W depending on position
      } else {
        // Window faces Z direction
        windowData.normal = { x: 0, y: 0, z: 1 };
        windowData.orientation = 'N'; // or S depending on position
      }

      // Sill height
      windowData.sillHeight = bbox.min.y;

      // Update dimensions from geometry if available
      const width = Math.max(dx, dz);
      const height = bbox.max.y - bbox.min.y;

      if (width > 0) windowData.overallWidth = width;
      if (height > 0) windowData.overallHeight = height;

      // Create vertices for solid angle calculation
      const hw = windowData.overallWidth / 2;
      const hh = windowData.overallHeight / 2;
      const cy = windowData.centre.y;

      if (dx < dz) {
        // Facing X
        windowData.vertices = [
          { x: windowData.centre.x, y: cy - hh, z: windowData.centre.z - hw },
          { x: windowData.centre.x, y: cy - hh, z: windowData.centre.z + hw },
          { x: windowData.centre.x, y: cy + hh, z: windowData.centre.z + hw },
          { x: windowData.centre.x, y: cy + hh, z: windowData.centre.z - hw },
        ];
      } else {
        // Facing Z
        windowData.vertices = [
          { x: windowData.centre.x - hw, y: cy - hh, z: windowData.centre.z },
          { x: windowData.centre.x + hw, y: cy - hh, z: windowData.centre.z },
          { x: windowData.centre.x + hw, y: cy + hh, z: windowData.centre.z },
          { x: windowData.centre.x - hw, y: cy + hh, z: windowData.centre.z },
        ];
      }
    }
  }

  /**
   * Get all extracted spaces
   * @returns {Array} Array of space objects
   */
  getSpaces() {
    return this.spaces;
  }

  /**
   * Get all extracted windows
   * @returns {Array} Array of window objects
   */
  getWindows() {
    return this.windows;
  }

  /**
   * Get mesh by express ID
   * @param {number} expressID - Express ID
   * @returns {THREE.Mesh|null} Mesh or null
   */
  getMesh(expressID) {
    return this.meshes.get(expressID) || null;
  }

  /**
   * Report progress
   * @param {string} message - Progress message
   * @param {number} percent - Progress percentage
   * @private
   */
  _reportProgress(message, percent) {
    if (this.onProgress) {
      this.onProgress(message, percent);
    }
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.modelID !== null && this.ifcAPI) {
      this.ifcAPI.CloseModel(this.modelID);
      this.modelID = null;
    }

    this.meshes.clear();
    this.spaces = [];
    this.windows = [];

    // Dispose materials
    Object.values(this.materials).forEach(m => m.dispose());
  }
}
