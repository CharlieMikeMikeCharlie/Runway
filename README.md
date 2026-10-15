# Commute Tracker

A static, local-first trip tracker. No build step, dependencies, server API, or account is required.

## GitHub Pages

Publish this repository's root from Settings → Pages → Deploy from a branch. Keep `index.html`, `refinements.js`, `refinements.css`, `manifest.webmanifest`, `icon.svg`, and `sw.js` together. All links and the service worker scope are relative, so both `username.github.io/` and `username.github.io/repository/` work.

Offline access becomes available after the first successful HTTPS visit. Installation UI depends on the browser. New service-worker versions take over after old app tabs close; increment the cache version when changing the app shell.

## Data

Trips, routes, and preferences are stored in this browser. Use Settings → Export backup regularly. Import merges trips by ID. Incomplete trips and trips marked excluded are omitted from estimates. No cloud sync or external calendar integration is configured.

Serve locally with `python3 -m http.server 4173`, then open `http://localhost:4173/`. Opening the HTML as a file supports the main app but not service-worker offline installation.

Run `node tests.cjs` for the dependency-free regression checks covering estimates, trip completion, mode matching, midnight handling, exclusions, and project URL paths.
