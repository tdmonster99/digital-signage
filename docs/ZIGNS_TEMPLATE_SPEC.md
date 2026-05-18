# ZignsTemplateSpec

`ZignsTemplateSpec` is a planning format for AI-assisted template production. It is not runtime code yet. Use it as the bridge between a visual concept and an editable Fabric.js renderer.

The purpose is to keep AI output constrained enough that Codex can implement it consistently in `admin.html`.

## Shape

```js
{
  key: 'lockouttagoutchecklist',
  name: 'Lockout/Tagout Checklist',
  category: 'safety',
  tag: 'SAFETY',
  renderer: 'renderLockoutTagoutChecklistClaudeDesign',

  canvas: {
    width: 1920,
    height: 1080,
    background: '#0E141C'
  },

  palette: {
    ink: '#0E141C',
    surface: '#18222F',
    surface2: '#25303D',
    primary: '#D8232A',
    accent: '#F5B500',
    success: '#1F9C5A',
    text: '#F2EFE9',
    muted: '#8A96A6'
  },

  fonts: {
    display: 'Barlow Condensed',
    body: 'Inter',
    mono: 'JetBrains Mono'
  },

  placeholders: {
    title: 'LOCKOUT / TAGOUT',
    subtitle: 'Safety Procedure - OSHA 1910.147',
    footer: 'IF UNSURE, STOP AND CALL SUPERVISOR'
  },

  regions: {
    header: { x: 0, y: 28, w: 1920, h: 168 },
    body: { x: 56, y: 320, w: 1212, h: 570 },
    side: { x: 1324, y: 320, w: 540, h: 570 },
    footer: { x: 0, y: 924, w: 1920, h: 128 }
  },

  objects: [
    {
      id: 'title',
      type: 'textbox',
      region: 'header',
      x: 210,
      y: 96,
      w: 1200,
      h: 116,
      text: 'LOCKOUT / TAGOUT',
      editable: true,
      font: 'display',
      size: 122,
      weight: 'bold',
      fill: '#ffffff',
      fitToBox: true
    }
  ],

  assets: [
    {
      id: 'forklift',
      file: '/assets/templates/forklift-traffic/forklift.png',
      type: 'transparent-png',
      purpose: 'Main pictogram',
      required: false
    }
  ],

  editable: [
    'title',
    'subtitle',
    'steps[].title',
    'steps[].body',
    'footer'
  ],

  locked: [
    'background',
    'hazard bands',
    'panel scaffolding'
  ],

  validationNotes: [
    'No text should be baked into image assets.',
    'Status text must fit at 470 px wide.',
    'Footer must not cover final checklist row.'
  ]
}
```

## Field Rules

- `key` must be lowercase and stable.
- `name` is the gallery title.
- `category` should match an existing gallery category when possible.
- `renderer` should be the function name added in `admin.html`.
- `canvas.width` and `canvas.height` should stay `1920` and `1080`.
- `palette` should be small. Avoid one-color themes.
- `fonts` should use existing or Google-loadable families.
- `regions` should define the major layout zones.
- `objects` should describe enough geometry to implement without guessing.
- `assets` should only list real files that will be generated or committed.
- `editable` should include user-facing copy fields.
- `locked` should include layout scaffolding and decorative structure.
- `validationNotes` should name the risks to check after implementation.

## Object Types

Prefer these types:

- `rect`
- `circle`
- `line`
- `polyline`
- `polygon`
- `path`
- `textbox`
- `image`
- `group`

Avoid these unless the existing renderer already proves they work:

- complex SVG imports
- filter-heavy images
- gradients that must match exactly
- masks or clips that are not necessary
- inline images inside text
