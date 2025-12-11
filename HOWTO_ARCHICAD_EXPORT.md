# How to Export IFC from ArchiCAD for DaylightLab

This guide explains how to set up ArchiCAD to export IFC files that work optimally with DaylightLab for daylight analysis.

## Quick Start

1. Open your ArchiCAD project
2. Go to **File → Save As...**
3. Select **IFC** format
4. Choose **IFC4** or **IFC2x3** schema
5. Select the **"General Translator"** or create a custom one (see below)
6. **Important:** Make sure Zones/Spaces are included in export
7. Click **Save**

---

## Detailed Setup Instructions

### Step 1: Ensure Zones Are Defined

DaylightLab analyzes **IfcSpace** entities (rooms/zones). In ArchiCAD, these come from **Zones**.

#### Creating Zones in ArchiCAD:

1. Go to **Design → Design Extras → Zone Tool** (or press `Z`)
2. Draw zones to cover each room you want to analyze
3. Set zone properties:
   - **Name**: Give each zone a meaningful name (e.g., "Living Room", "Bedroom 1")
   - **Zone Category**: Set to "Net Area" or appropriate category
   - **Height**: Ensure zone height matches room height

#### Tips for Good Zone Setup:
- Zones should cover the entire floor area of each room
- Zone boundaries should align with wall inner faces
- Each room should have its own zone (don't combine multiple rooms)
- Zone height should extend from floor to ceiling

---

### Step 2: Configure IFC Translator

The IFC Translator controls what data is exported. Here's how to set it up:

#### Using the Built-in Translator:

1. Go to **File → Interoperability → IFC → IFC Translators...**
2. Select **"General Translator"** as your starting point
3. Click **Edit...** to customize

#### Creating a Custom Translator for Daylight Analysis:

1. In the IFC Translators dialog, click **New...**
2. Name it "Daylight Analysis" or similar
3. Configure the following settings:

##### Geometry Conversion:
| Setting | Recommended Value |
|---------|-------------------|
| Geometry Method | **BREP** (most accurate) or **Extruded** (smaller file) |
| Element Geometry | **Element's Own Geometry** |
| Triangulate Surfaces | **Off** (unless needed) |

##### Model Filtering:
| Element Type | Include |
|--------------|---------|
| Walls | ✓ Yes |
| Windows | ✓ Yes |
| Doors | ✓ Yes |
| Slabs | ✓ Yes |
| Roofs | ✓ Yes |
| **Zones** | ✓ **Yes (Critical!)** |
| Columns | Optional |
| Beams | Optional |
| Objects/Furniture | Optional |

##### Properties:
| Setting | Value |
|---------|-------|
| Export Properties | **All Properties** or **ArchiCAD Properties** |
| Include Base Quantities | ✓ **Yes** |
| Include Classification | Optional |

---

### Step 3: Export the IFC File

1. Go to **File → Save As...**
2. Select format: **Industry Foundation Classes (*.ifc)**
3. Choose your configured translator
4. **IFC Schema**: Select **IFC4** (preferred) or **IFC2x3**
5. Browse to save location
6. Click **Save**

#### Export Settings Dialog:
- **Model View Definition (MVD)**: Coordination View 2.0 or Design Transfer View
- **Geometry**: Surface Geometry (for visualization)
- **Site Location**: Include if you want accurate sun position calculations

---

## Troubleshooting

### "No rooms found" in DaylightLab

**Cause:** Zones were not exported or don't exist in the ArchiCAD model.

**Solutions:**
1. Verify zones exist in ArchiCAD (use 3D window to check zone visibility)
2. Check IFC Translator settings - ensure "Zones" is checked for export
3. Re-export with a different translator

### Windows not detected

**Cause:** Windows may not be positioned correctly relative to rooms.

**Solutions:**
1. Ensure windows are properly placed in walls (not floating)
2. Check that windows have correct geometry (OverallWidth, OverallHeight)
3. Windows should be within or adjacent to zone boundaries

### Room geometry looks wrong

**Cause:** Zone boundaries may not match wall inner faces.

**Solutions:**
1. In ArchiCAD, adjust zone boundaries to align with inner wall faces
2. Use "Magic Wand" to automatically detect room boundaries
3. Check zone heights are correct

### File won't load / parsing errors

**Cause:** Incompatible IFC version or corrupted export.

**Solutions:**
1. Try exporting as IFC2x3 instead of IFC4 (or vice versa)
2. Use "BREP" geometry instead of "Extruded"
3. Simplify the model (export only relevant floors/areas)
4. Check for ArchiCAD updates that may fix IFC export bugs

---

## Recommended Workflow

### For Best Results:

1. **Set up zones early** in your design process
2. **Name zones clearly** so they're easy to identify
3. **Test export** with a small portion of the model first
4. **Verify in DaylightLab** that rooms and windows are detected correctly
5. **Iterate** on zone setup if needed

### Model Preparation Checklist:

- [ ] All rooms have zones defined
- [ ] Zone names are descriptive
- [ ] Zone heights match room heights
- [ ] Windows are placed in walls (not floating)
- [ ] Windows have correct dimensions
- [ ] Model is at correct scale (meters)

---

## IFC Schema Comparison

| Feature | IFC2x3 | IFC4 |
|---------|--------|------|
| Compatibility | Most tools | Newer tools |
| File Size | Smaller | Larger |
| Geometry Accuracy | Good | Better |
| Property Support | Standard | Extended |
| DaylightLab Support | ✓ Yes | ✓ Yes |

**Recommendation:** Use **IFC4** if your version of ArchiCAD supports it, otherwise use **IFC2x3**.

---

## Other BIM Software

While DaylightLab is optimized for ArchiCAD exports, it should work with IFC files from other software:

### Revit
1. Export to IFC using "IFC Exporter" add-in
2. Include Rooms/Spaces in export
3. Use IFC4 or IFC2x3 schema

### Vectorworks
1. Use File → Export → Export IFC Project
2. Enable Space/Room export
3. Select appropriate IFC version

### SketchUp (with IFC plugin)
1. Requires IFC exporter extension
2. Define spaces manually or use room detection
3. Export with geometry and properties

### General Requirements for Any Software:
- Export IfcSpace entities for rooms
- Export IfcWindow entities for windows
- Include geometry (BREP or extruded)
- Use IFC2x3 or IFC4 schema

---

## Support

If you encounter issues not covered here:

1. Check the browser console (F12) for error messages
2. Try a simpler test model first
3. Verify your IFC file opens in other viewers (like BIM Vision or Solibri Anywhere)
4. Report issues with details about your ArchiCAD version and export settings

---

## Sample Export Settings Summary

```
IFC Translator Settings for DaylightLab:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Schema:           IFC4 (or IFC2x3)
MVD:              Coordination View 2.0
Geometry:         BREP or Extruded

Include Elements:
  ✓ Walls
  ✓ Windows
  ✓ Doors
  ✓ Slabs (floors/ceilings)
  ✓ Zones (CRITICAL!)

Properties:
  ✓ Base Quantities
  ✓ ArchiCAD Properties
```
