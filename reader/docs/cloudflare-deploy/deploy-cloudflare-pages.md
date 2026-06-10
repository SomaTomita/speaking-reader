# Cloudflare Pages デプロイ手順 (wrangler CLI)

このプロジェクト (`reader/`) を Cloudflare Pages に CLI で公開するために必要な
「インストール」「登録」「認証」「手順」をまとめる。

設定は `reader/wrangler.toml`:
- `name = "ielts-speaking-reader"`(= Pages プロジェクト名)
- `pages_build_output_dir = "public"`(アップロード対象。これがあるので
  `wrangler pages deploy` を引数なしで実行できる)

デプロイは静的アセットの直アップロード。サーバー/Functions は無し。

---

## 1. インストール(マシンに必要なもの)

- **Node 22**(`.nvmrc` 準拠)。確認: `node -v`。
- **依存一式(wrangler を含む)**:
  ```bash
  cd reader   # リポジトリルートから
  npm install
  ```
  `wrangler` は devDependency に固定済み。グローバル導入は不要で、
  `npx wrangler ...` または `npm run deploy` で使える。
  - (任意)グローバルに入れたい場合: `npm i -g wrangler`(基本不要)。

## 2. 登録(アカウント)

- **Cloudflare アカウント(無料)** が必要。
  https://dash.cloudflare.com/sign-up で作成。
- **独自ドメインは不要**。`https://<project>.pages.dev` のサブドメインで公開される。
- **課金不要**。Free プランで静的サイトは帯域が実質無制限。

## 3. 認証(初回のみ・どちらか一方)

### 方法A: 対話ログイン(推奨・手元の開発用)
```bash
npx wrangler login
```
ブラウザが開く → Cloudflare にログインして許可 → トークンがローカルに保存
(`~/.config/.wrangler` 等)。確認:
```bash
npx wrangler whoami      # アカウント名 / Account ID が出れば OK
```

### 方法B: API トークン(非対話 / CI 用)
1. ダッシュボード → 右上アカウント → **My Profile → API Tokens → Create Token**。
2. テンプレート **「Edit Cloudflare Pages」**(または権限 *Account › Cloudflare Pages › Edit*)で発行。
3. 環境変数にセット(コードには書かない):
   ```bash
   export CLOUDFLARE_API_TOKEN=xxxxxxxx
   export CLOUDFLARE_ACCOUNT_ID=xxxxxxxx   # whoami かダッシュボードで確認
   ```

## 4. プロジェクト作成(初回のみ)

初回の `wrangler pages deploy` 実行時に「プロジェクトを作成しますか?」と
production ブランチ名を対話で聞かれるので、そのまま作成で OK。

事前に作る場合(プロジェクト名は wrangler.toml の `name` と一致させる):
```bash
npx wrangler pages project create ielts-speaking-reader --production-branch main
```

## 5. デプロイ

```bash
cd reader   # リポジトリルートから
npm run deploy
```
`deploy` の中身 = `npm run build`(`data.js` + `app.js` を再生成)→
`wrangler pages deploy`(`wrangler.toml` の `public/` をアップロード)。

- 公開 URL: `https://ielts-speaking-reader.pages.dev`(系)。
- production ブランチ = 本番、それ以外のブランチ = プレビュー URL。

## 6. 確認・運用

```bash
npx wrangler whoami                                                  # 認証状態
npx wrangler pages deployment list --project-name ielts-speaking-reader   # 履歴
```
- デプロイ後の URL を開き、レッスン表示 / 音声再生 / word ハイライトを確認。
- ロールバック・履歴: ダッシュボード → **Workers & Pages → ielts-speaking-reader → Deployments**。

---

## 注意点

- **必ずフルツリー(`ielts-speaking/` 配下)で実行する**。`npm run deploy` は
  内部で `build:data` を走らせ、`../part1`・`../part2`(reader の外)を読む。
  reader だけを別の場所にコピーして実行すると data 生成が ENOENT で失敗する。
- **音声は deploy では再生成しない**。`build:audio` は別コマンド。声を追加・変更
  したときだけ手動で `npm run build:audio` してから deploy する。
- **Cloudflare Pages の制限**: 1 デプロイあたり 20,000 ファイル / 1 ファイル
  25 MiB。現状(将来 3 声でも ~4,926 ファイル / 各 mp3 ~数十 KB)は余裕。
- **`.gitignore` は直アップロードには影響しない**。wrangler は指定ディレクトリ
  (`public/`)の中身をそのまま上げる。
- **認証情報はリポジトリに入れない**。login 方式はローカル保存、token 方式は
  環境変数 / CI シークレットで管理。

## クイックリファレンス

```bash
npm install                              # 依存 + wrangler(初回 / 更新時)
npx wrangler login                       # 初回認証(対話)
npx wrangler pages project create ielts-speaking-reader --production-branch main   # 初回のみ(任意)
npm run deploy                           # ビルド + 公開
npx wrangler pages deployment list --project-name ielts-speaking-reader   # 履歴確認
```
