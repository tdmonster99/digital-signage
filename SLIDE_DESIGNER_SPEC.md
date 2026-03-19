# Slide Designer — Feature Specification
## Digital Signage Platform

---

## Overview

Add a Fabric.js-based slide designer to the admin panel, replacing the current
"image only" approach with a full canvas editor. Users will be able to create
slides with text, images, shapes, and backgrounds directly in the browser —
no external design tools needed.

The display app will render these designed slides alongside traditional
image-only slides with no changes to the real-time sync architecture.

---

## Current State

- admin.html: Users upload images or paste URLs. Each slide = one image.
- display.html: Full-screen background-image crossfade slideshow.
- Firebase Firestore: Stores slide array with { id, url, name, active, dwell }.
- Cloudinary: Stores uploaded images.

---

## Target State

- Each slide can be either:
  a) IMAGE slide — existing behavior, full-screen image (keep as-is)
  b) DESIGNED slide — Fabric.js canvas with text, images, shapes, backgrounds

- The slide grid in admin.html shows thumbnail previews of both types.
- The display app renders both types seamlessly in the same slideshow loop.

---

## Tech Stack Addition

- Fabric.js v6 (CDN): https://cdnjs.cloudflare.com/ajax/libs/fabric.js/6.0.0/fabric.min.js
- No new backend required — canvas JSON stored in Firestore alongside existing slide data
- Slide thumbnails generated via fabric.Canvas.toDataURL() and stored in Cloudinary

---

## Data Model Changes

Current slide object:
```json
{
  "id": "uuid",
  "url": "https://...",
  "name": "slide name",
  "active": true,
  "dwell": 6
}
```

New slide object (designed slide):
```json
{
  "id": "uuid",
  "type": "designed",
  "name": "slide name",
  "active": true,
  "dwell": 6,
  "canvasJson": "{...fabric.js JSON...}",
  "thumbnailUrl": "https://cloudinary.com/..."
}
```

Existing image slides get type: "image" added for clarity but otherwise unchanged.

---

## Feature 1 — Slide Type Selector

When the user clicks "Add Slide" or the existing upload/URL buttons, show a
choice:

```
[ Upload Image ]   [ Design a Slide ]
```

- "Upload Image" — existing behavior unchanged
- "Design a Slide" — opens the slide editor modal (Feature 2)

---

## Feature 2 — Slide Editor Modal

A full-screen modal overlay containing:

### 2a — Canvas Area
- 16:9 canvas at 1920x1080 logical resolution, scaled to fit the modal
- Fabric.js canvas instance
- White background by default
- Click to select elements
- Drag to move elements
- Corner handles to resize
- Delete key removes selected element

### 2b — Left Toolbar (Element Tools)
Vertical icon toolbar on the left side with these tools:

| Icon | Action |
|------|--------|
| T | Add text block |
| Image | Add image (opens Cloudinary upload or URL prompt) |
| Square | Add rectangle shape |
| Circle | Add circle shape |
| Line | Add horizontal line |
| Background | Set canvas background (color picker or image) |

### 2c — Right Properties Panel
Context-sensitive panel that changes based on selected element:

**Text selected:**
- Font family (dropdown: Arial, Georgia, Helvetica, Impact, Montserrat, Oswald, Raleway, Roboto)
- Font size (number input)
- Bold / Italic / Underline toggles
- Text color (color picker)
- Text alignment (left / center / right)
- Background color with opacity slider
- Padding slider

**Image selected:**
- Opacity slider
- Flip horizontal / vertical buttons
- Bring forward / send backward buttons

**Shape selected:**
- Fill color (color picker)
- Border color (color picker)
- Border width (number input)
- Opacity slider
- Bring forward / send backward buttons

**Nothing selected (canvas):**
- Background type toggle: Solid Color / Gradient / Image
- If Solid: color picker
- If Gradient: two color pickers + direction selector
- If Image: upload button or URL input + fit mode (cover/contain)

### 2d — Top Bar
- Slide name input (text field)
- Undo button (Ctrl+Z)
- Redo button (Ctrl+Y)
- Preview button — shows full-screen preview of the slide
- Save button — saves canvas JSON to Firestore, generates thumbnail, closes modal
- Cancel button — closes modal without saving

