# RASENS 在留申請システム - 開発進捗ドキュメント

**最終更新**: 2026-06-03  
**プロジェクト**: 在留申請オンラインシステム（RASENS）統合システム  
**テクノロジー**: Next.js 16 App Router, TypeScript, Drizzle ORM, Neon PostgreSQL, Vercel Blob

---

## 📋 プロジェクト概要

RASENS（在留申請オンラインシステム）と統合した、申請人・申請案件管理システム。申請書類の作成、OCR処理、質問書生成、XML/XL形式出力、および完全なワークフロー管理を実現。

---

## ✅ 実装完了機能サマリー

### **コア機能（完了）**
- ✅ ユーザー認証・テナント管理
- ✅ 申請人マスター管理
- ✅ 申請案件管理（CRUD操作）
- ✅ 8ステップワークフロー（draft → completed）
- ✅ 申請書フォーム・質問書生成
- ✅ OCR処理（Google Cloud Vision API）
- ✅ RASENS転記シート・XML出力
- ✅ 資格外活動（gaikatsu）フィールド対応

### **最近実装（本セッション）**
- ✅ **ステップ7・8パネル**：申請日・申請番号・許可日記録
- ✅ **署名済み申請書管理**：3カテゴリ分類（申請人用/所属機関用/資格外活動）
- ✅ **パネル折りたたみ機能**：CollapsibleSection コンポーネント
- ✅ **新在留カード対応**：アップロード・自動反映
- ✅ **編集制限機能**：completed 後の編集禁止
- ✅ **バックアップ・復元**：手動・自動・履歴表示
- ✅ **Scheduled Task**：毎日 AM 2:00 に自動バックアップ実行

---

## 🗄️ データベーススキーマ

### **追加テーブル（backupHistory）**
```sql
-- テーブル構成
CREATE TABLE backup_history (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  backup_type TEXT ('manual' | 'automatic'),
  file_url TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  applicant_master_count INTEGER,
  applications_count INTEGER,
  created_by UUID,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,  -- 30日後の削除予定日時
  is_deleted BOOLEAN
);
```

### **draftData JSON スキーマ**
```javascript
{
  _submission: {
    applicationDate: "2026-06-03",
    applicationNumber: "R26-001234"
  },
  _result: {
    permitDate: "2026-07-15",
    residenceCardNumber: "RC123456789",
    currentVisaExpiry: "2028-07-15",
    currentVisaType: "Skilled Worker"
  },
  _signedDocuments: [
    {
      url: "https://blob.vercelusercontent.com/...",
      fileName: "申請書_署名済み.pdf",
      uploadedAt: "2026-06-03T10:00:00Z",
      documentType: "applicant" // "applicant" | "organization" | "gaikatsu"
    }
  ]
}
```

---

## 📁 新規ファイル一覧

### **アクション・ユーティリティ**
- `src/actions/backup.ts` - バックアップ・復元 Server Actions
- `src/lib/backup-utils.ts` - バックアップユーティリティ関数
- `src/lib/db/schema.ts` - backupHistory テーブル定義（更新）

### **UI コンポーネント**
- `src/components/applications/signed-documents-panel.tsx` - 署名済み書類管理（3カテゴリ表示）
- `src/components/applications/submission-info-panel.tsx` - ステップ7パネル
- `src/components/applications/permit-result-panel.tsx` - ステップ8パネル
- `src/components/ui/collapsible-section.tsx` - 折りたたみパネルコンポーネント
- `src/components/settings/backup-settings.tsx` - バックアップ設定UI

### **API エンドポイント**
- `/api/applications/[id]/upload-signed-document/route.ts` - 署名済み書類アップロード（documentType対応）
- `/api/applications/[id]/delete-signed-document/route.ts` - 署名済み書類削除
- `/api/applications/[id]/upload-residence-card/route.ts` - 新在留カードアップロード

### **Scheduled Task**
- `.claude/scheduled-tasks/auto-backup-daily/SKILL.md` - 毎日 AM 2:00 自動バックアップ

---

## 🔧 主要機能詳細

### **署名済み申請書（3カテゴリ）**

| カテゴリ | アイコン | 説明 | 色 |
|---------|---------|------|-----|
| 申請人用 | 👤 | 申請人が署名した書類 | 青 |
| 所属機関用 | 🏢 | 会社が署名した書類 | 緑 |
| 資格外活動許可申請書 | 💼 | 資格外活動の署名版 | 紫 |

