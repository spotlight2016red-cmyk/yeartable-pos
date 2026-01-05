// app/(pos)/pos/menu-edit/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type MenuItem = {
  id: number;
  name: string;
  price: number;
  tags: string[]; // cashier側の複数タグに寄せる
  isActive?: boolean;
};

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

function formatYen(n: number) {
  return `¥${(Number(n) || 0).toLocaleString()}`;
}

function normalizeToMenuItem(x: any, fallbackId: number): MenuItem {
  const id = Number(x?.id ?? fallbackId);
  const name = String(x?.name ?? "");
  const price = Number(x?.price ?? 0);

  // 互換：tag（単数）/ tags（複数）
  const tags: string[] = Array.isArray(x?.tags)
    ? x.tags.filter(Boolean).map(String)
    : x?.tag
    ? [String(x.tag)]
    : [];

  const isActive =
    typeof x?.isActive === "boolean" ? x.isActive : x?.isActive ?? true;

  return { id, name, price, tags, isActive };
}

function dedupe(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

export default function MenuEditPage() {
  const router = useRouter();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [showTicketModal, setShowTicketModal] = useState(false);

  // ✅ 編集モード
  const [isEditMode, setIsEditMode] = useState(false);

  // ✅ メニュー編集モーダル
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editTagsText, setEditTagsText] = useState(""); // カンマ区切り入力

  // 表示上の「追加先」状態（未選択/選択中）
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // ---- localStorage 保存（互換のため両方に書く） ----
  const saveMenuToLocalStorage = (next: MenuItem[], nextTags?: string[]) => {
    const normalized = next.map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price,
      tags: m.tags,
      tag: m.tags?.[0] ?? "", // 旧互換
      isActive: m.isActive !== false,
    }));

    // どっちを読んでも同じ内容になるように両方更新
    localStorage.setItem(LS_KEYS.menuItems, JSON.stringify(normalized));
    localStorage.setItem(LS_KEYS.registerMenu, JSON.stringify(normalized));

    // tagsも更新する
    const t = nextTags ?? dedupe([...(tags ?? []), ...next.flatMap((m) => m.tags)]);
    localStorage.setItem(LS_KEYS.menuTags, JSON.stringify(t));
    setTags(t);

    // 他画面へ通知（あれば反応する）
    window.dispatchEvent(new Event("menuUpdated"));
  };

  useEffect(() => {
    // ---- メニュー読み込み（どれが使われてても拾う） ----
    const a = safeJsonParse<any[]>(localStorage.getItem(LS_KEYS.menuItems), []);
    const b = safeJsonParse<any[]>(
      localStorage.getItem(LS_KEYS.registerMenu),
      []
    );

    const raw = a.length ? a : b;
    const base = raw.map((x, i) => normalizeToMenuItem(x, i + 1));
    const activeOnly = base.filter((m) => m.isActive !== false);
    setItems(activeOnly);

    // ---- タグ読み込み ----
    const t = safeJsonParse<any[]>(localStorage.getItem(LS_KEYS.menuTags), []);
    const tagList = dedupe(
      t.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean)
    );
    // メニュー側にあるタグも取り込んでおく
    const fromItems = dedupe(activeOnly.flatMap((m) => m.tags));
    setTags(dedupe([...tagList, ...fromItems]));

    // ---- 伝票読み込み ----
    const o = safeJsonParse<Order[]>(localStorage.getItem(LS_KEYS.orders), []);
    setOrders(o);

    // 監視（他画面で追加/更新されたら追従）
    const onOrdersUpdated = () => {
      const next = safeJsonParse<Order[]>(
        localStorage.getItem(LS_KEYS.orders),
        []
      );
      setOrders(next);
    };
    window.addEventListener("ordersUpdated", onOrdersUpdated);

    const onMenuUpdated = () => {
      const na = safeJsonParse<any[]>(
        localStorage.getItem(LS_KEYS.menuItems),
        []
      );
      const nb = safeJsonParse<any[]>(
        localStorage.getItem(LS_KEYS.registerMenu),
        []
      );
      const nraw = na.length ? na : nb;
      const nbase = nraw.map((x, i) => normalizeToMenuItem(x, i + 1));
      const nactive = nbase.filter((m) => m.isActive !== false);
      setItems(nactive);

      const nt = safeJsonParse<any[]>(
        localStorage.getItem(LS_KEYS.menuTags),
        []
      );
      const ntagList = dedupe(
        nt.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean)
      );
      const nfromItems = dedupe(nactive.flatMap((m) => m.tags));
      setTags(dedupe([...ntagList, ...nfromItems]));
    };
    window.addEventListener("menuUpdated", onMenuUpdated);

    return () => {
      window.removeEventListener("ordersUpdated", onOrdersUpdated);
      window.removeEventListener("menuUpdated", onMenuUpdated);
    };
  }, []);

  const openOrders = useMemo(() => {
    return [...orders]
      .filter((o) => o.status === "open")
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [orders]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const it of items) {
      const mainTag = it.tags?.[0] ?? "未分類";
      if (!map.has(mainTag)) map.set(mainTag, []);
      map.get(mainTag)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  // ✅ 伝票を選んだら cashier に飛ぶ
  const jumpToCashier = (order: Order) => {
    setSelectedOrder(order);
    setShowTicketModal(false);

    const tableId = order.tableId || order.tableName;
    const table = order.tableName || "";

    router.push(
      `/pos/cashier?tableId=${encodeURIComponent(tableId)}&table=${encodeURIComponent(
        table
      )}`
    );
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditPrice(Number(item.price) || 0);
    setEditTagsText((item.tags ?? []).join(", "));
    setShowItemModal(true);
  };

  const saveEditItem = () => {
    if (editingItemId == null) return;

    const nextName = editName.trim();
    if (!nextName) {
      alert("メニュー名は必須です");
      return;
    }

    const nextTags = dedupe(
      editTagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const nextItems = items.map((m) =>
      m.id === editingItemId
        ? { ...m, name: nextName, price: Number(editPrice) || 0, tags: nextTags }
        : m
    );

    setItems(nextItems);
    saveMenuToLocalStorage(nextItems, dedupe([...tags, ...nextTags]));

    setShowItemModal(false);
    setEditingItemId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        {/* ヘッダー */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">メニュー</h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                追加先:{" "}
                <span className="font-semibold">
                  {selectedOrder ? selectedOrder.tableName : "未選択"}
                </span>
              </span>

              {/* ✅ 主役ボタン：大きく */}
              <button
                onClick={() => setShowTicketModal(true)}
                className="rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-blue-700"
              >
                伝票を選ぶ
              </button>

              {/* 編集モード */}
              <button
                onClick={() => setIsEditMode((v) => !v)}
                className={`rounded-xl px-4 py-3 text-base font-bold shadow-sm transition-all active:scale-95 ${
                  isEditMode
                    ? "bg-orange-600 text-white hover:bg-orange-700"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title="メニューの名前・値段・タグを編集"
              >
                {isEditMode ? "編集モードON" : "編集モード"}
              </button>
            </div>
          </div>

          <Link
            href="/pos"
            className="self-start rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all active:scale-95 hover:bg-gray-50 lg:self-auto"
          >
            配置図に戻る
          </Link>
        </div>

        {/* 概要 */}
        <div className="mb-4 rounded-xl bg-white p-4 shadow">
          <div className="text-sm text-gray-700">
            タグ数: <span className="font-semibold">{tags.length}</span> / メニュー数:{" "}
            <span className="font-semibold">{items.length}</span> / 開いている伝票:{" "}
            <span className="font-semibold">{openOrders.length}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
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
            ※「伝票を選ぶ」→ 伝票をクリックすると、そのまま会計（追加）画面に移動します。
            {isEditMode && " / 編集モード中：各メニューの右側の「編集」から変更できます。"}
          </div>
        </div>

        {/* メニュー一覧 */}
        <div className="rounded-xl bg-white p-6 shadow">
          {items.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              メニューが見つかりません（localStorageの menuItems / register_menu を確認）
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([tag, list]) => (
                <div key={tag}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-lg font-bold text-gray-900">{tag}</div>
                    <div className="text-xs text-gray-500">
                      {list.length} 件
                    </div>
                  </div>

                  <div className="space-y-2">
                    {list.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">
                            {it.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            タグ:{" "}
                            {(it.tags?.length ? it.tags : ["未分類"]).join(" / ")}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-lg font-bold">
                            {formatYen(it.price)}
                          </div>

                          {isEditMode && (
                            <button
                              onClick={() => openEditItem(it)}
                              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white transition-all active:scale-95 hover:bg-black"
                            >
                              編集
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 伝票選択モーダル */}
        {showTicketModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 text-lg font-bold text-gray-900">
                追加先の伝票を選択
              </div>

              {openOrders.length === 0 ? (
                <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-600">
                  開いている伝票がありません
                </div>
              ) : (
                <div className="space-y-2">
                  {openOrders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => jumpToCashier(o)}
                      className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-all active:scale-[0.99] hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-gray-900">
                          {o.tableName}（{o.people}名）
                        </div>
                        <div className="font-bold text-gray-900">
                          {formatYen(o.total)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        items: {o.items?.length ?? 0} / id: {o.id}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setShowTicketModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-all active:scale-95 hover:bg-gray-50"
                >
                  閉じる
                </button>
                <Link
                  href="/pos"
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-center font-bold text-white transition-all active:scale-95 hover:bg-blue-700"
                >
                  席の図へ
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* メニュー編集モーダル */}
        {showItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 text-lg font-bold text-gray-900">
                メニュー編集
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    メニュー名
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    値段（円）
                  </label>
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value) || 0)}
                    min={0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    表示: {formatYen(editPrice)}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    タグ（カンマ区切り / 複数OK）
                  </label>
                  <input
                    value={editTagsText}
                    onChange={(e) => setEditTagsText(e.target.value)}
                    placeholder="例）おすすめ, ビール"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.slice(0, 20).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          const current = dedupe(
                            editTagsText
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          );
                          const next = current.includes(t)
                            ? current
                            : [...current, t];
                          setEditTagsText(next.join(", "));
                        }}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                        title="クリックで追加"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    まずは“簡単に運用できる方式”として、入力でタグを増やせます（保存時にタグ一覧にも反映）。
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setShowItemModal(false);
                    setEditingItemId(null);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-all active:scale-95 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveEditItem}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white transition-all active:scale-95 hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
