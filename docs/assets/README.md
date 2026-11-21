# README artwork

- `groundwork-hero.webp`, `groundwork-hero-mobile.webp`, `groundwork-workflow.webp` and `groundwork-workflow-mobile.webp` are AI-generated brand illustrations, generated for this repository with OpenAI's image generation tool, then cropped, typeset and compressed to WebP. They are conceptual artwork, not product screenshots or measured results.
- `architecture.svg` and `architecture-mobile.svg` are editable, hand-authored diagrams of the local architecture. The mobile assets stack their content to keep it legible on narrow screens; HTML picture sources choose the composition. Text equivalents for the diagrams appear in the project README.

All assets are stored locally so the README does not depend on a third-party image host. The repository's MIT license applies.

## Art direction and readability

The contrast revision uses brighter ivory surfaces and mint routes so objects separate from the dark background, rather than relying on green-on-green shadows. The headline names the actual workflow: find code, reuse it, and verify calls. Both the hero and diagrams have dedicated mobile compositions.

Text is placed on solid fields. The foreground palette (`#f8faef`, `#c5ffda`, `#d1e1d8`) against `#071719` has nominal contrast ratios of 17.38:1, 16.31:1 and 13.51:1 respectively, calculated with the WCAG relative-luminance formula before WebP encoding. These are palette measurements, not an accessibility certification of the rendered README. Ordinary README text and descriptive alt text carry the same meaning outside the artwork.

Research and tools: [Anthropic canvas-design](https://github.com/anthropics/skills/tree/main/skills/canvas-design), [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum), Pillow for layout and WebP export, and CairoSVG for checking the editable diagrams. PNG masters were used during design; the repository ships optimized WebP copies. The hero wordmark uses [Arsenal SC](https://github.com/anthropics/skills/tree/main/skills/canvas-design/canvas-fonts), with DejaVu Sans and JetBrains Mono for the supporting typography.
