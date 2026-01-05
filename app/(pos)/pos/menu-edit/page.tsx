// app/(pos)/pos/menu-edit/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type MenuItem = {
  id?: number | string;
  name: string;
  price: number;
  tag?: string;
};

type OrderItem = { id: number; name: string; price: number; qty: number };

type Order = {
  id: string;
  status: "open" | "closed";
  tableId: string;
  tableName: string;
  people: number;
  items: OrderItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

const LS_KEYS = {
  menuItems: "menuItems",
  menuTags: "menuTags",
  registerMenu: "register_menu",
  orders: "register_orders",
} as const;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function calcTotal(items: OrderItem[]) {
  return items.reduce((sum, it) => sum + it.price * it.qty, 0);
}

export default function MenuEditPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // 追加先の伝票（openのみ）
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // 伝票選択モーダル
  const [showOrderPicker, setShowOrderPicker] = useState(false);

  useEffect(() => {
    // ---- メニュー読み込み（既存キーを拾う）----
    const a = safeJsonParse<any[]>(localStorage.getItem(LS_KEYS.menuItems), []);
    const b = safeJsonParse<any[]>(
      localStorage.getItem(LS_KEYS.registerMenu),
      []
    );

    const merged = (a.length ? a : b).map((x) => ({
      id: x.id,
      name: x.name,
      price: Number(x.price) || 0,
      tag: x.tag,
    })) as MenuItem[];

    setItems(merged);

    const t = safeJsonParse<any[]>(localStorage.getItem(LS_KEYS.menuTags), []);
    setTags(
      t.map((x) => (typeof x === "string" ? x : x.name)).filter(Boolean)
    );

    // ---- 伝票読み込み（openのみ）----
    const loadOrders = () => {
      const all = safeJsonParse<Order[]>(
        localStorage.getItem(LS_KEYS.orders),
        []
      );
      const opens = all
        .filter((o) => o.status === "open")
        .sort(
          (x, y) =>
            new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime()
        );
      setOpenOrders(opens);

      // 選択中伝票が消えていたら解除
      if (selectedOrderId && !opens.some((o) => o.id === selectedOrderId)) {
        setSelectedOrderId(null);
      }
      // まだ未選択で open が1件だけなら自動選択（現場が楽）
      if (!selectedOrderId && opens.length === 1) {
        setSelectedOrderId(opens[0].id);
      }
    };

    loadOrders();
    const t2 = setInterval(loadOrders, 2000);
    return () => clearInterval(t2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedOrder = useMemo(() => {
    return openOrders.find((o) => o.id === selectedOrderId) || null;
  }, [openOrders, selectedOrderId]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const it of items) {
      const k = it.tag || "未分類";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  const addToSelectedOrder = (menu: MenuItem) => {
    if (!selectedOrderId) {
      setShowOrderPicker(true);
      return;
    }

    const all = safeJsonParse<Order[]>(
      localStorage.getItem(LS_KEYS.orders),
      []
    );

    const idx = all.findIndex((o) => o.id === selectedOrderId);
    if (idx === -1) {
      alert("追加先の伝票が見つかりませんでした。");
      setSelectedOrderId(null);
      return;
    }
    if (all[idx].status !== "open") {
      alert("この伝票は確定済みです。開いている伝票を選択してください。");
      return;
    }

    const nowISO = new Date().toISOString();
    const order = all[idx];

    const currentItems = Array.isArray(order.items) ? order.items : [];
    const hit = currentItems.find((x) => x.name === menu.name);

    const price = Number(menu.price) || 0;

    let nextItems: OrderItem[];
    if (hit) {
      nextItems = currentItems.map((x) =>
        x.name === menu.name ? { ...x, qty: x.qty + 1 } : x
      );
    } else {
      nextItems = [
        ...currentItems,
        { id: Date.now(), name: menu.name, price, qty: 1 },
      ];
    }

    const next: Order = {
      ...order,
      items: nextItems,
      total: calcTotal(nextItems),
      updatedAt: nowISO,
    };

    all[idx] = next;
    localStorage.setItem(LS_KEYS.orders, JSON.stringify(all));

    // 体感フィードバック（最小）
    // うるさくしたくないなら消してOK
    // eslint-disable-next-line no-console
    console.log(`[menu-edit] added "${menu.name}" to ${order.tableName}`);
  };

  const pickOrder = (id: string) => {
    setSelectedOrderId(id);
    setShowOrderPicker(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">メニュー</h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span className="rounded-full bg-white px-3 py-1 shadow">
                追加先:{" "}
                <span className="font-semibold">
                  {selectedOrder ? `${selectedOrder.tableName}（${selectedOrder.people}名）` : "未選択"}
                </span>
              </span>

              <button
                onClick={() => setShowOrderPicker(true)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 transition-all active:scale-95 hover:bg-gray-50"
              >
                伝票を選ぶ
              </button>

              {selectedOrder && (
                <Link
                  href={`/pos/tickets?table=${encodeURIComponent(
                    selectedOrder.tableName
                  )}`}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 transition-all active:scale-95 hover:bg-gray-50"
                >
                  この卓の伝票へ
                </Link>
              )}
            </div>
          </div>

          <Link
            href="/pos"
            className="rounded-lg bg-blue-600 px-5 py-2 text-white transition-all active:scale-95 hover:bg-blue-700"
          >
            配置図に戻る
          </Link>
        </div>

        <div className="mb-4 rounded-xl bg-white p-4 shadow">
          <div className="text-sm text-gray-700">
            タグ数: <span className="font-semibold">{tags.length}</span> /{" "}
            メニュー数: <span className="font-semibold">{items.length}</span> /{" "}
            開いている伝票:{" "}
            <span className="font-semibold">{openOrders.length}</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {tags.length === 0 ? (
              <span className="text-xs text-gray-500">タグなし</span>
            ) : (
              tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                >
                  {t}
                </span>
              ))
            )}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            ※メニューをクリックすると、選択中の伝票に1品追加されます（未選択なら伝票選択が出ます）
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow">
          {items.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              メニューが見つかりません（localStorageの menuItems / register_menu を確認）
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([tag, list]) => (
                <div key={tag}>
                  <div className="mb-2 text-lg font-bold text-gray-900">
                    {tag}
                  </div>

                  <div className="space-y-2">
                    {list.map((it, idx) => (
                      <button
                        key={`${it.id ?? "x"}-${idx}`}
                        onClick={() => addToSelectedOrder(it)}
                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-all active:scale-[0.99] hover:bg-gray-50"
                      >
                        <div className="font-semibold text-gray-900">
                          {it.name}
                        </div>
                        <div className="font-bold">
                          ¥{it.price.toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          ※ここは安定化フェーズ：編集UIは後で。いまは「既存伝票へ追加」を最短で通しています。
        </div>
      </div>

      {/* 伝票選択モーダル */}
      {showOrderPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 text-lg font-bold text-gray-900">
              追加先の伝票を選択
            </div>

            {openOrders.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                開いている伝票がありません。<br />
                先に席の図で「新規伝票」を作成してください。
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-auto">
                {openOrders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => pickOrder(o.id)}
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-900">
                        {o.tableName} <span className="text-sm text-gray-500">（{o.people}名）</span>
                      </div>
                      <div className="font-bold">
                        ¥{(o.total ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      items: {(o.items?.length ?? 0)} / id: {o.id}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowOrderPicker(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                閉じる
              </button>
              <Link
                href="/pos"
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-center font-bold text-white hover:bg-blue-700"
                onClick={() => setShowOrderPicker(false)}
              >
                席の図へ
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
