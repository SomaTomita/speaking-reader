# Issue/PR Bootstrap Implementation Plan — docs/plans 全機能の issue・PR 化（細分化版）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> 併用スキル: `/issue-plan`（issue テンプレート）, `/ship-pr`（PR テンプレート・マージ承認ゲート）。

**Goal:** `reader/docs/plans` の全機能（word-by-word highlight, multi-voice selection）と未コミットの全作業を、12 個の細粒度 issue と 10 本の PR に分けて main に取り込む。

**Architecture:** issue は「1 つの関心 = 1 issue」まで細分化。PR は互いに素なファイル集合で 10 本に分け、依存順（設定 → 共有モジュール → ビルド → UI）に直列マージし、**各マージ後の main が常に green**（その時点で走る lint/test が通る）であることを保つ。

**Tech Stack:** `gh` CLI（認証済み, repo: `SomaTomita/speaking-reader`）, git, npm（検証用）。コード変更は一切しない — 既存の作業ツリーをコミットに分配するだけ。

---

## 前提となる現状（2026-06-11 調査結果）

- 履歴は `abb24bb first commit` のみ。`part1/ part2/ reader/ .claude/ .gitignore` は全て未追跡、`README.md` は変更済み。
- **2機能とも実装済み**: `src/shared/word-cues.ts`(+test), `voices.ts`(+test), `audio-paths.ts`, `public/audio/{sonia,ryan,libby}/`（cue JSON 付き）が存在。
- **機能実装前の状態は一度もコミットされていない**ため、`speech-engine.ts` / `reader-app.ts` / `generate-audio.ts` に絡み合った 2 機能をコード上で分離することは不可能。
  → 機能ごとの記録は **retrospective issue（#10, #11）** で残し、コードは構造単位の PR（#7〜#9）が運ぶ。#10 #11 は最後のコード PR（PR9）が close する。
- issue/PR 番号は GitHub が連番で払い出すため、以下の番号は**想定値**。Subagent A の出力で実番号を確定し、以降の `(#N)` / `Closes #N` を読み替えること。
- 生成物（`reader/public/{app.js,data.js,audio-manifest.json,audio/**}`、`node_modules/`）は gitignore 済みで、どの PR にも含まれない。

## issue 一覧（12 件）と PR 対応（10 本）

| # | issue | label | PR / branch | 依存 |
|---|-------|-------|-------------|------|
| 1 | chore: ルート .gitignore | chore | PR1 `chore/1-gitignore` | — |
| 2 | docs: ルート README | docs | PR2 `docs/2-root-readme` | — |
| 3 | chore: Claude Code skills（開発ワークフロー） | chore | PR3 `chore/3-claude-skills` | — |
| 4 | docs: Part 1 教材（23+special 10+フレーズ集） | docs | PR4 `docs/4-part1-content` | — |
| 5 | docs: Part 2 教材（21 キューカード） | docs | PR5 `docs/5-part2-content` | — |
| 6 | chore: reader プロジェクト基盤（npm/TS/lint/deploy 設定） | chore | PR6 `chore/6-reader-scaffolding` | — |
| 7 | feat: 共有モジュール（types/splitter/word-cues/voices/paths + tests） | feat | PR7 `feat/7-shared-modules` | #6 |
| 8 | feat: ビルドパイプライン（build-data / generate-audio） | feat | PR8 `feat/8-build-pipeline` | #4 #5 #7 |
| 9 | feat: ブラウザ UI（reader-app/speech-engine/settings + public） | feat | PR9 `feat/9-reader-ui` | #8 |
| 10 | feat: word-by-word highlight（retrospective） | feat | PR9 が close | #7-#9 |
| 11 | feat: multi-voice selection（retrospective） | feat | PR9 が close | #7-#9 |
| 12 | docs: reader 設計資料・デプロイ手順 | docs | PR10 `docs/12-reader-docs` | — |

