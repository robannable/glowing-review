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
import {
  extractFloorPolygonFromGeometry,
  calculatePolygonArea,
  calculatePolygonPerimeter,
  calculateFaceArea,
  calculateFaceNormal,
  classifySurfaceByNormal,
  transformPoint,
  multiplyMatrices,
  identityMatrix,
  fanTriangulate,
  convexHull2D,
} from '../utils/geometry.js';

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

    this._reportProgress('Processing glazed doors...', 90);

    // Extract glazed doors
    await this._extractGlazedDoors();

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
          // 3D body geometry
          bodyFaces: [],     // Full 3D face data from Body representation
          floorFaces: [],    // Faces classified as floor
          ceilingFaces: [],  // Faces classified as ceiling
          wallFaces: [],     // Faces classified as wall
          totalCeilingArea: 0,
          totalWallArea: 0,
          hasBodyGeometry: false,
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
    }

    // Try to extract full 3D body faces (for pitched ceilings, etc.)
    try {
      const bodyFaces = this._extractBodyFaces(
        spaceData.expressID,
        identityMatrix(),
        spaceData.name
      );

      if (bodyFaces.length > 0) {
        spaceData.bodyFaces = bodyFaces;
        spaceData.hasBodyGeometry = true;

        // Classify faces by surface type
        for (const face of bodyFaces) {
          switch (face.surfaceType) {
            case 'floor':
              spaceData.floorFaces.push(face);
              break;
            case 'ceiling':
              spaceData.ceilingFaces.push(face);
              spaceData.totalCeilingArea += face.area;
              break;
            case 'wall':
              spaceData.wallFaces.push(face);
              spaceData.totalWallArea += face.area;
              break;
          }
        }

        console.log(`Space "${spaceData.name}" body geometry: ${bodyFaces.length} faces (${spaceData.floorFaces.length} floor, ${spaceData.ceilingFaces.length} ceiling, ${spaceData.wallFaces.length} wall)`);

        // If we got floor faces but didn't have a floor polygon, compute one from floor faces
        if (spaceData.floorFaces.length > 0 && !spaceData.floorPolygon) {
          this._computeFloorPolygonFromFaces(spaceData);
        }

        // Create mesh from extracted faces if we don't have one
        if (!spaceData.mesh && bodyFaces.length > 0) {
          const faceGeometry = this._createGeometryFromFaces(bodyFaces);
          if (faceGeometry) {
            const material = this._getMaterialForType('space');
            spaceData.mesh = new THREE.Mesh(faceGeometry, material);
            spaceData.mesh.userData.expressID = spaceData.expressID;
            spaceData.mesh.userData.elementType = 'space';
          }
        }
      }
    } catch (error) {
      console.warn(`Could not extract body faces for ${spaceData.name}:`, error);
    }

    // If we still don't have geometry, fall back to web-ifc extraction
    if (!spaceData.mesh) {
      await this._extractSpaceGeometryFallback(spaceData);
    }
  }

  /**
   * Compute floor polygon from extracted floor faces
   * @param {Object} spaceData - Space data object
   * @private
   */
  _computeFloorPolygonFromFaces(spaceData) {
    // Collect all floor face vertices projected to 2D (x, z)
    const floorPoints = [];
    for (const face of spaceData.floorFaces) {
      for (const v of face.vertices) {
        floorPoints.push({ x: v.x, y: v.z }); // Project to XZ plane
      }
    }

    if (floorPoints.length < 3) return;

    // Compute convex hull for floor boundary
    spaceData.floorPolygon = convexHull2D(floorPoints);

    if (spaceData.floorPolygon && spaceData.floorPolygon.length >= 3) {
      spaceData.floorArea = calculatePolygonArea(spaceData.floorPolygon);
      spaceData.perimeter = calculatePolygonPerimeter(spaceData.floorPolygon);
    }
  }

  /**
   * Fallback geometry extraction using web-ifc flat mesh
   * @param {Object} spaceData - Space data object
   * @private
   */
  async _extractSpaceGeometryFallback(spaceData) {

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
   * Extract body representation faces from an IfcSpace
   * Returns detailed 3D face information including pitched ceilings, sloped surfaces, etc.
   * @param {number} spaceID - Express ID of the IfcSpace
   * @param {Array} placementMatrix - 4x4 transformation matrix (column-major)
   * @param {string} spaceName - Name for logging/identification
   * @returns {Array} Array of face objects with vertices, normal, area, surfaceType
   * @private
   */
  _extractBodyFaces(spaceID, placementMatrix, spaceName) {
    const faces = [];

    try {
      const space = this.ifcAPI.GetLine(this.modelID, spaceID);
      if (!space || !space.Representation) {
        return faces;
      }

      // Get the product definition shape
      const representation = this.ifcAPI.GetLine(this.modelID, space.Representation.value);
      if (!representation || !representation.Representations) {
        return faces;
      }

      // Find the Body representation
      for (const repRef of representation.Representations) {
        const shapeRep = this.ifcAPI.GetLine(this.modelID, repRef.value);
        if (!shapeRep) continue;

        // Check for Body representation (case-insensitive)
        const identifier = shapeRep.RepresentationIdentifier?.value || '';
        if (identifier.toLowerCase() !== 'body' && identifier !== '') {
          continue;
        }

        // Process representation items
        if (shapeRep.Items) {
          for (const itemRef of shapeRep.Items) {
            const item = this.ifcAPI.GetLine(this.modelID, itemRef.value);
            if (item) {
              const extractedFaces = this._extractFacesFromItem(
                item,
                placementMatrix,
                `${spaceName}_face`
              );
              faces.push(...extractedFaces);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error extracting body faces for ${spaceName}:`, error);
    }

    return faces;
  }

  /**
   * Dispatch to appropriate face extractor based on geometry type
   * @param {Object} item - IFC representation item
   * @param {Array} placementMatrix - 4x4 transformation matrix
   * @param {string} namePrefix - Name prefix for faces
   * @returns {Array} Array of face objects
   * @private
   */
  _extractFacesFromItem(item, placementMatrix, namePrefix) {
    if (!item || !item.type) {
      return [];
    }

    const typeName = this._getTypeName(item.type);

    switch (typeName) {
      case 'IfcPolygonalFaceSet':
        return this._extractFacesFromPolygonalFaceSet(item, placementMatrix, namePrefix);

      case 'IfcFacetedBrep':
        return this._extractFacesFromFacetedBrep(item, placementMatrix, namePrefix);

      case 'IfcExtrudedAreaSolid':
        return this._extractFacesFromExtrudedAreaSolid(item, placementMatrix, namePrefix);

      case 'IfcMappedItem':
        return this._extractFacesFromMappedItem(item, placementMatrix, namePrefix);

      default:
        // Try to handle other solid types that might contain faces
        if (typeName.includes('Brep') || typeName.includes('FaceSet')) {
          console.log(`Unhandled solid type: ${typeName}`);
        }
        return [];
    }
  }

  /**
   * Get IFC type name from type ID
   * @param {number} typeID - IFC type identifier
   * @returns {string} Type name
   * @private
   */
  _getTypeName(typeID) {
    // Common IFC geometry types
    const typeNames = {
      2839578677: 'IfcPolygonalFaceSet',
      807026263: 'IfcFacetedBrep',
      2937912522: 'IfcExtrudedAreaSolid',
      2830218821: 'IfcMappedItem',
      1484403080: 'IfcShapeRepresentation',
      3905492369: 'IfcCartesianPointList3D',
      3939117080: 'IfcPolygonalBoundedHalfSpace',
      1033248425: 'IfcIndexedPolyCurve',
      2556980723: 'IfcFace',
      3698973494: 'IfcClosedShell',
      2529465313: 'IfcAdvancedBrep',
      1950629157: 'IfcTriangulatedFaceSet',
    };
    return typeNames[typeID] || `Unknown(${typeID})`;
  }

  /**
   * Extract faces from IfcPolygonalFaceSet (common in ArchiCAD exports)
   * @param {Object} faceSet - IfcPolygonalFaceSet entity
   * @param {Array} placementMatrix - 4x4 transformation matrix
   * @param {string} namePrefix - Name prefix for faces
   * @returns {Array} Array of face objects
   * @private
   */
  _extractFacesFromPolygonalFaceSet(faceSet, placementMatrix, namePrefix) {
    const faces = [];

    try {
      // Get coordinates from IfcCartesianPointList3D
      if (!faceSet.Coordinates) {
        return faces;
      }

      const coordList = this.ifcAPI.GetLine(this.modelID, faceSet.Coordinates.value);
      if (!coordList || !coordList.CoordList) {
        return faces;
      }

      // Extract all coordinate points
      const points = [];
      for (const coord of coordList.CoordList) {
        const x = coord[0]?.value ?? coord[0] ?? 0;
        const y = coord[1]?.value ?? coord[1] ?? 0;
        const z = coord[2]?.value ?? coord[2] ?? 0;

        // Transform point using placement matrix
        const transformedPoint = transformPoint({ x, y, z }, placementMatrix);
        points.push(transformedPoint);
      }

      // Process faces
      if (!faceSet.Faces) {
        return faces;
      }

      let faceIndex = 0;
      for (const faceRef of faceSet.Faces) {
        const face = this.ifcAPI.GetLine(this.modelID, faceRef.value);
        if (!face || !face.CoordIndex) {
          continue;
        }

        // Get vertex indices (IFC uses 1-based indexing!)
        const vertices = [];
        for (const idx of face.CoordIndex) {
          const pointIndex = (idx.value ?? idx) - 1; // Convert to 0-based
          if (pointIndex >= 0 && pointIndex < points.length) {
            vertices.push(points[pointIndex]);
          }
        }

        if (vertices.length >= 3) {
          const normal = calculateFaceNormal(vertices);
          const area = calculateFaceArea(vertices);
          const surfaceType = classifySurfaceByNormal(normal);

          faces.push({
            name: `${namePrefix}_${faceIndex}`,
            vertices,
            normal,
            area,
            surfaceType,
            vertexCount: vertices.length,
          });
        }

        faceIndex++;
      }
    } catch (error) {
      console.warn(`Error extracting PolygonalFaceSet faces:`, error);
    }

    return faces;
  }

  /**
   * Extract faces from IfcFacetedBrep (boundary representation)
   * @param {Object} brep - IfcFacetedBrep entity
   * @param {Array} placementMatrix - 4x4 transformation matrix
   * @param {string} namePrefix - Name prefix for faces
   * @returns {Array} Array of face objects
   * @private
   */
  _extractFacesFromFacetedBrep(brep, placementMatrix, namePrefix) {
    const faces = [];

    try {
      if (!brep.Outer) {
        return faces;
      }

      // Get the closed shell
      const shell = this.ifcAPI.GetLine(this.modelID, brep.Outer.value);
      if (!shell || !shell.CfsFaces) {
        return faces;
      }

      let faceIndex = 0;
      for (const faceRef of shell.CfsFaces) {
        const face = this.ifcAPI.GetLine(this.modelID, faceRef.value);
        if (!face || !face.Bounds) {
          continue;
        }

        // Get face bounds (outer and inner loops)
        for (const boundRef of face.Bounds) {
          const bound = this.ifcAPI.GetLine(this.modelID, boundRef.value);
          if (!bound || !bound.Bound) {
            continue;
          }

          // Get the polyloop
          const loop = this.ifcAPI.GetLine(this.modelID, bound.Bound.value);
          if (!loop || !loop.Polygon) {
            continue;
          }

          // Extract vertices from polyloop
          const vertices = [];
          for (const pointRef of loop.Polygon) {
            const point = this.ifcAPI.GetLine(this.modelID, pointRef.value);
            if (point && point.Coordinates) {
              const x = point.Coordinates[0]?.value ?? point.Coordinates[0] ?? 0;
              const y = point.Coordinates[1]?.value ?? point.Coordinates[1] ?? 0;
              const z = point.Coordinates[2]?.value ?? point.Coordinates[2] ?? 0;

              const transformedPoint = transformPoint({ x, y, z }, placementMatrix);
              vertices.push(transformedPoint);
            }
          }

          if (vertices.length >= 3) {
            const normal = calculateFaceNormal(vertices);
            const area = calculateFaceArea(vertices);
            const surfaceType = classifySurfaceByNormal(normal);

            // Check orientation flag
            const orientation = bound.Orientation?.value ?? true;
            const adjustedNormal = orientation ? normal : {
              x: -normal.x,
              y: -normal.y,
              z: -normal.z,
            };

            faces.push({
              name: `${namePrefix}_${faceIndex}`,
              vertices,
              normal: adjustedNormal,
              area,
              surfaceType: classifySurfaceByNormal(adjustedNormal),
              vertexCount: vertices.length,
            });
          }

          faceIndex++;
        }
      }
    } catch (error) {
      console.warn(`Error extracting FacetedBrep faces:`, error);
    }

    return faces;
  }

  /**
   * Extract faces from IfcExtrudedAreaSolid
   * Generates top, bottom, and side faces from extrusion
   * @param {Object} solid - IfcExtrudedAreaSolid entity
   * @param {Array} placementMatrix - 4x4 transformation matrix
   * @param {string} namePrefix - Name prefix for faces
   * @returns {Array} Array of face objects
   * @private
   */
  _extractFacesFromExtrudedAreaSolid(solid, placementMatrix, namePrefix) {
    const faces = [];

    try {
      // Get extrusion depth
      const depth = solid.Depth?.value ?? solid.Depth ?? 0;
      if (depth === 0) {
        return faces;
      }

      // Get extrusion direction
      let extrudeDir = { x: 0, y: 0, z: 1 }; // Default: Z direction
      if (solid.ExtrudedDirection) {
        const dir = this.ifcAPI.GetLine(this.modelID, solid.ExtrudedDirection.value);
        if (dir && dir.DirectionRatios) {
          extrudeDir = {
            x: dir.DirectionRatios[0]?.value ?? dir.DirectionRatios[0] ?? 0,
            y: dir.DirectionRatios[1]?.value ?? dir.DirectionRatios[1] ?? 0,
            z: dir.DirectionRatios[2]?.value ?? dir.DirectionRatios[2] ?? 0,
          };
        }
      }

      // Get local placement matrix for the solid
      let solidMatrix = identityMatrix();
      if (solid.Position) {
        solidMatrix = this._getPlacementMatrix(solid.Position.value);
      }

      // Combine with parent placement
      const combinedMatrix = multiplyMatrices(placementMatrix, solidMatrix);

      // Get profile (swept area)
      if (!solid.SweptArea) {
        return faces;
      }

      const profile = this.ifcAPI.GetLine(this.modelID, solid.SweptArea.value);
      if (!profile) {
        return faces;
      }

      // Extract profile points
      const profilePoints = this._extractProfilePoints(profile);
      if (profilePoints.length < 3) {
        return faces;
      }

      // Transform profile points and create bottom face
      const bottomVertices = profilePoints.map(p => transformPoint(p, combinedMatrix));

      // Create top face by offsetting along extrusion direction
      const topVertices = bottomVertices.map(p => ({
        x: p.x + extrudeDir.x * depth,
        y: p.y + extrudeDir.y * depth,
        z: p.z + extrudeDir.z * depth,
      }));

      // Add bottom face
      const bottomNormal = calculateFaceNormal(bottomVertices);
      const bottomArea = calculateFaceArea(bottomVertices);
      faces.push({
        name: `${namePrefix}_bottom`,
        vertices: bottomVertices,
        normal: bottomNormal,
        area: bottomArea,
        surfaceType: classifySurfaceByNormal(bottomNormal),
        vertexCount: bottomVertices.length,
      });

      // Add top face (reverse winding)
      const topVerticesReversed = [...topVertices].reverse();
      const topNormal = calculateFaceNormal(topVerticesReversed);
      const topArea = calculateFaceArea(topVerticesReversed);
      faces.push({
        name: `${namePrefix}_top`,
        vertices: topVerticesReversed,
        normal: topNormal,
        area: topArea,
        surfaceType: classifySurfaceByNormal(topNormal),
        vertexCount: topVerticesReversed.length,
      });

      // Add side faces
      const n = bottomVertices.length;
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const sideVertices = [
          bottomVertices[i],
          bottomVertices[next],
          topVertices[next],
          topVertices[i],
        ];

        const sideNormal = calculateFaceNormal(sideVertices);
        const sideArea = calculateFaceArea(sideVertices);
        faces.push({
          name: `${namePrefix}_side_${i}`,
          vertices: sideVertices,
          normal: sideNormal,
          area: sideArea,
          surfaceType: classifySurfaceByNormal(sideNormal),
          vertexCount: 4,
        });
      }
    } catch (error) {
      console.warn(`Error extracting ExtrudedAreaSolid faces:`, error);
    }

    return faces;
  }

  /**
   * Extract profile points from an IFC profile definition
   * @param {Object} profile - IFC profile definition
   * @returns {Array} Array of 3D points
   * @private
   */
  _extractProfilePoints(profile) {
    const points = [];
    const typeName = this._getTypeName(profile.type);

    try {
      if (typeName.includes('ArbitraryClosedProfileDef') || typeName.includes('ArbitraryProfileDefWithVoids')) {
        // Get outer curve
        if (profile.OuterCurve) {
          const curve = this.ifcAPI.GetLine(this.modelID, profile.OuterCurve.value);
          points.push(...this._extractCurvePoints(curve));
        }
      } else if (typeName.includes('RectangleProfileDef')) {
        // Rectangle profile
        const xDim = profile.XDim?.value ?? profile.XDim ?? 1;
        const yDim = profile.YDim?.value ?? profile.YDim ?? 1;
        const halfX = xDim / 2;
        const halfY = yDim / 2;

        points.push(
          { x: -halfX, y: -halfY, z: 0 },
          { x: halfX, y: -halfY, z: 0 },
          { x: halfX, y: halfY, z: 0 },
          { x: -halfX, y: halfY, z: 0 }
        );
      } else if (typeName.includes('CircleProfileDef')) {
        // Approximate circle with polygon
        const radius = profile.Radius?.value ?? profile.Radius ?? 1;
        const segments = 16;
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          points.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            z: 0,
          });
        }
      }
    } catch (error) {
      console.warn(`Error extracting profile points:`, error);
    }

    return points;
  }

  /**
   * Extract points from an IFC curve
   * @param {Object} curve - IFC curve entity
   * @returns {Array} Array of 3D points
   * @private
   */
  _extractCurvePoints(curve) {
    const points = [];

    try {
      if (!curve) return points;

      const typeName = this._getTypeName(curve.type);

      if (typeName.includes('Polyline') && curve.Points) {
        for (const pointRef of curve.Points) {
          const point = this.ifcAPI.GetLine(this.modelID, pointRef.value);
          if (point && point.Coordinates) {
            points.push({
              x: point.Coordinates[0]?.value ?? point.Coordinates[0] ?? 0,
              y: point.Coordinates[1]?.value ?? point.Coordinates[1] ?? 0,
              z: point.Coordinates[2]?.value ?? point.Coordinates[2] ?? 0,
            });
          }
        }
      } else if (typeName.includes('IndexedPolyCurve') && curve.Points) {
        // IfcIndexedPolyCurve - get points from coordinate list
        const coordList = this.ifcAPI.GetLine(this.modelID, curve.Points.value);
        if (coordList && coordList.CoordList) {
          for (const coord of coordList.CoordList) {
            points.push({
              x: coord[0]?.value ?? coord[0] ?? 0,
              y: coord[1]?.value ?? coord[1] ?? 0,
              z: coord[2]?.value ?? coord[2] ?? 0,
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error extracting curve points:`, error);
    }

    return points;
  }

  /**
   * Extract faces from IfcMappedItem (geometry reuse)
   * @param {Object} mappedItem - IfcMappedItem entity
   * @param {Array} placementMatrix - Parent 4x4 transformation matrix
   * @param {string} namePrefix - Name prefix for faces
   * @returns {Array} Array of face objects
   * @private
   */
  _extractFacesFromMappedItem(mappedItem, placementMatrix, namePrefix) {
    const faces = [];

    try {
      if (!mappedItem.MappingSource) {
        return faces;
      }

      // Get the mapping source (representation map)
      const repMap = this.ifcAPI.GetLine(this.modelID, mappedItem.MappingSource.value);
      if (!repMap) {
        return faces;
      }

      // Get origin placement from mapping source
      let originMatrix = identityMatrix();
      if (repMap.MappingOrigin) {
        originMatrix = this._getPlacementMatrix(repMap.MappingOrigin.value);
      }

      // Get target placement
      let targetMatrix = identityMatrix();
      if (mappedItem.MappingTarget) {
        targetMatrix = this._getCartesianTransformationMatrix(mappedItem.MappingTarget.value);
      }

      // Combine matrices: parent × origin × target
      const combinedMatrix = multiplyMatrices(
        placementMatrix,
        multiplyMatrices(originMatrix, targetMatrix)
      );

      // Get mapped representation
      if (repMap.MappedRepresentation) {
        const representation = this.ifcAPI.GetLine(this.modelID, repMap.MappedRepresentation.value);
        if (representation && representation.Items) {
          for (const itemRef of representation.Items) {
            const item = this.ifcAPI.GetLine(this.modelID, itemRef.value);
            if (item) {
              const extractedFaces = this._extractFacesFromItem(item, combinedMatrix, namePrefix);
              faces.push(...extractedFaces);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error extracting MappedItem faces:`, error);
    }

    return faces;
  }

  /**
   * Get 4x4 placement matrix from IfcAxis2Placement3D
   * @param {number} placementID - Express ID of placement
   * @returns {Array} 4x4 matrix in column-major order
   * @private
   */
  _getPlacementMatrix(placementID) {
    const matrix = identityMatrix();

    try {
      const placement = this.ifcAPI.GetLine(this.modelID, placementID);
      if (!placement) return matrix;

      // Get location
      let location = { x: 0, y: 0, z: 0 };
      if (placement.Location) {
        const locPoint = this.ifcAPI.GetLine(this.modelID, placement.Location.value);
        if (locPoint && locPoint.Coordinates) {
          location = {
            x: locPoint.Coordinates[0]?.value ?? locPoint.Coordinates[0] ?? 0,
            y: locPoint.Coordinates[1]?.value ?? locPoint.Coordinates[1] ?? 0,
            z: locPoint.Coordinates[2]?.value ?? locPoint.Coordinates[2] ?? 0,
          };
        }
      }

      // Get axis (Z direction)
      let zAxis = { x: 0, y: 0, z: 1 };
      if (placement.Axis) {
        const axisDir = this.ifcAPI.GetLine(this.modelID, placement.Axis.value);
        if (axisDir && axisDir.DirectionRatios) {
          zAxis = {
            x: axisDir.DirectionRatios[0]?.value ?? axisDir.DirectionRatios[0] ?? 0,
            y: axisDir.DirectionRatios[1]?.value ?? axisDir.DirectionRatios[1] ?? 0,
            z: axisDir.DirectionRatios[2]?.value ?? axisDir.DirectionRatios[2] ?? 1,
          };
        }
      }

      // Get ref direction (X direction)
      let xAxis = { x: 1, y: 0, z: 0 };
      if (placement.RefDirection) {
        const refDir = this.ifcAPI.GetLine(this.modelID, placement.RefDirection.value);
        if (refDir && refDir.DirectionRatios) {
          xAxis = {
            x: refDir.DirectionRatios[0]?.value ?? refDir.DirectionRatios[0] ?? 1,
            y: refDir.DirectionRatios[1]?.value ?? refDir.DirectionRatios[1] ?? 0,
            z: refDir.DirectionRatios[2]?.value ?? refDir.DirectionRatios[2] ?? 0,
          };
        }
      }

      // Normalize and orthogonalize
      const zLen = Math.sqrt(zAxis.x ** 2 + zAxis.y ** 2 + zAxis.z ** 2);
      zAxis = { x: zAxis.x / zLen, y: zAxis.y / zLen, z: zAxis.z / zLen };

      // Y = Z × X (cross product)
      const yAxis = {
        x: zAxis.y * xAxis.z - zAxis.z * xAxis.y,
        y: zAxis.z * xAxis.x - zAxis.x * xAxis.z,
        z: zAxis.x * xAxis.y - zAxis.y * xAxis.x,
      };
      const yLen = Math.sqrt(yAxis.x ** 2 + yAxis.y ** 2 + yAxis.z ** 2);
      if (yLen > 0) {
        yAxis.x /= yLen;
        yAxis.y /= yLen;
        yAxis.z /= yLen;
      }

      // Recalculate X = Y × Z for orthogonality
      xAxis = {
        x: yAxis.y * zAxis.z - yAxis.z * zAxis.y,
        y: yAxis.z * zAxis.x - yAxis.x * zAxis.z,
        z: yAxis.x * zAxis.y - yAxis.y * zAxis.x,
      };

      // Build column-major matrix
      return [
        xAxis.x, xAxis.y, xAxis.z, 0,
        yAxis.x, yAxis.y, yAxis.z, 0,
        zAxis.x, zAxis.y, zAxis.z, 0,
        location.x, location.y, location.z, 1,
      ];
    } catch (error) {
      console.warn(`Error getting placement matrix:`, error);
    }

    return matrix;
  }

  /**
   * Get 4x4 matrix from IfcCartesianTransformationOperator3D
   * @param {number} transformID - Express ID of transformation
   * @returns {Array} 4x4 matrix in column-major order
   * @private
   */
  _getCartesianTransformationMatrix(transformID) {
    const matrix = identityMatrix();

    try {
      const transform = this.ifcAPI.GetLine(this.modelID, transformID);
      if (!transform) return matrix;

      // Get scale
      const scale = transform.Scale?.value ?? transform.Scale ?? 1;

      // Get local origin
      let origin = { x: 0, y: 0, z: 0 };
      if (transform.LocalOrigin) {
        const locPoint = this.ifcAPI.GetLine(this.modelID, transform.LocalOrigin.value);
        if (locPoint && locPoint.Coordinates) {
          origin = {
            x: locPoint.Coordinates[0]?.value ?? locPoint.Coordinates[0] ?? 0,
            y: locPoint.Coordinates[1]?.value ?? locPoint.Coordinates[1] ?? 0,
            z: locPoint.Coordinates[2]?.value ?? locPoint.Coordinates[2] ?? 0,
          };
        }
      }

      // Get axis directions
      let axis1 = { x: 1, y: 0, z: 0 };
      let axis2 = { x: 0, y: 1, z: 0 };
      let axis3 = { x: 0, y: 0, z: 1 };

      if (transform.Axis1) {
        const dir = this.ifcAPI.GetLine(this.modelID, transform.Axis1.value);
        if (dir && dir.DirectionRatios) {
          axis1 = {
            x: dir.DirectionRatios[0]?.value ?? dir.DirectionRatios[0] ?? 1,
            y: dir.DirectionRatios[1]?.value ?? dir.DirectionRatios[1] ?? 0,
            z: dir.DirectionRatios[2]?.value ?? dir.DirectionRatios[2] ?? 0,
          };
        }
      }

      if (transform.Axis2) {
        const dir = this.ifcAPI.GetLine(this.modelID, transform.Axis2.value);
        if (dir && dir.DirectionRatios) {
          axis2 = {
            x: dir.DirectionRatios[0]?.value ?? dir.DirectionRatios[0] ?? 0,
            y: dir.DirectionRatios[1]?.value ?? dir.DirectionRatios[1] ?? 1,
            z: dir.DirectionRatios[2]?.value ?? dir.DirectionRatios[2] ?? 0,
          };
        }
      }

      if (transform.Axis3) {
        const dir = this.ifcAPI.GetLine(this.modelID, transform.Axis3.value);
        if (dir && dir.DirectionRatios) {
          axis3 = {
            x: dir.DirectionRatios[0]?.value ?? dir.DirectionRatios[0] ?? 0,
            y: dir.DirectionRatios[1]?.value ?? dir.DirectionRatios[1] ?? 0,
            z: dir.DirectionRatios[2]?.value ?? dir.DirectionRatios[2] ?? 1,
          };
        }
      }

      // Build column-major matrix with scale
      return [
        axis1.x * scale, axis1.y * scale, axis1.z * scale, 0,
        axis2.x * scale, axis2.y * scale, axis2.z * scale, 0,
        axis3.x * scale, axis3.y * scale, axis3.z * scale, 0,
        origin.x, origin.y, origin.z, 1,
      ];
    } catch (error) {
      console.warn(`Error getting cartesian transformation matrix:`, error);
    }

    return matrix;
  }

  /**
   * Create Three.js BufferGeometry from extracted faces
   * @param {Array} faces - Array of face objects from extraction
   * @returns {THREE.BufferGeometry} Merged geometry for all faces
   * @private
   */
  _createGeometryFromFaces(faces) {
    if (!faces || faces.length === 0) {
      return null;
    }

    // Collect all vertices and build triangulated indices
    const positions = [];
    const normals = [];
    const indices = [];
    let vertexOffset = 0;

    for (const face of faces) {
      if (!face.vertices || face.vertices.length < 3) continue;

      // Add vertices
      for (const v of face.vertices) {
        positions.push(v.x, v.y, v.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
      }

      // Triangulate using fan triangulation
      const faceIndices = face.vertices.map((_, i) => i);
      const triangles = fanTriangulate(faceIndices);

      for (const tri of triangles) {
        indices.push(
          tri[0] + vertexOffset,
          tri[1] + vertexOffset,
          tri[2] + vertexOffset
        );
      }

      vertexOffset += face.vertices.length;
    }

    if (positions.length === 0) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    return geometry;
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
   * Get mesh by express ID
   * @param {number} expressID - Express ID
   * @returns {THREE.Mesh|null} Mesh or null
   */
  getMesh(expressID) {
    return this.meshes.get(expressID) || null;
  }

  /**
   * Get body faces for a space by express ID
   * Returns the full 3D geometry faces including pitched ceilings, sloped surfaces, etc.
   * @param {number} expressID - Express ID of the space
   * @returns {Object|null} Object with bodyFaces, floorFaces, ceilingFaces, wallFaces or null
   */
  getSpaceBodyFaces(expressID) {
    const space = this.spaces.find(s => s.expressID === expressID);
    if (!space || !space.hasBodyGeometry) {
      return null;
    }

    return {
      bodyFaces: space.bodyFaces,
      floorFaces: space.floorFaces,
      ceilingFaces: space.ceilingFaces,
      wallFaces: space.wallFaces,
      totalCeilingArea: space.totalCeilingArea,
      totalWallArea: space.totalWallArea,
    };
  }

  /**
   * Create Three.js geometry for a space's body faces
   * Useful for visualization with accurate 3D geometry
   * @param {number} expressID - Express ID of the space
   * @returns {THREE.BufferGeometry|null} BufferGeometry or null if no body geometry
   */
  createSpaceBodyGeometry(expressID) {
    const space = this.spaces.find(s => s.expressID === expressID);
    if (!space || !space.hasBodyGeometry || space.bodyFaces.length === 0) {
      return null;
    }

    return this._createGeometryFromFaces(space.bodyFaces);
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

    // Dispose materials
    Object.values(this.materials).forEach(m => m.dispose());
  }
}
