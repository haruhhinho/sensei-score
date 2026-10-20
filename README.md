# Sensei 評価 / Sensei Score

日本の大学の先生と授業を、学生が匿名で評価・共有するサイトです。

- 画面：Vite（素のJavaScript）
- データベース・ログイン：Supabase（Google アカウント／メールのリンク）
- 公開・サーバー処理：Cloudflare Pages ＋ Pages Functions（`functions/api/`）
- AI（投稿チェック・要約・翻訳）：Anthropic API

公開までの手順は [docs/SETUP.md](docs/SETUP.md) を見てください。

## 手元で動かす

```sh
npm install
cp .env.example .env   # Supabase の URL と anon キーを書く
npm run dev
```
`/api/` の機能（投稿・要約・翻訳）は Cloudflare 上で動きます。
