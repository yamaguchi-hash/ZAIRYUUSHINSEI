-- ファイルアップロード情報の確認
SELECT 
  COUNT(*) as file_count,
  SUM(file_size) as total_size_bytes,
  ROUND(SUM(file_size) / (1024 * 1024), 2) as total_size_mb
FROM uploaded_documents
WHERE is_deleted = false;

-- バックアップ履歴の確認
SELECT 
  COUNT(*) as backup_count,
  SUM(file_size) as total_backup_bytes,
  ROUND(SUM(file_size) / (1024 * 1024), 2) as total_backup_mb
FROM backup_history
WHERE is_deleted = false;