- **アップロード**：ドロップダウンでタイプを選択 → PDF選択 → 自動保存
- **表示**：タイプ別セクション で整理表示
- **保存先**：Vercel Blob（テナントID でスコープ）
- **メタデータ**：draftData._signedDocuments に documentType フィールド含む

### **バックアップ・復元**

#### 手動バックアップ
- JSON形式でダウンロード
- applicantMaster + applications 含む
- ファイルサイズ表示

#### 自動バックアップ
- 毎日 AM 2:00 実行（UTC+9 基準）
- Vercel Blob へのプライベート保存
- 30日間の保持（期限後は自動削除対象）
- Scheduled Task で管理

#### 復元機能
- JSONファイルから復元
- 確認ダイアログで警告表示
- applicantMaster + applications 完全復元
- 復元後、自動ページリロード

#### バックアップ履歴
- 作成日時・ファイルサイズ・レコード件数表示
- 手動/自動フラグ
- 各バックアップからのダウンロードリンク

---

## 🚀 ワークフロー（8ステップ）

```
① 基本情報 → ② 書類要件 → ③ 書類提出 → ④ OCR処理
    ↓
⑤ 質問書送信 → ⑥ 最終審査 → ⑦ 署名・提出 → ⑧ 許可・完了
```

**ステップ7（署名・提出）**
- 申請日・申請番号を記録 → applications.caseNumber 自動更新
- 署名済み申請書をアップロード（3カテゴリ分類）
- draftData._submission に保存

**ステップ8（許可・完了）**
- 許可日を記録
- 新在留カード情報をアップロード（JPG/PNG/WebP）
- applicantMaster を自動更新（residenceCardNumber等）
- status を "completed" に変更 → 編集禁止

---

## ⏰ スケジュール済みタスク

### `auto-backup-daily`
- **Schedule**: `0 2 * * *` (毎日 AM 2:00 JST)
- **Status**: ✅ アクティブ（次回実行: 明日 AM 2:00）
- **処理内容**:
  1. すべてのテナントを取得
  2. 各テナントの applicantMaster + applications をバックアップ
  3. Vercel Blob へ保存（tenant_id でスコープ）
  4. backupHistory テーブルに記録
  5. 30日以上前のバックアップを自動削除マーク

---

## 📊 最新ビルド状況

```
✓ Compiled successfully in 4.0s
✓ TypeScript check: OK
✓ Pages optimized and ready for production
```

**Latest Commit**: `17a85d7 - Categorize signed documents by type`

---

## 🔐 セキュリティ・保護機能

- ✅ テナント隔離（すべてのクエリで tenantId 条件）
- ✅ ロール権限管理（admin/hr_manager/expert/applicant）
- ✅ Vercel Blob プライベートアクセス
- ✅ ファイルアップロード MIME タイプ検証
- ✅ 復元時の確認ダイアログ
- ✅ 完了後の編集禁止（fieldset disable）

---

## 📝 設定ページ（/settings）

**対象**: admin ユーザーのみ

**セクション**:
1. アカウント情報表示
2. 表示名変更
3. メールアドレス変更
4. パスワード変更
5. ユーザー管理（admin機能）
6. **バックアップ・復元（admin機能）** ← 本セッション実装

---

## 🚀 次に着手すべき TODO

### **優先度 HIGH**
- [ ] Scheduled Task 実行確認（翌日 AM 2:00）
- [ ] バックアップ復元テスト（別環境で実施）
- [ ] 本番データの初回バックアップ実行・保管

### **優先度 MEDIUM**
- [ ] 古いバックアップの自動削除ロジック確認
- [ ] 大規模データ（1000件以上）でのバックアップ性能確認
- [ ] PDF 以外のファイル形式対応検討（画像等）

### **優先度 LOW**
- [ ] 監査ログの強化
- [ ] ユーザーマニュアル作成
- [ ] API ドキュメント自動生成

---

## 📞 参考情報

**Git**: すべて commit 済み（最新: `17a85d7`）  
**環境**: Vercel（本番）+ Neon PostgreSQL  
**ストレージ**: Vercel Blob（private access）  

**キー概念**:
- テナント隔離 → すべてのクエリで tenantId 条件
- ステータス管理 → applications.status で UI/操作制御
- draftData → JSON フィールドで柔軟なメタデータ管理
