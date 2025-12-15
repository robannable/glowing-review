/**
 * Batch Analysis Module for DaylightLab
 * Handles multi-room analysis, compliance checking, and optimization hints
 */

import { DaylightCalculator } from './DaylightCalculator.js';

// BREEAM/LEED Compliance thresholds
export const COMPLIANCE_STANDARDS = {
  BREEAM: {
    name: 'BREEAM',
    avgDF: 2.0,      // Average DF for habitable rooms
    minDF: 0.6,      // Minimum point DF
    areaAbove2: 80,  // % of area achieving 2% DF
  },
  LEED: {
    name: 'LEED v4',
    avgDF: 2.0,
    minDF: 0.5,
    areaAbove2: 75,
  },
  BS8206: {
    name: 'BS 8206-2',
    avgDF: 2.0,      // Kitchens
    avgDFLiving: 1.5, // Living rooms
    avgDFBedroom: 1.0, // Bedrooms
    minDF: 0.5,
  },
};

/**
 * Check compliance against a standard
 * @param {Object} stats - Room statistics
 * @param {string} standard - Standard name (BREEAM, LEED, BS8206)
 * @returns {Object} Compliance result
 */
export function checkCompliance(stats, standard = 'BREEAM') {
  const thresholds = COMPLIANCE_STANDARDS[standard] || COMPLIANCE_STANDARDS.BREEAM;

  const checks = {
    avgDF: stats.average >= thresholds.avgDF,
    minDF: stats.min >= thresholds.minDF,
    areaAbove2: stats.above2 >= thresholds.areaAbove2,
  };

  const passCount = Object.values(checks).filter(v => v).length;
  const totalChecks = Object.keys(checks).length;

  let status;
  if (passCount === totalChecks) {
    status = 'pass';
  } else if (passCount >= totalChecks - 1) {
    status = 'marginal';
  } else {
    status = 'fail';
  }

  return {
    standard: thresholds.name,
    status,
    checks,
    passCount,
    totalChecks,
    thresholds,
  };
}

/**
 * Generate optimization recommendation
 * @param {Object} room - Room object
 * @param {Array} windows - Room windows
 * @param {Object} stats - Calculation statistics
 * @returns {string} Recommendation text
 */
export function generateRecommendation(room, windows, stats) {
  const targetDF = 2.0;
  const currentDF = stats.average;

  if (currentDF >= targetDF) {
    if (currentDF > 5) {
      return 'Consider glare control';
    }
    return 'Meets requirements';
  }

  // Calculate how much more glazing might be needed
  const totalGlazedArea = windows.reduce((sum, w) => sum + w.glazedArea, 0);
  const currentRatio = (totalGlazedArea / room.floorArea) * 100;

  // Rough estimate: DF is roughly proportional to glazing ratio
  // This is simplified - actual relationship is more complex
  const neededRatio = (currentRatio * targetDF) / Math.max(currentDF, 0.1);
  const additionalGlazing = ((neededRatio - currentRatio) / 100) * room.floorArea;

  if (windows.length === 0) {
    return `Add ~${(room.floorArea * 0.15).toFixed(1)}m² glazing`;
  }

  if (additionalGlazing > 0) {
    return `+${additionalGlazing.toFixed(1)}m² glazing needed`;
  }

  // If glazing seems sufficient, might be obstruction or depth issue
  const roomDepth = Math.max(
    room.boundingBox ? (room.boundingBox.maxX - room.boundingBox.minX) : 0,
    room.boundingBox ? (room.boundingBox.maxZ - room.boundingBox.minZ) : 0
  );

  if (roomDepth > 6) {
    return 'Room depth limits daylight';
  }

  return 'Review obstructions';
}

/**
 * Run batch analysis on all rooms
 * @param {Array} rooms - Array of room objects
 * @param {Object} windowDetector - Window detector instance
 * @param {Object} options - Calculation options
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Array of results for each room
 */
