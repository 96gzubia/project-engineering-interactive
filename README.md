# Project Engineering · Interactive Lecture

Interactive browser-based lecture environment for **Project Engineering**, authored by **Dr. Gorka Zubia Garea**.

Designed for Safari on iPhone/iPad, browsers on macOS, classroom projection, GitHub Pages, Home Screen installation, and offline reopening after the first successful load.

## Structure

- `index.html` — web-app entry point.
- `aula_interactiva.html` — standalone interactive lecture.
- `manifest.webmanifest` — installable web-app metadata.
- `service-worker.js` — offline cache.
- `assets/` — web-app icons.
- `scripts/serve.command` — macOS local-server launcher.
- `.github/workflows/pages.yml` — GitHub Pages deployment.

## Local use

Double-click `scripts/serve.command`, or run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## iPhone / iPad

Once deployed with GitHub Pages, open the site in Safari and choose **Share → Add to Home Screen → Open as Web App**.

## GitHub Pages

This repository includes a GitHub Actions workflow for Pages deployment from `main`.

> The lecture source is intentionally kept as a standalone HTML document so it remains portable and editable independently of the PWA shell.
