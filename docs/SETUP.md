# Sensei 評価 公開までの手順書

秘密のキー（Anthropic の API キー、Supabase の service_role / secret キー）は、**この手順書のとおり各サービスの管理画面に直接入力してください。** チャットやファイルには書かないでください。

---

## 1. Supabase：データベースを作る

1. Supabase のプロジェクトを開き、左の **SQL Editor** →「New query」。
2. このリポジトリの `supabase/schema.sql` の中身をすべて貼り付けて **Run**。
   - 何度実行しても壊れないように作ってあります。
3. 左の **Project Settings → API**（または「API Keys」）で次の3つを控えます（管理画面に貼るときに使います）。
   - Project URL（`https://xxxx.supabase.co`）
   - anon / publishable キー（公開してよいキー）
   - service_role / secret キー（**秘密**）

## 2. Supabase：ログインの設定

1. **Authentication → URL Configuration**
   - Site URL：公開後のURL（例 `https://sensei-score.○○.workers.dev`。独自ドメインを買ったらそちら）
   - Redirect URLs：上と同じURL、テスト用に `http://localhost:5173` も追加
2. **Authentication → Providers → Email**：有効のまま（パスワードではなく、メールに届くリンクでログインします）
3. **Google でのログイン**
   1. Google Cloud Console（console.cloud.google.com）でプロジェクトを作成
   2. 「APIとサービス → OAuth 同意画面」を作成（アプリ名 Sensei 評価、外部、公開）
   3. 「認証情報 → OAuth クライアント ID」→ 種類「ウェブアプリケーション」
      - 承認済みのリダイレクト URI：Supabase の Google 設定画面に表示される Callback URL（`https://xxxx.supabase.co/auth/v1/callback`）
   4. 発行されたクライアント ID とシークレットを、Supabase の **Authentication → Providers → Google** に貼って有効化
4. **メール送信について**：Supabase 標準のメール送信は1時間に数通しか送れません。公開前に
   **Authentication → Emails → SMTP Settings** で外部の送信サービス（Resend など。無料枠あり）を設定してください。

## 3. Cloudflare：サイトを公開する

このリポジトリは **Cloudflare Workers**（現在の標準）でも **Cloudflare Pages** でも公開できます。

### Workers の場合（「Deploy command：npx wrangler deploy」と表示される画面）

1. Cloudflare ダッシュボード →「Workers & Pages」→「作成」→「Git リポジトリをインポート」→ `haruhhinho/sensei-score`
2. 設定
   - Worker 名（プロジェクト名）：`sensei-score`（`wrangler.jsonc` の `"name"` と同じにする）
   - Build command：`npm run build`
   - Deploy command：`npx wrangler deploy`
   - 出力ディレクトリの欄はありません（`wrangler.jsonc` で `dist` を指定済み）
3. **Build variables**（ビルドの設定の中。画面を作るときに使う公開してよい値）

   | 名前 | 値 |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable キー |

4. **Variables and Secrets**（Worker の「設定」タブ。サーバー処理で使う値）

   | 名前 | 値 | 種類 |
   |---|---|---|
   | `SUPABASE_URL` | Project URL | テキスト |
   | `SUPABASE_ANON_KEY` | anon / publishable キー | テキスト |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret キー | **シークレット** |
   | `ANTHROPIC_API_KEY` | Anthropic の API キー | **シークレット** |
   | `AI_MODEL_FAST`（任意） | 例 `claude-haiku-5-5` | テキスト |
   | `AI_MODEL_DEFAULT`（任意） | 例 `claude-sonnet-5-5` | テキスト |

5. 「デプロイ」タブから再デプロイ。`VITE_` の値を変えたら必ず再デプロイします。
6. 表示された `https://sensei-score.○○.workers.dev` を開いて確認し、このURLを手順2の Site URL / Redirect URLs に入れます。

### Pages の場合

