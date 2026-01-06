-- あきひろOS用のマイグレーション
-- zoneとmaturityフィールドを追加

-- zoneカラムを追加（NOW/NEXT/LATER）
ALTER TABLE roadmap_items 
ADD COLUMN IF NOT EXISTS zone TEXT CHECK (zone IN ('NOW', 'NEXT', 'LATER'));

-- maturityカラムを追加（成熟度: 着想/着手/巡行/手放し）
ALTER TABLE roadmap_items 
ADD COLUMN IF NOT EXISTS maturity TEXT CHECK (maturity IN ('着想', '着手', '巡行', '手放し'));

-- 既存データのデフォルト値設定（後方互換性のため）
UPDATE roadmap_items 
SET zone = CASE 
  WHEN status = 'DO' THEN 'NOW'
  WHEN status = 'PARK' THEN 'NEXT'
  ELSE 'LATER'
END
WHERE zone IS NULL;

UPDATE roadmap_items 
SET maturity = CASE 
  WHEN status = 'DO' THEN '着手'
  WHEN status = 'PARK' THEN '着想'
  ELSE '手放し'
END
WHERE maturity IS NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_roadmap_items_zone ON roadmap_items(zone);
CREATE INDEX IF NOT EXISTS idx_roadmap_items_maturity ON roadmap_items(maturity);









