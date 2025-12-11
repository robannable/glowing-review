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

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    window.removeEventListener('resize', this._onResize);
  }
}
