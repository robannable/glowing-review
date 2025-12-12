#!/bin/bash
# DaylightLab Setup and Run Script for Linux
# =============================================

echo ""
echo "========================================"
echo "  DaylightLab - Daylight Analysis Tool"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo ""
    echo "Please install Node.js using your package manager:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  Fedora: sudo dnf install nodejs npm"
    echo "  Arch: sudo pacman -S nodejs npm"
    echo "Or download from: https://nodejs.org/"
    echo ""
    exit 1
fi

# Display Node.js version
echo "[OK] Node.js found:"
node --version
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not available."
    echo "Please install npm using your package manager."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    echo "This may take a minute on first run..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install dependencies."
        exit 1
    fi
    echo ""
    echo "[OK] Dependencies installed successfully."
else
    echo "[OK] Dependencies already installed."
fi

echo ""
echo "========================================"
echo "  Starting DaylightLab..."
echo "========================================"
echo ""
echo "The application will open in your default browser."
echo "If it doesn't, open: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Start the development server
npm run dev
