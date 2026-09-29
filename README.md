# Project Engineering · Interactive Lecture

Interactive browser-based lecture environment for Project Engineering, authored by Dr. Gorka Zubia Garea.

The repository now uses one permanent Progressive Web App entry point for iPhone, iPad, Android, desktop browsers, and classroom projection. Students keep the same Home Screen icon while new lectures are added behind it.

## App behavior

- The root URL is permanent.
- A compact lecture navigator is always available above the lecture.
- When a newly published lecture becomes the latest lecture, the next normal launch opens it automatically.
- After that, the app remembers the last lecture opened on that device and continues there.
- Latest and Continue shortcuts are available in the navigator.
- Android installations expose PWA shortcuts for Latest lecture and Continue when supported by the launcher.
- App-shell files use update-aware network-first caching, while previously opened lecture files remain available as offline fallbacks.

## Lecture catalog

Lecture files live in the lectures directory and are registered in data/lectures.json.

Current catalog:

- Lecture 01 · Dirección de Proyectos — lectures/01-direccion-de-proyectos.html

The original aula_interactiva.html remains in the repository as a backward-compatible standalone copy of Lecture 01.

To publish a new lecture:

1. Add the new standalone HTML file under lectures.
2. Add one entry to data/lectures.json with its id, number, title, course, and file path.
3. Change the top-level latest value to the new lecture id.

No student needs to replace the Home Screen icon or learn a new course URL.

## Structure

- index.html — permanent PWA entry point and lecture shell.
- lectures/ — standalone lecture HTML files.
- data/lectures.json — lecture catalog and latest-lecture pointer.
- scripts/app-shell.js — lecture selection, Latest, Continue, and update logic.
- assets/app-shell.css — responsive desktop/mobile lecture navigator.
- manifest.webmanifest — installable PWA metadata and shortcuts.
- service-worker.js — update-aware offline cache.
- assets/ — SVG and PNG app icons.
- aula_interactiva.html — backward-compatible standalone copy of Lecture 01.
- scripts/serve.command — macOS local-server launcher.

## iPhone and iPad

Open the GitHub Pages root URL in Safari and choose Share → Add to Home Screen. Existing installations continue to use the same root URL.

## Android

Open the GitHub Pages root URL in Chrome and choose the browser option labelled Install app or Add to Home screen. The exact wording depends on the Android browser and launcher.

## Local use

Double-click scripts/serve.command, or run Python's built-in HTTP server from the repository root on port 8000.

## GitHub Pages

GitHub Pages publishes the main branch using the repository's built-in Pages deployment. A separate custom Pages workflow is not required.
