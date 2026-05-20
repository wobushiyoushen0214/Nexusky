# Nexusky Web Clipper

Nexusky starts a local clipper endpoint on `http://127.0.0.1:17321` while the desktop app is running.

## Browser Extension

Load `browser-extension/` as an unpacked Chromium extension. Use the toolbar button to save the current page, or the context menu to save the selected text.

The extension sends:

```json
{
  "title": "Page title",
  "url": "https://example.com/article",
  "selection": "Optional selected text",
  "text": "Readable page text"
}
```

Nexusky writes the clip to `Clippings/YYYY-MM-DD Page title.md` in the active vault and indexes it immediately.

## Direct API

```bash
curl -X POST http://127.0.0.1:17321/clip \
  -H 'Content-Type: application/json' \
  -d '{"title":"Example","url":"https://example.com","text":"Captured text"}'
```

Health check:

```bash
curl http://127.0.0.1:17321/health
```