### 2e — Bottom Layers Panel
- Horizontal list of all elements on canvas
- Click to select
- Drag to reorder (z-index)
- Eye icon to toggle visibility
- Trash icon to delete

---

## Feature 3 — Template Gallery

When "Design a Slide" is clicked, before opening the blank editor, show a
template picker with these starter templates:

| Template | Description |
|----------|-------------|
| Blank | Empty white canvas |
| Announcement | Large centered text on colored background |
| Image + Caption | Full bleed image with text overlay at bottom |
| Lower Third | Image background with title and subtitle bar at bottom |
| Two Column | Left image, right text block |
| Menu Board | Dark background, title at top, content area below |
| Event Promo | Bold title, date/time text, image background |
| Employee Spotlight | Portrait image left, name and bio right |

Each template pre-populates the canvas with placeholder elements that the
user replaces with their content.

---

## Feature 4 — Display App Rendering

The display app needs to render designed slides alongside image slides.

### Logic:
```javascript
if (slide.type === "designed") {
  renderFabricCanvas(slide.canvasJson);
} else {
  // existing background-image behavior
  renderImageSlide(slide.url);
}
```

### Implementation:
- Load Fabric.js in display.html (same CDN)
- Create an off-screen fabric.StaticCanvas (no interaction needed)
- Load canvasJson via canvas.loadFromJSON()
- Scale canvas to fill the screen maintaining 16:9
- Use canvas.toDataURL() to render to an img element
- Apply existing crossfade transition between slides

---

## Feature 5 — Slide Duplication

In the slide grid, add a "Duplicate" button to each slide card (alongside
existing hide/delete buttons). Duplicating a designed slide opens it in the
editor pre-populated with all existing elements, saving as a new slide.

---

## Feature 6 — Thumbnail Generation

When a designed slide is saved:
1. Call fabric.canvas.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 0.25 })
2. Convert dataURL to a Blob
3. Upload Blob to Cloudinary (same unsigned preset)
4. Store returned URL as slide.thumbnailUrl in Firestore
5. Display thumbnailUrl in the slide grid card

---

## Implementation Order

Build in this sequence to keep things working at each step:

1. Add Fabric.js to admin.html, create basic modal with blank canvas ✓ testable
2. Add text tool and background color ✓ testable
3. Add image upload tool (Cloudinary) ✓ testable
4. Add shapes (rectangle, circle, line) ✓ testable
5. Add properties panel (right sidebar) ✓ testable
6. Add undo/redo ✓ testable
7. Add save → Firestore + thumbnail generation ✓ testable
8. Update display.html to render designed slides ✓ testable
9. Add template gallery ✓ testable
10. Add layers panel ✓ testable
11. Add slide duplication ✓ testable

---

## Design Guidelines

- Editor modal: dark theme matching existing admin.html color scheme
- Canvas area: checkerboard pattern outside the 16:9 bounds (like Figma/Canva)
- Selected elements: blue outline with 8 corner/edge handles
- Toolbar icons: use SVG icons matching existing admin.html style
- Properties panel: collapsible sections, same input styling as existing fields
- Transitions: smooth panel animations, no jarring layout shifts

---

## Out of Scope (Phase 2)

These features are NOT part of this spec and should not be built yet:

- Video elements on canvas
- Animated elements / keyframe animation
- Live data widgets (weather, clock, RSS)
- Google Slides import
- PowerPoint import
- Collaboration / multi-user editing
- Version history
- Asset library / shared media

---

## Files to Modify

- admin.html — add editor modal, toolbar, properties panel, template gallery
- display.html — add Fabric.js, designed slide rendering logic
- No new files required for MVP

---

## How to Hand This to Claude Code

Paste the following prompt into Claude Code followed by this entire document:

> "I want to add a Fabric.js slide designer to my digital signage app.
> Here is the full feature spec. Please implement it in the order specified,
> starting with Step 1. Ask me before moving to each new step so I can test
> first. Do not modify display.html until the admin editor is fully working."