export async function runBatchAnalysis(rooms, windowDetector, options = {}, onProgress = null) {
  const results = [];
  const totalRooms = rooms.length;

  for (let i = 0; i < totalRooms; i++) {
    const room = rooms[i];

    if (onProgress) {
      onProgress(`Analyzing ${room.name}...`, ((i / totalRooms) * 100));
    }

    // Find windows for this room
    const windows = windowDetector.findRoomWindows(room);

    try {
      // Create calculator
      const calculator = new DaylightCalculator(room, windows, options);

      // Run calculation
      const calcResults = await calculator.calculate();

      // Check compliance
      const compliance = checkCompliance(calcResults.statistics);

      // Generate recommendation
      const recommendation = generateRecommendation(room, windows, calcResults.statistics);

      results.push({
        room,
        windows,
        stats: calcResults.statistics,
        grid: calcResults.grid,
        compliance,
        recommendation,
        success: true,
      });

    } catch (error) {
      console.warn(`Failed to analyze room ${room.name}:`, error);
      results.push({
        room,
        windows,
        stats: null,
        grid: null,
        compliance: null,
        recommendation: 'Analysis failed',
        success: false,
        error: error.message,
      });
    }
  }

  if (onProgress) {
    onProgress('Complete', 100);
  }

  return results;
}

/**
 * Generate summary statistics from batch results
 * @param {Array} results - Batch analysis results
 * @returns {Object} Summary statistics
 */
export function generateBatchSummary(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  const passing = successful.filter(r => r.compliance?.status === 'pass');
  const marginal = successful.filter(r => r.compliance?.status === 'marginal');
  const failing = successful.filter(r => r.compliance?.status === 'fail');

  const avgDFs = successful.map(r => r.stats.average);
  const overallAvgDF = avgDFs.length > 0
    ? avgDFs.reduce((a, b) => a + b, 0) / avgDFs.length
    : 0;

  const totalFloorArea = successful.reduce((sum, r) => sum + r.room.floorArea, 0);
  const compliantArea = passing.reduce((sum, r) => sum + r.room.floorArea, 0);

  return {
    totalRooms: results.length,
    successfulAnalyses: successful.length,
    failedAnalyses: failed.length,
    passing: passing.length,
    marginal: marginal.length,
    failing: failing.length,
    overallAvgDF,
    totalFloorArea,
    compliantArea,
    complianceRate: totalFloorArea > 0 ? (compliantArea / totalFloorArea) * 100 : 0,
  };
}

/**
 * Export results to CSV format
 * @param {Array} results - Batch analysis results
 * @returns {string} CSV string
 */
