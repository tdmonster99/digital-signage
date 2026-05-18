# Zigns Template Production Workflow

This workflow turns a template idea into an editable Zigns Fabric.js template. The goal is repeatability: every template should start from a clear brief, produce a structured handoff, and land in the app as editable Fabric objects rather than as a flat poster image.

## Preferred Path: Codex-Native

Use this path when Claude Design usage is limited or when the template is a normal production template.

1. Start with a one-template brief.
2. Use Codex image generation to create a 16:9 concept plate.
3. Ask Codex to convert the concept into a `ZignsTemplateSpec`.
4. Generate any required transparent glyph assets with Codex image generation, or draw simple glyphs directly with Fabric primitives.
5. Implement the template in `admin.html` using the existing template helper pattern.
6. Add or update the `EXTRA_TEMPLATE_RENDERERS` entry.
7. Add or update the `EXTRA_TEMPLATE_CATALOG` entry.
8. Bump `TMPL_THUMB_CACHE_KEY`.
9. Prepend `DEVLOG.md`.
10. Run validation.

This keeps the whole process inside Codex. The only exception is when an outside design tool produces a superior concept that is worth importing as reference.

## Optional Path: Claude Design Assist

Use this path sparingly for high-value templates, design exploration, or when a template category needs a stronger visual direction.

1. Prompt Claude Design with `docs/prompts/CLAUDE_DESIGN_TEMPLATE_BRIEF.md`.
2. Export the project zip.
3. Ask Codex to ingest the zip with `docs/prompts/CODEX_TEMPLATE_INGEST.md`.
4. Codex should treat JSX, CSS, screenshots, and HTML as reference material only.
5. Codex translates the handoff into the same editable Fabric renderer pattern used by the Codex-native path.

Do not import React, Babel, CSS prototypes, or generated HTML into Zigns.

## Required Template Deliverables

Each finished template should have:

- One renderer function in `admin.html`.
- One `EXTRA_TEMPLATE_RENDERERS` mapping.
- One `EXTRA_TEMPLATE_CATALOG` card.
- Editable text for user-facing copy.
- Locked or non-evented structure for layout scaffolding.
- A thumbnail cache key bump.
- A top `DEVLOG.md` entry.
- Passing static smoke validation.

## Implementation Rules

- Work in `/Users/jzegar/dev/zigns/app`.
- Do not edit the site repo.
- Keep the app no-framework and no-bundler.
- Keep frontend code in `admin.html`.
- Do not add npm dependencies for template work.
- Do not commit, push, reset, restore, or delete unless explicitly asked.
- Do not flatten the template into a single image.
- Prefer Fabric objects for text, panels, lines, shapes, and simple glyphs.
- Use image assets only when the graphic is too detailed or costly to draw cleanly with Fabric primitives.

## Codex-Native Production Steps

### 1. Brief

Capture these fields before generating anything:

- Template name
- Category
- Audience
- Display environment
- Job to be done
- Required text zones
- Required graphic zones
- Tone
- Constraints

Example:

```text
Template name: Forklift Traffic Flow
Category: operations
Audience: warehouse associates and visitors
Display environment: 55 inch TV near warehouse entrance, viewed from 10 to 25 feet
Job to be done: show current forklift/pedestrian traffic rules and route direction
Tone: direct, industrial, high-contrast
Required zones: headline, route map, three rules, dock status, supervisor contact
Graphic zones: forklift glyph, pedestrian glyph, directional arrows
Constraints: editable text, no real logos, no tiny body copy
```

### 2. Concept Plate

Use Codex image generation for a 16:9 concept. The concept is reference only. It may inspire composition, hierarchy, and art direction, but the implemented template must be rebuilt as editable Fabric objects.

### 3. ZignsTemplateSpec

Translate the concept into a constrained spec before editing code. The spec should make positions, text, palette, assets, editability, and locked structure explicit.

Use `docs/ZIGNS_TEMPLATE_SPEC.md` as the target shape.

### 4. Asset Pass

For each graphic element, choose one:

- Fabric primitive: simple lock, tag, badge, warning mark, arrow, route line, checkbox, metric card.
- Transparent asset: detailed pictogram, textured background, illustrative icon, or domain-specific glyph.

Save reusable assets under:

```text
assets/templates/<template-key>/
```

If no assets are needed, keep the template fully primitive.

### 5. Fabric Renderer

Implement a renderer function near the other template renderers in `admin.html`.

Expected pattern:

```js
function renderExampleTemplate({
  title = 'EXAMPLE TITLE',
  subtitle = 'Supporting copy',
} = {}) {
  const W = CANVAS_W, H = CANVAS_H;
  const cv = _tmplCanvas || fabricCanvas;
  cv.backgroundColor = '#111827';

  loadGoogleFont('Barlow Condensed');
  loadGoogleFont('Inter');

  tmplRect(0, 0, W, H, { fill: '#111827', rx: 0, selectable: false, evented: false });
  tmplText(title, W / 2, 160, {
    fontFamily: 'Barlow Condensed',
    fontSize: 104,
    fontWeight: 'bold',
    fill: '#ffffff',
    boxWidth: 1500,
    boxHeight: 120,
    fitToBox: true,
    minFontSize: 62,
  });
}
```

### 6. Catalog and Cache

Add the renderer mapping:

```js
exampletemplate: () => renderExampleTemplate(),
```

Add the catalog card:

```js
{ key:'exampletemplate', title:'Example Template', desc:'Short gallery description', category:'operations', preview:'warning', accent:'#f59e0b', bg:'#111827', tag:'OPS' },
```

Bump:

```js
const TMPL_THUMB_CACHE_KEY = 'zigns-template-thumbs-...';
```

### 7. Validation

Run:

```bash
npm run smoke:static
git diff --check
```

For higher-risk template changes, also preview the template in the browser and check:

- Gallery card appears in the right category.
- Preview renders without a blank modal.
- Text does not overlap.
- Long editable fields fit or shrink.
- The inserted slide is type `designed`.
- The player can render the resulting canvas JSON.

## Quality Bar

A template is ready when it satisfies all of these:

- The first glance communicates the template's purpose.
- The largest text is readable from across a room.
- The layout still works when editable text changes moderately.
- At least the main copy fields are editable.
- Structure and decoration do not interfere with selection.
- The thumbnail is recognizable at gallery size.
- The design is original and not a copy of a competitor.

## Red Flags

Stop and revise when:

- The design only works as a screenshot.
- Text is baked into an image.
- Tiny labels carry important meaning.
- The renderer needs a new framework, dependency, or build step.
- Objects overlap at 1920x1080.
- The template needs extensive custom editor UI before it is useful.
- A generated image contains a logo, fake brand, unreadable text, or copyrighted-looking graphic.
