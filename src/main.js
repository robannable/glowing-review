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
import { DEFAULT_WORK_PLANE_HEIGHT, DEFAULT_WALL_OFFSET } from './utils/constants.js';
import { offsetPolygon } from './utils/geometry.js';
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

    // Comparison data
    this.baselineFileName = null;
    this.baselineResults = null;
    this.baselineSummary = null;
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

    // Section cut callbacks
    this.ui.onSectionToggle = () => this._handleSectionToggle();
    this.ui.onSectionChange = (options) => this._handleSectionChange(options);

    // Comparison callback
    this.ui.onCompareFile = (file) => this._handleCompareFile(file);

    // Annotation callbacks
    this.ui.onAnnotationModeToggle = (enabled) => this._handleAnnotationModeToggle(enabled);
    this.ui.onAnnotationSave = (position, text, color) => this._handleAnnotationSave(position, text, color);
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

      const allWindows = this.windowDetector.getAllWindows();
      console.log(`Model loaded: ${rooms.length} rooms, ${allWindows.length} windows`);

      // Debug: log room details
      if (rooms.length === 0) {
        console.warn('No rooms found in IFC file - check if IfcSpace elements exist');
      } else {
        console.log('Rooms found:', rooms.map(r => ({
          name: r.name,
          area: r.floorArea?.toFixed(2),
          hasPolygon: !!r.floorPolygon,
          hasBoundingBox: !!r.boundingBox
        })));
      }

      if (allWindows.length === 0) {
        console.warn('No windows found in IFC file - check if IfcWindow elements exist');
      }

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

    // Debug: log windows for this room
    console.log(`Room "${room.name}" windows:`, this.currentWindows.length);
    if (this.currentWindows.length === 0) {
      console.warn('No windows found for selected room - check room boundaries');
    } else {
      console.log('Windows:', this.currentWindows.map(w => ({
        centre: w.centre,
        normal: w.normal,
        size: `${w.overallWidth?.toFixed(2)} x ${w.overallHeight?.toFixed(2)}`,
      })));
    }

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
          enhancedMode: settings.enhancedMode,
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

      // Debug logging
      console.log('Calculation results:', {
        gridLength: results.grid?.length,
        statistics: results.statistics,
        mode: results.mode,
      });

      this.calculationResults = results;

      // Check if results are valid
      if (!results.grid || results.grid.length === 0) {
        console.warn('No grid points generated - check room geometry');
        this.ui.setStatus('Warning: No grid points generated', 'error');
      }

      if (!results.statistics || results.statistics.count === 0) {
        console.warn('No valid calculation results - check windows');
        this.ui.setStatus('Warning: No valid results calculated', 'error');
      }

      // Create heatmap
      this.viewer.clearHeatmap();
      const heatmap = createHeatmapMesh(results.grid, settings.gridSpacing);
      console.log('Heatmap created:', heatmap ? 'yes' : 'no (null)');
      if (heatmap) {
        this.viewer.addHeatmap(heatmap);
      } else {
        console.warn('Heatmap not created - check grid data');
      }

      // Add room outline for context
      // Use actual floor level from room bounding box to handle offset models
      const floorLevel = this.currentRoom.boundingBox?.minY || 0;
      const outlineHeight = floorLevel + DEFAULT_WORK_PLANE_HEIGHT;

      if (this.currentRoom.floorPolygon) {
        // Use inset polygon to match where grid points are generated
        const insetPolygon = offsetPolygon(this.currentRoom.floorPolygon, -DEFAULT_WALL_OFFSET);
        const outlinePolygon = (insetPolygon && insetPolygon.length >= 3)
          ? insetPolygon
          : this.currentRoom.floorPolygon;
        const outline = createRoomOutline(outlinePolygon, outlineHeight);
        if (outline) {
          this.viewer.addHeatmap(outline);
        }
      }

      // Add window indicators at work plane height
      const windowIndicators = createWindowIndicators(this.currentWindows, outlineHeight);
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
          enhancedMode: settings.enhancedMode,
        },
        (message, percent) => {
          this.ui.showLoading(message, percent);
        }
      );

      // Generate summary
      this.batchSummary = generateBatchSummary(this.batchResults);

      // Store as baseline for comparison
      this.baselineResults = this.batchResults;
      this.baselineSummary = this.batchSummary;
      this.baselineFileName = this.ifcLoader.currentFileName || 'Baseline Model';

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

  /**
   * Handle section cut toggle
   * @private
   */
  _handleSectionToggle() {
    if (this.ui.sectionEnabled) {
      // Disable section cut
      this.viewer.disableSectionCut();
      this.ui.hideSectionControls();
      this.ui.setStatus('Section cut disabled');
    } else {
      // Enable section cut
      const axis = document.getElementById('section-axis').value;
      this.viewer.enableSectionCut(axis, 0.5);
      const bounds = this.viewer.getSectionBounds();
      this.ui.showSectionControls(bounds);
      this.ui.setStatus('Section cut enabled - use slider to adjust');
    }
  }

  /**
   * Handle section cut changes (axis or position)
   * @param {Object} options - { axis, position }
   * @private
   */
  _handleSectionChange(options) {
    if (options.axis) {
      // Axis changed - re-enable with new axis
      this.viewer.disableSectionCut();
      this.viewer.enableSectionCut(options.axis, 0.5);
      const bounds = this.viewer.getSectionBounds();
      this.ui.updateSectionValue(bounds.current);
      document.getElementById('section-slider').value = 50;
    }

    if (options.position !== undefined) {
      // Position changed
      this.viewer.setSectionPosition(options.position);
      const bounds = this.viewer.getSectionBounds();
      this.ui.updateSectionValue(bounds.current);
    }
  }

  /**
   * Handle comparison file selection
   * @param {File} file - Comparison IFC file
   * @private
   */
  async _handleCompareFile(file) {
    // Check if we have baseline results
    if (!this.baselineResults || this.baselineResults.length === 0) {
      this.ui.setStatus('Run "All Rooms" analysis first to create baseline', 'error');
      return;
    }

    try {
      this.ui.showLoading('Loading comparison file...', 0);

      // Create a temporary IFC loader for the comparison file
      const comparisonLoader = new IFCLoader();
      comparisonLoader.onProgress = (message, percent) => {
        this.ui.showLoading(message, percent * 0.3); // First 30% for loading
      };

      // Load the comparison file
      await comparisonLoader.loadFile(file);

      // Create temporary room selector and window detector
      const tempRoomSelector = new RoomSelector(null, comparisonLoader);
      tempRoomSelector.init();

      const tempWindowDetector = new WindowDetector(comparisonLoader);
      tempWindowDetector.init();

      const comparisonRooms = tempRoomSelector.getRooms();

      if (comparisonRooms.length === 0) {
        this.ui.hideLoading();
        this.ui.setStatus('No rooms found in comparison file', 'error');
        return;
      }

      // Run batch analysis on comparison model
      const settings = this.ui.getSettings();

      const comparisonResults = await runBatchAnalysis(
        comparisonRooms,
        tempWindowDetector,
        {
          gridSpacing: settings.gridSpacing,
          workPlaneHeight: settings.workPlaneHeight,
          reflectances: settings.reflectances,
          enhancedMode: settings.enhancedMode,
        },
        (message, percent) => {
          this.ui.showLoading(`Comparison: ${message}`, 30 + percent * 0.7);
        }
      );

      const comparisonSummary = generateBatchSummary(comparisonResults);

      // Calculate comparison summary
      let improved = 0;
      let worsened = 0;
      let unchanged = 0;

      this.baselineResults.forEach(baseline => {
        if (!baseline.success) return;

        const comp = comparisonResults.find(r => r.room.name === baseline.room.name);
        if (!comp || !comp.success) {
          unchanged++;
          return;
        }

        const diff = comp.stats.average - baseline.stats.average;
        if (Math.abs(diff) < 0.1) {
          unchanged++;
        } else if (diff > 0) {
          improved++;
        } else {
          worsened++;
        }
      });

      const comparisonData = {
        baselineName: this.baselineFileName,
        comparisonName: file.name,
        baselineResults: this.baselineResults,
        comparisonResults: comparisonResults,
        summary: {
          baselineAvgDF: this.baselineSummary.overallAvgDF,
          comparisonAvgDF: comparisonSummary.overallAvgDF,
          baselinePassing: this.baselineSummary.passing,
          comparisonPassing: comparisonSummary.passing,
          baselineComplianceRate: this.baselineSummary.complianceRate,
          comparisonComplianceRate: comparisonSummary.complianceRate,
          improved,
          worsened,
          unchanged,
        },
      };

      this.ui.hideLoading();
      this.ui.showComparisonResults(comparisonData);

      const changeText = improved > worsened ? 'improved' : improved < worsened ? 'worsened' : 'unchanged';
      this.ui.setStatus(`Comparison complete - Overall ${changeText} (${improved} improved, ${worsened} worsened)`);

    } catch (error) {
      console.error('Comparison error:', error);
      this.ui.hideLoading();
      this.ui.setStatus(`Comparison failed: ${error.message}`, 'error');
    }
  }

  /**
   * Handle annotation mode toggle
   * @param {boolean} enabled - Whether annotation mode is enabled
   * @private
   */
  _handleAnnotationModeToggle(enabled) {
    if (enabled) {
      this.ui.setStatus('Annotation mode: Click on model to place a note');

      // Add click listener to viewport
      this._annotationClickHandler = (event) => {
        if (!this.ui.annotationMode) return;

        // Only handle left clicks
        if (event.button !== 0) return;

        // Check if we clicked on an existing annotation
        const existingAnnotation = this.viewer.getAnnotationAt(event);
        if (existingAnnotation) {
          // Show tooltip or delete option
          if (confirm(`Delete annotation: "${existingAnnotation.text}"?`)) {
            this.viewer.removeAnnotation(existingAnnotation.id);
            this.ui.setStatus('Annotation deleted');
          }
          return;
        }

        // Get click position on model
        const position = this.viewer.getClickPosition(event);
        if (position) {
          this.ui.showAnnotationModal(position);
        }
      };

      this.viewer.renderer.domElement.addEventListener('click', this._annotationClickHandler);
    } else {
      this.ui.setStatus('Annotation mode disabled');

      // Remove click listener
      if (this._annotationClickHandler) {
        this.viewer.renderer.domElement.removeEventListener('click', this._annotationClickHandler);
        this._annotationClickHandler = null;
      }
    }
  }

  /**
   * Handle saving a new annotation
   * @param {Object} position - 3D position
   * @param {string} text - Annotation text
   * @param {string} color - Marker color
   * @private
   */
  _handleAnnotationSave(position, text, color) {
    const annotation = this.viewer.addAnnotation(position, text, color);
    this.ui.setStatus(`Annotation added: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    console.log('Annotation added:', annotation);
  }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new DaylightLab();
  await app.init();

  // Make app available globally for debugging
  window.daylightLab = app;
});
