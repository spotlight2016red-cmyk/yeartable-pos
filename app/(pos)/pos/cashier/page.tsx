"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type MenuItem = {
  id: number;
  name: string;
  price: number;
  isActive: boolean;
  tags?: string[]; // 例: ["おすすめ", "一品"]
};

type CartItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
};

type TableConfig = {
  id: string;
  label: string;
  floorId: string;
  x: number;
  y: number;
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

type PaymentMethod = "cash" | "card" | "other";

const LS = {
  menuItems: "menuItems",
  orders: "register_orders",
  tableConfigs: "table_configs",
} as const;

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function calcTotal(items: CartItem[]) {
  return items.reduce((sum, it) => sum + it.price * it.qty, 0);
}

export default function CashierPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // URL: /pos/cashier?tableId=xxx&table=T-02 も /pos/cashier?table=T-02 も拾う
  const tableIdParam = sp.get("tableId") ? decodeURIComponent(sp.get("tableId")!) : "";
  const tableNameParam = sp.get("table") ? decodeURIComponent(sp.get("table")!) : "";
  const hasTableContext = Boolean(tableIdParam || tableNameParam);

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // 伝票（既存）+ 追加分（今回タップ）を分けて見せたいので、stateを分割
  const [baseOrder, setBaseOrder] = useState<Order | null>(null);
  const [addCart, setAddCart] = useState<CartItem[]>([]);

  // checkout
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");

  // debounce save
  const saveTimer = useRef<number | null>(null);
  const didInit = useRef(false);

  // ---- load menu
  useEffect(() => {
    const saved = localStorage.getItem(LS.menuItems);
    const list = safeJsonParse<MenuItem[]>(saved, []);
    const migrated = list.map((x) => ({ ...x, tags: x.tags || [] }));
    setMenu(migrated.filter((x) => x.isActive));
  }, []);

  // ---- load base order (open)
  useEffect(() => {
    const load = () => {
      const orders = safeJsonParse<Order[]>(localStorage.getItem(LS.orders), []);
      // まず tableId で探す。無ければ tableName で探す（過去互換）
      const found =
        (tableIdParam
          ? orders.find((o) => o.status === "open" && o.tableId === tableIdParam)
          : undefined) ||
        (tableNameParam
          ? orders
              .filter((o) => o.status === "open" && o.tableName === tableNameParam)
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
          : undefined) ||
        null;

      setBaseOrder(found);

      // ここ重要：初回ロード時は「追加分カート」は空にする（既存は上に表示）
      setAddCart([]);
    };

    load();
    // floor-map から戻ってきた時などに即追従したい
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableIdParam, tableNameParam]);

  // ---- derived: base items, base total
  const baseItems: CartItem[] = useMemo(() => {
    if (!baseOrder) return [];
    return baseOrder.items.map((x) => ({ id: x.id, name: x.name, price: x.price, qty: x.qty }));
  }, [baseOrder]);

  const baseTotal = useMemo(() => calcTotal(baseItems), [baseItems]);
  const addTotal = useMemo(() => calcTotal(addCart), [addCart]);
  const grandTotal = baseTotal + addTotal;

  // ---- filtered menu
  const filteredMenu = useMemo(() => {
    if (!searchQuery.trim()) return menu;
    const q = searchQuery.toLowerCase();
    return menu.filter((it) => it.name.toLowerCase().includes(q));
  }, [menu, searchQuery]);

  // ---- group menu by main tag
  const menuGrouped = useMemo(() => {
    const by: Record<string, MenuItem[]> = {};
    for (const it of filteredMenu) {
      const tag = it.tags && it.tags.length > 0 ? it.tags[0] : "その他";
      if (!by[tag]) by[tag] = [];
      by[tag].push(it);
    }
    return Object.keys(by).sort().map((k) => [k, by[k]] as const);
  }, [filteredMenu]);

  // ---- save additions into register_orders (open order) immediately (debounced)
  const scheduleSave = (nextAddCart: CartItem[]) => {
    if (!hasTableContext) return; // 単発会計だけの時は保存しない（会計確定でclosed保存）
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(() => {
      const now = new Date().toISOString();

      const orders = safeJsonParse<Order[]>(localStorage.getItem(LS.orders), []);

      // target order: baseOrder があればそれ。無ければ新規に作る（tableName だけ来たケース等）
      let target = baseOrder
        ? orders.find((o) => o.id === baseOrder.id) || null
        : null;

      if (!target) {
        // tableId が空の時、table_configs から引いて補完する
        const configs = safeJsonParse<TableConfig[]>(localStorage.getItem(LS.tableConfigs), []);
        const cfg =
          (tableIdParam ? configs.find((c) => c.id === tableIdParam) : undefined) ||
          (tableNameParam ? configs.find((c) => c.label === tableNameParam) : undefined);

        const resolvedTableId = tableIdParam || cfg?.id || `table_${Date.now()}`;
        const resolvedTableName = tableNameParam || cfg?.label || "未設定";

        target = {
          id: `order_${Date.now()}`,
          status: "open",
          tableId: resolvedTableId,
          tableName: resolvedTableName,
          people: 1,
          items: [],
          total: 0,
          createdAt: now,
          updatedAt: now,
        };
        orders.push(target);
      }

      // merge: base(target.items) + nextAddCart
      const merged = [...target.items.map((x) => ({ ...x }))];

      for (const add of nextAddCart) {
        const idx = merged.findIndex((x) => x.id === add.id);
        if (idx >= 0) merged[idx].qty += add.qty;
        else merged.push({ id: add.id, name: add.name, price: add.price, qty: add.qty });
      }

      const newTotal = merged.reduce((s, x) => s + x.price * x.qty, 0);

      const updatedOrders = orders.map((o) =>
        o.id === target!.id
          ? {
              ...o,
              items: merged,
              total: newTotal,
              updatedAt: now,
            }
          : o
      );

      localStorage.setItem(LS.orders, JSON.stringify(updatedOrders));
      window.dispatchEvent(new Event("ordersUpdated"));

      // UI側：baseOrder を追従させ、追加分は“保存済み”としてクリア
      const newBase = updatedOrders.find((o) => o.id === target!.id) || null;
      setBaseOrder(newBase);
      setAddCart([]);
    }, 350);
  };

  // 初回レンダリング直後の addCart 空 を保存しない（事故防止）
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      return;
    }
    // addCartが増減したら即保存予約
    scheduleSave(addCart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addCart]);

  // ---- cart ops (addCart only)
  const addToCart = (item: MenuItem) => {
    setAddCart((prev) => {
      const ex = prev.find((x) => x.id === item.id);
      if (ex) return prev.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x));
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const updateCartQty = (itemId: number, delta: number) => {
    setAddCart((prev) =>
      prev
        .map((x) => {
          if (x.id !== itemId) return x;
          const q = x.qty + delta;
          if (q <= 0) return null;
          return { ...x, qty: q };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const removeFromCart = (itemId: number) => {
    setAddCart((prev) => prev.filter((x) => x.id !== itemId));
  };

  const clearAddCart = () => {
    if (addCart.length === 0) return;
    if (confirm("追加分カートをクリアしますか？")) setAddCart([]);
  };

  // ---- back (0円事故防止：新規で空なら伝票削除)
  const handleBack = () => {
    if (!hasTableContext) {
      router.push("/pos");
      return;
    }

    // 保存待ちがあれば先に反映させる
    if (addCart.length > 0) {
      scheduleSave(addCart);
    } else {
      // addCartが空の時、baseOrderが存在し total=0 かつ items=0 なら削除
      if (baseOrder && baseOrder.status === "open" && baseOrder.total === 0 && baseOrder.items.length === 0) {
        const orders = safeJsonParse<Order[]>(localStorage.getItem(LS.orders), []);
        const next = orders.filter((o) => o.id !== baseOrder.id);
        localStorage.setItem(LS.orders, JSON.stringify(next));
        window.dispatchEvent(new Event("ordersUpdated"));
      }
    }

    router.push("/pos");
  };

  // ---- checkout modal
  const goCheckout = () => {
    setShowCheckout(true);
    setPaymentMethod("cash");
    setCashReceived("");
  };

  const change = useMemo(() => {
    if (paymentMethod !== "cash") return 0;
    const received = parseInt(cashReceived || "0", 10) || 0;
    return Math.max(0, received - grandTotal);
  }, [paymentMethod, cashReceived, grandTotal]);

  const confirmPayment = () => {
    if (grandTotal <= 0) return;

    if (paymentMethod === "cash") {
      const received = parseInt(cashReceived || "0", 10) || 0;
      if (received < grandTotal) {
        alert(`受取金額が不足しています。\n合計: ¥${grandTotal.toLocaleString()}\n受取: ¥${received.toLocaleString()}`);
        return;
      }
    }

    const now = new Date().toISOString();
    const methodText = { cash: "現金", card: "カード", other: "その他" }[paymentMethod];

    // テーブル文脈があるなら、そのopen伝票を closed にする（会計確定）
    if (hasTableContext) {
      const orders = safeJsonParse<Order[]>(localStorage.getItem(LS.orders), []);
      // 現在の baseOrder を対象（念のため tableId/name でも探索）
      const target =
        (baseOrder ? orders.find((o) => o.id === baseOrder.id) : undefined) ||
        (tableIdParam ? orders.find((o) => o.status === "open" && o.tableId === tableIdParam) : undefined) ||
        (tableNameParam ? orders.find((o) => o.status === "open" && o.tableName === tableNameParam) : undefined);

      if (target) {
        const updated = orders.map((o) =>
          o.id === target.id
            ? { ...o, status: "closed", closedAt: now, updatedAt: now, total: o.total }
            : o
        );
        localStorage.setItem(LS.orders, JSON.stringify(updated));
        window.dispatchEvent(new Event("ordersUpdated"));
      }
    } else {
      // 単発会計（既存ベース無し）: addCart を closed で保存
      const orders = safeJsonParse<Order[]>(localStorage.getItem(LS.orders), []);
      const standalone: Order = {
        id: `order_${Date.now()}`,
        status: "closed",
        tableId: "",
        tableName: "単発会計",
        people: 1,
        items: addCart.map((x) => ({ id: x.id, name: x.name, price: x.price, qty: x.qty })),
        total: addTotal,
        createdAt: now,
        updatedAt: now,
        closedAt: now,
      };
      orders.push(standalone);
      localStorage.setItem(LS.orders, JSON.stringify(orders));
      window.dispatchEvent(new Event("ordersUpdated"));
    }

    setShowCheckout(false);
    setAddCart([]);
    setSearchQuery("");

    alert(
      `決済完了！\n支払い方法: ${methodText}\n合計: ¥${grandTotal.toLocaleString()}${
        paymentMethod === "cash"
          ? `\n受取: ¥${(parseInt(cashReceived || "0", 10) || 0).toLocaleString()}\nお釣り: ¥${change.toLocaleString()}`
          : ""
      }`
    );

    router.push("/pos");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-4">
      {/* top bar */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-6xl p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="料理名で検索..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
            <button
              onClick={handleBack}
              className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all active:bg-gray-50"
            >
              戻る
            </button>
          </div>

          {hasTableContext && (
            <div className="mt-2 text-sm text-gray-600">
              追加先: <span className="font-semibold text-blue-700">{tableNameParam || baseOrder?.tableName || "未設定"}</span>{" "}
              <span className="ml-2 text-xs text-gray-500">
                （既存伝票は右カート上段に表示、追加分は下に加算されます）
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* menu */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-gray-800 lg:text-xl">メニュー</h2>

            {filteredMenu.length === 0 ? (
              <div className="rounded-lg bg-white p-8 text-center text-gray-500">
                {searchQuery ? "検索結果が見つかりません" : "メニューがありません"}
              </div>
            ) : (
              <div className="space-y-6">
                {menuGrouped.map(([tag, items]) => (
                  <div key={tag} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-3 text-base font-semibold text-gray-800 lg:text-lg">{tag}</h3>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => addToCart(item)}
                          className="flex min-h-[100px] flex-col items-center justify-center rounded-lg bg-gray-50 p-4 transition-all active:scale-95 active:bg-gray-100 lg:h-32 lg:hover:bg-gray-100"
                        >
                          <div className="text-base font-semibold text-gray-900 lg:text-lg">{item.name}</div>
                          <div className="mt-1 text-xl font-bold text-blue-600 lg:mt-2 lg:text-2xl">
                            ¥{item.price.toLocaleString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* cart */}
          <div className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-20 rounded-lg bg-white p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">カート</h2>
                {addCart.length > 0 && (
                  <button onClick={clearAddCart} className="text-sm text-red-600 transition-all active:text-red-700">
                    追加分クリア
                  </button>
                )}
              </div>

              {/* base order summary */}
              {hasTableContext && baseItems.length > 0 && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-blue-800">
                    <span>現在の伝票</span>
                    <span className="text-xs font-bold">{(tableNameParam || baseOrder?.tableName || "").trim()} / {baseOrder?.people ?? 0}名</span>
                  </div>
                  <div className="space-y-1">
                    {baseItems.slice(0, 5).map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-sm text-blue-900">
                        <div className="truncate">
                          {it.name} <span className="text-xs text-blue-700">¥{it.price.toLocaleString()} × {it.qty}</span>
                        </div>
                        <div className="font-bold">¥{(it.price * it.qty).toLocaleString()}</div>
                      </div>
                    ))}
                    {baseItems.length > 5 && (
                      <div className="text-xs text-blue-700 opacity-80">…他 {baseItems.length - 5} 件</div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2 text-sm font-bold text-blue-900">
                    <span>小計（既存）</span>
                    <span>¥{baseTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* add cart */}
              {addCart.length === 0 ? (
                <p className="py-4 text-center text-gray-500">
                  {hasTableContext && baseItems.length > 0 ? "追加分カートは空です" : "カートは空です"}
                  {hasTableContext && baseItems.length > 0 && (
                    <span className="block text-xs text-gray-400 mt-1">（既存伝票は上に表示中）</span>
                  )}
                </p>
              ) : (
                <div className="mb-4 max-h-[360px] space-y-2 overflow-y-auto">
                  {addCart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded bg-gray-50 p-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-600">¥{item.price.toLocaleString()} × {item.qty}</div>
                        <div className="mt-1 text-sm font-semibold text-blue-600">
                          小計: ¥{(item.price * item.qty).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          className="h-8 w-8 rounded bg-gray-200 text-gray-700 transition-all active:bg-gray-300"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-semibold">{item.qty}</span>
                        <button
                          onClick={() => updateCartQty(item.id, 1)}
                          className="h-8 w-8 rounded bg-gray-200 text-gray-700 transition-all active:bg-gray-300"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="ml-2 h-8 w-8 rounded bg-red-100 text-red-600 transition-all active:bg-red-200"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-4 border-t-2 border-gray-400 pt-4">
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold text-gray-900">合計</span>
                  <span className="text-4xl font-bold text-blue-600">¥{grandTotal.toLocaleString()}</span>
                </div>
                {hasTableContext && (
                  <div className="mt-1 text-xs text-gray-500">
                    既存: ¥{baseTotal.toLocaleString()} ＋ 追加: ¥{addTotal.toLocaleString()}
                  </div>
                )}
              </div>

              <button
                onClick={goCheckout}
                disabled={grandTotal <= 0}
                className="w-full rounded-lg bg-blue-600 py-4 text-xl font-bold text-white transition-all active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                会計へ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* checkout modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">会計</h2>

            <div className="mb-4 rounded-lg bg-gray-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">合計</h3>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900">合計</span>
                <span className="text-3xl font-bold text-blue-600">¥{grandTotal.toLocaleString()}</span>
              </div>
              {hasTableContext && (
                <div className="mt-1 text-xs text-gray-500">
                  既存: ¥{baseTotal.toLocaleString()} ＋ 追加: ¥{addTotal.toLocaleString()}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">支払い方法</label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "card", "other"] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    onClick={() => {
                      setPaymentMethod(method);
                      if (method !== "cash") setCashReceived("");
                    }}
                    className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                      paymentMethod === method
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-700 active:bg-gray-50"
                    }`}
                  >
                    {method === "cash" ? "現金" : method === "card" ? "カード" : "その他"}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === "cash" && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">受取金額</label>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="金額を入力"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
                {cashReceived && (
                  <div className="mt-2 text-right">
                    <div className="text-sm text-gray-600">お釣り</div>
                    <div className="text-2xl font-bold text-green-600">¥{change.toLocaleString()}</div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowCheckout(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 transition-all active:scale-95"
              >
                キャンセル
              </button>
              <button
                onClick={confirmPayment}
                disabled={paymentMethod === "cash" && ((parseInt(cashReceived || "0", 10) || 0) < grandTotal)}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-bold text-white transition-all active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                支払い確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* mobile bottom summary（最低限） */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-2xl lg:hidden">
        <div className="mx-auto max-w-md p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-600">合計</div>
              <div className="text-2xl font-bold text-blue-600">¥{grandTotal.toLocaleString()}</div>
              {hasTableContext && (
                <div className="text-[11px] text-gray-500 mt-0.5">
                  既存: ¥{baseTotal.toLocaleString()} / 追加: ¥{addTotal.toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {addCart.length > 0 && (
                <button
                  onClick={clearAddCart}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 active:bg-gray-50"
                >
                  追加クリア
                </button>
              )}
              <button
                onClick={goCheckout}
                disabled={grandTotal <= 0}
                className="rounded-lg bg-blue-600 px-6 py-3 text-lg font-bold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                会計へ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
