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
    this.onViewChange = null;
    this.onResetView = null;
    this.onExport = null;
    this.onSettingsSave = null;
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
}
