# Vercel 環境変数の設定方法

## Vercel ダッシュボードで設定

1. **Vercel にログイン**
   https://vercel.com

2. **プロジェクト「zairyu-shinsei-system」を選択**

3. **Settings → Environment Variables をクリック**

4. **「Add」をクリック**
   - Name: `GOOGLE_SERVICE_ACCOUNT_KEY`
   - Value: （JSON キーの内容）

5. **「Save」をクリック**

6. **自動的に再デプロイされます**

## JSON キーの取得方法

Google Cloud Console で以下の方法でキーを確認：

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=zaryuushinsei

2. `zairyu-shinsei-system@zaryuushinsei.iam.gserviceaccount.com` をクリック

3. 「キー」タブから JSON キーを確認

4. **右上の「表示」をクリックしてコピー**

5. Vercel の環境変数に貼り付け
