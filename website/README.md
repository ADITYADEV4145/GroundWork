# Groundwork website

A dependency-free, responsive product site. Artwork shares the README's generated dark-green architectural identity; all fonts, scripts and images are local. No analytics or third-party requests.

Requires Node.js 22+. From the repository root:

```sh
npm --prefix website run build
npm --prefix website start
```

Open port 4173. Set `PORT` to use another port. `website/dist` is also deployable on any static host. No service worker is registered. The interactive walkthrough uses clearly labeled illustrative output, not a connection to a visitor's repository.

The installation instructions deliberately use a source build: `groundwork-agent` is not published on npm yet. Keep product claims aligned with the root README and `references/`.
