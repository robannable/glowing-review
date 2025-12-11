/**
 * DaylightLab Constants
 */

// IFC Type constants
export const IFCSPACE = 3856911033;
export const IFCWINDOW = 3304561284;
export const IFCDOOR = 395920057;
export const IFCWALL = 2391406946;
export const IFCWALLSTANDARDCASE = 3512223829;
export const IFCSLAB = 1529196076;
export const IFCOPENINGELEMENT = 3588315303;
export const IFCRELSPACEBOUNDARY = 3451746338;
export const IFCRELCONTAINEDINSPATIALSTRUCTURE = 3242617779;
export const IFCRELAGGREGATES = 160246688;
export const IFCPRODUCT = 2439245199;
export const IFCBUILDINGSTOREY = 3124254112;

// Default material properties
export const DEFAULT_REFLECTANCES = {
  ceiling: 0.8,     // White ceiling
  walls: 0.5,       // Light-coloured walls
  floor: 0.2,       // Carpet/wood floor
  external: 0.1,    // External ground/buildings
};

export const DEFAULT_TRANSMITTANCE = 0.7;  // Double glazing
export const MAINTENANCE_FACTOR = 0.9;     // Dirt/degradation allowance

// Grid settings
export const DEFAULT_GRID_SPACING = 0.5;   // meters
export const DEFAULT_WORK_PLANE_HEIGHT = 0.85;  // meters (desk height)
export const DEFAULT_WALL_OFFSET = 0.5;    // meters from walls

// Daylight factor colour scale
export const DF_COLOUR_STOPS = [
  { value: 0, r: 26, g: 26, b: 46 },       // Dark blue (very dark)
  { value: 0.5, r: 194, g: 54, b: 22 },    // Dark red
  { value: 1, r: 230, g: 126, b: 34 },     // Orange
  { value: 2, r: 241, g: 196, b: 15 },     // Yellow
  { value: 3, r: 46, g: 204, b: 113 },     // Light green
  { value: 5, r: 39, g: 174, b: 96 },      // Green
  { value: 10, r: 22, g: 160, b: 133 },    // Teal
];

// Thresholds for compliance
export const DF_THRESHOLDS = {
  poor: 1,        // < 1% is very poor
  minimum: 2,     // < 2% inadequate
  adequate: 3,    // 2-5% adequate
  good: 5,        // > 5% well lit
};

// UK default location (London)
export const DEFAULT_LOCATION = {
  latitude: 51.5,
  longitude: -0.1,
};

// Scene colors
export const COLORS = {
  background: 0x1a1a2e,
  ground: 0x2a2a4a,
  ambient: 0x404040,
  directional: 0xffffff,
  highlight: 0xe94560,
  window: 0x3498db,
  selected: 0xe94560,
};

// Materials
export const MATERIAL_DEFAULTS = {
  opacity: 0.8,
  transparent: true,
  side: 2, // DoubleSide
};
