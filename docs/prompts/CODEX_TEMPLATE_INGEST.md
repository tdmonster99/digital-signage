# Prompt: Codex Template Ingest From Design Export

Use this when Claude Design, Gemini, or another design tool produced a zip or HTML prototype.

```text
Work in /Users/jzegar/dev/zigns/app.

I have provided a design export for a Zigns template:
[ZIP OR FOLDER PATH]

Please ingest it using the Zigns template production workflow.

Rules:
- Inspect the export read-only first.
- Treat JSX, CSS, HTML, screenshots, and design-tool code as reference material only.
- Do not import React, Babel, CSS prototypes, or generated HTML into Zigns.
- Translate the design into the existing editable Fabric.js renderer pattern in admin.html.
- Preserve editability for user-facing copy.
- Use Fabric primitives for panels, text, lines, badges, checkboxes, arrows, and simple glyphs.
- Use committed assets only when a graphic is too detailed to draw cleanly with Fabric primitives.
- Do not add dependencies, frameworks, build steps, or new slide types.
- Do not edit the site repo.
- Do not commit or push.

Process:
1. List what is inside the export and identify the useful handoff files, screenshots, and assets.
2. Summarize whether the export is useful, partially useful, or not useful.
3. Extract or reconstruct a ZignsTemplateSpec.
4. Implement or update the matching renderer in admin.html.
5. Wire the template key in EXTRA_TEMPLATE_RENDERERS.
6. Add or update the EXTRA_TEMPLATE_CATALOG card if needed.
7. Bump TMPL_THUMB_CACHE_KEY.
8. Prepend DEVLOG.md.
9. Run npm run smoke:static and git diff --check.

QA:
- Verify text does not overlap.
- Verify the template is not a single flattened image.
- Verify the gallery preview can regenerate.
- Report any design compromises made during translation.
```
