# Wrangler CLI で Cloudflare Pages にデプロイするまでの全ステップ

> 最終更新: 2026-06-10
> 対象: `reader/`(このプロジェクト)。設定ファイルは `reader/wrangler.toml`。
> 参照した一次情報は文末の「参考資料」を参照。

このドキュメントは、何も入っていないマシンから `wrangler.toml` ベースで
CLI デプロイが完了するまでを、上から順に実行できる形でまとめたもの。

---

## 0. 前提知識(2026年6月時点の最新状況)

- **Wrangler** は Cloudflare Developer Platform の公式 CLI。Workers / Pages /
  D1 / R2 / KV など、Cloudflare の開発者向け機能をほぼすべて操作できる。
  本プロジェクトでは **Pages への静的アセット直アップロード(Direct Upload)** にのみ使う。
- 本プロジェクトの Wrangler は **v4 系**(`package.json` の devDependency に
  `"wrangler": "^4.99.0"` で固定済み)。グローバルインストールは不要。
- **Pages と Workers の統合が進行中**: Cloudflare は 2026 年現在、Pages と
  Workers を単一プラットフォームへ統合する方向を公式に示しており、新規
  プロジェクトには Workers Static Assets(`wrangler deploy`)を推奨し始めている。
  ただし純粋な静的サイトでは Pages は引き続き第一級サポートであり、
  本プロジェクトは当面 `wrangler pages deploy` のままで問題ない
  (移行が必要になったら公式の Pages→Workers 移行ガイドに従う)。
- **設定ファイル形式**: Cloudflare は新規プロジェクトに `wrangler.jsonc` を
  推奨し始めているが、`wrangler.toml` も完全サポートが継続している。
  本プロジェクトは TOML のままでよい。

### このプロジェクトの wrangler.toml

```toml
name = "ielts-speaking-reader"        # = Pages プロジェクト名
compatibility_date = "2026-06-09"
pages_build_output_dir = "public"     # アップロード対象ディレクトリ
```

`pages_build_output_dir` が定義されているため、`wrangler pages deploy` を
**ディレクトリ引数なし**で実行できる(Wrangler が TOML を読んで `public/` を上げる)。
公式ドキュメントの原則どおり、「設定ファイルを source of truth」として扱い、
ダッシュボード側では設定を変更しないこと。

---

## 1. インストール

### 1-1. Node.js 22

`.nvmrc` が Node 22 を指定している。nvm / Volta 等のバージョンマネージャ経由を推奨。

```bash
cd reader   # リポジトリルートから
nvm use          # .nvmrc を読んで Node 22 に切替(未導入なら nvm install)
node -v          # v22.x.x であること
```

### 1-2. 依存パッケージ(wrangler を含む)

```bash
npm install
npx wrangler --version   # 4.x が表示されれば OK
```

`wrangler` は devDependency なので、この `npm install` だけで揃う。
以降はすべて `npx wrangler ...` で実行する(グローバル `npm i -g wrangler` は不要)。

---

## 2. Cloudflare アカウント登録(初回のみ)

1. https://dash.cloudflare.com/sign-up で無料アカウントを作成。
2. 独自ドメインは不要。`https://<プロジェクト名>.pages.dev` で公開される。
3. 課金も不要。Free プランで静的サイトの帯域は実質無制限。

---

## 3. 認証(初回のみ。A か B のどちらか一方)

### 方法A: 対話ログイン(ローカル開発用・推奨)

```bash
npx wrangler login
```

ブラウザが開く → Cloudflare にログイン → アクセスを許可。
OAuth トークンがローカル(`~/.config/.wrangler/` など)に保存される。

確認:

```bash
npx wrangler whoami   # アカウント名と Account ID が表示されれば認証完了
```

### 方法B: API トークン(CI / 非対話環境用)

1. ダッシュボード右上 → **My Profile → API Tokens → Create Token**。
2. テンプレート **「Edit Cloudflare Pages」**(権限: *Account › Cloudflare Pages › Edit*)で発行。
3. 環境変数で渡す(ファイルやリポジトリには絶対に書かない):

```bash
export CLOUDFLARE_API_TOKEN=<発行したトークン>
export CLOUDFLARE_ACCOUNT_ID=<whoami かダッシュボードで確認した ID>
```

---

## 4. Pages プロジェクト作成(初回のみ)

