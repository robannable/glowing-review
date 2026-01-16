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
import { extractFloorPolygonFromGeometry, calculatePolygonArea, calculatePolygonPerimeter } from '../utils/geometry.js';

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
    this.glazedDoors = [];
    this.obstructionMeshes = []; // Solid building fabric for overshading analysis
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

    this._reportProgress('Processing windows...', 80);

    // Extract windows
    await this._extractWindows();

    this._reportProgress('Processing glazed doors...', 85);

    // Extract glazed doors
    await this._extractGlazedDoors();

    this._reportProgress('Extracting solid fabric for shading...', 90);

    // Extract solid building fabric for overshading analysis
    this._extractObstructionMeshes();

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
      const expressID = mesh.expressID;
      const elementType = this._getElementType(expressID);
      const material = this._getMaterialForType(elementType);

      // Collect all geometries for this element (handles multi-casement windows)
      const geometries = [];
      for (let i = 0; i < placedGeometry.size(); i++) {
        const geometry = placedGeometry.get(i);
        const bufferGeom = this._createBufferGeometry(geometry);
        if (bufferGeom) {
          geometries.push(bufferGeom);
        }
      }

      if (geometries.length === 0) return;

      // Merge multiple geometries into one mesh (e.g., multi-casement windows)
      let finalGeometry;
      if (geometries.length === 1) {
        finalGeometry = geometries[0];
      } else {
        // Merge all geometries for this element
        finalGeometry = this._mergeBufferGeometries(geometries);
      }

      if (finalGeometry) {
        const meshObj = new THREE.Mesh(finalGeometry, material);
        meshObj.castShadow = true;
        meshObj.receiveShadow = true;
        meshObj.userData.expressID = expressID;
        meshObj.userData.elementType = elementType;

        this.meshes.set(expressID, meshObj);
        group.add(meshObj);
      }
    });
  }

  /**
   * Merge multiple buffer geometries into one
   * @param {THREE.BufferGeometry[]} geometries - Array of geometries to merge
   * @returns {THREE.BufferGeometry} Merged geometry
   * @private
   */
  _mergeBufferGeometries(geometries) {
    // Calculate total sizes
    let totalPositions = 0;
    let totalNormals = 0;
    let totalIndices = 0;

    for (const geom of geometries) {
      totalPositions += geom.attributes.position.count * 3;
      totalNormals += geom.attributes.normal.count * 3;
      totalIndices += geom.index ? geom.index.count : 0;
    }

    const mergedPositions = new Float32Array(totalPositions);
    const mergedNormals = new Float32Array(totalNormals);
    const mergedIndices = new Uint32Array(totalIndices);

    let positionOffset = 0;
    let normalOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;

    for (const geom of geometries) {
      // Copy positions
      const positions = geom.attributes.position.array;
      mergedPositions.set(positions, positionOffset);
      positionOffset += positions.length;

      // Copy normals
      const normals = geom.attributes.normal.array;
      mergedNormals.set(normals, normalOffset);
      normalOffset += normals.length;

      // Copy indices with offset
      if (geom.index) {
        const indices = geom.index.array;
        for (let i = 0; i < indices.length; i++) {
          mergedIndices[indexOffset + i] = indices[i] + vertexOffset;
        }
        indexOffset += indices.length;
      }

      vertexOffset += geom.attributes.position.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

    return merged;
  }

  /**
   * Create a Three.js BufferGeometry from web-ifc geometry
   * @param {Object} placedGeometry - Placed geometry from web-ifc
   * @returns {THREE.BufferGeometry} Three.js buffer geometry
   * @private
   */
  _createBufferGeometry(placedGeometry) {
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

    return bufferGeometry;
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
        // Collect all geometries for this space (may have multiple parts)
        const geometries = [];

        for (let g = 0; g < flatMesh.geometries.size(); g++) {
          const placedGeom = flatMesh.geometries.get(g);
          const geom = this.ifcAPI.GetGeometry(this.modelID, placedGeom.geometryExpressID);

          const vertices = this.ifcAPI.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
          const indices = this.ifcAPI.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

          if (vertices.length > 0 && indices.length > 0) {
            // Get transformation matrix
            const matrix = new THREE.Matrix4();
            matrix.fromArray(placedGeom.flatTransformation);

            // Create buffer geometry for this part
            const bufferGeometry = new THREE.BufferGeometry();
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
            bufferGeometry.applyMatrix4(matrix);

            geometries.push(bufferGeometry);
          }
        }

        if (geometries.length > 0) {
          // Merge geometries if multiple parts
          let finalGeometry;
          if (geometries.length === 1) {
            finalGeometry = geometries[0];
          } else {
            finalGeometry = this._mergeBufferGeometries(geometries);
          }

          // Create mesh for the space
          const material = this._getMaterialForType('space');
          const spaceMesh = new THREE.Mesh(finalGeometry, material);
          spaceMesh.userData.expressID = spaceData.expressID;
          spaceMesh.userData.elementType = 'space';
          spaceData.mesh = spaceMesh;

          // Calculate bounding box from geometry
          finalGeometry.computeBoundingBox();
          const bbox = finalGeometry.boundingBox;

          spaceData.boundingBox = {
            minX: bbox.min.x,
            minY: bbox.min.y,
            minZ: bbox.min.z,
            maxX: bbox.max.x,
            maxY: bbox.max.y,
            maxZ: bbox.max.z,
          };

          const height = bbox.max.y - bbox.min.y;
          spaceData.height = height > 0 ? height : 2.7;

          // Extract actual floor polygon from mesh vertices near floor level
          const floorPolygon = extractFloorPolygonFromGeometry(finalGeometry, bbox.min.y, 0.3);

          if (floorPolygon && floorPolygon.length >= 3) {
            spaceData.floorPolygon = floorPolygon;
            // Calculate accurate area and perimeter from actual polygon
            spaceData.floorArea = calculatePolygonArea(floorPolygon);
            spaceData.perimeter = calculatePolygonPerimeter(floorPolygon);
          } else {
            // Fallback to bounding box rectangle if extraction fails
            const width = bbox.max.x - bbox.min.x;
            const depth = bbox.max.z - bbox.min.z;
            spaceData.floorArea = width * depth;
            spaceData.perimeter = 2 * (width + depth);
            spaceData.floorPolygon = [
              { x: bbox.min.x, y: bbox.min.z },
              { x: bbox.max.x, y: bbox.min.z },
              { x: bbox.max.x, y: bbox.max.z },
              { x: bbox.min.x, y: bbox.max.z },
            ];
          }

          spaceData.volume = spaceData.floorArea * spaceData.height;

          console.log(`Space "${spaceData.name}": ${spaceData.floorArea.toFixed(2)} m² (${spaceData.floorPolygon.length} vertices)`);
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

    const height = bbox.max.y - bbox.min.y;
    spaceData.height = height > 0 ? height : 2.7;

    // Extract actual floor polygon from mesh vertices near floor level
    const floorPolygon = extractFloorPolygonFromGeometry(geometry, bbox.min.y, 0.3);

    if (floorPolygon && floorPolygon.length >= 3) {
      spaceData.floorPolygon = floorPolygon;
      // Calculate accurate area and perimeter from actual polygon
      spaceData.floorArea = calculatePolygonArea(floorPolygon);
      spaceData.perimeter = calculatePolygonPerimeter(floorPolygon);
    } else {
      // Fallback to bounding box rectangle if extraction fails
      const width = bbox.max.x - bbox.min.x;
      const depth = bbox.max.z - bbox.min.z;
      spaceData.floorArea = width * depth;
      spaceData.perimeter = 2 * (width + depth);
      spaceData.floorPolygon = [
        { x: bbox.min.x, y: bbox.min.z },
        { x: bbox.max.x, y: bbox.min.z },
        { x: bbox.max.x, y: bbox.max.z },
        { x: bbox.min.x, y: bbox.max.z },
      ];
    }

    spaceData.volume = spaceData.floorArea * spaceData.height;

    console.log(`Space "${spaceData.name}" (from mesh): ${spaceData.floorArea.toFixed(2)} m² (${spaceData.floorPolygon.length} vertices)`);
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
   * Extract glazed doors (doors with sidelights or glass panels)
   * @private
   */
  async _extractGlazedDoors() {
    this.glazedDoors = [];

    // Keywords that indicate glazed doors
    const glazingKeywords = ['sidelight', 'glazed', 'glass', 'vision', 'lite', 'panel'];

    try {
      const doorIDs = this.ifcAPI.GetLineIDsWithType(this.modelID, IFCDOOR);

      for (let i = 0; i < doorIDs.size(); i++) {
        const doorID = doorIDs.get(i);
        const door = this.ifcAPI.GetLine(this.modelID, doorID);
        const doorName = door.Name?.value || '';

        // Check door type for glazing indicators
        let isGlazed = false;
        let glazedRatio = 0;
        let doorTypeName = '';

        // Try to get door type info
        try {
          const typeRels = this.ifcAPI.GetLineIDsWithType(this.modelID, 781155140); // IFCRELDEFINESBYTYPE
          for (let j = 0; j < typeRels.size(); j++) {
            const rel = this.ifcAPI.GetLine(this.modelID, typeRels.get(j));
            const relatedObjects = rel.RelatedObjects;

            if (relatedObjects) {
              for (let k = 0; k < relatedObjects.length; k++) {
                if (relatedObjects[k].value === doorID) {
                  const typeRef = rel.RelatingType;
                  if (typeRef) {
                    const doorType = this.ifcAPI.GetLine(this.modelID, typeRef.value);
                    doorTypeName = doorType.Name?.value || '';

                    // Check if door type indicates glazing
                    const typeNameLower = doorTypeName.toLowerCase();
                    if (glazingKeywords.some(keyword => typeNameLower.includes(keyword))) {
                      isGlazed = true;
                      // Estimate glazed ratio based on type
                      if (typeNameLower.includes('sidelight')) {
                        glazedRatio = 0.25; // Sidelight typically ~25% of door opening
                      } else if (typeNameLower.includes('full') || typeNameLower.includes('vision')) {
                        glazedRatio = 0.6; // Full glass door
                      } else {
                        glazedRatio = 0.3; // Partial glazing (e.g., top half)
                      }
                    }
                  }
                  break;
                }
              }
            }
            if (isGlazed) break;
          }
        } catch (typeError) {
          // Type lookup failed, continue with geometry analysis
        }

        // If not identified by type, check name
        if (!isGlazed) {
          const nameLower = doorName.toLowerCase();
          if (glazingKeywords.some(keyword => nameLower.includes(keyword))) {
            isGlazed = true;
            glazedRatio = 0.3;
          }
        }

        if (isGlazed) {
          const mesh = this.meshes.get(doorID);
          const doorData = {
            expressID: doorID,
            globalId: door.GlobalId?.value || '',
            name: doorName || `Glazed Door ${this.glazedDoors.length + 1}`,
            typeName: doorTypeName,
            overallWidth: door.OverallWidth?.value || 0.9,
            overallHeight: door.OverallHeight?.value || 2.1,
            area: 0,
            glazedArea: 0,
            glazedRatio,
            centre: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 1, z: 0 },
            vertices: [],
            transmittance: 0.7,
            frameRatio: 0.2, // Doors typically have more frame
            orientation: 'N',
            sillHeight: 0,
            mesh,
            isDoor: true,
          };

          // Extract geometry
          await this._extractWindowGeometry(doorData);

          // Calculate glazed area
          doorData.area = doorData.overallWidth * doorData.overallHeight;
          doorData.glazedArea = doorData.area * doorData.glazedRatio * (1 - doorData.frameRatio);

          this.glazedDoors.push(doorData);
          console.log(`Found glazed door: ${doorData.name} (${doorTypeName}) - ${(doorData.glazedRatio * 100).toFixed(0)}% glazed`);
        }
      }
    } catch (error) {
      console.warn('Error extracting glazed doors:', error);
    }

    console.log(`Extracted ${this.glazedDoors.length} glazed doors`);
  }

  /**
   * Extract solid building fabric meshes for overshading analysis
   * Includes walls, slabs, roofs - elements that can block light paths
   * @private
   */
  _extractObstructionMeshes() {
    this.obstructionMeshes = [];

    // Solid element types that can cause overshading
    const obstructionTypes = ['wall', 'slab'];

    // Window and door express IDs to exclude (we want to see through these)
    const windowIDs = new Set(this.windows.map(w => w.expressID));
    const doorIDs = new Set(this.glazedDoors.map(d => d.expressID));
    const spaceIDs = new Set(this.spaces.map(s => s.expressID));

    for (const [expressID, mesh] of this.meshes) {
      // Skip windows, glazed doors, and spaces
      if (windowIDs.has(expressID) || doorIDs.has(expressID) || spaceIDs.has(expressID)) {
        continue;
      }

      const elementType = mesh.userData.elementType;

      // Include walls and slabs as potential obstructions
      if (obstructionTypes.includes(elementType)) {
        // Clone the mesh for obstruction testing to avoid affecting visualization
        const obstructionMesh = mesh.clone();
        obstructionMesh.userData.expressID = expressID;
        obstructionMesh.userData.obstructionType = elementType;

        this.obstructionMeshes.push(obstructionMesh);
      }
    }

    console.log(`Extracted ${this.obstructionMeshes.length} obstruction meshes (walls/slabs) for shading analysis`);
  }

  /**
   * Get obstruction meshes for a specific room
   * Returns solid elements that could shade the room's windows
   * @param {Object} room - Room object with boundingBox
   * @param {number} expandDistance - Distance to expand search beyond room bounds (default 5m)
   * @returns {Array} Array of Three.js meshes for obstruction testing
   */
  getObstructionMeshesForRoom(room, expandDistance = 5) {
    if (!room || !room.boundingBox) {
      return this.obstructionMeshes;
    }

    // Expand room bounds to capture nearby obstructions
    const expandedBounds = {
      minX: room.boundingBox.minX - expandDistance,
      minY: room.boundingBox.minY - expandDistance,
      minZ: room.boundingBox.minZ - expandDistance,
      maxX: room.boundingBox.maxX + expandDistance,
      maxY: room.boundingBox.maxY + expandDistance,
      maxZ: room.boundingBox.maxZ + expandDistance,
    };

    // Filter obstructions that are near the room
    return this.obstructionMeshes.filter(mesh => {
      if (!mesh.geometry) return false;

      mesh.geometry.computeBoundingBox();
      const bbox = mesh.geometry.boundingBox;

      // Check if mesh bounding box overlaps with expanded room bounds
      return !(
        bbox.max.x < expandedBounds.minX ||
        bbox.min.x > expandedBounds.maxX ||
        bbox.max.y < expandedBounds.minY ||
        bbox.min.y > expandedBounds.maxY ||
        bbox.max.z < expandedBounds.minZ ||
        bbox.min.z > expandedBounds.maxZ
      );
    });
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
   * Get all extracted glazed doors
   * @returns {Array} Array of glazed door objects
   */
  getGlazedDoors() {
    return this.glazedDoors;
  }

  /**
   * Get all obstruction meshes (solid building fabric)
   * @returns {Array} Array of Three.js meshes
   */
  getObstructionMeshes() {
    return this.obstructionMeshes;
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
    this.glazedDoors = [];

    // Dispose obstruction meshes
    for (const mesh of this.obstructionMeshes) {
      if (mesh.geometry) mesh.geometry.dispose();
    }
    this.obstructionMeshes = [];

    // Dispose materials
    Object.values(this.materials).forEach(m => m.dispose());
  }
}
