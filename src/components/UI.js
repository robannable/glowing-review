/**
 * UI Manager for DaylightLab
 * Handles all user interface interactions
 */

export class UI {
  constructor() {
    // DOM elements
    this.elements = {};

    // State
    this.rooms = [];
    this.selectedRoomId = null;
    this.windows = [];
    this.results = null;

    // Callbacks
    this.onFileOpen = null;
    this.onRoomSelect = null;
    this.onCalculate = null;
    this.onCalculateAll = null;
    this.onViewChange = null;
    this.onResetView = null;
    this.onExport = null;
    this.onExportCSV = null;
    this.onExportPDF = null;
    this.onSettingsSave = null;
    this.onDisplayModeChange = null;
    this.onSectionToggle = null;
    this.onSectionChange = null;
    this.onSunPathToggle = null;
    this.onCompareFile = null;
    this.onAnnotationModeToggle = null;
    this.onAnnotationSave = null;

    // Batch results data
    this.batchResults = null;

    // Section state
    this.sectionEnabled = false;

    // Sun path state
    this.sunPathEnabled = false;
    this.sunPathDate = new Date();

    // Annotation state
    this.annotationMode = false;
    this.pendingAnnotationPosition = null;
  }

  /**
   * Initialize the UI
   */
  init() {
    this._cacheElements();
    this._bindEvents();
    this._loadSettings();

    return this;
  }