マージ順: PR1 → PR2 → … → PR10 の直列固定（PR7 以降はコンパイル依存、PR8 は教材 #4 #5 に依存）。

## PR とファイルの対応（互いに素であることが必須）

| PR | 含むパス |
|----|---------|
| PR1 | `.gitignore` |
| PR2 | `README.md` |
| PR3 | `.claude/` |
| PR4 | `part1/` |
| PR5 | `part2/` |
| PR6 | `reader/package.json` `reader/package-lock.json` `reader/tsconfig.json` `reader/eslint.config.js` `reader/.prettierrc` `reader/.prettierignore` `reader/.nvmrc` `reader/wrangler.toml` `reader/.gitignore` `reader/CLAUDE.md` `reader/CONTRACT.md` `reader/README.md` |
| PR7 | `reader/src/shared/` |
| PR8 | `reader/src/build/` |
| PR9 | `reader/src/app/` `reader/public/` |
| PR10 | `reader/docs/` |

---

## Task 1: ラベルを作る

**Step 1:** `gh label list` で既存確認。
**Step 2:** 不足分を作成:

```bash
gh label create feat --color 0E8A16 --description "New feature"
gh label create docs --color 0075CA --description "Documentation / content"
gh label create chore --color BFBFBF --description "Repo maintenance"
```

---

## Task 2: issue を 12 件作成する（/issue-plan テンプレート準拠）

実装済みのため Todo は `[x]` で作成（PR 上の検証項目のみ `[ ]`）。
各コマンドの出力 URL から**実番号を記録**すること。

**Step 1: #1 ルート .gitignore**

```bash
gh issue create --label chore --title "chore: ルート .gitignore を追加" --body "$(cat <<'EOF'
## 目的
OS ごみ・node_modules・環境変数ファイルを履歴に入れない土台を作る。

## Todo
- [x] `.DS_Store` / `node_modules/` / `.env*` / `*.log` を除外

## 受け入れ条件
- `git check-ignore reader/node_modules` がヒットする

## 対象外
- reader 側の生成物除外（`reader/.gitignore` は #6）
EOF
)"
```

**Step 2: #2 ルート README**

```bash
gh issue create --label docs --title "docs: ルート README — リポジトリ全体の案内" --body "$(cat <<'EOF'
## 目的
リポジトリ構成（part1/part2/reader）・quick start・deploy 手順を 1 枚で案内する。

## Todo
- [x] レイアウト説明、quick start（`cd reader && npm run dev`）、Cloudflare Pages deploy
- [x] 教材 MD の見出しがビルドパーサとの契約である旨の注意書き

## 受け入れ条件
- README の手順どおりに dev サーバが起動できる

## 対象外
- reader/README（#6）
EOF
)"
```

**Step 3: #3 Claude Code skills**

```bash
gh issue create --label chore --title "chore: 開発ワークフロー skills（issue-plan / work-issue / ship-pr）" --body "$(cat <<'EOF'
## 目的
issue 作成 → 着手 → PR → squash merge のルールをスキルとして共有・強制する。

## Todo
- [x] `issue-plan`: 細分化ルール + todo 付き issue テンプレート
- [x] `work-issue`: ブランチ命名・commit 規約（AI 表記禁止）・todo 更新
- [x] `ship-pr`: 3 秒要約・Closes リンク・マージ承認ゲート・squash 固定

## 受け入れ条件
- 新規セッションで 3 スキルが `/` メニューに見える

## 対象外
- hooks / settings.json の変更
EOF
)"
```

**Step 4: #4 Part 1 教材**

```bash
gh issue create --label docs --title "docs: IELTS Part 1 教材 — 23 トピック + special-topics + フレーズ集" --body "$(cat <<'EOF'
## 目的
リーダーアプリのデータソースとなる Part 1 回答集を取り込む。

## Todo
- [x] 23 トピック（`NN-topic.md`、`## Qn.` / `### English` 構造）
- [x] `special-topics/` 10 本
- [x] `*high-score-phrases.md`（Band 7-9 フレーズ集）と書式規約 `CLAUDE.md`

