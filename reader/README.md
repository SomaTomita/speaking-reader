# IELTS Speaking Reader

A static, browser-only reader for the IELTS speaking Markdown notes in `../part1/` and `../part2/`.
The English sections are parsed at build time and rendered as cards, then read aloud with
pre-generated MP3 (edge-tts) or the Web Speech API for shadowing practice.

## Structure

```
reader/
├── src/
│   ├── app/        # browser app (bundled by esbuild); reader-app.ts is the entry point
│   ├── build/      # Node build scripts (run via tsx): build-data.ts, generate-audio.ts
│   └── shared/     # shared by app + build: types.ts (single source of truth), sentence-splitter.ts
└── public/
    ├── index.html
    ├── styles.css
    ├── data.js             # generated: lesson dataset
    ├── app.js              # generated: bundled by esbuild
    ├── audio/              # generated: per-sentence MP3 (edge-tts)
    └── audio-manifest.json # generated: audio file index
```

Generated files are git-ignored — regenerate them with the build scripts, never hand-edit.

See `CONTRACT.md` for the shared data contract (types, MD conventions, UI spec).

## Scripts

```bash
npm install            # install dev deps (Node 22, see .nvmrc)
npm run build:data     # parse Markdown → public/data.js
npm run build:app      # bundle src/app/reader-app.ts → public/app.js
npm run build          # both of the above
npm run build:audio    # generate per-sentence MP3 via edge-tts (skips existing files)
npm run dev            # build, then serve public/ on http://localhost:8080
npm run test           # node --test over src/**/*.test.ts
npm run lint           # ESLint
npm run format         # Prettier (write)
npm run deploy         # build + wrangler pages deploy (Cloudflare Pages)
```

No runtime npm dependencies ship — the app is a single static bundle
(`public/index.html` + `data.js` + `app.js`) plus CSS and audio files.

## 日本語メモ

- `build:data` は `../part1/*.md`・`../part1/special-topics/*.md`・`../part2/*.md` を走査し、
  各ファイルから `### English` / `## English` セクションのみを抽出して `public/data.js` に書き出します。
- `*italic*`, \`backticks\`, `[links](...)`, `>` ブロッククォートなどの Markdown 記号は
  読み上げに邪魔なので、ビルド時に取り除きます。
- 段落区切り（空行）は保持し、段落内の改行は半角スペースに畳み込みます。
- `build:audio` はネットワークアクセスして数百ファイルを書き込みます。既存ファイルはスキップされるので、
  全再生成したいときだけ `npm run build:audio -- --force` を使ってください。