  /**
   * Cache DOM element references
   * @private
   */
  _cacheElements() {
    this.elements = {
      // Toolbar
      btnOpen: document.getElementById('btn-open'),
      btnCalculate: document.getElementById('btn-calculate'),
      btnView2D: document.getElementById('btn-view-2d'),
      btnView3D: document.getElementById('btn-view-3d'),
      btnReset: document.getElementById('btn-reset'),
      btnSettings: document.getElementById('btn-settings'),
      btnExport: document.getElementById('btn-export'),
      btnDisplayMode: document.getElementById('btn-display-mode'),
      displayModeText: document.getElementById('display-mode-text'),
      roomSelect: document.getElementById('room-select'),

      // Viewport
      viewport: document.getElementById('viewport'),
      dropZone: document.getElementById('drop-zone'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      progressFill: document.getElementById('progress-fill'),
      canvas: document.getElementById('canvas'),

      // Side panel
      sidePanel: document.getElementById('side-panel'),
      panelToggle: document.getElementById('panel-toggle'),
      roomInfo: document.getElementById('room-info'),
      windowsInfo: document.getElementById('windows-info'),
      resultsInfo: document.getElementById('results-info'),

      // Status bar
      statusText: document.getElementById('status-text'),
      statusCoords: document.getElementById('status-coords'),

      // File input
      fileInput: document.getElementById('file-input'),

      // Settings modal
      settingsModal: document.getElementById('settings-modal'),
      settingsClose: document.getElementById('settings-close'),
      settingsSave: document.getElementById('settings-save'),
      settingGridSpacing: document.getElementById('setting-grid-spacing'),
      settingWorkPlane: document.getElementById('setting-work-plane'),
      settingTransmittance: document.getElementById('setting-transmittance'),
      settingCeilingRef: document.getElementById('setting-ceiling-ref'),
      settingWallRef: document.getElementById('setting-wall-ref'),
      settingFloorRef: document.getElementById('setting-floor-ref'),
      settingLatitude: document.getElementById('setting-latitude'),
      settingLongitude: document.getElementById('setting-longitude'),

      // Batch analysis
      btnCalculateAll: document.getElementById('btn-calculate-all'),
      btnExportCSV: document.getElementById('btn-export-csv'),
      btnExportPDF: document.getElementById('btn-export-pdf'),

      // Batch results modal
      batchResultsModal: document.getElementById('batch-results-modal'),
      batchResultsClose: document.getElementById('batch-results-close'),
      batchResultsOk: document.getElementById('batch-results-ok'),
      batchSummary: document.getElementById('batch-summary'),
      batchResultsBody: document.getElementById('batch-results-body'),
      batchExportCSV: document.getElementById('batch-export-csv'),
      batchExportPDF: document.getElementById('batch-export-pdf'),

      // Section controls
      btnSection: document.getElementById('btn-section'),
      sectionControls: document.getElementById('section-controls'),
      sectionAxis: document.getElementById('section-axis'),
      sectionSlider: document.getElementById('section-slider'),
      sectionValue: document.getElementById('section-value'),
      sectionClose: document.getElementById('section-close'),

      // Sun Path controls
      btnSunPath: document.getElementById('btn-sun-path'),
      sunpathControls: document.getElementById('sunpath-controls'),
      sunpathDate: document.getElementById('sunpath-date'),
      sunpathLocation: document.getElementById('sunpath-location'),
      sunpathClose: document.getElementById('sunpath-close'),
      quickDateBtns: document.querySelectorAll('.quick-date-btn'),

      // Comparison
      btnCompare: document.getElementById('btn-compare'),
      compareFileInput: document.getElementById('compare-file-input'),
      comparisonModal: document.getElementById('comparison-modal'),
      comparisonClose: document.getElementById('comparison-close'),
      comparisonCloseBtn: document.getElementById('comparison-close-btn'),
      comparisonHeader: document.getElementById('comparison-header'),
      comparisonSummary: document.getElementById('comparison-summary'),
      comparisonBody: document.getElementById('comparison-body'),

      // Annotations
      btnAnnotate: document.getElementById('btn-annotate'),
      annotationModal: document.getElementById('annotation-modal'),
      annotationClose: document.getElementById('annotation-close'),
      annotationCancel: document.getElementById('annotation-cancel'),
      annotationSave: document.getElementById('annotation-save'),
      annotationText: document.getElementById('annotation-text'),
      annotationColor: document.getElementById('annotation-color'),
    };
  }

  /**
   * Bind event listeners
   * @private
   */
  _bindEvents() {
    // File open button
    this.elements.btnOpen.addEventListener('click', () => {
      this.elements.fileInput.click();
    });

    // File input change
    this.elements.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.onFileOpen) {
        this.onFileOpen(file);
      }
      e.target.value = ''; // Reset for re-selection
    });

    // Drag and drop
    this.elements.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.elements.dropZone.classList.add('dragover');
    });

    this.elements.dropZone.addEventListener('dragleave', () => {
      this.elements.dropZone.classList.remove('dragover');
    });

    this.elements.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.elements.dropZone.classList.remove('dragover');

      const file = e.dataTransfer.files[0];
      if (file && file.name.toLowerCase().endsWith('.ifc') && this.onFileOpen) {
        this.onFileOpen(file);
      } else {
        this.setStatus('Please drop an IFC file', 'error');
      }
    });

    // Room selection
    this.elements.roomSelect.addEventListener('change', (e) => {
      const roomId = parseInt(e.target.value);
      if (!isNaN(roomId) && this.onRoomSelect) {
        this.onRoomSelect(roomId);
      }
    });

    // Calculate button
    this.elements.btnCalculate.addEventListener('click', () => {
      if (this.onCalculate) {
        this.onCalculate();
      }
    });

    // View buttons
    this.elements.btnView2D.addEventListener('click', () => {
      this.setActiveViewButton('2d');
      if (this.onViewChange) {
        this.onViewChange('2d');
      }
    });

    this.elements.btnView3D.addEventListener('click', () => {
      this.setActiveViewButton('3d');
      if (this.onViewChange) {
        this.onViewChange('3d');
      }
    });

    // Reset view
    this.elements.btnReset.addEventListener('click', () => {
      if (this.onResetView) {
        this.onResetView();
      }
    });

    // Export
    this.elements.btnExport.addEventListener('click', () => {
      if (this.onExport) {
        this.onExport();
      }
    });

    // Display mode toggle
    this.elements.btnDisplayMode.addEventListener('click', () => {
      if (this.onDisplayModeChange) {
        this.onDisplayModeChange();
      }
    });

    // Calculate all rooms
    this.elements.btnCalculateAll.addEventListener('click', () => {
      if (this.onCalculateAll) {
        this.onCalculateAll();
      }
    });

    // Export CSV
    this.elements.btnExportCSV.addEventListener('click', () => {
      if (this.onExportCSV) {
        this.onExportCSV();
      }
    });

    // Export PDF
    this.elements.btnExportPDF.addEventListener('click', () => {
      if (this.onExportPDF) {
        this.onExportPDF();
      }
    });

    // Batch results modal
    this.elements.batchResultsClose.addEventListener('click', () => {
      this.elements.batchResultsModal.classList.add('hidden');
    });

    this.elements.batchResultsOk.addEventListener('click', () => {
      this.elements.batchResultsModal.classList.add('hidden');
    });

    this.elements.batchResultsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.batchResultsModal) {
        this.elements.batchResultsModal.classList.add('hidden');
      }
    });

    this.elements.batchExportCSV.addEventListener('click', () => {
      if (this.onExportCSV) {
        this.onExportCSV();
      }
    });

    this.elements.batchExportPDF.addEventListener('click', () => {
      if (this.onExportPDF) {
        this.onExportPDF();
      }
    });

    // Section cut toggle
    this.elements.btnSection.addEventListener('click', () => {
      if (this.onSectionToggle) {
        this.onSectionToggle();
      }
    });

    // Section axis change
    this.elements.sectionAxis.addEventListener('change', (e) => {
      if (this.onSectionChange) {
        this.onSectionChange({ axis: e.target.value });
      }
    });

    // Section slider change
    this.elements.sectionSlider.addEventListener('input', (e) => {
      const position = parseFloat(e.target.value) / 100;
      if (this.onSectionChange) {
        this.onSectionChange({ position });
      }
    });

    // Section close button
    this.elements.sectionClose.addEventListener('click', () => {
      if (this.onSectionToggle) {
        this.onSectionToggle(); // Toggle off
      }
    });

    // Sun path toggle
    this.elements.btnSunPath.addEventListener('click', () => {
      if (this.onSunPathToggle) {
        this.onSunPathToggle(this.sunPathDate);
      }
    });

    // Sun path close button
    this.elements.sunpathClose.addEventListener('click', () => {
      if (this.onSunPathToggle) {
        this.onSunPathToggle(this.sunPathDate); // Toggle off
      }
    });

    // Sun path date picker
    this.elements.sunpathDate.addEventListener('change', (e) => {
      this.sunPathDate = new Date(e.target.value);
      this._clearQuickDateButtons();
      if (this.sunPathEnabled && this.onSunPathToggle) {
        // Re-render with new date
        this.onSunPathToggle(this.sunPathDate, true); // Force update
      }
    });

    // Quick date buttons
    this.elements.quickDateBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const month = parseInt(btn.dataset.month);
        const day = parseInt(btn.dataset.day);
        const year = new Date().getFullYear();
        this.sunPathDate = new Date(year, month - 1, day);
        this.elements.sunpathDate.value = this.sunPathDate.toISOString().split('T')[0];
        this._setActiveQuickDateButton(btn);
        if (this.sunPathEnabled && this.onSunPathToggle) {
          this.onSunPathToggle(this.sunPathDate, true); // Force update
        }
      });
    });

    // Compare button
    this.elements.btnCompare.addEventListener('click', () => {
      this.elements.compareFileInput.click();
    });

    // Compare file input
    this.elements.compareFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.onCompareFile) {
        this.onCompareFile(file);
      }
      e.target.value = ''; // Reset for re-selection
    });

    // Comparison modal close
    this.elements.comparisonClose.addEventListener('click', () => {
      this.elements.comparisonModal.classList.add('hidden');
    });

    this.elements.comparisonCloseBtn.addEventListener('click', () => {
      this.elements.comparisonModal.classList.add('hidden');
    });

    this.elements.comparisonModal.addEventListener('click', (e) => {
      if (e.target === this.elements.comparisonModal) {
        this.elements.comparisonModal.classList.add('hidden');
      }
    });

    // Annotation mode toggle
    this.elements.btnAnnotate.addEventListener('click', () => {
      this.toggleAnnotationMode();
    });

    // Annotation modal events
    this.elements.annotationClose.addEventListener('click', () => {
      this.hideAnnotationModal();
    });

    this.elements.annotationCancel.addEventListener('click', () => {
      this.hideAnnotationModal();
    });

    this.elements.annotationSave.addEventListener('click', () => {
      const text = this.elements.annotationText.value.trim();
      const color = this.elements.annotationColor.value;

      if (text && this.pendingAnnotationPosition && this.onAnnotationSave) {
        this.onAnnotationSave(this.pendingAnnotationPosition, text, color);
      }

      this.hideAnnotationModal();
    });

    this.elements.annotationModal.addEventListener('click', (e) => {
      if (e.target === this.elements.annotationModal) {
        this.hideAnnotationModal();
      }
    });

    // Panel toggle
    this.elements.panelToggle.addEventListener('click', () => {
      this.elements.sidePanel.classList.toggle('collapsed');
    });

    // Settings
    this.elements.btnSettings.addEventListener('click', () => {
      this.elements.settingsModal.classList.remove('hidden');
    });

    this.elements.settingsClose.addEventListener('click', () => {
      this.elements.settingsModal.classList.add('hidden');
    });

    this.elements.settingsSave.addEventListener('click', () => {
      this._saveSettings();
      this.elements.settingsModal.classList.add('hidden');
      if (this.onSettingsSave) {
        this.onSettingsSave(this.getSettings());
      }
    });

    // Close modal on background click
    this.elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.settingsModal) {
        this.elements.settingsModal.classList.add('hidden');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'o':
          this.elements.fileInput.click();
          break;
        case 'r':
          if (this.onResetView) this.onResetView();
          break;
        case '2':
          if (!this.elements.btnView2D.disabled) {
            this.setActiveViewButton('2d');
            if (this.onViewChange) this.onViewChange('2d');
          }
          break;
        case '3':
          if (!this.elements.btnView3D.disabled) {
            this.setActiveViewButton('3d');
            if (this.onViewChange) this.onViewChange('3d');
          }
          break;
        case 'c':
          if (!this.elements.btnCalculate.disabled && this.onCalculate) {
            this.onCalculate();
          }
          break;
        case 'v':
          if (!this.elements.btnDisplayMode.disabled && this.onDisplayModeChange) {
            this.onDisplayModeChange();
          }
          break;
        case 'a':
          if (!this.elements.btnCalculateAll.disabled && this.onCalculateAll) {
            this.onCalculateAll();
          }
          break;
        case 's':
          if (!this.elements.btnSection.disabled && this.onSectionToggle) {
            this.onSectionToggle();
          }
          break;
        case 'p':
          if (!this.elements.btnSunPath.disabled && this.onSunPathToggle) {
            this.onSunPathToggle();
          }
          break;
        case 'n':
          if (!this.elements.btnAnnotate.disabled) {
            this.toggleAnnotationMode();
          }
          break;
        case 'escape':
          // Deselect room
          this.elements.roomSelect.value = '';
          if (this.onRoomSelect) this.onRoomSelect(null);
          break;
      }
    });
  }

  /**
   * Show loading overlay
   * @param {string} message - Loading message
   * @param {number} progress - Progress percentage
   */
  showLoading(message = 'Loading...', progress = 0) {
    this.elements.loadingOverlay.classList.remove('hidden');
    this.elements.loadingText.textContent = message;
    this.elements.progressFill.style.width = `${progress}%`;
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    this.elements.loadingOverlay.classList.add('hidden');
  }

  /**
   * Hide drop zone
   */
  hideDropZone() {
    this.elements.dropZone.classList.remove('active');
  }

  /**
   * Show drop zone
   */
  showDropZone() {
    this.elements.dropZone.classList.add('active');
  }

  /**
   * Set status bar text
   * @param {string} text - Status text
   * @param {string} type - Type: 'info', 'success', 'error'
   */
  setStatus(text, type = 'info') {
    this.elements.statusText.textContent = text;
    this.elements.statusText.className = type;
  }

  /**
   * Enable toolbar buttons after model load
   */
  enableToolbar() {
    this.elements.btnView2D.disabled = false;
    this.elements.btnView3D.disabled = false;
    this.elements.btnReset.disabled = false;
    this.elements.roomSelect.disabled = false;
    this.elements.btnExport.disabled = false;
    this.elements.btnDisplayMode.disabled = false;
    this.elements.btnCalculateAll.disabled = false;
    this.elements.btnSection.disabled = false;
    this.elements.btnSunPath.disabled = false;
    this.elements.btnCompare.disabled = false;
    this.elements.btnAnnotate.disabled = false;
  }

  /**
   * Enable export buttons (after batch analysis)
   */
  enableExports() {
    this.elements.btnExportCSV.disabled = false;
    this.elements.btnExportPDF.disabled = false;
  }

  /**
   * Update display mode button text
   * @param {string} mode - 'solid', 'wireframe', or 'hidden'
   */
  setDisplayModeText(mode) {
    const labels = {
      solid: 'Solid',
      wireframe: 'Wireframe',
      hidden: 'Hidden',
    };
    this.elements.displayModeText.textContent = labels[mode] || 'Solid';
  }

  /**
   * Show section controls panel
   * @param {Object} bounds - { min, max, current } values for slider
   */
  showSectionControls(bounds) {
    this.sectionEnabled = true;
    this.elements.sectionControls.classList.remove('hidden');
    this.elements.btnSection.classList.add('active-feature');

    // Update slider display
    if (bounds) {
      this.updateSectionValue(bounds.current);
    }
  }

  /**
   * Hide section controls panel
   */
  hideSectionControls() {
    this.sectionEnabled = false;
    this.elements.sectionControls.classList.add('hidden');
    this.elements.btnSection.classList.remove('active-feature');
    this.elements.sectionSlider.value = 50;
  }

  /**
   * Update section value display
   * @param {number} value - Current section height in meters
   */
  updateSectionValue(value) {
    this.elements.sectionValue.textContent = value.toFixed(1);
  }

  /**
   * Toggle sun path button state and show/hide controls
   * @param {boolean} active - Whether sun path is visible
   * @param {Object} settings - Location settings
   */
  setSunPathActive(active, settings = null) {
    this.sunPathEnabled = active;

    if (active) {
      this.elements.btnSunPath.classList.add('active-feature');
      this.elements.sunpathControls.classList.remove('hidden');

      // Set current date in date picker
      this.elements.sunpathDate.value = this.sunPathDate.toISOString().split('T')[0];

      // Update location display
      if (settings) {
        const lat = settings.latitude;
        const lon = settings.longitude;
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        this.elements.sunpathLocation.textContent = `${Math.abs(lat).toFixed(1)}°${latDir}, ${Math.abs(lon).toFixed(1)}°${lonDir}`;
      }
    } else {
      this.elements.btnSunPath.classList.remove('active-feature');
      this.elements.sunpathControls.classList.add('hidden');
    }
  }

  /**
   * Clear active state from all quick date buttons
   * @private
   */
  _clearQuickDateButtons() {
    this.elements.quickDateBtns.forEach((btn) => {
      btn.classList.remove('active');
    });
  }

  /**
   * Set a quick date button as active
   * @param {HTMLElement} activeBtn - The button to activate
   * @private
   */
  _setActiveQuickDateButton(activeBtn) {
    this._clearQuickDateButtons();
    activeBtn.classList.add('active');
  }

  /**
   * Toggle annotation mode
   */
  toggleAnnotationMode() {
    this.annotationMode = !this.annotationMode;

    if (this.annotationMode) {
      document.body.classList.add('annotation-mode');
      this.elements.btnAnnotate.classList.add('active-feature');
    } else {
      document.body.classList.remove('annotation-mode');
      this.elements.btnAnnotate.classList.remove('active-feature');
    }

    if (this.onAnnotationModeToggle) {
      this.onAnnotationModeToggle(this.annotationMode);
    }
  }

  /**
   * Exit annotation mode without toggling
   */
  exitAnnotationMode() {
    this.annotationMode = false;
    document.body.classList.remove('annotation-mode');
    this.elements.btnAnnotate.classList.remove('active-feature');
  }

  /**
   * Show annotation input modal
   * @param {Object} position - 3D position for annotation
   */
  showAnnotationModal(position) {
    this.pendingAnnotationPosition = position;
    this.elements.annotationText.value = '';
    this.elements.annotationColor.value = '#ffaa00';
    this.elements.annotationModal.classList.remove('hidden');
    this.elements.annotationText.focus();
  }

  /**
   * Hide annotation modal
   */
  hideAnnotationModal() {
    this.elements.annotationModal.classList.add('hidden');
    this.pendingAnnotationPosition = null;
  }

  /**
   * Enable calculate button
   */
  enableCalculate() {
    this.elements.btnCalculate.disabled = false;
  }

  /**
   * Disable calculate button
   */
  disableCalculate() {
    this.elements.btnCalculate.disabled = true;
  }

  /**
   * Set active view button
   * @param {string} view - '2d' or '3d'
   */
  setActiveViewButton(view) {
    this.elements.btnView2D.classList.toggle('active', view === '2d');
    this.elements.btnView3D.classList.toggle('active', view === '3d');
  }

  /**
   * Populate room dropdown
   * @param {Array} rooms - Array of room objects
   */
  setRooms(rooms) {
    this.rooms = rooms;
    const select = this.elements.roomSelect;

    // Clear existing options
    select.innerHTML = '<option value="">Select Room...</option>';

    // Add rooms
    rooms.forEach(room => {
      const option = document.createElement('option');
      option.value = room.expressID;
      option.textContent = `${room.name} (${room.floorArea.toFixed(1)} m²)`;
      select.appendChild(option);
    });

    // Expand panel if collapsed
    this.elements.sidePanel.classList.remove('collapsed');
  }

  /**
   * Display room information
   * @param {Object} room - Room object
   */
  showRoomInfo(room) {
    if (!room) {
      this.elements.roomInfo.innerHTML = '<p class="placeholder-text">Select a room to see details</p>';
      return;
    }

    this.elements.roomInfo.innerHTML = `
      <div class="info-row">
        <span class="info-label">Name</span>
        <span class="info-value">${room.name}</span>
      </div>
      ${room.longName ? `
      <div class="info-row">
        <span class="info-label">Long Name</span>
        <span class="info-value">${room.longName}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="info-label">Floor Area</span>
        <span class="info-value">${room.floorArea.toFixed(2)} m²</span>
      </div>
      <div class="info-row">
        <span class="info-label">Height</span>
        <span class="info-value">${room.height.toFixed(2)} m</span>
      </div>
      <div class="info-row">
        <span class="info-label">Volume</span>
        <span class="info-value">${room.volume.toFixed(2)} m³</span>
      </div>
      <div class="info-row">
        <span class="info-label">Perimeter</span>
        <span class="info-value">${room.perimeter.toFixed(2)} m</span>
      </div>
    `;
  }

  /**
   * Display window information
   * @param {Array} windows - Array of window objects
   * @param {number} floorArea - Room floor area for ratio calculation
   */
  showWindowsInfo(windows, floorArea = 0) {
    if (!windows || windows.length === 0) {
      this.elements.windowsInfo.innerHTML = '<p class="placeholder-text">No windows found for this room</p>';
      return;
    }

    const totalGlazedArea = windows.reduce((sum, w) => sum + w.glazedArea, 0);
    const glazingRatio = floorArea > 0 ? (totalGlazedArea / floorArea * 100) : 0;

    let html = `
      <div class="info-row">
        <span class="info-label">Window Count</span>
        <span class="info-value">${windows.length}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Total Glazed Area</span>
        <span class="info-value">${totalGlazedArea.toFixed(2)} m²</span>
      </div>
      <div class="info-row">
        <span class="info-label">Glazing/Floor Ratio</span>
        <span class="info-value">${glazingRatio.toFixed(1)}%</span>
      </div>
      <hr style="border-color: var(--border-color); margin: 12px 0;">
    `;

    windows.forEach((w, i) => {
      html += `
        <div class="window-item">
          <div class="window-name">${w.name || `Window ${i + 1}`}</div>
          <div class="window-details">
            ${w.overallWidth.toFixed(2)}m × ${w.overallHeight.toFixed(2)}m | ${w.orientation}
          </div>
        </div>
      `;
    });

    this.elements.windowsInfo.innerHTML = html;
  }

  /**
   * Display calculation results
   * @param {Object} stats - Statistics object
   */
  showResults(stats) {
    if (!stats) {
      this.elements.resultsInfo.innerHTML = '<p class="placeholder-text">Calculate daylight to see results</p>';
      return;
    }

    const getClass = (value, threshold1, threshold2) => {
      if (value >= threshold2) return 'good';
      if (value >= threshold1) return 'warning';
      return 'poor';
    };

    this.elements.resultsInfo.innerHTML = `
      <div class="result-stat">
        <span class="info-label">Average DF</span>
        <span class="result-value ${getClass(stats.average, 2, 5)}">${stats.average.toFixed(2)}<span class="result-unit">%</span></span>
      </div>
      <div class="result-stat">
        <span class="info-label">Minimum DF</span>
        <span class="result-value ${getClass(stats.min, 1, 2)}">${stats.min.toFixed(2)}<span class="result-unit">%</span></span>
      </div>
      <div class="result-stat">
        <span class="info-label">Maximum DF</span>
        <span class="result-value">${stats.max.toFixed(2)}<span class="result-unit">%</span></span>
      </div>
      <div class="result-stat">
        <span class="info-label">Uniformity</span>
        <span class="result-value ${getClass(stats.uniformity, 0.3, 0.4)}">${(stats.uniformity * 100).toFixed(0)}<span class="result-unit">%</span></span>
      </div>
      <hr style="border-color: var(--border-color); margin: 12px 0;">
      <div class="result-stat">
        <span class="info-label">Area ≥ 2% DF</span>
        <span class="result-value ${getClass(stats.above2, 50, 80)}">${stats.above2.toFixed(0)}<span class="result-unit">%</span></span>
      </div>
      <div class="result-stat">
        <span class="info-label">Area ≥ 5% DF</span>
        <span class="result-value">${stats.above5.toFixed(0)}<span class="result-unit">%</span></span>
      </div>
      <div class="result-stat">
        <span class="info-label">Grid Points</span>
        <span class="result-value">${stats.count}</span>
      </div>
    `;
  }

  /**
   * Clear results display
   */
  clearResults() {
    this.elements.resultsInfo.innerHTML = '<p class="placeholder-text">Calculate daylight to see results</p>';
  }

  /**
   * Clear all info panels
   */
  clearInfo() {
    this.showRoomInfo(null);
    this.elements.windowsInfo.innerHTML = '<p class="placeholder-text">Select a room to see windows</p>';
    this.clearResults();
  }

  /**
   * Get current settings
   * @returns {Object} Settings object
   */
  getSettings() {
    return {
      gridSpacing: parseFloat(this.elements.settingGridSpacing.value),
      workPlaneHeight: parseFloat(this.elements.settingWorkPlane.value),
      transmittance: parseFloat(this.elements.settingTransmittance.value),
      reflectances: {
        ceiling: parseFloat(this.elements.settingCeilingRef.value),
        walls: parseFloat(this.elements.settingWallRef.value),
        floor: parseFloat(this.elements.settingFloorRef.value),
      },
      location: {
        latitude: parseFloat(this.elements.settingLatitude.value),
        longitude: parseFloat(this.elements.settingLongitude.value),
      },
    };
  }

  /**
   * Save settings to localStorage
   * @private
   */
  _saveSettings() {
    const settings = this.getSettings();
    localStorage.setItem('daylightlab-settings', JSON.stringify(settings));
  }

  /**
   * Load settings from localStorage
   * @private
   */
  _loadSettings() {
    const saved = localStorage.getItem('daylightlab-settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        this.elements.settingGridSpacing.value = settings.gridSpacing || 0.5;
        this.elements.settingWorkPlane.value = settings.workPlaneHeight || 0.85;
        this.elements.settingTransmittance.value = settings.transmittance || 0.7;
        this.elements.settingCeilingRef.value = settings.reflectances?.ceiling || 0.8;
        this.elements.settingWallRef.value = settings.reflectances?.walls || 0.5;
        this.elements.settingFloorRef.value = settings.reflectances?.floor || 0.2;
        this.elements.settingLatitude.value = settings.location?.latitude || 51.5;
        this.elements.settingLongitude.value = settings.location?.longitude || -0.1;
      } catch {
        console.warn('Failed to load settings');
      }
    }
  }

  /**
   * Show batch results modal
   * @param {Array} results - Batch analysis results
   * @param {Object} summary - Summary statistics
   */
  showBatchResults(results, summary) {
    this.batchResults = results;

    // Update summary
    const summaryClass = (passing, total) => {
      const ratio = passing / total;
      if (ratio >= 0.8) return 'good';
      if (ratio >= 0.5) return 'warning';
      return 'poor';
    };

    this.elements.batchSummary.innerHTML = `
      <div class="summary-stat">
        <div class="stat-value">${summary.totalRooms}</div>
        <div class="stat-label">Rooms Analyzed</div>
      </div>
      <div class="summary-stat ${summaryClass(summary.passing, summary.successfulAnalyses)}">
        <div class="stat-value">${summary.passing}/${summary.successfulAnalyses}</div>
        <div class="stat-label">Passing BREEAM</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value">${summary.overallAvgDF.toFixed(2)}%</div>
        <div class="stat-label">Overall Avg DF</div>
      </div>
      <div class="summary-stat ${summary.complianceRate >= 80 ? 'good' : summary.complianceRate >= 50 ? 'warning' : 'poor'}">
        <div class="stat-value">${summary.complianceRate.toFixed(0)}%</div>
        <div class="stat-label">Compliant Area</div>
      </div>
    `;

    // Update table
    const getValueClass = (value, threshold1, threshold2) => {
      if (value >= threshold2) return 'value-good';
      if (value >= threshold1) return 'value-warning';
      return 'value-poor';
    };

    const rows = results.map(r => {
      if (!r.success) {
        return `
          <tr>
            <td>${r.room.name}</td>
            <td>${r.room.floorArea.toFixed(1)}</td>
            <td>${r.windows.length}</td>
            <td colspan="3">Analysis failed</td>
            <td><span class="compliance-badge fail">ERROR</span></td>
            <td class="recommendation-text">${r.error || 'Failed'}</td>
          </tr>
        `;
      }

      const complianceClass = r.compliance?.status || 'fail';

      return `
        <tr>
          <td>${r.room.name}</td>
          <td>${r.room.floorArea.toFixed(1)}</td>
          <td>${r.windows.length}</td>
          <td class="${getValueClass(r.stats.average, 2, 5)}">${r.stats.average.toFixed(2)}%</td>
          <td class="${getValueClass(r.stats.min, 0.6, 1)}">${r.stats.min.toFixed(2)}%</td>
          <td class="${getValueClass(r.stats.above2, 50, 80)}">${r.stats.above2.toFixed(0)}%</td>
          <td><span class="compliance-badge ${complianceClass}">${complianceClass.toUpperCase()}</span></td>
          <td class="recommendation-text">${r.recommendation}</td>
        </tr>
      `;
    }).join('');

    this.elements.batchResultsBody.innerHTML = rows;

    // Show modal
    this.elements.batchResultsModal.classList.remove('hidden');
  }

  /**
   * Show comparison results modal
   * @param {Object} comparison - Comparison data with baseline, comparison results and deltas
   */
  showComparisonResults(comparison) {
    const { baselineName, comparisonName, baselineResults, comparisonResults, summary } = comparison;

    // Update header with model names
    this.elements.comparisonHeader.innerHTML = `
      <div class="model-info">
        <div class="model-label">Baseline</div>
        <div class="model-name">${baselineName}</div>
      </div>
      <div class="model-info">
        <div class="model-label">Comparison</div>
        <div class="model-name">${comparisonName}</div>
      </div>
    `;

    // Calculate change class
    const getChangeClass = (baseline, comparison) => {
      const diff = comparison - baseline;
      if (Math.abs(diff) < 0.1) return 'unchanged';
      return diff > 0 ? 'improved' : 'worsened';
    };

    // Update summary
    this.elements.comparisonSummary.innerHTML = `
      <div class="comparison-stat">
        <div class="stat-label">Average DF</div>
        <div class="stat-values">
          <span class="stat-value baseline">${summary.baselineAvgDF.toFixed(2)}%</span>
          <span class="stat-arrow">→</span>
          <span class="stat-value ${getChangeClass(summary.baselineAvgDF, summary.comparisonAvgDF)}">${summary.comparisonAvgDF.toFixed(2)}%</span>
        </div>
      </div>
      <div class="comparison-stat">
        <div class="stat-label">Passing Rooms</div>
        <div class="stat-values">
          <span class="stat-value baseline">${summary.baselinePassing}</span>
          <span class="stat-arrow">→</span>
          <span class="stat-value ${getChangeClass(summary.baselinePassing, summary.comparisonPassing)}">${summary.comparisonPassing}</span>
        </div>
      </div>
      <div class="comparison-stat">
        <div class="stat-label">Compliance Rate</div>
        <div class="stat-values">
          <span class="stat-value baseline">${summary.baselineComplianceRate.toFixed(0)}%</span>
          <span class="stat-arrow">→</span>
          <span class="stat-value ${getChangeClass(summary.baselineComplianceRate, summary.comparisonComplianceRate)}">${summary.comparisonComplianceRate.toFixed(0)}%</span>
        </div>
      </div>
      <div class="comparison-stat">
        <div class="stat-label">Rooms Improved</div>
        <div class="stat-values">
          <span class="stat-value improved">${summary.improved}</span>
          <span class="stat-value worsened">${summary.worsened}</span>
          <span class="stat-value unchanged">${summary.unchanged}</span>
        </div>
      </div>
    `;

    // Build comparison table rows
    const rows = baselineResults.map(baselineRoom => {
      const compRoom = comparisonResults.find(r => r.room.name === baselineRoom.room.name);

      if (!baselineRoom.success) {
        return `
          <tr>
            <td>${baselineRoom.room.name}</td>
            <td>Error</td>
            <td>${compRoom?.success ? compRoom.stats.average.toFixed(2) + '%' : 'Error'}</td>
            <td>-</td>
            <td><span class="compliance-badge fail">ERROR</span></td>
            <td>${compRoom?.success ? `<span class="compliance-badge ${compRoom.compliance?.status || 'fail'}">${(compRoom.compliance?.status || 'fail').toUpperCase()}</span>` : '<span class="compliance-badge fail">ERROR</span>'}</td>
          </tr>
        `;
      }

      const baselineDF = baselineRoom.stats.average;
      const compDF = compRoom?.success ? compRoom.stats.average : null;
      const change = compDF !== null ? compDF - baselineDF : null;

      const changeClass = change === null ? 'change-neutral' :
        Math.abs(change) < 0.1 ? 'change-neutral' :
        change > 0 ? 'change-positive' : 'change-negative';

      const changeText = change === null ? '-' :
        Math.abs(change) < 0.1 ? '0' :
        (change > 0 ? '+' : '') + change.toFixed(2) + '%';

      return `
        <tr>
          <td>${baselineRoom.room.name}</td>
          <td>${baselineDF.toFixed(2)}%</td>
          <td>${compDF !== null ? compDF.toFixed(2) + '%' : 'N/A'}</td>
          <td class="${changeClass}">${changeText}</td>
          <td><span class="compliance-badge ${baselineRoom.compliance?.status || 'fail'}">${(baselineRoom.compliance?.status || 'fail').toUpperCase()}</span></td>
          <td>${compRoom?.success ? `<span class="compliance-badge ${compRoom.compliance?.status || 'fail'}">${(compRoom.compliance?.status || 'fail').toUpperCase()}</span>` : '-'}</td>
        </tr>
      `;
    }).join('');

    this.elements.comparisonBody.innerHTML = rows;

    // Show modal
    this.elements.comparisonModal.classList.remove('hidden');
  }
}
