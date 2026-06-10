---
name: ship-pr
description: 作業ブランチから PR を作成し main へ squash merge するまでの手順。「PR にして」「マージして」と言われたら必ずこれを使う。3秒で読める PR 要約・issue リンク・マージ後処理のルールを含む。
argument-hint: "[issue-number]"
allowed-tools: Bash(git push *), Bash(git switch *), Bash(git pull *), Bash(git diff *), Bash(gh pr create *), Bash(gh pr view *), Bash(gh pr comment *), Bash(gh issue view *)
---

# Ship PR — PR 作成から main マージまで

`/work-issue` の完了条件（todo 全消化・テスト・lint 通過）を満たしてから使う。

対象 issue 番号: $ARGUMENTS（未指定なら現在のブランチ名・会話から特定する）

## 1. PR 作成

```bash
git push -u origin <branch>
gh pr create --title "<type>: <説明> (#<N>)" --body "$(cat <<'EOF'
Closes #<N>

## 変更内容（3秒で読める要約）

<1〜3 行。何が・なぜ変わったかだけ。実装の詳細は書かない>

## 確認方法

- [ ] `cd reader && npm run test` が通る
- [ ] <受け入れ条件に対応した動作確認手順>
EOF
)"
```

### PR 本文ルール

- **先頭は必ず `Closes #<N>`**。issue へのリンクを切らさない（マージ時に issue が自動 close される）。
- **「変更内容」は 3 秒で読み切れる長さ（1〜3 行）に収める**。箇条書き 3 点以内。
  詳細を書きたければ折りたたみ（`<details>`）に入れ、本文は短く保つ。
- タイトルは squash merge 後に main の commit メッセージになるため、
  `<type>: <説明> (#<N>)` 形式を厳守する。
- **AI 表記を入れない**。`Generated with Claude Code` や `Co-Authored-By: Claude` を
  PR 本文・コメントに含めない。

### PR コメントルール

- レビュー対応や追記の PR コメントにも、関連 issue 番号（`#<N>`）を含めて文脈を残す。

```bash
gh pr comment <PR番号> --body "#<N> の <todo項目> に対応: <変更の一言要約>"
```

## 2. マージ前チェック

- [ ] CI（あれば）グリーン
- [ ] issue の Todo がすべて `[x]`
- [ ] PR 本文先頭に `Closes #<N>` がある
- [ ] `git diff main...HEAD` に生成物・無関係な変更が混ざっていない

## 3. マージ（squash 固定・要承認）

**マージは必ずユーザーの明示的な承認を得てから実行する。**
マージ前チェックの結果と PR の URL を提示し、「マージしていい？」と確認する。
承認なしで `gh pr merge` を実行しない（main への変更は取り消しにくいため）。

```bash
gh pr merge <PR番号> --squash --delete-branch
```

- **squash merge のみ**。merge commit / rebase merge は使わない（main は 1 PR = 1 commit に保つ）。
- `--delete-branch` でリモートブランチを削除。ローカルも掃除する:

```bash
git switch main && git pull && git branch -d <branch>
```

## 4. マージ後

- issue が自動 close されたことを確認（`gh issue view <N>`）。
- `Depends on #<N>` で待っていた issue があれば、着手可能になった旨をユーザーに報告する。