export function exportToCSV(results) {
  const headers = [
    'Room Name',
    'Long Name',
    'Floor Area (m²)',
    'Window Count',
    'Total Glazed Area (m²)',
    'Glazing Ratio (%)',
    'Average DF (%)',
    'Min DF (%)',
    'Max DF (%)',
    'Uniformity',
    'Area ≥1% (%)',
    'Area ≥2% (%)',
    'Area ≥5% (%)',
    'Grid Points',
    'Compliance Status',
    'Recommendation',
  ];

  const rows = results.map(r => {
    if (!r.success) {
      return [
        r.room.name,
        r.room.longName || '',
        r.room.floorArea.toFixed(2),
        r.windows.length,
        '', '', '', '', '', '', '', '', '', '',
        'Failed',
        r.error || 'Analysis failed',
      ];
    }

    const totalGlazed = r.windows.reduce((sum, w) => sum + w.glazedArea, 0);
    const glazingRatio = (totalGlazed / r.room.floorArea) * 100;

    return [
      r.room.name,
      r.room.longName || '',
      r.room.floorArea.toFixed(2),
      r.windows.length,
      totalGlazed.toFixed(2),
      glazingRatio.toFixed(1),
      r.stats.average.toFixed(2),
      r.stats.min.toFixed(2),
      r.stats.max.toFixed(2),
      (r.stats.uniformity * 100).toFixed(0),
      r.stats.above1.toFixed(0),
      r.stats.above2.toFixed(0),
      r.stats.above5.toFixed(0),
      r.stats.count,
      r.compliance?.status || 'N/A',
      r.recommendation,
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  return csv;
}

/**
 * Export detailed grid data to CSV
 * @param {Array} results - Batch analysis results
 * @returns {string} CSV string with all grid points
 */
export function exportGridDataToCSV(results) {
  const headers = ['Room', 'X', 'Y', 'Z', 'Daylight Factor (%)', 'Sky Component (%)', 'IRC (%)'];

  const rows = [];

  results.forEach(r => {
    if (!r.success || !r.grid) return;

    r.grid.forEach(point => {
      rows.push([
        r.room.name,
        point.position.x.toFixed(3),
        point.position.y.toFixed(3),
        point.position.z.toFixed(3),
        point.daylightFactor?.toFixed(2) || '',
        point.skyComponent?.toFixed(2) || '',
        point.irc?.toFixed(2) || '',
      ]);
    });
  });

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  return csv;
}

/**
 * Generate HTML for PDF report
 * @param {Array} results - Batch analysis results
 * @param {Object} summary - Summary statistics
 * @param {Object} projectInfo - Project information
 * @returns {string} HTML string
 */
export function generateReportHTML(results, summary, projectInfo = {}) {
  const date = new Date().toLocaleDateString();

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass': return '#27ae60';
      case 'marginal': return '#f39c12';
      case 'fail': return '#e74c3c';
      default: return '#888';
    }
  };

  // Format room name with long name if available
  const formatRoomName = (room) => {
    if (room.longName) {
      return `${room.name} - ${room.longName}`;
    }
    return room.name;
  };

  const roomRows = results.map(r => {
    if (!r.success) {
      return `
        <tr>
          <td>${formatRoomName(r.room)}</td>
          <td>${r.room.floorArea.toFixed(1)}</td>
          <td>${r.windows.length}</td>
          <td colspan="4">Analysis failed</td>
          <td>${r.recommendation}</td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${formatRoomName(r.room)}</td>
        <td>${r.room.floorArea.toFixed(1)}</td>
        <td>${r.windows.length}</td>
        <td>${r.stats.average.toFixed(2)}%</td>
        <td>${r.stats.min.toFixed(2)}%</td>
        <td>${r.stats.above2.toFixed(0)}%</td>
        <td style="color: ${getStatusColor(r.compliance?.status)}">
          ${r.compliance?.status?.toUpperCase() || 'N/A'}
        </td>
        <td>${r.recommendation}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Daylight Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 10px; }
    h2 { color: #16213e; margin-top: 30px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .date { color: #666; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .summary-box { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-value { font-size: 28px; font-weight: bold; color: #1a1a2e; }
    .summary-label { color: #666; margin-top: 5px; }
    .pass { color: #27ae60; }
    .fail { color: #e74c3c; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #1a1a2e; color: white; }
    tr:hover { background: #f5f5f5; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
    .compliance-note { background: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Daylight Analysis Report</h1>
    <span class="date">${date}</span>
  </div>

  ${projectInfo.name ? `<p><strong>Project:</strong> ${projectInfo.name}</p>` : ''}

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="summary-box">
      <div class="summary-value">${summary.totalRooms}</div>
      <div class="summary-label">Rooms Analyzed</div>
    </div>
    <div class="summary-box">
      <div class="summary-value ${summary.passing === summary.successfulAnalyses ? 'pass' : ''}">${summary.passing}</div>
      <div class="summary-label">Passing</div>
    </div>
    <div class="summary-box">
      <div class="summary-value ${summary.failing > 0 ? 'fail' : ''}">${summary.failing}</div>
      <div class="summary-label">Failing</div>
    </div>
    <div class="summary-box">
      <div class="summary-value">${summary.overallAvgDF.toFixed(2)}%</div>
      <div class="summary-label">Overall Avg DF</div>
    </div>
  </div>

  <div class="compliance-note">
    <strong>Compliance Standard:</strong> BREEAM (Average DF ≥ 2%, Minimum DF ≥ 0.6%, 80% of area ≥ 2% DF)
  </div>

  <h2>Room Results</h2>
  <table>
    <thead>
      <tr>
        <th>Room</th>
        <th>Area (m²)</th>
        <th>Windows</th>
        <th>Avg DF</th>
        <th>Min DF</th>
        <th>≥2% Area</th>
        <th>Status</th>
        <th>Recommendation</th>
      </tr>
    </thead>
    <tbody>
      ${roomRows}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated by DaylightLab - Browser-based Daylight Analysis Tool</p>
    <p>Note: Results are based on the BRE split-flux method with CIE overcast sky model.
    For compliance certification, please consult with a qualified daylighting consultant.</p>
  </div>
</body>
</html>
  `;
}