初回の `wrangler pages deploy` 実行時に「プロジェクトを作成しますか?」と
production ブランチ名を対話で聞かれるので、そのまま作成しても OK。

明示的に先に作る場合(プロジェクト名は **wrangler.toml の `name` と一致**させる):

```bash
npx wrangler pages project create ielts-speaking-reader --production-branch main
```

作成済みプロジェクトの確認:

```bash
npx wrangler pages project list
```

---

## 5. ビルドとデプロイ

### 5-1. 一発デプロイ(通常はこれだけ)

```bash
cd reader   # リポジトリルートから
npm run deploy
```

`deploy` スクリプトの中身は以下の 2 段階:

1. `npm run build` … `build:data`(`../part1`・`../part2` の MD を `public/data.js` に変換)
   + `build:app`(esbuild で `public/app.js` をバンドル)
2. `wrangler pages deploy` … `wrangler.toml` の `pages_build_output_dir = "public"` を読み、
   `public/` の中身をそのままアップロード

成功すると公開 URL(`https://ielts-speaking-reader.pages.dev` 系)が表示される。

### 5-2. プレビューデプロイ(本番を汚さず確認したいとき)

production ブランチ以外の名前を指定すると、ブランチエイリアス
`https://<ブランチ名>.ielts-speaking-reader.pages.dev` のプレビュー URL になる:

```bash
npm run build && npx wrangler pages deploy --branch=preview
```

---

## 6. デプロイ後の確認・運用

```bash
npx wrangler whoami                                                        # 認証状態
npx wrangler pages deployment list --project-name ielts-speaking-reader   # デプロイ履歴
```

- 公開 URL を開き、レッスン表示 / 音声再生 / word ハイライトが動くことを確認する。
- ロールバックと履歴管理: ダッシュボード →
  **Workers & Pages → ielts-speaking-reader → Deployments**。

---

## 7. 注意点(このプロジェクト固有のものを含む)

- **必ずフルツリー(`ielts-speaking/` 配下)で実行する。**
  `npm run deploy` 内の `build:data` は `../part1`・`../part2`(reader の外)を
  読むため、`reader/` だけを別の場所にコピーして実行すると ENOENT で失敗する。
- **音声(MP3)は deploy では再生成されない。** 声の追加・変更時のみ、
  デプロイ前に手動で `npm run build:audio` を実行する。
- **Pages Direct Upload の制限**: 1 デプロイあたり **20,000 ファイル / 1 ファイル 25 MiB**。
  現状(将来 3 声構成でも ~5,000 ファイル、各 MP3 数十 KB)は十分余裕がある。
- **`.gitignore` は直アップロードに影響しない。** Wrangler は `public/` の中身を
  そのまま上げる。公開したくないものを `public/` に置かないこと。
- **認証情報をリポジトリに入れない。** login 方式はローカル保存、token 方式は
  環境変数 / CI シークレットで管理する。
- アップロードのキャッシュは `node_modules/.cache/wrangler` に保存される。
  挙動が怪しいときはここを消すとフルアップロードし直せる。

---

## クイックリファレンス

```bash
# 初回セットアップ
npm install
npx wrangler login
npx wrangler pages project create ielts-speaking-reader --production-branch main  # 任意

# 毎回のデプロイ
npm run deploy

# プレビュー
npm run build && npx wrangler pages deploy --branch=preview

# 確認
npx wrangler whoami
npx wrangler pages deployment list --project-name ielts-speaking-reader
```

---

## 参考資料

- [Wrangler CLI の全体像(Qiita / toreis)](https://qiita.com/toreis/items/692f6b53841ae88a1557)
  … Wrangler の役割、`npx wrangler` 運用、`wrangler login` 認証の解説
- [Cloudflare Pages: Direct Upload(公式)](https://developers.cloudflare.com/pages/get-started/direct-upload/)
  … `pages project create` / `pages deploy` / `--branch` / 20,000 ファイル制限
- [Wrangler Configuration(公式)](https://developers.cloudflare.com/workers/wrangler/configuration/)
  … `name` / `compatibility_date`、設定ファイルを source of truth とする原則
- [Migrate from Pages to Workers(公式)](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
  … 将来 Workers Static Assets へ移行する場合の手順
- [Workers Static Assets(公式)](https://developers.cloudflare.com/workers/static-assets/)
  … Pages/Workers 統合の現状と新規プロジェクト向け推奨
