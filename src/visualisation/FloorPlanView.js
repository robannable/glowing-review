/**
 * Floor Plan View utilities for DaylightLab
 * Helpers for 2D plan view visualization
 */
import * as THREE from 'three';

/**
 * Create a north arrow indicator
 * @param {number} size - Size of the arrow
 * @returns {THREE.Group} North arrow group
 */
export function createNorthArrow(size = 2) {
  const group = new THREE.Group();
  group.name = 'north-arrow';

  // Arrow shaft
  const shaftGeometry = new THREE.BoxGeometry(size * 0.1, size * 0.8, 0.01);
  const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shaft.position.y = size * 0.4;
  group.add(shaft);

  // Arrow head
  const headShape = new THREE.Shape();
  headShape.moveTo(0, 0);
  headShape.lineTo(-size * 0.2, -size * 0.3);
  headShape.lineTo(0, -size * 0.15);
  headShape.lineTo(size * 0.2, -size * 0.3);
  headShape.closePath();

  const headGeometry = new THREE.ShapeGeometry(headShape);
  const headMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.rotation.x = -Math.PI / 2;
  head.position.y = size * 0.85;
  group.add(head);

  // "N" label
  // Using a simple sprite or just skip for now
  // In production, you'd use TextGeometry or a sprite

  return group;
}

/**
 * Create a scale bar for 2D view
 * @param {number} length - Length in meters
 * @param {string} label - Label text
 * @returns {THREE.Group} Scale bar group
 */
export function createScaleBar(length = 5, label = '5m') {
  const group = new THREE.Group();
  group.name = 'scale-bar';

  // Main bar
  const barGeometry = new THREE.BoxGeometry(length, 0.05, 0.01);
  const barMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bar = new THREE.Mesh(barGeometry, barMaterial);
  group.add(bar);

  // End caps
  const capGeometry = new THREE.BoxGeometry(0.05, 0.2, 0.01);
  const leftCap = new THREE.Mesh(capGeometry, barMaterial);
  leftCap.position.x = -length / 2;
  group.add(leftCap);

  const rightCap = new THREE.Mesh(capGeometry, barMaterial);
  rightCap.position.x = length / 2;
  group.add(rightCap);

  return group;
}

/**
 * Create grid lines for 2D view
 * @param {Object} bounds - Bounding box
 * @param {number} spacing - Grid line spacing
 * @returns {THREE.Group} Grid lines group
 */
export function createGridLines(bounds, spacing = 1) {
  const group = new THREE.Group();
  group.name = 'grid-lines';

  const material = new THREE.LineBasicMaterial({
    color: 0x444444,
    transparent: true,
    opacity: 0.3,
  });

  const height = 0.001; // Just above ground

  // Vertical lines (along Z axis)
  for (let x = Math.floor(bounds.minX); x <= Math.ceil(bounds.maxX); x += spacing) {
    const points = [
      new THREE.Vector3(x, height, bounds.minZ),
      new THREE.Vector3(x, height, bounds.maxZ),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    group.add(line);
  }

  // Horizontal lines (along X axis)
  for (let z = Math.floor(bounds.minZ); z <= Math.ceil(bounds.maxZ); z += spacing) {
    const points = [
      new THREE.Vector3(bounds.minX, height, z),
      new THREE.Vector3(bounds.maxX, height, z),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    group.add(line);
  }

  return group;
}

/**
 * Create dimension annotation
 * @param {Object} start - Start point {x, y, z}
 * @param {Object} end - End point {x, y, z}
 * @param {string} label - Dimension label
 * @returns {THREE.Group} Dimension group
 */
export function createDimension(start, end, label = '') {
  const group = new THREE.Group();
  group.name = 'dimension';

  const material = new THREE.LineBasicMaterial({ color: 0x888888 });

  // Main dimension line
  const points = [
    new THREE.Vector3(start.x, start.y || 0.01, start.z),
    new THREE.Vector3(end.x, end.y || 0.01, end.z),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  group.add(line);

  // Tick marks at ends
  const tickSize = 0.2;
  const dir = new THREE.Vector3()
    .subVectors(
      new THREE.Vector3(end.x, 0, end.z),
      new THREE.Vector3(start.x, 0, start.z)
    )
    .normalize();

  // Perpendicular direction
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);

  // Start tick
  const startTick = [
    new THREE.Vector3(
      start.x + perp.x * tickSize,
      0.01,
      start.z + perp.z * tickSize
    ),
    new THREE.Vector3(
      start.x - perp.x * tickSize,
      0.01,
      start.z - perp.z * tickSize
    ),
  ];
  const startTickGeom = new THREE.BufferGeometry().setFromPoints(startTick);
  group.add(new THREE.Line(startTickGeom, material));

  // End tick
  const endTick = [
    new THREE.Vector3(
      end.x + perp.x * tickSize,
      0.01,
      end.z + perp.z * tickSize
    ),
    new THREE.Vector3(
      end.x - perp.x * tickSize,
      0.01,
      end.z - perp.z * tickSize
    ),
  ];
  const endTickGeom = new THREE.BufferGeometry().setFromPoints(endTick);
  group.add(new THREE.Line(endTickGeom, material));

  return group;
}

/**
 * Setup orthographic camera for floor plan view
 * @param {THREE.OrthographicCamera} camera - Camera to setup
 * @param {Object} bounds - Scene bounds
 * @param {number} padding - Padding factor (1.0 = no padding)
 */
export function setupFloorPlanCamera(camera, bounds, padding = 1.2) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const width = (bounds.maxX - bounds.minX) * padding;
  const height = (bounds.maxZ - bounds.minZ) * padding;

  const aspect = camera.right / camera.top;
  const size = Math.max(width, height / aspect);

  camera.left = -size * aspect / 2;
  camera.right = size * aspect / 2;
  camera.top = size / 2;
  camera.bottom = -size / 2;

  camera.position.set(centerX, 50, centerZ);
  camera.lookAt(centerX, 0, centerZ);
  camera.updateProjectionMatrix();
}

/**
 * Create room label for 2D view
 * @param {string} text - Label text
 * @param {Object} position - Position {x, z}
 * @returns {THREE.Sprite} Label sprite
 */
export function createRoomLabel(text, position) {
  // Create canvas for text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.font = 'bold 24px Arial';
  context.fillStyle = 'white';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);

  sprite.position.set(position.x, 0.5, position.z);
  sprite.scale.set(4, 1, 1);
  sprite.name = 'room-label';

  return sprite;
}
