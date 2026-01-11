-- 年表アイテムテーブル
CREATE TABLE roadmap_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  category TEXT NOT NULL DEFAULT '未分類',
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DO', 'PARK', 'NO')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS (Row Level Security) を有効化
ALTER TABLE roadmap_items ENABLE ROW LEVEL SECURITY;

-- ポリシー: ユーザーは自分のデータのみ閲覧・操作可能
CREATE POLICY "Users can view their own roadmap items"
  ON roadmap_items
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own roadmap items"
  ON roadmap_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own roadmap items"
  ON roadmap_items
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own roadmap items"
  ON roadmap_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX idx_roadmap_items_user_id ON roadmap_items(user_id);
CREATE INDEX idx_roadmap_items_quarter ON roadmap_items(quarter);















