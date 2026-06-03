# ダウンロードフォルダの JSON ファイルを探す
$jsonFiles = Get-ChildItem "$env:USERPROFILE\Downloads\zairyu-shinsei-system-*.json" -ErrorAction SilentlyContinue

if ($jsonFiles.Count -eq 0) {
    Write-Host "❌ JSON ファイルが見つかりません"
    Write-Host ""
    Write-Host "確認してください："
    Write-Host "1. Google Cloud Console で JSON キーをダウンロード済み？"
    Write-Host "2. ファイルはダウンロードフォルダに保存されている？"
    Write-Host ""
    Write-Host "ダウンロードフォルダ："
    Write-Host "$env:USERPROFILE\Downloads"
    exit 1
}

$jsonFile = $jsonFiles | Select-Object -First 1

Write-Host "📄 JSON ファイルを見つけました："
Write-Host "  $($jsonFile.Name)"
Write-Host ""

# JSON の内容を読み込む
$json = Get-Content $jsonFile.FullName -Raw

# .env.local に追加
$envContent = "GOOGLE_SERVICE_ACCOUNT_KEY='$json'"
Add-Content .env.local $envContent

Write-Host "✅ .env.local に設定を追加しました！"
Write-Host ""
Write-Host "次のステップ："
Write-Host "1. npm run dev（ローカルテスト）"
Write-Host "2. git push origin master"
Write-Host "3. vercel deploy --prod（デプロイ）"