## 受け入れ条件
- 全ファイルが CLAUDE.md の見出し規約に従い、#8 マージ後の `build:data` で全件パースされる

## 対象外
- Part 2（#5）
EOF
)"
```

**Step 5: #5 Part 2 教材**

```bash
gh issue create --label docs --title "docs: IELTS Part 2 教材 — 21 キューカード" --body "$(cat <<'EOF'
## 目的
Part 2（cue-card 長文回答）の教材を取り込む。

## Todo
- [x] 21 本（`NN-topic-keyword.md`、トップレベル `## 日本語` / `## English` 構造）
- [x] 書式規約 `CLAUDE.md`

## 受け入れ条件
- 全ファイルが CLAUDE.md の見出し規約に従い、#8 マージ後の `build:data` で全件パースされる

## 対象外
- Part 1（#4）
EOF
)"
```

**Step 6: #6 reader プロジェクト基盤**

```bash
gh issue create --label chore --title "chore: reader プロジェクト基盤 — npm/TypeScript/lint/deploy 設定" --body "$(cat <<'EOF'
## 目的
アプリ本体のコードを受け入れる npm プロジェクトの器を作る。

## Todo
- [x] `package.json`（scripts: build:data/app/audio, dev, test, lint, format, deploy）+ lockfile
- [x] `tsconfig.json` / `eslint.config.js` / `.prettierrc` / `.prettierignore` / `.nvmrc`(Node 22)
- [x] `wrangler.toml`（Cloudflare Pages）/ `reader/.gitignore`（生成物除外）
- [x] `CLAUDE.md` / `CONTRACT.md`（データ契約・UI 仕様の単一情報源）/ `README.md`

## 受け入れ条件
- `cd reader && npm ci` が成功する
- `git check-ignore reader/public/app.js reader/public/audio` がヒットする

## 対象外
- `src/`（#7〜#9）、`docs/`（#12）
EOF
)"
```

**Step 7: #7 共有モジュール**

```bash
gh issue create --label feat --title "feat: 共有モジュール — types / sentence-splitter / word-cues / voices / audio-paths" --body "$(cat <<'EOF'
## 目的
ビルドとブラウザアプリの両方から使う純粋モジュール群（単一情報源）を入れる。

## Todo
- [x] `types.ts`（Segment/Lesson/Group）/ `sentence-splitter.ts`
- [x] `word-cues.ts`: buildWordUnits / activeCueIndex（#10 の中核、unit test 付き）
- [x] `voices.ts`: VOICES 3 声 + DEFAULT_VOICE_KEY（#11 の中核、unit test 付き）
- [x] `audio-paths.ts`: voice-keyed URL ヘルパ
- [ ] PR 上で `npm test`（shared のテストのみ）green

## 受け入れ条件
- `cd reader && npm test` が pass（この時点では src/shared のテストのみ走る）

## 対象外
- Node ビルドスクリプト（#8）、ブラウザ UI（#9）
EOF
)"
```

**Step 8: #8 ビルドパイプライン**

```bash
gh issue create --label feat --title "feat: ビルドパイプライン — build-data / generate-audio" --body "$(cat <<'EOF'
## 目的
教材 MD → `data.js` 変換と、edge-tts による 3 声 + word-cue sidecar の音声生成を入れる。

## Todo
- [x] `build-data.ts`: `../part1` `../part2` を走査し English セクションを抽出
- [x] `generate-audio.ts`: VOICES ループ、`saveSubtitles: true`、skip-if-both、pre-flight 検証
- [ ] PR 上で `npm run build:data` が全レッスンをパースして `public/data.js` を生成

## 受け入れ条件
- `npm run build:data` 成功（#4 #5 マージ済みの main 上）
- `npm run build:audio` は実行しない（既存音声あり・ネットワーク高負荷のため対象外）