1. 「Workers & Pages」→「作成」→ 画面下の「Pages」→「Git に接続」→ `haruhhinho/sensei-score`
2. フレームワーク プリセット：なし／ビルド コマンド：`npm run build`／ビルド出力ディレクトリ：`dist`
3. 「設定 → 変数とシークレット」に、上の表の値をすべて（`VITE_` の2つも含めて）入れる
4. 再デプロイし、`https://○○.pages.dev` を手順2の Site URL / Redirect URLs に入れる

## 4. 自分を管理者にする

1. 公開したサイトで、自分のメールアドレスか Google で新規登録してログイン
2. Supabase の SQL Editor で次を実行（メールアドレスは自分のものに）
   ```sql
   insert into public.admins(user_id)
   select id from auth.users where email = 'あなたのメールアドレス';
   ```
3. サイトを再読み込みすると、フッターに「管理」が出ます。

## 5. 全国の大学を取り込む

1. 文部科学省「学校コード」のページ（https://www.mext.go.jp/b_menu/toukei/mext_01087.html）から、**大学**の学校コード一覧（CSV）をダウンロード
2. サイトの「管理」ページ下部「大学の一覧を取り込む」で、そのCSVを選んで実行
   - 短期大学も入れたいときはチェックを入れます
   - 何度取り込んでも重複しません（学校コードで上書き）

### 先生の一括追加

「管理」ページの「先生の一括追加」で、先生の一覧（CSV）をまとめて登録できます。

- 「見本のCSVをダウンロード」で形式を確認できます（列：大学、氏名、ふりがな、英語表記、学部・学科）。
- 大学は、一覧と同じ正式名称か学校コードで書きます。
- すでに登録されている先生（日本語名・英語名が同じ人）は追加されません。同じ大学に同姓同名の別の先生がいる場合は、管理画面からではなく通常の「先生を追加」から登録してください。
- 名簿は各大学が公開している教員紹介ページなどをもとに作り、researchmap など規約で営利目的の利用や大量取得を禁じているサービスからは取り込まないでください。

## 追加のSQL（更新のたびに）

コードの更新でデータベースの変更が必要になったときは、`supabase/migrations/` に SQL ファイルを追加します。Supabase の SQL Editor で、まだ実行していないファイルの中身を貼り付けて Run してください（何度実行しても大丈夫です）。

- `20261026_self_delete.sql`：自分が追加した先生・大学をマイページから削除できるようにする

## 6. 公開前に必ずやること

- **規約・ポリシーの【 】を埋める**（運営者情報のページは削除済み。運営者の氏名・住所は、請求があれば答える形にしています）：`src/i18n.js` の利用規約・プライバシーポリシー・運営者情報・お問い合わせにある【運営者名】【連絡先メールアドレス】などを、実際の情報に書き換えて GitHub に上げ直してください（日本語・英語の両方）。
- **Anthropic の利用上限**：console.anthropic.com の「Limits」で月の上限額を設定しておくと、使いすぎを防げます。
- **Supabase のバックアップ**：無料プランは自動バックアップがありません。利用者が増えたら Pro プランを検討してください。

## 7. 広告（AdSense）を入れるとき

1. 独自ドメインを購入（Cloudflare Registrar なら原価、.com で年1,500円前後）
2. Cloudflare の Worker（または Pages）の「ドメイン」設定で接続し、手順2の Site URL / Redirect URLs と Google の設定を新しいドメインに更新
3. ある程度レビューが集まってから AdSense に申請。審査に通ったら広告コードの追加をご相談ください（利用者情報の外部送信ページの更新も必要です）。

---

### うまく動かないとき

- 「読み込めませんでした」：`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を確認して再デプロイ
- 投稿時に「AIのチェックが使えません」：`ANTHROPIC_API_KEY` を確認
- 投稿時に「投稿できませんでした」：`SUPABASE_SERVICE_ROLE_KEY` と `SUPABASE_URL` を確認
- ログインのメールが届かない：迷惑メールフォルダ、または手順2-4のSMTP設定
