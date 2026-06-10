# IELTS Speaking Reader

Static, browser-only reader for the IELTS speaking notes in `../part1/` and `../part2/`.
Markdown lessons are parsed at build time into a dataset, rendered as cards, and read
aloud with pre-generated MP3 (edge-tts) or the Web Speech API for shadowing practice.

**Read `CONTRACT.md` first.** It is the single source of truth for data types, source-MD
conventions, build outputs, the UI spec, and accessibility requirements.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript 5.6, ES modules (`"type": "module"`) |
| Build (Node) | `tsx` runs `src/build/*.ts` directly |
| Bundler | esbuild → `public/app.js` (IIFE, es2020, minified) |
| Lint / format | ESLint 9 + typescript-eslint, Prettier 3 |
| Runtime | Node 22 (`.nvmrc`) |
| Dependency | `node-edge-tts` (build-time MP3 generation, no API key) |

No framework. The browser app is vanilla TS bundled to a single IIFE; no runtime npm deps ship.

## Layout

```
src/app/      Browser app (bundled by esbuild). reader-app.ts is the entry point.
src/build/    Node build scripts (run via tsx): build-data.ts, generate-audio.ts
src/shared/   Shared by app + build: types.ts (source of truth), sentence-splitter.ts
public/       index.html, styles.css, and generated artifacts (below)
```

## Build commands

| Command | Does |
|---------|------|
| `npm run build:data` | Parse `../part1/**/*.md` + `../part2/*.md` → `public/data.js` |
| `npm run build:app` | Bundle `src/app/reader-app.ts` → `public/app.js` |
| `npm run build:audio` | Generate per-sentence MP3 via edge-tts (skips existing) |
| `npm run build` | `build:data` + `build:app` |
| `npm run dev` | `build`, then serve `public/` on `:8080` |
| `npm run lint` / `format` / `format:check` | ESLint / Prettier write / Prettier check |

## Conventions & guardrails

- `src/shared/types.ts` is the single source of truth for `Segment` / `Lesson` / `Group`.
  Change it there, not inline.
- **Generated, do NOT hand-edit:** `public/data.js`, `public/app.js`,
  `public/audio-manifest.json`, `public/audio/uk/*.mp3`. Regenerate via the build scripts.
- Audio file naming is `public/audio/uk/{groupIdx}_{lessonIdx}_{segmentIdx}_{sentenceIdx}.mp3`.
- `build:audio` makes network calls and writes hundreds of files. It skips existing files;
  only run `build:audio -- --force` (full regenerate) when deliberately intended.
- The build parser is coupled to the source-MD headings (`## Qn.`, `### English`, `## English`).
  If those change in `../part1` or `../part2`, update `src/build/build-data.ts` to match.
- UI must stay accessible (keyboard, ARIA live region, contrast) and honour the calm palette
  in `CONTRACT.md`; respect `prefers-reduced-motion`.
