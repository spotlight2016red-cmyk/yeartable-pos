// app/(pos)/pos/floor-map/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { TableConfig } from "@/components/pos/types";
import { generateUUID, generateLabel } from "@/components/pos/utils";
import { defaultTableConfigs } from "@/components/pos/constants";

type Order = {
  id: string;
  status: "open" | "closed";
  tableId: string;
  tableName: string;
  people: number;
  items: Array<{ id: number; name: string; price: number; qty: number }>;
  total: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

type TableStatus = {
  tableId: string;
  tableName: string;
  order: Order | null;
  status: "open" | "empty" | "closed";
};

const LS_KEYS = {
  tableConfigs: "table_configs",
  orders: "register_orders",
  currentFloor: "currentFloor",
} as const;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function nowISO() {
  return new Date().toISOString();
}

export default function FloorMapPage() {
  const router = useRouter();

  const [currentFloor, setCurrentFloor] = useState<string>("1F");

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingConfigs, setEditingConfigs] = useState<TableConfig[]>([]);
  const [originalConfigs, setOriginalConfigs] = useState<TableConfig[]>([]);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);

  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const [tableStatuses, setTableStatuses] = useState<TableStatus[]>([]);

  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [selectedTableLabel, setSelectedTableLabel] = useState<string>("");
  const [newOrderPeople, setNewOrderPeople] = useState(1);

  // 初期ロード
  useEffect(() => {
    const savedFloor = localStorage.getItem(LS_KEYS.currentFloor);
    if (savedFloor === "1F" || savedFloor === "2F") setCurrentFloor(savedFloor);

    const raw = localStorage.getItem(LS_KEYS.tableConfigs);
    if (raw) {
      const configs = safeJsonParse<any[]>(raw, []);
      const migrated: TableConfig[] = configs.map((c) => ({
        id: c.id || generateUUID(),
        label: c.label || c.name || "T-01",
        floorId: c.floorId || "1F",
        x: typeof c.x === "number" ? c.x : 6,
        y: typeof c.y === "number" ? c.y : 4,
      }));
      setEditingConfigs(migrated);
      setOriginalConfigs(JSON.parse(JSON.stringify(migrated)));
    } else {
      setEditingConfigs(defaultTableConfigs);
      setOriginalConfigs(JSON.parse(JSON.stringify(defaultTableConfigs)));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.currentFloor, currentFloor);
  }, [currentFloor]);

  const currentConfigs: TableConfig[] = useMemo(() => {
    return editingConfigs.length > 0 ? editingConfigs : defaultTableConfigs;
  }, [editingConfigs]);

  const floorConfigs = useMemo(() => {
    return currentConfigs.filter((c) => c.floorId === currentFloor);
  }, [currentConfigs, currentFloor]);

  /**
   * ✅ 重要：open伝票の tableId が古い/別形式のまま混ざってるので、
   * tableNameで拾えたopen伝票は config.id に正規化（migration）する。
   */
  const computeStatuses = () => {
    const orders = safeJsonParse<Order[]>(
      localStorage.getItem(LS_KEYS.orders),
      []
    );

    let didMigrate = false;
    const migratedOrders = [...orders];

    const statuses: TableStatus[] = floorConfigs.map((config) => {
      // まず tableId で open を探す（最優先）
      const openById = migratedOrders
        .filter((o) => o.status === "open" && o.tableId === config.id)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];

      if (openById) {
        return {
          tableId: config.id,
          tableName: config.label,
          order: openById,
          status: "open",
        };
      }

      // 互換：古いデータで tableName でしか一致しないopenを拾う
      const openByName = migratedOrders
        .filter((o) => o.status === "open" && o.tableName === config.label)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];

      if (openByName) {
        // ✅ migration：tableIdが違うなら config.id に寄せる
        if (openByName.tableId !== config.id) {
          const idx = migratedOrders.findIndex((o) => o.id === openByName.id);
          if (idx >= 0) {
            migratedOrders[idx] = {
              ...migratedOrders[idx],
              tableId: config.id,
              tableName: config.label,
              updatedAt: migratedOrders[idx].updatedAt || nowISO(),
            };
            didMigrate = true;
          }
        }

        // 返す表示用 order は「migration後のもの」を返す
        const after = migratedOrders.find((o) => o.id === openByName.id) || openByName;

        return {
          tableId: config.id,
          tableName: config.label,
          order: after,
          status: "open",
        };
      }

      const hasClosedById = migratedOrders.some(
        (o) => o.status === "closed" && o.tableId === config.id
      );
      const hasClosedByName = migratedOrders.some(
        (o) => o.status === "closed" && o.tableName === config.label
      );

      return {
        tableId: config.id,
        tableName: config.label,
        order: null,
        status: hasClosedById || hasClosedByName ? "closed" : "empty",
      };
    });

    // ✅ migrationが走ったら保存して全画面へ通知
    if (didMigrate) {
      localStorage.setItem(LS_KEYS.orders, JSON.stringify(migratedOrders));
      window.dispatchEvent(new Event("ordersUpdated"));
    }

    setTableStatuses(statuses);
  };

  // 初回 + 更新監視
  useEffect(() => {
    if (floorConfigs.length === 0) return;

    computeStatuses();

    if (isEditMode) return;

    const onOrdersUpdated = () => computeStatuses();
    const onTableConfigUpdated = () => computeStatuses();

    window.addEventListener("ordersUpdated", onOrdersUpdated);
    window.addEventListener("tableConfigUpdated", onTableConfigUpdated);

    // 念のため保険ポーリング
    const t = setInterval(computeStatuses, 3000);

    return () => {
      clearInterval(t);
      window.removeEventListener("ordersUpdated", onOrdersUpdated);
      window.removeEventListener("tableConfigUpdated", onTableConfigUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorConfigs, isEditMode, currentFloor]);

  const hasOpenOrder = (tableId: string, tableLabel: string): boolean => {
    const orders = safeJsonParse<Order[]>(
      localStorage.getItem(LS_KEYS.orders),
      []
    );
    return orders.some(
      (o) =>
        o.status === "open" &&
        (o.tableId === tableId || o.tableName === tableLabel)
    );
  };

  const startEdit = () => {
    setOriginalConfigs(JSON.parse(JSON.stringify(currentConfigs)));
    setIsEditMode(true);
  };

  const cancelEdit = () => {
    setEditingConfigs(JSON.parse(JSON.stringify(originalConfigs)));
    setEditingTableId(null);
    setIsEditMode(false);
  };

  const saveEdit = () => {
    if (editingTableId) {
      setEditingConfigs((prev) =>
        prev.map((c) =>
          c.id === editingTableId
            ? { ...c, label: editingLabel.trim() || c.label }
            : c
        )
      );
      setEditingTableId(null);
    }

    const configsToSave = currentConfigs.map(({ id, label, floorId, x, y }) => ({
      id,
      label,
      floorId,
      x,
      y,
    }));

    localStorage.setItem(LS_KEYS.tableConfigs, JSON.stringify(configsToSave));
    window.dispatchEvent(new Event("tableConfigUpdated"));

    setOriginalConfigs(JSON.parse(JSON.stringify(currentConfigs)));
    setIsEditMode(false);
  };

  const addTable = () => {
    const newLabel = generateLabel(currentConfigs, currentFloor);
    const newTable: TableConfig = {
      id: generateUUID(),
      label: newLabel,
      floorId: currentFloor,
      x: 6,
      y: 4,
    };
    setEditingConfigs((prev) => [...prev, newTable]);
  };

  const deleteTable = (tableId: string, tableLabel: string) => {
    if (hasOpenOrder(tableId, tableLabel)) {
      alert(
        `テーブル「${tableLabel}」には開いている伝票があります。\n伝票を確定してから削除してください。`
      );
      return;
    }
    if (!confirm(`テーブル「${tableLabel}」を削除しますか？`)) return;

    setEditingConfigs((prev) => prev.filter((c) => c.id !== tableId));
    if (editingTableId === tableId) setEditingTableId(null);
  };

  const onTapTable = (tableLabel: string, tableId: string) => {
    if (isEditMode) {
      setEditingTableId(tableId);
      const config = currentConfigs.find((c) => c.id === tableId);
      setEditingLabel(config?.label || "");
      return;
    }

    const status = tableStatuses.find(
      (s) => s.tableId === tableId || s.tableName === tableLabel
    );

    if (status?.order) {
      router.push(
        `/pos/cashier?table=${encodeURIComponent(
          tableLabel
        )}&tableId=${encodeURIComponent(tableId)}`
      );
      return;
    }

    setSelectedTableId(tableId);
    setSelectedTableLabel(tableLabel);
    setNewOrderPeople(1);
    setShowNewOrderModal(true);
  };

  const createNewOrder = () => {
    if (!selectedTableId || !selectedTableLabel) return;

    const id = `order_${Date.now()}`;
    const iso = nowISO();

    const newOrder: Order = {
      id,
      status: "open",
      tableId: selectedTableId,
      tableName: selectedTableLabel,
      people: newOrderPeople,
      items: [],
      total: 0,
      createdAt: iso,
      updatedAt: iso,
    };

    const orders = safeJsonParse<Order[]>(
      localStorage.getItem(LS_KEYS.orders),
      []
    );
    orders.push(newOrder);
    localStorage.setItem(LS_KEYS.orders, JSON.stringify(orders));
    window.dispatchEvent(new Event("ordersUpdated"));

    setShowNewOrderModal(false);

    router.push(
      `/pos/cashier?table=${encodeURIComponent(
        selectedTableLabel
      )}&tableId=${encodeURIComponent(selectedTableId)}`
    );
  };

  const dragStart = (
    e: React.MouseEvent | React.TouchEvent,
    tableId: string
  ) => {
    if (!isEditMode) return;
    e.preventDefault();
    setDraggingTableId(tableId);
  };

  const dragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditMode || !draggingTableId) return;
    e.preventDefault();

    const container = (e.currentTarget as HTMLElement).closest(
      "[data-floor-canvas='true']"
    ) as HTMLElement | null;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = ((clientX - rect.left) / rect.width) * 12;
    const y = ((clientY - rect.top) / rect.height) * 8;

    const snappedX = Math.max(0, Math.min(11, Math.round(x * 2) / 2));
    const snappedY = Math.max(0, Math.min(7, Math.round(y * 2) / 2));

    setEditingConfigs((prev) =>
      prev.map((c) =>
        c.id === draggingTableId ? { ...c, x: snappedX, y: snappedY } : c
      )
    );
  };

  const dragEnd = () => setDraggingTableId(null);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const statusClass = (s: TableStatus["status"]) => {
    switch (s) {
      case "open":
        return "bg-blue-100 border-blue-400 text-blue-900";
      case "closed":
        return "bg-gray-100 border-gray-300 text-gray-600";
      default:
        return "bg-white border-gray-200 text-gray-700";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20 lg:pb-4">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">
              テーブル配置図
              {isEditMode && (
                <span className="ml-2 text-base text-orange-600">
                  （編集モード）
                </span>
              )}
            </h1>

            <div className="flex gap-2">
              {!isEditMode ? (
                <>
                  <button
                    onClick={startEdit}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm text-white transition-all active:scale-95 lg:text-base lg:hover:bg-orange-700"
                  >
                    編集
                  </button>

                  <Link
                    href="/pos/tickets"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-all active:scale-95 lg:text-base lg:hover:bg-gray-50"
                  >
                    伝票一覧
                  </Link>

                  <Link
                    href="/pos/menu-edit"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-all active:scale-95 lg:text-base lg:hover:bg-gray-50"
                  >
                    メニュー
                  </Link>
                </>
              ) : (
                <>
                  <button
                    onClick={saveEdit}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white transition-all active:scale-95 lg:text-base lg:hover:bg-green-700"
                  >
                    決定
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-all active:scale-95 lg:text-base lg:hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mb-4 flex gap-2 rounded-lg bg-white p-2 shadow">
            {(["1F", "2F"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setCurrentFloor(f)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all lg:text-base ${
                  currentFloor === f
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 active:bg-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {isEditMode && (
            <div className="mb-4">
              <button
                onClick={addTable}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 lg:text-base lg:hover:bg-green-700"
              >
                + テーブルを追加（{currentFloor}）
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-4 rounded-lg bg-white p-4 shadow">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-blue-400 bg-blue-100" />
            <span className="text-sm text-gray-700">開いている伝票</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-gray-300 bg-white" />
            <span className="text-sm text-gray-700">空席</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border-2 border-gray-300 bg-gray-100" />
            <span className="text-sm text-gray-700">確定済み</span>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow lg:p-6">
          <div
            data-floor-canvas="true"
            className="relative mx-auto aspect-[3/2] max-w-4xl touch-none"
            onMouseMove={dragMove}
            onMouseUp={dragEnd}
            onMouseLeave={dragEnd}
            onTouchMove={dragMove}
            onTouchEnd={dragEnd}
          >
            <div className="absolute inset-0 grid grid-cols-12 grid-rows-8 gap-1">
              {Array.from({ length: 96 }).map((_, i) => (
                <div
                  key={i}
                  className={`border ${
                    isEditMode ? "border-gray-200" : "border-gray-100"
                  } bg-gray-50`}
                />
              ))}
            </div>

            {floorConfigs.map((config) => {
              const status = !isEditMode
                ? tableStatuses.find(
                    (s) =>
                      s.tableId === config.id || s.tableName === config.label
                  )
                : null;

              const order = status?.order;
              const isDragging = draggingTableId === config.id;
              const isEditingName = editingTableId === config.id;

              return (
                <div
                  key={config.id}
                  onMouseDown={(e) => dragStart(e, config.id)}
                  onTouchStart={(e) => dragStart(e, config.id)}
                  className={`absolute rounded-lg border-2 p-2 text-center transition-all ${
                    isEditMode
                      ? "cursor-move border-orange-400 bg-orange-50 select-none"
                      : "cursor-pointer active:scale-95"
                  } ${isDragging ? "z-50 opacity-80" : "z-10"} ${
                    !isEditMode && status
                      ? statusClass(status.status)
                      : isEditMode
                      ? "bg-orange-50 border-orange-400 text-orange-900"
                      : "bg-white border-gray-200 text-gray-700"
                  }`}
                  style={{
                    left: `${(config.x / 12) * 100}%`,
                    top: `${(config.y / 8) * 100}%`,
                    width: `${(2 / 12) * 100}%`,
                    height: `${(2 / 8) * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onClick={() => onTapTable(config.label, config.id)}
                >
                  {isEditingName ? (
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onBlur={() => {
                        setEditingConfigs((prev) =>
                          prev.map((c) =>
                            c.id === config.id
                              ? { ...c, label: editingLabel.trim() || c.label }
                              : c
                          )
                        );
                        setEditingTableId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setEditingConfigs((prev) =>
                            prev.map((c) =>
                              c.id === config.id
                                ? {
                                    ...c,
                                    label: editingLabel.trim() || c.label,
                                  }
                                : c
                            )
                          );
                          setEditingTableId(null);
                        }
                        if (e.key === "Escape") setEditingTableId(null);
                      }}
                      className="w-full rounded border-2 border-blue-500 bg-white px-1 text-center text-base font-bold focus:outline-none lg:text-lg"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="text-base font-bold lg:text-lg">
                          {config.label}
                        </div>
                        {isEditMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTable(config.id, config.label);
                            }}
                            className="ml-1 rounded bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white transition-all active:scale-95 lg:hover:bg-red-600"
                            title="削除"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {!isEditMode && order && status?.status === "open" && (
                        <div className="mt-1 space-y-0.5 text-xs">
                          <div className="font-semibold">
                            ¥{order.total.toLocaleString()}
                          </div>
                          <div className="text-[10px] opacity-80">
                            {order.people}名
                          </div>
                          <div className="text-[10px] opacity-60">
                            {formatTime(order.updatedAt)}
                          </div>
                        </div>
                      )}

                      {!isEditMode && status?.status === "closed" && (
                        <div className="mt-1 text-[10px] opacity-60">
                          確定済み
                        </div>
                      )}

                      {isEditMode && (
                        <div className="mt-1 text-[10px] opacity-60">
                          タップで名前編集
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              新規伝票作成
            </h2>

            <div className="mb-4">
              <div className="mb-2 text-sm text-gray-600">
                テーブル:{" "}
                <span className="font-semibold">{selectedTableLabel}</span>
              </div>

              <label className="mb-1 block text-sm font-medium text-gray-700">
                人数
              </label>
              <input
                type="number"
                value={newOrderPeople}
                onChange={(e) =>
                  setNewOrderPeople(parseInt(e.target.value, 10) || 1)
                }
                min={1}
                max={99}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewOrderModal(false);
                  setSelectedTableId("");
                  setSelectedTableLabel("");
                }}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-all active:scale-95 lg:hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={createNewOrder}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white transition-all active:scale-95 lg:hover:bg-blue-700"
              >
                開始
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
