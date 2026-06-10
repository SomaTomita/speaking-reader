---
name: issue-plan
description: 機能要望・バグ報告を小さな GitHub issue に分割して todo チェックリスト付きで作成する。開発を始める前の計画段階で使う。「issueにして」「issueを切って」「計画して」と言われたら必ずこれを使う。
argument-hint: "[要望の説明]"
allowed-tools: Bash(gh issue list *), Bash(gh issue view *), Bash(gh label *)
---

# Issue Plan — 要望を小さな issue に分割する

機能要望やバグ報告を受け取ったら、**実装を始める前に**このスキルで issue に落とし込む。
リポジトリは `SomaTomita/speaking-reader`。issue 操作はすべて `gh` CLI で行う。

分割対象の要望: $ARGUMENTS（未指定なら直前の会話の要望を対象にする）

## 分割ルール（最重要）

- **1 issue = 1 PR = 1 つの独立した変更**。半日以内に完了できるサイズまで分割する。
- 「データ生成」「UI」「音声」など、レイヤーをまたぐ要望はレイヤーごとに issue を分ける。
- 分割した issue 間に依存があれば、本文に `Depends on #N` と明記する。
- 大きな機能は親 issue（エピック）を 1 つ作り、本文のチェックリストから子 issue にリンクする。
- 分割案はまずユーザーに提示して承認を得てから `gh issue create` を実行する。

## issue 本文テンプレート

```markdown
## 目的

<なぜやるか。1〜2 文>

## Todo

- [ ] <実装手順 1>
- [ ] <実装手順 2>
- [ ] テスト追加・更新（`npm run test`）
- [ ] `npm run lint` / `npm run format:check` が通る

## 受け入れ条件

- <完了と判断できる具体的な条件>

## 対象外（スコープ外）

- <この issue ではやらないこと>
```

- **Todo セクションは必須**。実装中に `/work-issue` がチェックを進める前提で、具体的な手順を書く。
- 受け入れ条件は検証可能な形（コマンド、画面動作）で書く。

## 作成コマンド

```bash
gh issue create \
  --title "<type>: <短い要約>" \
  --body "$(cat <<'EOF'
<上のテンプレートを埋めた本文>
EOF
)" \
  --label "<feat|fix|refactor|docs|test|chore>"
```

- タイトルは conventional commit と同じ type 接頭辞（`feat:` `fix:` など）を付ける。
- ラベルが存在しない場合は `gh label create <name>` で先に作る。
- 作成後、issue 番号と URL の一覧をユーザーに報告する。

## 次のステップ

issue 作成後、着手する issue を決めたら `/work-issue` に進む。
