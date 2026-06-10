# speaking-reader

IELTS Speaking practice notes (Markdown) plus a static, browser-only reader app
that turns them into a shadowing-practice tool with TTS audio.

## Layout

```
part1/    Part 1 answers (short Q&A). One file per topic; special-topics/ for
          less common prompt sets; *high-score-phrases.md is a phrase cheat-sheet.
part2/    Part 2 answers (cue-card monologues). One file per cue card.
reader/   TypeScript app: parses part1/part2 at build time into a dataset,
          renders lessons as cards, reads them aloud with pre-generated MP3
          (edge-tts) or the Web Speech API.
```

Each directory has its own `CLAUDE.md` documenting its file format and conventions.
`reader/CONTRACT.md` is the single source of truth for data types, source-MD
conventions, build outputs, and the UI spec.

## Quick start

```bash
cd reader
npm install
npm run dev    # build data + app, serve public/ on http://localhost:8080
```

Requires Node 22 (`reader/.nvmrc`).

## Deploy

The reader deploys to Cloudflare Pages:

```bash
cd reader
npm run deploy    # build + wrangler pages deploy
```

See `reader/docs/deploy-cloudflare-pages.md` for setup details.

## Authoring notes

Markdown headings in `part1/` and `part2/` are a contract with the build parser
(`reader/src/build/build-data.ts`). Follow the file structure described in each
directory's `CLAUDE.md` exactly, or the build will skip/misparse the lesson.
