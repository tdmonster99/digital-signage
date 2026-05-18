# Prompt: Claude Design Zigns Template Brief

Use this only when you want Claude Design to produce a visual concept and handoff.

```text
You are designing one original Zigns digital signage template that must be implementable in the existing Zigns Fabric.js template system.

Context:
Zigns templates are 16:9 digital signage slides rendered as editable Fabric.js canvas JSON. The final template must not be a single flattened poster image. It must break down into editable Fabric objects such as text, rectangles, lines, simple shapes, groups, and optional transparent PNG-style glyph assets.

The Zigns app uses:
- 1920x1080 landscape canvas
- Fabric.js designed slides rendered from canvasJson
- template renderers in admin.html
- a template catalog entry with a key, title, category, preview type, colors, and tag

Design exactly one template:

Template name: [TEMPLATE NAME]
Category: [CATEGORY]
Use case: [REAL USE CASE]
Audience: [WHO WILL SEE IT]
Tone: [TONE]
Display environment: [SCREEN LOCATION AND VIEWING DISTANCE]

Requirements:
- Create a polished 16:9 visual concept.
- Make the layout easy to rebuild as editable Fabric.js objects.
- Include clear hierarchy and practical placeholder copy.
- Use large readable text.
- Avoid tiny details and fake logos.
- Do not use copyrighted icons or brand marks.
- Do not rely on effects that are hard to reproduce in Fabric.js.
- Use image assets only for simple transparent-background glyphs or pictograms.

After the visual concept, provide an implementation handoff with:

1. Design summary
Explain the composition, hierarchy, and intended use.

2. Fabric object plan
Provide a table with:
Layer order, Fabric object type, purpose, x, y, width, height, fill/stroke, font details, editable text content.

3. Asset list
List any required transparent-background glyph assets. Include filename, dimensions, visual description, and placement.

4. ZignsTemplateSpec
Provide a JSON-like spec using the shape from docs/ZIGNS_TEMPLATE_SPEC.md.

5. Fabric compatibility notes
Call out anything that might be hard to implement in Fabric.js and suggest a simpler alternative.

The goal is a production-worthy signage template concept that Codex can rebuild as editable Fabric.js, not just a pretty static image.
```
