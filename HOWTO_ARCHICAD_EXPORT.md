# How to Export IFC from ArchiCAD for DaylightLab

This guide explains how to set up ArchiCAD 29 to export IFC files that work optimally with DaylightLab for daylight analysis.

## Quick Start

1. Open your ArchiCAD project
2. Go to **File → Save As...** or **File → Interoperability → IFC → Save as IFC...**
3. Select your IFC Translator (or configure one - see below)
4. **Critical:** Ensure spatial elements (Zones) are included
5. Click **Save**

---

## Step 1: Create Zones in Your Model

DaylightLab analyzes **IfcSpace/IfcSpatialZone** entities. In ArchiCAD, these come from **Zones**.

### Creating Zones:

1. Select the **Zone Tool** from the toolbox (or press `Z`)
2. Draw zones to cover each room you want to analyze
3. Use the **Magic Wand** (spacebar while in Zone tool) to automatically detect room boundaries from walls

### Zone Settings (Info Box / Settings Dialog):

| Property | Recommendation |
|----------|----------------|
| **Zone Name** | Descriptive name (e.g., "Living Room", "Bedroom 1") |
| **Zone Number/ID** | Unique identifier (e.g., "ZON-001") |
| **Zone Height** | Match your ceiling height |
| **Zone Category** | Select appropriate category |

### Zone Properties Panel (as shown in your screenshot):

Your zones have useful properties in the **ZONES** section:
- **Illuminance Requirement** - Can store target lux levels
- **Area per Occupant** - Already set to 6.00 in your example
- **Floor/Wall/Ceiling Finish** - Surface finish types

The **WINDOW RATE** section is particularly relevant:
- **Window rate calculated** - ArchiCAD can calculate glazing ratios
- **Does Window rate meet...** - Compliance checking expressions

---

## Step 2: Configure IFC Translator for Export

### Accessing IFC Translators:

**File → Interoperability → IFC → IFC Translators...**

### IFC Domain Settings (Critical!)

Based on your screenshot, in the **IFC Domain** filter tree, ensure these are **checked**:

```
☑ IfcElement
  ☑ IfcBuildingElement        ← Walls, Windows, Doors, Slabs
    (includes walls, windows, doors, slabs, roofs)
  ☐ IfcCivilElement           ← Not needed
  ☐ IfcDistributionElement    ← Not needed (MEP)
  ☐ IfcElementAssembly        ← Optional
  ☑ IfcElementComponent       ← Optional (building parts)
  ☐ IfcFeatureElement         ← Optional (openings)
  ☐ IfcFurnishingElement      ← Optional (furniture)
  ☐ IfcGeographicElement      ← Not needed
  ☐ IfcTransportElement       ← Not needed
  ☐ IfcProxy                  ← Optional

☑ IfcSpatialElement           ← CRITICAL FOR ROOMS!
  ☐ IfcExternalSpatialStructureElement  ← Not needed
  ☑ IfcSpatialStructureElement          ← MUST BE CHECKED (contains IfcSpace)
  ☑ IfcSpatialZone                      ← MUST BE CHECKED (zones)
```

### Critical Settings Summary:

| IFC Domain Element | Check? | Why |
|--------------------|--------|-----|
| **IfcBuildingElement** | ✅ Yes | Includes walls, windows, doors, slabs |
| **IfcSpatialStructureElement** | ✅ **Yes** | **Required for IfcSpace (rooms)** |
| **IfcSpatialZone** | ✅ **Yes** | **Required for zone export** |
| IfcFurnishingElement | Optional | Furniture (not needed for daylight) |
| IfcDistributionElement | Optional | MEP elements (not needed) |

---

## Step 3: Export Settings

### Recommended Translator Configuration:

#### Geometry Options:
| Setting | Recommended |
|---------|-------------|
| **Geometry Conversion** | BREP (accurate) or Tessellated |
| **Geometry Simplification** | Minimal |
| **Include Bounding Box** | Yes |

#### Property Options:
| Setting | Recommended |
|---------|-------------|
| **Export Element Properties** | All or Selected |
| **Export IFC Base Quantities** | Yes |
| **Export ArchiCAD Properties** | Yes |

#### Schema Selection:
- **IFC4** - Recommended (better spatial element support)
- **IFC2x3** - Alternative if IFC4 causes issues

---

## Step 4: Perform the Export

1. **File → Save As...** (or **File → Interoperability → IFC → Save as IFC...**)
2. Select your configured translator
3. Choose save location
4. Set filename (e.g., `myproject-daylight.ifc`)
5. Click **Save**

### Export Dialog Options:
- **Entire Model** or **Visible Elements Only** - Either works
- **Current Story** vs **All Stories** - Export the stories you need to analyze

