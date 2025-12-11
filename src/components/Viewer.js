/**
 * Three.js Viewer for DaylightLab
 * Manages the 3D scene, camera, and rendering
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS } from '../utils/constants.js';

export class Viewer {
  /**
   * Create a new Viewer
   * @param {HTMLElement} container - Container element for the canvas
   */
  constructor(container) {
    this.container = container;
    this.canvas = container.querySelector('#canvas') || container;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animationId = null;

    this.modelGroup = new THREE.Group();
    this.roomsGroup = new THREE.Group();
    this.heatmapGroup = new THREE.Group();
    this.helpersGroup = new THREE.Group();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.is2DView = false;
    this.savedCameraState = null;

    // Display mode: 'solid', 'wireframe', 'hidden'
    this.displayMode = 'solid';
    this.originalMaterials = new Map();

    // Section cutting (clipping plane)
    this.clippingEnabled = false;
    this.clippingPlane = null;
    this.clippingHelper = null;
    this.modelBounds = null;

    // Sun path visualization
    this.sunPathGroup = new THREE.Group();
    this.sunPathGroup.name = 'sunPath';

    // Annotations
    this.annotationsGroup = new THREE.Group();
    this.annotationsGroup.name = 'annotations';
    this.annotations = [];
  }

  /**
   * Initialize the viewer
   */
  init() {
    this._createScene();
    this._createCamera();
    this._createRenderer();
    this._createControls();
    this._createLights();
    this._createGround();
    this._addGroups();

    // Handle resize
    window.addEventListener('resize', () => this._onResize());

    // Start animation loop
    this.animate();

    return this;
  }

  /**
   * Create the Three.js scene
   * @private
   */
  _createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
  }

  /**
   * Create the camera
   * @private
   */
  _createCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;

    // Perspective camera for 3D view
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.perspectiveCamera.position.set(20, 20, 20);
    this.perspectiveCamera.lookAt(0, 0, 0);

    // Orthographic camera for 2D view
    const frustumSize = 30;
    this.orthographicCamera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    this.orthographicCamera.position.set(0, 50, 0);
    this.orthographicCamera.lookAt(0, 0, 0);

    this.camera = this.perspectiveCamera;
  }

  /**
   * Create the WebGL renderer
   * @private
   */
  _createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true, // For screenshots
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true; // Enable clipping planes
  }

  /**
   * Create orbit controls
   * @private
   */
  _createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below ground
    this.controls.target.set(0, 0, 0);
  }

  /**
   * Create scene lighting
   * @private
   */
  _createLights() {
    // Ambient light
    const ambient = new THREE.AmbientLight(COLORS.ambient, 0.6);
    this.scene.add(ambient);

    // Main directional light (sun)
    const directional = new THREE.DirectionalLight(COLORS.directional, 0.8);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 100;
    directional.shadow.camera.left = -30;
    directional.shadow.camera.right = 30;
    directional.shadow.camera.top = 30;
    directional.shadow.camera.bottom = -30;
    this.scene.add(directional);

    // Fill light
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-10, 10, -10);
    this.scene.add(fill);

    // Hemisphere light for ambient sky/ground
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    this.scene.add(hemisphere);
  }

  /**
   * Create ground plane
   * @private
   */
  _createGround() {
    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.ground,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.helpersGroup.add(this.ground);

    // Grid helper
    const grid = new THREE.GridHelper(100, 100, 0x444444, 0x333333);
    grid.position.y = 0;
    this.helpersGroup.add(grid);

    // Axis helper (small, at origin)
    const axisHelper = new THREE.AxesHelper(2);
    axisHelper.position.set(0, 0.01, 0);
    this.helpersGroup.add(axisHelper);
  }

  /**
   * Add groups to scene
   * @private
   */
  _addGroups() {
    this.modelGroup.name = 'model';
    this.roomsGroup.name = 'rooms';
    this.heatmapGroup.name = 'heatmap';
    this.helpersGroup.name = 'helpers';

    this.scene.add(this.helpersGroup);
    this.scene.add(this.modelGroup);
    this.scene.add(this.roomsGroup);
    this.scene.add(this.heatmapGroup);
    this.scene.add(this.sunPathGroup);
    this.scene.add(this.annotationsGroup);
  }

  /**
   * Handle window resize
   * @private
   */
  _onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    // Update perspective camera
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();

    // Update orthographic camera
    const frustumSize = 30;
    this.orthographicCamera.left = -frustumSize * aspect / 2;
    this.orthographicCamera.right = frustumSize * aspect / 2;
    this.orthographicCamera.updateProjectionMatrix();

    // Update renderer
    this.renderer.setSize(width, height);
  }

  /**
   * Animation loop
   */
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Add an object to the model group
   * @param {THREE.Object3D} object - Object to add
   */
  addObject(object) {
    this.modelGroup.add(object);
  }

  /**
   * Remove an object from the model group
   * @param {THREE.Object3D} object - Object to remove
   */
  removeObject(object) {
    this.modelGroup.remove(object);
  }

  /**
   * Clear all model objects
   */
  clearModel() {
    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0];
      this._disposeObject(child);
      this.modelGroup.remove(child);
    }
  }

  /**
   * Clear room meshes
   */
  clearRooms() {
    while (this.roomsGroup.children.length > 0) {
      const child = this.roomsGroup.children[0];
      this._disposeObject(child);
      this.roomsGroup.remove(child);
    }
  }

  /**
   * Clear heatmap
   */
  clearHeatmap() {
    while (this.heatmapGroup.children.length > 0) {
      const child = this.heatmapGroup.children[0];
      this._disposeObject(child);
      this.heatmapGroup.remove(child);
    }
  }

  /**
   * Add room mesh
   * @param {THREE.Mesh} mesh - Room mesh
   */
  addRoomMesh(mesh) {
    this.roomsGroup.add(mesh);
  }

  /**
   * Add heatmap mesh
   * @param {THREE.Mesh} mesh - Heatmap mesh
   */
  addHeatmap(mesh) {
    this.heatmapGroup.add(mesh);
  }

  /**
   * Dispose of an object and its resources
   * @param {THREE.Object3D} object - Object to dispose
   * @private
   */
  _disposeObject(object) {
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(m => m.dispose());
      } else {
        object.material.dispose();
      }
    }
    if (object.children) {
      object.children.forEach(child => this._disposeObject(child));
    }
  }

  /**
   * Fit camera to show an object or bounding box
   * @param {THREE.Object3D|THREE.Box3} target - Object or bounding box to fit
   */
  fitCameraToObject(target) {
    let box;
    if (target instanceof THREE.Box3) {
      box = target;
    } else {
      box = new THREE.Box3().setFromObject(target);
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.perspectiveCamera.fov * (Math.PI / 180);
    let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
    cameraDistance *= 1.5; // Add some padding

    // Position camera
    const direction = new THREE.Vector3(1, 0.8, 1).normalize();
    this.perspectiveCamera.position.copy(center).add(direction.multiplyScalar(cameraDistance));

    // Update controls target
    this.controls.target.copy(center);
    this.controls.update();

    // Update orthographic camera for 2D view
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const frustumSize = maxDim * 1.5;
    this.orthographicCamera.left = -frustumSize * aspect / 2;
    this.orthographicCamera.right = frustumSize * aspect / 2;
    this.orthographicCamera.top = frustumSize / 2;
    this.orthographicCamera.bottom = -frustumSize / 2;
    this.orthographicCamera.position.set(center.x, center.y + 50, center.z);
    this.orthographicCamera.lookAt(center);
    this.orthographicCamera.updateProjectionMatrix();
  }

  /**
   * Reset view to default position
   */
  resetView() {
    this.perspectiveCamera.position.set(20, 20, 20);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // If there's a model, fit to it
    if (this.modelGroup.children.length > 0) {
      this.fitCameraToObject(this.modelGroup);
    }
  }

  /**
   * Switch to 2D plan view
   */
  setView2D() {
    if (this.is2DView) return;

    // Save 3D camera state
    this.savedCameraState = {
      position: this.perspectiveCamera.position.clone(),
      target: this.controls.target.clone(),
    };

    // Switch to orthographic camera
    this.camera = this.orthographicCamera;
    this.controls.object = this.orthographicCamera;

    // Position camera above model looking down
    if (this.modelGroup.children.length > 0) {
      const box = new THREE.Box3().setFromObject(this.modelGroup);
      const center = new THREE.Vector3();
      box.getCenter(center);

      this.orthographicCamera.position.set(center.x, 50, center.z);
      this.orthographicCamera.lookAt(center.x, 0, center.z);
      this.controls.target.set(center.x, 0, center.z);
    }

    // Restrict rotation for 2D view
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = 0;
    this.controls.enableRotate = false;
    this.controls.update();

    this.is2DView = true;
  }

  /**
   * Switch to 3D view
   */
  setView3D() {
    if (!this.is2DView) return;

    // Restore perspective camera
    this.camera = this.perspectiveCamera;
    this.controls.object = this.perspectiveCamera;

    // Restore saved state if available
    if (this.savedCameraState) {
      this.perspectiveCamera.position.copy(this.savedCameraState.position);
      this.controls.target.copy(this.savedCameraState.target);
    }

    // Restore rotation
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.enableRotate = true;
    this.controls.update();

    this.is2DView = false;
  }

  /**
   * Perform raycast from mouse position
   * @param {MouseEvent} event - Mouse event
   * @param {Array} objects - Objects to test against
   * @returns {Array} Intersections
   */
  raycast(event, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /**
   * Take a screenshot of the current view
   * @returns {string} Data URL of the screenshot
   */
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /**
   * Set the display mode for the building model
   * @param {string} mode - 'solid', 'wireframe', or 'hidden'
   */
  setDisplayMode(mode) {
    if (this.displayMode === mode) return;

    this.displayMode = mode;

    this.modelGroup.traverse((object) => {
      if (object.isMesh) {
        switch (mode) {
          case 'solid':
            // Restore original material
            if (this.originalMaterials.has(object.uuid)) {
              object.material = this.originalMaterials.get(object.uuid);
            }
            object.visible = true;
            break;

          case 'wireframe':
            // Store original material if not already stored
            if (!this.originalMaterials.has(object.uuid)) {
              this.originalMaterials.set(object.uuid, object.material);
            }
            // Create wireframe material
            object.material = new THREE.MeshBasicMaterial({
              color: 0x888888,
              wireframe: true,
              transparent: true,
              opacity: 0.5,
            });
            object.visible = true;
            break;

          case 'hidden':
            // Store original material if not already stored
            if (!this.originalMaterials.has(object.uuid)) {
              this.originalMaterials.set(object.uuid, object.material);
            }
            object.visible = false;
            break;
        }
      }
    });
  }

  /**
   * Get current display mode
   * @returns {string} Current display mode
   */
  getDisplayMode() {
    return this.displayMode;
  }

  /**
   * Cycle through display modes: solid -> wireframe -> hidden -> solid
   * @returns {string} New display mode
   */
  cycleDisplayMode() {
    const modes = ['solid', 'wireframe', 'hidden'];
    const currentIndex = modes.indexOf(this.displayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setDisplayMode(modes[nextIndex]);
    return this.displayMode;
  }

  // ============================================
  // Section Cutting (Clipping Plane)
  // ============================================

  /**
   * Enable section cutting
   * @param {string} axis - 'x', 'y', or 'z' (default 'y' for horizontal cut)
   * @param {number} position - Initial position (0-1 normalized)
   */
  enableSectionCut(axis = 'y', position = 0.5) {
    // Calculate model bounds if not already done
    if (!this.modelBounds && this.modelGroup.children.length > 0) {
      this.modelBounds = new THREE.Box3().setFromObject(this.modelGroup);
    }

    if (!this.modelBounds) return;

    // Create clipping plane based on axis
    const normal = new THREE.Vector3();
    switch (axis.toLowerCase()) {
      case 'x': normal.set(-1, 0, 0); break;
      case 'z': normal.set(0, 0, -1); break;
      case 'y':
      default: normal.set(0, -1, 0); break;
    }

    this.clippingPlane = new THREE.Plane(normal, 0);
    this.clippingAxis = axis.toLowerCase();

    // Set initial position
    this.setSectionPosition(position);

    // Apply clipping plane to all materials in the model
    this._applyClippingPlane(true);

    // Create visual helper
    this._createClippingHelper();

    this.clippingEnabled = true;
  }

  /**
   * Disable section cutting
   */
  disableSectionCut() {
    if (!this.clippingEnabled) return;

    // Remove clipping plane from all materials
    this._applyClippingPlane(false);

    // Remove helper
    if (this.clippingHelper) {
      this.helpersGroup.remove(this.clippingHelper);
      this._disposeObject(this.clippingHelper);
      this.clippingHelper = null;
    }

    this.clippingPlane = null;
    this.clippingEnabled = false;
  }

  /**
   * Toggle section cutting
   * @param {string} axis - 'x', 'y', or 'z'
   * @returns {boolean} New state
   */
  toggleSectionCut(axis = 'y') {
    if (this.clippingEnabled) {
      this.disableSectionCut();
    } else {
      this.enableSectionCut(axis);
    }
    return this.clippingEnabled;
  }

  /**
   * Set section cut position
   * @param {number} position - 0-1 normalized position along axis
   */
  setSectionPosition(position) {
    if (!this.clippingPlane || !this.modelBounds) return;

    const min = this.modelBounds.min;
    const max = this.modelBounds.max;

    let constant;
    switch (this.clippingAxis) {
      case 'x':
        constant = min.x + (max.x - min.x) * position;
        break;
      case 'z':
        constant = min.z + (max.z - min.z) * position;
        break;
      case 'y':
      default:
        constant = min.y + (max.y - min.y) * position;
        break;
    }

    this.clippingPlane.constant = constant;

    // Update helper position
    this._updateClippingHelper(constant);
  }

  /**
   * Apply clipping plane to all model materials
   * @param {boolean} enable - Whether to enable or disable clipping
   * @private
   */
  _applyClippingPlane(enable) {
    const clippingPlanes = enable ? [this.clippingPlane] : [];

    this.modelGroup.traverse((object) => {
      if (object.isMesh && object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => {
            mat.clippingPlanes = clippingPlanes;
            mat.clipShadows = true;
            mat.needsUpdate = true;
          });
        } else {
          object.material.clippingPlanes = clippingPlanes;
          object.material.clipShadows = true;
          object.material.needsUpdate = true;
        }
      }
    });
  }

  /**
   * Create visual helper for clipping plane
   * @private
   */
  _createClippingHelper() {
    if (!this.modelBounds) return;

    const size = new THREE.Vector3();
    this.modelBounds.getSize(size);
    const maxSize = Math.max(size.x, size.z) * 1.2;

    // Create plane geometry for the helper
    const geometry = new THREE.PlaneGeometry(maxSize, maxSize);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.clippingHelper = new THREE.Mesh(geometry, material);

    // Rotate based on axis
    switch (this.clippingAxis) {
      case 'x':
        this.clippingHelper.rotation.y = Math.PI / 2;
        break;
      case 'z':
        // No rotation needed for Z
        break;
      case 'y':
      default:
        this.clippingHelper.rotation.x = -Math.PI / 2;
        break;
    }

    // Add edge ring for visibility
    const edgeGeometry = new THREE.RingGeometry(maxSize / 2 - 0.1, maxSize / 2, 64);
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.rotation.copy(this.clippingHelper.rotation);
    this.clippingHelper.add(edge);

    this.helpersGroup.add(this.clippingHelper);
  }

  /**
   * Update clipping helper position
   * @param {number} constant - Plane constant value
   * @private
   */
  _updateClippingHelper(constant) {
    if (!this.clippingHelper || !this.modelBounds) return;

    const center = new THREE.Vector3();
    this.modelBounds.getCenter(center);

    switch (this.clippingAxis) {
      case 'x':
        this.clippingHelper.position.set(constant, center.y, center.z);
        break;
      case 'z':
        this.clippingHelper.position.set(center.x, center.y, constant);
        break;
      case 'y':
      default:
        this.clippingHelper.position.set(center.x, constant, center.z);
        break;
    }
  }

  /**
   * Get section cut bounds for UI slider
   * @returns {Object} { min, max, current }
   */
  getSectionBounds() {
    if (!this.modelBounds) {
      if (this.modelGroup.children.length > 0) {
        this.modelBounds = new THREE.Box3().setFromObject(this.modelGroup);
      } else {
        return { min: 0, max: 10, current: 5 };
      }
    }

    const axis = this.clippingAxis || 'y';
    const min = this.modelBounds.min[axis];
    const max = this.modelBounds.max[axis];
    const current = this.clippingPlane ? this.clippingPlane.constant : (min + max) / 2;

    return { min, max, current };
  }

  // ============================================
  // Sun Path Visualization
  // ============================================

  /**
   * Show sun path arc for a given location and date
   * @param {Object} options - { latitude, longitude, date }
   */
  showSunPath(options = {}) {
    const {
      latitude = 51.5,
      longitude = -0.1,
      date = new Date(),
    } = options;

    // Clear existing sun path
    this.clearSunPath();

    // Calculate sun positions throughout the day
    const positions = this._calculateSunPositions(latitude, longitude, date);

    if (positions.length === 0) return;

    // Get model center for positioning
    let center = new THREE.Vector3(0, 0, 0);
    if (this.modelGroup.children.length > 0) {
      const box = new THREE.Box3().setFromObject(this.modelGroup);
      box.getCenter(center);
    }

    const radius = 20; // Sun path radius

    // Create sun path arc
    const points = positions.map(pos => {
      const x = center.x + radius * Math.cos(pos.azimuthRad) * Math.cos(pos.altitudeRad);
      const y = center.y + radius * Math.sin(pos.altitudeRad);
      const z = center.z + radius * Math.sin(pos.azimuthRad) * Math.cos(pos.altitudeRad);
      return new THREE.Vector3(x, Math.max(y, center.y), z);
    });

    // Create the arc line
    const curve = new THREE.CatmullRomCurve3(points);
    const arcGeometry = new THREE.TubeGeometry(curve, 64, 0.1, 8, false);
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.6,
    });
    const arc = new THREE.Mesh(arcGeometry, arcMaterial);
    this.sunPathGroup.add(arc);

    // Add hour markers
    for (let hour = 6; hour <= 18; hour += 2) {
      const pos = positions.find(p => p.hour === hour);
      if (pos && pos.altitudeRad > 0) {
        const x = center.x + radius * Math.cos(pos.azimuthRad) * Math.cos(pos.altitudeRad);
        const y = center.y + radius * Math.sin(pos.altitudeRad);
        const z = center.z + radius * Math.sin(pos.azimuthRad) * Math.cos(pos.altitudeRad);

        // Sun sphere
        const sunGeom = new THREE.SphereGeometry(0.5, 16, 16);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const sun = new THREE.Mesh(sunGeom, sunMat);
        sun.position.set(x, Math.max(y, center.y + 0.5), z);
        this.sunPathGroup.add(sun);

        // Hour label (using sprite)
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${hour}:00`, 32, 24);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(x, Math.max(y, center.y + 0.5) + 1.5, z);
        sprite.scale.set(3, 1.5, 1);
        this.sunPathGroup.add(sprite);
      }
    }

    // Add compass directions
    this._addCompassMarkers(center, radius);
  }

  /**
   * Calculate sun positions throughout the day
   * @param {number} latitude
   * @param {number} longitude
   * @param {Date} date
   * @returns {Array} Sun positions with altitude and azimuth
   * @private
   */
  _calculateSunPositions(latitude, longitude, date) {
    const positions = [];
    const dayOfYear = this._getDayOfYear(date);
    const latRad = latitude * Math.PI / 180;

    // Declination angle (simplified)
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180) * Math.PI / 180;

    for (let hour = 5; hour <= 20; hour += 0.5) {
      // Hour angle
      const hourAngle = (hour - 12) * 15 * Math.PI / 180;

      // Solar altitude
      const sinAlt = Math.sin(latRad) * Math.sin(declination) +
                     Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
      const altitude = Math.asin(sinAlt);

      // Solar azimuth
      const cosAz = (Math.sin(declination) - Math.sin(latRad) * sinAlt) /
                    (Math.cos(latRad) * Math.cos(altitude));
      let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
      if (hour > 12) azimuth = 2 * Math.PI - azimuth;

      // Adjust to Three.js coordinate system (Z = North)
      azimuth = Math.PI - azimuth;

      if (altitude > 0) {
        positions.push({
          hour: Math.floor(hour),
          altitudeRad: altitude,
          azimuthRad: azimuth,
          altitude: altitude * 180 / Math.PI,
          azimuth: azimuth * 180 / Math.PI,
        });
      }
    }

    return positions;
  }

  /**
   * Get day of year
   * @param {Date} date
   * @returns {number}
   * @private
   */
  _getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Add compass direction markers
   * @param {THREE.Vector3} center
   * @param {number} radius
   * @private
   */
  _addCompassMarkers(center, radius) {
    const directions = [
      { label: 'N', angle: 0 },
      { label: 'E', angle: Math.PI / 2 },
      { label: 'S', angle: Math.PI },
      { label: 'W', angle: -Math.PI / 2 },
    ];

    directions.forEach(dir => {
      const x = center.x + (radius + 2) * Math.sin(dir.angle);
      const z = center.z + (radius + 2) * Math.cos(dir.angle);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = dir.label === 'N' ? '#ff4444' : '#aaaaaa';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(dir.label, 32, 48);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(x, center.y + 0.5, z);
      sprite.scale.set(2, 2, 1);
      this.sunPathGroup.add(sprite);
    });
  }

  /**
   * Clear sun path visualization
   */
  clearSunPath() {
    while (this.sunPathGroup.children.length > 0) {
      const child = this.sunPathGroup.children[0];
      this._disposeObject(child);
      this.sunPathGroup.remove(child);
    }
  }

  /**
   * Toggle sun path visibility
   * @param {Object} options - Sun path options
   * @returns {boolean} New visibility state
   */
  toggleSunPath(options) {
    if (this.sunPathGroup.children.length > 0) {
      this.clearSunPath();
      return false;
    } else {
      this.showSunPath(options);
      return true;
    }
  }

  // ============================================
  // Annotations
  // ============================================

  /**
   * Add an annotation marker at a 3D position
   * @param {THREE.Vector3} position - 3D position
   * @param {string} text - Annotation text
   * @param {string} color - Marker color (hex string)
   * @returns {Object} Annotation object
   */
  addAnnotation(position, text, color = '#ffaa00') {
    const id = `annotation_${Date.now()}`;

    // Create pin marker
    const markerGroup = new THREE.Group();
    markerGroup.name = id;

    // Sphere head
    const sphereGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.y = 0.5;
    markerGroup.add(sphere);

    // Pin shaft
    const shaftGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    const shaft = new THREE.Mesh(shaftGeom, shaftMat);
    shaft.position.y = 0.25;
    markerGroup.add(shaft);

    // Point tip (touches surface)
    const tipGeom = new THREE.ConeGeometry(0.08, 0.15, 8);
    const tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.y = 0;
    tip.rotation.x = Math.PI;
    markerGroup.add(tip);

    // Create text label sprite
    const label = this._createTextSprite(text, color);
    label.position.y = 0.9; // Above the pin head
    markerGroup.add(label);

    // Position the marker exactly at the hit point
    markerGroup.position.copy(position);

    // Store annotation data
    const annotation = {
      id,
      position: position.clone(),
      text,
      color,
      mesh: markerGroup,
      label,
    };

    this.annotations.push(annotation);
    this.annotationsGroup.add(markerGroup);

    return annotation;
  }

  /**
   * Create a text sprite for annotation labels
   * @param {string} text - Label text
   * @param {string} bgColor - Background color
   * @returns {THREE.Sprite}
   * @private
   */
  _createTextSprite(text, bgColor = '#ffaa00') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Measure text to size canvas appropriately
    ctx.font = 'bold 28px Arial';
    const textWidth = Math.min(ctx.measureText(text).width + 20, 300);

    canvas.width = textWidth;
    canvas.height = 40;

    // Draw rounded background
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
    ctx.fill();

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate text if too long
    let displayText = text;
    if (ctx.measureText(text).width > canvas.width - 16) {
      while (ctx.measureText(displayText + '...').width > canvas.width - 16 && displayText.length > 0) {
        displayText = displayText.slice(0, -1);
      }
      displayText += '...';
    }
    ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Always visible
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(canvas.width / 60, canvas.height / 60, 1);

    return sprite;
  }

  /**
   * Remove an annotation by ID
   * @param {string} id - Annotation ID
   */
  removeAnnotation(id) {
    const index = this.annotations.findIndex(a => a.id === id);
    if (index === -1) return;

    const annotation = this.annotations[index];
    this.annotationsGroup.remove(annotation.mesh);
    this._disposeObject(annotation.mesh);
    this.annotations.splice(index, 1);
  }

  /**
   * Clear all annotations
   */
  clearAnnotations() {
    while (this.annotationsGroup.children.length > 0) {
      const child = this.annotationsGroup.children[0];
      this._disposeObject(child);
      this.annotationsGroup.remove(child);
    }
    this.annotations = [];
  }

  /**
   * Get annotation at screen position (if any)
   * @param {MouseEvent} event - Mouse event
   * @returns {Object|null} Annotation or null
   */
  getAnnotationAt(event) {
    const intersects = this.raycast(event, this.annotationsGroup.children);
    if (intersects.length > 0) {
      // Find parent marker group
      let obj = intersects[0].object;
      while (obj.parent && obj.parent !== this.annotationsGroup) {
        obj = obj.parent;
      }

      // Find annotation by mesh
      return this.annotations.find(a => a.mesh === obj) || null;
    }
    return null;
  }

  /**
   * Get 3D position from screen click
   * @param {MouseEvent} event - Mouse event
   * @returns {THREE.Vector3|null} 3D position or null
   */
  getClickPosition(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Collect all meshes from model group recursively
    const meshes = [];
    this.modelGroup.traverse((obj) => {
      if (obj.isMesh && obj.visible) {
        meshes.push(obj);
      }
    });

    // Also include room meshes and heatmap
    this.roomsGroup.traverse((obj) => {
      if (obj.isMesh && obj.visible) {
        meshes.push(obj);
      }
    });

    // Raycast against all model meshes
    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      // Return the exact hit point on the surface
      return intersects[0].point.clone();
    }

    // Fallback to ground plane
    const groundIntersects = this.raycaster.intersectObject(this.ground, false);
    if (groundIntersects.length > 0) {
      return groundIntersects[0].point.clone();
    }

    return null;
  }

  /**
   * Get all annotations
   * @returns {Array} Array of annotations
   */
  getAnnotations() {
    return this.annotations;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.clearModel();
    this.clearRooms();
    this.clearHeatmap();
    this.clearSunPath();
    this.disableSectionCut();

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    window.removeEventListener('resize', this._onResize);
  }
}
