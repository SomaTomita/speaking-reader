---
name: work-issue
description: GitHub issue に着手してブランチ作成・実装・commit まで進める。「#N をやって」「issue に着手」と言われたら必ずこれを使う。ブランチ命名・commit メッセージ・issue の todo 更新ルールを含む。
argument-hint: "[issue-number]"
allowed-tools: Bash(gh issue view *), Bash(gh issue edit *), Bash(gh issue comment *), Bash(git switch *), Bash(git pull *), Bash(npm run *)
---

# Work Issue — issue 着手から commit まで

issue 番号を受け取ったら、このスキルの手順で実装を進める。
**issue なしの実装は禁止**。issue がなければ先に `/issue-plan` で作る。

対象 issue 番号: $ARGUMENTS（未指定なら会話から特定し、不明ならユーザーに確認する）

## 1. 着手

```bash
gh issue view <N>                      # 本文・todo・受け入れ条件を必ず読む
git switch main && git pull            # 最新の main から分岐
git switch -c <type>/<N>-<short-desc>  # 例: feat/12-voice-selection
```

- ブランチ名の `<type>` は issue タイトルの type と一致させる（feat / fix / refactor / docs / test / chore / perf / ci）。
- `<short-desc>` は英語ケバブケース 2〜4 語。

## 2. 実装中

- issue 本文の **Todo を上から順に**進める。完了するたびに issue のチェックボックスを更新する:

```bash
gh issue view <N> --json body -q .body          # 現在の本文を取得
# `- [ ]` を `- [x]` に置き換えた本文で更新
gh issue edit <N> --body "<更新後の本文>"
```

- 計画と違う対応が必要になったら、勝手にスコープを広げず issue にコメントで記録する:

```bash
gh issue comment <N> --body "<変更点と理由>"
```

## 3. commit ルール

- 形式: `<type>: <説明> (#<issue番号>)` — 例: `feat: add voice selector dropdown (#12)`
- **co-author に Claude Code を入れない**。`Co-Authored-By` 行・`Generated with Claude Code` などの AI 表記をコミットメッセージに一切含めない。
- 1 commit = 1 つの論理的変更。todo 1 項目ごとに commit する粒度が目安。
- commit 前に必ず通す:

```bash
cd reader && npm run lint && npm run format:check && npm run test
```

- 生成物（`reader/public/app.js` `data.js` `audio/` `audio-manifest.json`）は gitignore 済み。commit に混ざっていたら除外する。

## 4. 完了条件

issue の Todo がすべて `[x]`、受け入れ条件を満たし、テスト・lint が通ったら `/ship-pr` に進む。
