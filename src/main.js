/**
 * DaylightLab - Main Application Entry Point
 * Browser-based daylight analysis tool for architects
 */

import { Viewer } from './components/Viewer.js';
import { IFCLoader } from './components/IFCLoader.js';
import { UI } from './components/UI.js';
import { RoomSelector } from './components/RoomSelector.js';
import { WindowDetector } from './components/WindowDetector.js';
import { DaylightCalculator } from './analysis/DaylightCalculator.js';
import { createHeatmapMesh, createRoomOutline, createWindowIndicators } from './visualisation/Heatmap.js';
import {
  runBatchAnalysis,
  generateBatchSummary,
  exportToCSV,
  exportGridDataToCSV,
  generateReportHTML,
} from './analysis/BatchAnalysis.js';

/**
 * Main application class
 */
class DaylightLab {
  constructor() {
    this.viewer = null;
    this.ifcLoader = null;
    this.ui = null;
    this.roomSelector = null;
    this.windowDetector = null;
    this.calculator = null;

    this.currentRoom = null;
    this.currentWindows = [];
    this.calculationResults = null;
    this.batchResults = null;
    this.batchSummary = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log('Initializing DaylightLab...');

    // Initialize UI
    this.ui = new UI();
    this.ui.init();

    // Initialize Viewer
    const viewport = document.getElementById('viewport');
    this.viewer = new Viewer(viewport);
    this.viewer.init();

    // Initialize IFC Loader
    this.ifcLoader = new IFCLoader();

    // Set up UI callbacks
    this._setupCallbacks();

    console.log('DaylightLab ready');
    this.ui.setStatus('Ready - Drop an IFC file or click Open to begin');
  }

  /**
   * Set up UI event callbacks
   * @private
   */
  _setupCallbacks() {
    // File open callback
    this.ui.onFileOpen = (file) => this._handleFileOpen(file);

    // Room selection callback
    this.ui.onRoomSelect = (roomId) => this._handleRoomSelect(roomId);

    // Calculate callback
    this.ui.onCalculate = () => this._handleCalculate();

    // View change callback
    this.ui.onViewChange = (view) => this._handleViewChange(view);

    // Reset view callback
    this.ui.onResetView = () => this._handleResetView();

    // Export callback
    this.ui.onExport = () => this._handleExport();

    // Settings save callback
    this.ui.onSettingsSave = (settings) => this._handleSettingsSave(settings);

    // Display mode change callback
    this.ui.onDisplayModeChange = () => this._handleDisplayModeChange();

    // Batch analysis callback
    this.ui.onCalculateAll = () => this._handleCalculateAll();

    // Export callbacks
    this.ui.onExportCSV = () => this._handleExportCSV();
    this.ui.onExportPDF = () => this._handleExportPDF();
  }

