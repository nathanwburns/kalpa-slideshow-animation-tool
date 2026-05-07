# Kalpa Slideshow Animation Tool Project

Railway-hosted MVP for generating Kalpa-branded animated slides from prompts, links, and uploaded files.

## Current MVP

- Prompt-driven deck generation
- URL and desktop file uploads
- Editable package re-upload
- Rendered slide asset re-upload for approximate rebuilds
- Small Kalpa starter template library
- Per-slide regeneration flow
- Per-slide GIF, MP4, and PNG downloads
- Entire deck download as GIF package or MP4 package
- Editable project package download
- 48-hour automatic asset retention model

## What the MVP is doing today

- Node server for the web app and temporary project storage
- Python renderer for slide frames, GIFs, and MP4s
- Kalpa visual defaults from the local brand book and site-derived template library

## Local run

The renderer depends on the Python packages listed in `requirements-render.txt`.

If `vendor_py/` is already present:

```bash
node server.js
```

If `vendor_py/` is missing, install the renderer dependencies into the project first:

```bash
python3 -m pip install --target ./vendor_py -r requirements-render.txt
node server.js
```

Then open:

- `http://localhost:3000`

## Railway deploy model

- Push to GitHub
- Connect the repo to Railway
- Railway build command installs the renderer dependencies into `vendor_py/`
- Railway starts the app with `node server.js`

## Storage model

- Rendered assets are temporary
- The app deletes server-side project folders after 48 hours
- Users should download:
  - individual slide assets
  - deck ZIPs
  - editable project package

## Re-editing model

- Best path: re-upload the editable project package for exact edits
- Fallback path: re-upload GIFs, MP4s, PNGs, or related slide assets for approximate rebuilds

## Included template library

- `template-library/manifest.json`
- `template-library/README.md`
- `public/template-library/index.html`

This library is intentionally small. Expand it only after real decks prove which archetypes deserve to become permanent templates.
