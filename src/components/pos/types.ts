// POS関連の共通型定義

// テーブル配置設定
export type TableConfig = {
  id: string; // UUID（不変）
  label: string; // 表示名（編集可能）
  floorId: string; // "1F" or "2F"
  x: number; // グリッド位置（0-11）または線の始点x1
  y: number; // グリッド位置（0-7）または線の始点y1
  type?: "table" | "equipment" | "line"; // デフォルトは"table"
  width?: number; // グリッド幅（デフォルトは2）または線の終点x2
  height?: number; // グリッド高さ（デフォルトは2）または線の終点y2
  rotation?: number; // 回転角度（度、デフォルトは0）
  stroke?: number; // 線幅（デフォルトは2）
};

// 注文アイテム
export type OrderItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
};

// 飲み放題情報
export type AllYouCanDrink = {
  startedAt: string; // ISO形式の開始時刻
  durationMin: number; // 時間（分）
};

// 注文（伝票）
export type Order = {
  id: string;
  status: "open" | "closed";
  tableId: string; // テーブルID（不変）
  tableName: string; // 表示名（tables.labelと同期）
  people: number;
  items: OrderItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  allYouCanDrink?: AllYouCanDrink;
};

// メニューアイテム
export type MenuItem = {
  id: number;
  name: string;
  price: number;
  isActive: boolean; // 有効/無効（売り切れ対応）
  tags?: string[]; // タグ（例: ["サラダ", "一品"]）
};

// テーブル状態
export type TableStatus = {
  tableName: string;
  order: Order | null;
  status: "open" | "empty" | "closed";
};



