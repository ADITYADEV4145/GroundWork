# Groundwork motion website

A dependency-free cinematic product page: a painted alpine film, masked type entrance, staggered glass footer, and accessible installation/workflow dialogs. Credits use only **Aditya**. The editable page is `public/index.html`, with inline CSS and JavaScript; it works on any static host without a framework or build step.

The walkthrough includes the new bright ivory/mint poster and workflow artwork supplied by the product-video stream. Core product details remain accessible as live text and keyboard tabs, not only embedded in images.

The supplied reference's CloudFront video/poster and Google Fonts (Instrument Serif and Plus Jakarta Sans) are the only third-party presentation requests. No analytics, forms, account connection, or repository data is sent. Product runtime privacy claims describe Groundwork, not those media requests.

## Local preview and checks

Requires Node.js 22+:

```sh
npm --prefix website test
npm --prefix website start
```

The test script copies `public/` to `dist/` and checks static-host paths and server containment. Default port: 4173; override with `PORT`. No service worker is registered.

## Motion and interactions

- Web Animations API entrance runs once per load; a watchdog restores visibility if later JavaScript fails.
- Reduced-motion and data-saving preferences show the poster without loading the video. A visible control can play/pause the scenery; hidden tabs pause it.
- The main CTA opens npm-first installation, with Homebrew and a collapsed source fallback. All commands can be copied or manually selected when clipboard access is denied.
- Workflow links open an illustrative navigation/reuse/grounding demo with arrow-key tabs. Native dialogs provide Escape dismissal, focus containment, and focus restoration. With JavaScript disabled, all links fall back to real documentation and the scenery stays a poster.
- The page scrolls naturally on narrow or short screens rather than clipping content.

## Netlify

`netlify.toml` at the repository root publishes `website/public` with no build command or server. `public/_headers` supplies security headers for the static deployment. Connect the repository to Netlify, or deploy that folder with an authenticated Netlify connection/CLI:

```sh
netlify deploy --dir=website/public --prod
```

Use the same linked Netlify site for updates. Do not commit access tokens or `.netlify/` account state. Verify the final public URL in a signed-out browser. The Devin preview is organization-only and is not the public deployment.