  /**
   * Handle file open
   * @param {File} file - IFC file
   * @private
   */
  async _handleFileOpen(file) {
    try {
      this.ui.hideDropZone();
      this.ui.showLoading('Loading IFC file...', 0);

      // Set progress callback
      this.ifcLoader.onProgress = (message, percent) => {
        this.ui.showLoading(message, percent);
      };

      // Load the file
      const modelGroup = await this.ifcLoader.loadFile(file);

      // Clear any previous model
      this.viewer.clearModel();
      this.viewer.clearRooms();
      this.viewer.clearHeatmap();

      // Add model to scene
      this.viewer.addObject(modelGroup);

      // Fit camera to model
      this.viewer.fitCameraToObject(modelGroup);

      // Initialize room selector
      this.roomSelector = new RoomSelector(this.viewer, this.ifcLoader);
      this.roomSelector.init();
      this.roomSelector.onRoomSelected = (room) => this._onRoomSelected(room);

      // Initialize window detector
      this.windowDetector = new WindowDetector(this.ifcLoader);
      this.windowDetector.init();

      // Populate room dropdown
      const rooms = this.roomSelector.getRooms();
      this.ui.setRooms(rooms);

      // Enable toolbar
      this.ui.enableToolbar();

      this.ui.hideLoading();
      this.ui.setStatus(`Loaded: ${file.name} - ${rooms.length} rooms found`);

      console.log(`Model loaded: ${rooms.length} rooms, ${this.windowDetector.getAllWindows().length} windows`);

    } catch (error) {
      console.error('Error loading file:', error);
      this.ui.hideLoading();
      this.ui.showDropZone();
      this.ui.setStatus(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Handle room selection from dropdown
   * @param {number} roomId - Room express ID
   * @private
   */
  _handleRoomSelect(roomId) {
    if (this.roomSelector) {
      this.roomSelector.selectRoom(roomId);
    }
  }

  /**
   * Callback when room is selected
   * @param {Object} room - Selected room object
   * @private
   */
  _onRoomSelected(room) {
    this.currentRoom = room;

    // Clear previous results
    this.viewer.clearHeatmap();
    this.calculationResults = null;
    this.ui.clearResults();

    if (!room) {
      this.ui.clearInfo();
      this.ui.disableCalculate();
      this.windowDetector.clearHighlights();
      this.currentWindows = [];
      return;
    }

    // Show room info
    this.ui.showRoomInfo(room);

    // Find and highlight windows
    this.currentWindows = this.windowDetector.findRoomWindows(room);
    this.windowDetector.highlightWindows();

    // Show window info
    this.ui.showWindowsInfo(this.currentWindows, room.floorArea);

    // Enable calculate button
    this.ui.enableCalculate();

    // Update dropdown selection
    document.getElementById('room-select').value = room.expressID;

    this.ui.setStatus(`Selected: ${room.name} - ${this.currentWindows.length} windows`);
  }

  /**
   * Handle calculate button
   * @private
   */
  async _handleCalculate() {
    if (!this.currentRoom) {
      this.ui.setStatus('Please select a room first', 'error');
      return;
    }

    try {
      // Get settings
      const settings = this.ui.getSettings();

      // Create calculator
      this.calculator = new DaylightCalculator(
        this.currentRoom,
        this.currentWindows,
        {
          gridSpacing: settings.gridSpacing,
          workPlaneHeight: settings.workPlaneHeight,
          reflectances: settings.reflectances,
        }
      );

      // Set progress callback
      this.calculator.onProgress = (message, percent) => {
        this.ui.showLoading(message, percent);
      };

      this.ui.showLoading('Starting calculation...', 0);
      this.ui.disableCalculate();

      // Run calculation
      const results = await this.calculator.calculate();

      this.calculationResults = results;

      // Create heatmap
      this.viewer.clearHeatmap();
      const heatmap = createHeatmapMesh(results.grid, settings.gridSpacing);
      if (heatmap) {
        this.viewer.addHeatmap(heatmap);
      }

      // Add room outline for context
      if (this.currentRoom.floorPolygon) {
        const outline = createRoomOutline(this.currentRoom.floorPolygon);
        if (outline) {
          this.viewer.addHeatmap(outline);
        }
      }

      // Add window indicators
      const windowIndicators = createWindowIndicators(this.currentWindows);
      if (windowIndicators) {
        this.viewer.addHeatmap(windowIndicators);
      }

      // Show results
      this.ui.showResults(results.statistics);

      this.ui.hideLoading();
      this.ui.enableCalculate();

      const avgDF = results.statistics.average.toFixed(2);
      this.ui.setStatus(`Calculation complete - Average DF: ${avgDF}%`);

      console.log('Calculation results:', results.statistics);

    } catch (error) {
      console.error('Calculation error:', error);
      this.ui.hideLoading();
      this.ui.enableCalculate();
      this.ui.setStatus(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Handle view change
   * @param {string} view - '2d' or '3d'
   * @private
   */
  _handleViewChange(view) {
    if (view === '2d') {
      this.viewer.setView2D();
    } else {
      this.viewer.setView3D();
    }
  }

  /**
   * Handle reset view
   * @private
   */
  _handleResetView() {
    this.viewer.resetView();
  }

  /**
   * Handle export
   * @private
   */
  _handleExport() {
    try {
      const dataURL = this.viewer.screenshot();

      // Create download link
      const link = document.createElement('a');
      link.download = `daylightlab-${Date.now()}.png`;
      link.href = dataURL;
      link.click();

      this.ui.setStatus('Screenshot exported');
    } catch (error) {
      console.error('Export error:', error);
      this.ui.setStatus('Export failed', 'error');
    }
  }

  /**
   * Handle settings save
   * @param {Object} settings - New settings
   * @private
   */
  _handleSettingsSave(settings) {
    console.log('Settings saved:', settings);
    this.ui.setStatus('Settings saved');

    // If we have results, offer to recalculate
    if (this.calculationResults && this.currentRoom) {
      // Could show a dialog here asking if user wants to recalculate
    }
  }

  /**
   * Handle display mode change
   * @private
   */
  _handleDisplayModeChange() {
    const newMode = this.viewer.cycleDisplayMode();
    this.ui.setDisplayModeText(newMode);

    const modeNames = {
      solid: 'Solid view',
      wireframe: 'Wireframe view',
      hidden: 'Building hidden',
    };
    this.ui.setStatus(modeNames[newMode] || 'Display mode changed');
  }

  /**
   * Handle calculate all rooms
   * @private
   */
  async _handleCalculateAll() {
    if (!this.roomSelector) {
      this.ui.setStatus('Please load an IFC file first', 'error');
      return;
    }

    const rooms = this.roomSelector.getRooms();
    if (rooms.length === 0) {
      this.ui.setStatus('No rooms found in model', 'error');
      return;
    }

    try {
      const settings = this.ui.getSettings();

      this.ui.showLoading('Starting batch analysis...', 0);

      // Run batch analysis
      this.batchResults = await runBatchAnalysis(
        rooms,
        this.windowDetector,
        {
          gridSpacing: settings.gridSpacing,
          workPlaneHeight: settings.workPlaneHeight,
          reflectances: settings.reflectances,
        },
        (message, percent) => {
          this.ui.showLoading(message, percent);
        }
      );

      // Generate summary
      this.batchSummary = generateBatchSummary(this.batchResults);

      this.ui.hideLoading();

      // Show results modal
      this.ui.showBatchResults(this.batchResults, this.batchSummary);

      // Enable export buttons
      this.ui.enableExports();

      const passRate = ((this.batchSummary.passing / this.batchSummary.successfulAnalyses) * 100).toFixed(0);
      this.ui.setStatus(`Batch analysis complete - ${passRate}% rooms passing`);

      console.log('Batch results:', this.batchSummary);

    } catch (error) {
      console.error('Batch analysis error:', error);
      this.ui.hideLoading();
      this.ui.setStatus(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Handle CSV export
   * @private
   */
  _handleExportCSV() {
    if (!this.batchResults || this.batchResults.length === 0) {
      this.ui.setStatus('No results to export - run batch analysis first', 'error');
      return;
    }

    try {
      // Export summary CSV
      const csv = exportToCSV(this.batchResults);

      // Create download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daylightlab-results-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      this.ui.setStatus('CSV exported successfully');

    } catch (error) {
      console.error('CSV export error:', error);
      this.ui.setStatus('Export failed', 'error');
    }
  }

  /**
   * Handle PDF export
   * @private
   */
  _handleExportPDF() {
    if (!this.batchResults || this.batchResults.length === 0) {
      this.ui.setStatus('No results to export - run batch analysis first', 'error');
      return;
    }

    try {
      // Generate HTML report
      const html = generateReportHTML(this.batchResults, this.batchSummary);

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      printWindow.document.write(html);
      printWindow.document.close();

      // Trigger print dialog after a short delay
      setTimeout(() => {
        printWindow.print();
      }, 500);

      this.ui.setStatus('PDF report opened - use browser print to save');

    } catch (error) {
      console.error('PDF export error:', error);
      this.ui.setStatus('Export failed', 'error');
    }
  }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new DaylightLab();
  await app.init();

  // Make app available globally for debugging
  window.daylightLab = app;
});
