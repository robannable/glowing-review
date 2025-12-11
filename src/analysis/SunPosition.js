/**
 * Sun Position Calculator for DaylightLab
 * Wrapper around SunCalc for sun position calculations
 */
import SunCalc from 'suncalc';
import { DEFAULT_LOCATION } from '../utils/constants.js';

/**
 * Get sun position for a given time and location
 * @param {Date} date - Date and time
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @returns {Object} Sun position {altitude, azimuth}
 */
export function getSunPosition(date, latitude = DEFAULT_LOCATION.latitude, longitude = DEFAULT_LOCATION.longitude) {
  const position = SunCalc.getPosition(date, latitude, longitude);

  return {
    altitude: position.altitude, // Radians, 0 at horizon, π/2 at zenith
    azimuth: position.azimuth, // Radians, 0 = south, π/2 = west
    altitudeDegrees: position.altitude * (180 / Math.PI),
    azimuthDegrees: position.azimuth * (180 / Math.PI) + 180, // Convert to 0 = north
  };
}

/**
 * Get sun times for a given date and location
 * @param {Date} date - Date
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @returns {Object} Sun times (sunrise, sunset, noon, etc.)
 */
export function getSunTimes(date, latitude = DEFAULT_LOCATION.latitude, longitude = DEFAULT_LOCATION.longitude) {
  const times = SunCalc.getTimes(date, latitude, longitude);

  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    solarNoon: times.solarNoon,
    dawn: times.dawn,
    dusk: times.dusk,
    dayLength: (times.sunset - times.sunrise) / (1000 * 60 * 60), // Hours
  };
}

/**
 * Calculate sun vector (direction from ground to sun)
 * @param {Date} date - Date and time
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @returns {Object} Sun direction vector {x, y, z}
 */
export function getSunVector(date, latitude = DEFAULT_LOCATION.latitude, longitude = DEFAULT_LOCATION.longitude) {
  const position = getSunPosition(date, latitude, longitude);

  // Convert altitude and azimuth to Cartesian coordinates
  // In Three.js: Y is up, X is east, Z is south
  const cosAlt = Math.cos(position.altitude);

  return {
    x: -Math.sin(position.azimuth) * cosAlt, // East-West
    y: Math.sin(position.altitude), // Up
    z: -Math.cos(position.azimuth) * cosAlt, // North-South
  };
}

/**
 * Check if sun is above horizon
 * @param {Date} date - Date and time
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {boolean} True if sun is above horizon
 */
export function isSunUp(date, latitude = DEFAULT_LOCATION.latitude, longitude = DEFAULT_LOCATION.longitude) {
  const position = getSunPosition(date, latitude, longitude);
  return position.altitude > 0;
}

/**
 * Get CIE sky luminance factor for an altitude angle
 * Under CIE Standard Overcast Sky: L(θ) = Lz × (1 + 2 sin θ) / 3
 * @param {number} altitude - Altitude angle in radians
 * @returns {number} Luminance factor (0 to 1, normalized to zenith)
 */
export function getCIEOvercastLuminance(altitude) {
  if (altitude <= 0) return 0;
  return (1 + 2 * Math.sin(altitude)) / 3;
}

/**
 * Calculate external illuminance for CIE Overcast Sky
 * Design sky illuminance (diffuse horizontal illuminance)
 * @returns {number} External illuminance in lux (standardized value)
 */
export function getDesignSkyIlluminance() {
  // CIE design sky - 10,000 lux diffuse horizontal illuminance
  // This is a standard value used for daylight factor calculations
  return 10000;
}
