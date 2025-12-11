/**
 * Legend utilities for DaylightLab
 * Color scale and legend helper functions
 */
import { DF_COLOUR_STOPS } from '../utils/constants.js';

/**
 * Get CSS gradient string for daylight factor scale
 * @returns {string} CSS linear-gradient value
 */
export function getDFGradientCSS() {
  const stops = DF_COLOUR_STOPS.map(stop => {
    const percent = (stop.value / 10) * 100;
    const color = `rgb(${stop.r}, ${stop.g}, ${stop.b})`;
    return `${color} ${percent}%`;
  });

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Get legend tick marks for daylight factor scale
 * @returns {Array} Array of tick mark objects {value, label}
 */
export function getLegendTicks() {
  return [
    { value: 0, label: '0%' },
    { value: 1, label: '1%' },
    { value: 2, label: '2%' },
    { value: 5, label: '5%' },
    { value: 10, label: '10%+' },
  ];
}

/**
 * Get compliance thresholds with descriptions
 * @returns {Array} Array of threshold objects
 */
export function getComplianceThresholds() {
  return [
    {
      min: 0,
      max: 1,
      label: 'Very Poor',
      description: 'Artificial lighting required',
      colorClass: 'poor',
    },
    {
      min: 1,
      max: 2,
      label: 'Poor',
      description: 'Inadequate daylight',
      colorClass: 'poor',
    },
    {
      min: 2,
      max: 5,
      label: 'Adequate',
      description: 'Adequate daylight',
      colorClass: 'adequate',
    },
    {
      min: 5,
      max: Infinity,
      label: 'Good',
      description: 'Well daylit',
      colorClass: 'good',
    },
  ];
}

/**
 * Get classification for a daylight factor value
 * @param {number} df - Daylight factor percentage
 * @returns {Object} Classification object
 */
export function classifyDaylightFactor(df) {
  if (df < 1) {
    return {
      label: 'Very Poor',
      class: 'poor',
      description: 'Artificial lighting required at all times',
    };
  } else if (df < 2) {
    return {
      label: 'Poor',
      class: 'poor',
      description: 'Inadequate daylight, supplementary lighting needed',
    };
  } else if (df < 5) {
    return {
      label: 'Adequate',
      class: 'adequate',
      description: 'Acceptable daylight levels',
    };
  } else {
    return {
      label: 'Good',
      class: 'good',
      description: 'Well daylit, good natural lighting',
    };
  }
}

/**
 * Generate HTML for legend component
 * @param {Object} options - Display options
 * @returns {string} HTML string
 */
export function generateLegendHTML(options = {}) {
  const {
    showThresholds = true,
    showGradient = true,
    orientation = 'vertical',
  } = options;

  let html = '<div class="df-legend">';

  if (showGradient) {
    html += `
      <div class="legend-gradient" style="background: ${getDFGradientCSS()};
        ${orientation === 'vertical' ? 'width: 20px; height: 150px;' : 'height: 20px; width: 100%;'}">
      </div>
      <div class="legend-labels">
        ${getLegendTicks().map(tick => `<span>${tick.label}</span>`).join('')}
      </div>
    `;
  }

  if (showThresholds) {
    const thresholds = getComplianceThresholds();
    html += '<div class="legend-thresholds">';
    for (const threshold of thresholds) {
      html += `
        <div class="threshold-item ${threshold.colorClass}">
          <span class="threshold-range">${threshold.min}-${threshold.max === Infinity ? '+' : threshold.max}%</span>
          <span class="threshold-label">${threshold.label}</span>
        </div>
      `;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Format a daylight factor value for display
 * @param {number} df - Daylight factor value
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
export function formatDaylightFactor(df, decimals = 2) {
  if (df === null || isNaN(df)) return '-';
  return `${df.toFixed(decimals)}%`;
}

/**
 * Format statistics for display
 * @param {Object} stats - Statistics object
 * @returns {Object} Formatted statistics
 */
export function formatStatistics(stats) {
  if (!stats) return null;

  return {
    average: formatDaylightFactor(stats.average),
    min: formatDaylightFactor(stats.min),
    max: formatDaylightFactor(stats.max),
    median: formatDaylightFactor(stats.median),
    uniformity: `${(stats.uniformity * 100).toFixed(0)}%`,
    above2: `${stats.above2.toFixed(0)}%`,
    above5: `${stats.above5.toFixed(0)}%`,
    gridPoints: stats.count.toString(),
  };
}
