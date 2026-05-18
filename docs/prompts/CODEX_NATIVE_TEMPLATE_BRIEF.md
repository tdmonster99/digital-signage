# Prompt: Codex-Native Zigns Template

Use this when you want Codex to create a template without Claude Design.

```text
Work in /Users/jzegar/dev/zigns/app.

Goal:
Create one original Zigns digital signage template using the Codex-native template workflow.

Template:
- Name: [TEMPLATE NAME]
- Category: [business/office/safety/operations/wayfinding/restaurant/retail/healthcare/education/events/holiday/socialmedia]
- Audience: [WHO WILL SEE IT]
- Display environment: [WHERE THE SCREEN IS AND VIEWING DISTANCE]
- Job to be done: [WHAT THE TEMPLATE MUST HELP VIEWERS DO]
- Tone: [SERIOUS / FRIENDLY / OPERATIONAL / URGENT / PREMIUM / ETC.]

Required content:
- [TEXT ZONE 1]
- [TEXT ZONE 2]
- [TEXT ZONE 3]

Graphic direction:
- [GLYPH / PICTOGRAM / BACKGROUND / MAP / PANEL IDEAS]

Constraints:
- Use the existing Zigns app template system in admin.html.
- Keep the result editable as Fabric.js objects.
- Do not flatten the template into a single image.
- Do not add dependencies, frameworks, build steps, or new slide types.
- Do not edit the site repo.
- Do not commit or push.

Process:
1. Inspect AGENTS.md, CLAUDE.md, DEVLOG.md, and the existing template renderer/catalog pattern.
2. Produce a concise ZignsTemplateSpec before editing code.
3. If useful, generate a 16:9 concept image and simple transparent glyph assets with image generation.
4. Implement the renderer in admin.html using existing Fabric helper patterns.
5. Add the renderer mapping and catalog card.
6. Bump TMPL_THUMB_CACHE_KEY.
7. Prepend DEVLOG.md.
8. Run npm run smoke:static and git diff --check.

Quality bar:
- Readable from a distance.
- Original design.
- Main text fields editable.
- No text overlap.
- Thumbnail works at gallery size.
- Player-safe Fabric canvas JSON.
```
