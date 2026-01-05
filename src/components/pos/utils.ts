// POS関連の共通ユーティリティ関数

import { TableConfig } from "./types";

// UUID生成関数
export const generateUUID = (): string => {
  return `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ラベル自動生成（T-01, T-02...）
export const generateLabel = (existingConfigs: TableConfig[], floorId: string): string => {
  const floorTables = existingConfigs.filter((c) => c.floorId === floorId);
  const numbers = floorTables
    .map((t) => {
      const match = t.label.match(/T-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `T-${nextNumber.toString().padStart(2, "0")}`;
};

