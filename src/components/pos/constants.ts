// POS関連の定数

import { TableConfig } from "./types";
import { generateUUID } from "./utils";

// 固定テーブル配置（v1、互換性のため）
// 関数として定義して、実行時に生成する（SSR対応）
export const getDefaultTableConfigs = (): TableConfig[] => {
  try {
    return [
      // 1F
      { id: generateUUID(), label: "A1", floorId: "1F", x: 1, y: 1, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "A2", floorId: "1F", x: 3, y: 1, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "A3", floorId: "1F", x: 5, y: 1, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "B1", floorId: "1F", x: 1, y: 3, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "B2", floorId: "1F", x: 3, y: 3, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "B3", floorId: "1F", x: 5, y: 3, type: "table", width: 2, height: 2, rotation: 0 },
      // 2F
      { id: generateUUID(), label: "C1", floorId: "2F", x: 1, y: 1, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "C2", floorId: "2F", x: 3, y: 1, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "D1", floorId: "2F", x: 1, y: 3, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "D2", floorId: "2F", x: 3, y: 3, type: "table", width: 2, height: 2, rotation: 0 },
      { id: generateUUID(), label: "D3", floorId: "2F", x: 5, y: 3, type: "table", width: 2, height: 2, rotation: 0 },
    ];
  } catch (e) {
    console.error("[constants] Error generating defaultTableConfigs:", e);
    return [];
  }
};

// 後方互換性のため、定数としてもエクスポート（使用しないことを推奨）
// SSR時は空配列を返すが、実際の使用時は getDefaultTableConfigs() を使用すること
export const defaultTableConfigs: TableConfig[] = [];

