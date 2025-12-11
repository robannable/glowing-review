/**
 * Daylight Calculator for DaylightLab
 * Main calculation engine that orchestrates all daylight calculations
 */
import { generateGrid, generateGridFromBoundingBox, estimateGridCount } from './GridGenerator.js';
import { calculateSkyComponent } from './SkyComponent.js';
import { calculateIRC, calculatePositionalIRC } from './ReflectedComponent.js';
import { DEFAULT_REFLECTANCES, DEFAULT_GRID_SPACING, DEFAULT_WORK_PLANE_HEIGHT } from '../utils/constants.js';

export class DaylightCalculator {
  /**
   * Create a daylight calculator
   * @param {Object} room - Room object
   * @param {Array} windows - Windows belonging to the room
   * @param {Object} options - Calculation options
   */
  constructor(room, windows, options = {}) {
    this.room = room;
    this.windows = windows;

    this.options = {
      gridSpacing: options.gridSpacing || DEFAULT_GRID_SPACING,
      workPlaneHeight: options.workPlaneHeight || DEFAULT_WORK_PLANE_HEIGHT,
      reflectances: options.reflectances || DEFAULT_REFLECTANCES,
      usePositionalIRC: options.usePositionalIRC !== false,
    };

    this.grid = [];
    this.baseIRC = 0;
    this.statistics = null;

    this.onProgress = null;
    this.cancelled = false;
  }

  /**
   * Run the daylight calculation
   * @returns {Promise<Object>} Calculation results
   */
  async calculate() {
    this.cancelled = false;

    // Step 1: Generate analysis grid
    this._reportProgress('Generating grid...', 0);

    // Get room floor level from bounding box
    const floorLevel = this.room.boundingBox?.minY || 0;

    if (this.room.floorPolygon && this.room.floorPolygon.length >= 3) {
      this.grid = generateGrid(this.room.floorPolygon, {
        spacing: this.options.gridSpacing,
        workPlaneHeight: this.options.workPlaneHeight,
        floorLevel: floorLevel,
      });
    } else if (this.room.boundingBox) {
      this.grid = generateGridFromBoundingBox(this.room.boundingBox, {
        spacing: this.options.gridSpacing,
        workPlaneHeight: this.options.workPlaneHeight,
      });
    }

    if (this.grid.length === 0) {
      throw new Error('Could not generate analysis grid for room');
    }

    console.log(`Generated ${this.grid.length} grid points`);

    // Step 2: Calculate IRC (once for the whole room)
    this._reportProgress('Calculating reflected component...', 10);
    this.baseIRC = calculateIRC(this.room, this.windows, this.options.reflectances);
    console.log(`Base IRC: ${this.baseIRC.toFixed(2)}%`);

    // Step 3: Calculate SC for each grid point
    const totalPoints = this.grid.length;
    let processedPoints = 0;

    for (let i = 0; i < totalPoints; i++) {
      if (this.cancelled) {
        throw new Error('Calculation cancelled');
      }

      const point = this.grid[i];

      // Calculate Sky Component
      point.skyComponent = calculateSkyComponent(point.position, this.windows);

      // Calculate IRC (position-dependent if enabled)
      if (this.options.usePositionalIRC) {
        point.irc = calculatePositionalIRC(
          point.position,
          this.baseIRC,
          this.windows,
          this.room
        );
      } else {
        point.irc = this.baseIRC;
      }

      // Total Daylight Factor
      point.daylightFactor = point.skyComponent + point.irc;

      processedPoints++;

      // Report progress every 10 points or at end
      if (processedPoints % 10 === 0 || processedPoints === totalPoints) {
        const progress = 10 + (processedPoints / totalPoints) * 80;
        this._reportProgress(
          `Calculating: ${processedPoints}/${totalPoints} points...`,
          progress
        );

        // Yield to main thread
        await this._sleep(0);
      }
    }

    // Step 4: Calculate statistics
    this._reportProgress('Calculating statistics...', 95);
    this.statistics = this._calculateStatistics();

    this._reportProgress('Complete', 100);

    return {
      grid: this.grid,
      statistics: this.statistics,
      baseIRC: this.baseIRC,
    };
  }

  /**
   * Calculate statistics from grid results
   * @returns {Object} Statistics object
   * @private
   */
  _calculateStatistics() {
    const values = this.grid
      .map(p => p.daylightFactor)
      .filter(v => v !== null && !isNaN(v));

    const n = values.length;

    if (n === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        median: 0,
        standardDeviation: 0,
        uniformity: 0,
        above1: 0,
        above2: 0,
        above3: 0,
        above5: 0,
      };
    }

    // Sort for percentiles
    const sorted = [...values].sort((a, b) => a - b);

    // Basic statistics
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / n;
    const min = sorted[0];
    const max = sorted[n - 1];
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / n;
    const standardDeviation = Math.sqrt(variance);

    // Uniformity ratio (min/average)
    const uniformity = average > 0 ? min / average : 0;

    // Threshold compliance
    const above1 = (values.filter(v => v >= 1).length / n) * 100;
    const above2 = (values.filter(v => v >= 2).length / n) * 100;
    const above3 = (values.filter(v => v >= 3).length / n) * 100;
    const above5 = (values.filter(v => v >= 5).length / n) * 100;

    return {
      count: n,
      average,
      min,
      max,
      median,
      standardDeviation,
      uniformity,
      above1,
      above2,
      above3,
      above5,
    };
  }

  /**
   * Get grid results
   * @returns {Array} Grid array with calculated values
   */
  getGrid() {
    return this.grid;
  }

  /**
   * Get calculated statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    return this.statistics;
  }

  /**
   * Get estimated grid count
   * @returns {number} Estimated number of grid points
   */
  getEstimatedGridCount() {
    return estimateGridCount(this.room, this.options.gridSpacing);
  }

  /**
   * Cancel ongoing calculation
   */
  cancel() {
    this.cancelled = true;
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
   * Sleep for async yielding
   * @param {number} ms - Milliseconds
   * @returns {Promise}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