---

## Troubleshooting

### "No rooms found" in DaylightLab

**Most Common Cause:** IfcSpatialStructureElement or IfcSpatialZone not checked in IFC Domain.

**Fix:**
1. Open IFC Translator settings
2. Go to IFC Domain filter
3. Expand `IfcSpatialElement`
4. Check both `IfcSpatialStructureElement` and `IfcSpatialZone`
5. Re-export

**Other Checks:**
- Verify zones exist in your model (View → Elements in 3D → check Zones are visible)
- Zones must have geometry (not just stamps)
- Zone heights must be > 0

### Windows not detected for a room

**Causes:**
1. Windows not within zone boundary
2. Windows in walls that don't bound the zone

**Fixes:**
- Ensure zone boundaries align with wall inner faces
- Use Magic Wand to regenerate zone boundaries
- Check windows are properly hosted in walls

### Room dimensions seem wrong

**Cause:** Zone boundaries don't match wall faces.

**Fix:**
1. Select the zone
2. Use Magic Wand (spacebar) to recalculate from walls
3. Manually adjust zone polygon if needed

### IFC file is very large

**Fixes:**
- Disable unnecessary IFC Domain elements (furniture, MEP, etc.)
- Export only the stories you need
- Use "Visible Elements Only" option

---

## Recommended Workflow

### Before Export Checklist:

- [ ] All rooms have zones defined
- [ ] Zones have meaningful names (check Zone Name property)
- [ ] Zone heights are correct
- [ ] Zone boundaries align with wall inner faces
- [ ] Windows are placed in walls (not floating objects)

### IFC Translator Checklist:

- [ ] IfcBuildingElement is checked
- [ ] **IfcSpatialStructureElement is checked** ⚠️
- [ ] **IfcSpatialZone is checked** ⚠️
- [ ] Geometry set to BREP or Tessellated
- [ ] Properties export enabled

---

## ArchiCAD 29 IFC Export Settings Summary

```
IFC Translator Configuration for DaylightLab
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEMA: IFC4 (recommended) or IFC2x3

IFC DOMAIN - MUST CHECK:
  ☑ IfcBuildingElement
  ☑ IfcSpatialStructureElement  ← CRITICAL!
  ☑ IfcSpatialZone              ← CRITICAL!

IFC DOMAIN - OPTIONAL:
  ☐ IfcFurnishingElement (furniture)
  ☐ IfcDistributionElement (MEP)
  ☐ IfcCivilElement

GEOMETRY:
  → BREP or Tessellated
  → Include bounding box: Yes

PROPERTIES:
  → Export base quantities: Yes
  → Export ArchiCAD properties: Yes
```

---

## Zone Properties Reference

Based on your ArchiCAD 29 Zone settings, here are relevant properties:

| Property Section | Property | Use in DaylightLab |
|------------------|----------|-------------------|
| ID AND CATEGORIES | Zone ID | Identification |
| ZONES | Illuminance Requirement | Future: target comparison |
| ZONES | Area per Occupant | Future: occupancy calcs |
| WINDOW RATE | Window rate calculated | Compare with results |
| ENVIRONMENTAL | Various | Future enhancements |

---

## Testing Your Export

### Quick Test:
1. Export a small test file (one or two rooms)
2. Load in DaylightLab
3. Verify:
   - Rooms appear in the dropdown
   - Room geometry is correct
   - Windows are detected for each room

### Verification in External Viewer:
Before using DaylightLab, you can verify your IFC in:
- **BIM Vision** (free) - https://bimvision.eu/
- **Solibri Anywhere** (free) - https://www.solibri.com/
- **IFC.js viewer** (online) - https://ifcjs.github.io/web-ifc-viewer/

Look for:
- IfcSpace or IfcSpatialZone entities in the model tree
- IfcWindow entities
- Correct geometry for rooms and windows

---

## Other BIM Software

### Revit
1. Use built-in IFC export or IFC Exporter add-in
2. **Critical:** Check "Export rooms as IfcSpace"
3. Use IFC4 Reference View or Design Transfer View

### Vectorworks
1. File → Export → Export IFC Project
2. Enable Space export in options
3. Select IFC4 or IFC2x3

### General Requirements:
- Export IfcSpace or IfcSpatialZone for rooms
- Export IfcWindow for windows
- Include geometry (BREP preferred)
- Use IFC4 or IFC2x3 schema

---

## Support

If you encounter issues:
1. Check browser console (F12) for specific error messages
2. Verify IFC opens in BIM Vision or similar viewer
3. Confirm zones are visible in ArchiCAD 3D view
4. Re-check IFC Domain settings (IfcSpatialStructureElement!)