## 対象外
- 音声の再生成、ブラウザ UI（#9）
EOF
)"
```

**Step 9: #9 ブラウザ UI**

```bash
gh issue create --label feat --title "feat: ブラウザ UI — reader-app / speech-engine / settings + public 一式" --body "$(cat <<'EOF'
## 目的
レッスン表示・MP3/Web Speech 再生・word highlight・voice 切替を持つ UI を完成させる。

実装済みの word-by-word highlight (#10) と multi-voice selection (#11) の UI 層を含む
最終ピース。この issue の PR が #10 #11 も close する。

## Todo
- [x] `reader-app.ts`: lesson 描画、lazy cue fetch、word span、highlight ハンドラ
- [x] `speech-engine.ts`: rAF word-sync、onWord、voice-keyed URL、Web Speech フォールバック
- [x] `settings.ts`: voiceName→voiceKey 移行（test 付き）/ `ui.ts`
- [x] `public/`: index.html / styles.css（karaoke 3 状態、WCAG AA、reduced-motion）/ favicon
- [ ] PR 上で `npm run lint && npm run format:check && npm test && npm run build` が全て green
- [ ] `npm run dev` で再生・単語ハイライト・3 声切替を手動確認

## 受け入れ条件
- 上記検証コマンドが全て成功し、手動確認 3 点（再生/highlight/voice 切替）が動く

## 対象外
- 新機能の追加。以後は 1 issue = 1 PR の通常フロー
EOF
)"
```

**Step 10: #10 word-by-word highlight（retrospective）**

```bash
gh issue create --label feat --title "feat: word-by-word karaoke highlight（実装済み・記録用）" --body "$(cat <<'EOF'
## 目的
再生中の単語をカラオケ式にハイライトし、単語単位のシャドーイングを可能にする。

> Retrospective issue: 実装済み機能の記録。コードは #7（word-cues）/#8（cue sidecar 生成）/#9（UI）に分散。
> 設計: `reader/docs/plans/2026-06-09-word-highlight-design.md`
> 実装計画: `reader/docs/plans/2026-06-09-word-by-word-highlight.md`

## Todo
- [x] edge-tts `saveSubtitles` による `{file}.mp3.json` word cue sidecar（#8）
- [x] buildWordUnits / activeCueIndex 純関数 + unit test（#7）
- [x] rAF ループ + onWord コールバック、cue 欠損時は文ハイライトへフォールバック（#9）
- [x] upcoming/active/read 3 状態 CSS（WCAG AA・prefers-reduced-motion 対応）（#9）

## 受け入れ条件
- 1.0x / 非 1.0x 速度で単語フィルが音声に同期する
- cue JSON を 1 つ外しても文ハイライトで動作する（コンソールエラーなし）

## 対象外
- 単語クリックでのシーク、動画出力
EOF
)"
```

**Step 11: #11 multi-voice selection（retrospective）**

```bash
gh issue create --label feat --title "feat: multi-voice selection — Sonia/Ryan/Libby（実装済み・記録用）" --body "$(cat <<'EOF'
## 目的
ボイスピッカーを実体のある 3 つの事前生成音声に差し替え、切替を意味のある操作にする。

> Retrospective issue: 実装済み機能の記録。コードは #7（voices/audio-paths）/#8（VOICES ループ生成）/#9（picker UI・settings 移行）に分散。
> 設計: `reader/docs/plans/2026-06-10-voice-selection-design.md`
> 実装計画: `reader/docs/plans/2026-06-10-multi-voice-selection.md`

## Todo
- [x] VOICES 単一情報源 + voice-keyed URL ヘルパ + unit test（#7）
- [x] `audio/{sonia,ryan,libby}/` 生成（uk/→sonia/ 移行、pre-flight 付き）（#8）
- [x] manifest `voices[]` + `defaultVoice`、picker を manifest 駆動に（#9）
- [x] settings 移行 voiceName→voiceKey（不明値は sonia、test 付き）（#9）
- [x] 声切替時は現在文を新ボイスで再開、word highlight 同期維持（#9）

## 受け入れ条件
- 3 声すべてで音声が実際に変わり、word highlight が同期する
- 旧 voiceName 保存値があっても起動できる（migration test green）

## 対象外
- 非 UK アクセント、4 声以上
EOF
)"
```

**Step 12: #12 reader 設計資料**

```bash
gh issue create --label docs --title "docs: reader 設計資料 — plans 4 本 + デプロイ手順" --body "$(cat <<'EOF'
## 目的
2 機能の設計・実装計画と Cloudflare Pages デプロイ手順、および本ブートストラップ計画を履歴に残す。

## Todo
- [x] `docs/plans/` word-highlight 設計+実装計画、multi-voice 設計+実装計画
- [x] `docs/plans/2026-06-11-issue-pr-bootstrap.md`（本計画）
- [x] `docs/deploy-cloudflare-pages.md` + `docs/cloudflare-deploy/`

## 受け入れ条件
- 各 plan が対応する issue（#10 #11）からリンクされている

## 対象外
- コード
EOF
)"
```

**Step 13: 実番号の確認**

Run: `gh issue list --limit 15`
Expected: 12 件。番号が想定とずれていたら以降の `(#N)` / `Closes #N` を全て読み替える。

---

## Task 3〜12: PR を 10 本、直列で出す

全 PR 共通の手順（`<N>`=issue 番号, `<branch>`, `<paths>`, `<title>` は上の対応表）:

**Step 1: 最新 main から分岐し、対象パスのみ stage**

```bash
git switch main && git pull
git switch -c <branch>
git add <paths>
git status --short   # 対象パス以外が staged に無いこと・生成物が無いことを確認
```

**Step 2: commit（co-author なし・AI 表記なし）**

```bash
git commit -m "<title> (#<N>)"
```

**Step 3: PR 固有の検証（下表）。失敗したら commit を残したまま停止して報告。**

| PR | 検証コマンド（`cd reader` で実行） |
|----|------------------------------------|
| PR6 | `npm ci` |
| PR7 | `npm test`（shared のテストが pass） |
| PR8 | `npm run build:data`（全レッスンパース） |
| PR9 | `npm run lint && npm run format:check && npm test && npm run build` + `npm run dev` 手動 3 点 |
| 他 | なし（docs/設定のみ） |

**Step 4: push + PR 作成（/ship-pr テンプレート: 先頭 Closes、3 秒要約 1〜3 行、確認方法）**

```bash
git push -u origin <branch>
gh pr create --title "<title> (#<N>)" --body "$(cat <<'EOF'
Closes #<N>

## 変更内容（3秒で読める要約）

<1〜3 行>

## 確認方法

- [ ] <Step 3 の検証結果>
EOF
)"
```

PR9 のみ `Closes #9` `Closes #10` `Closes #11` の 3 行 + `<details>` に実装詳細。

**Step 5: マージ（要・ユーザー承認）**

PR URL・diff stat・検証結果を提示し、**ユーザーの承認を得てから**:

```bash
gh pr merge --squash --delete-branch
git switch main && git pull && git branch -d <branch>
```

---

## Task 13: 完了確認

```bash
git log --oneline main          # first commit + squash 10 個
gh issue list --state open      # 0 件
git status --short              # クリーン
```

## Done criteria

- 12 issue すべて todo・受け入れ条件付きで記録され、PR から `Closes` リンクされている
- main の履歴が「1 PR = 1 squash commit」× 10 で、全 commit に issue 番号が入っている
- 各マージ直後の main で、その時点の検証コマンド（上表）が通る
- co-author / AI 表記がどの commit・PR にも無い
- 以後の新機能は `/issue-plan` → `/work-issue` → `/ship-pr` の通常フローに乗る
