// app/(pos)/pos/tickets/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

const LS_ORDERS = "register_orders";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function TicketsPage() {
  const sp = useSearchParams();
  const tableFilter = sp.get("table") ? decodeURIComponent(sp.get("table")!) : "";
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const load = () => {
      const data = safeJsonParse<Order[]>(localStorage.getItem(LS_ORDERS), []);
      // 更新が新しい順
      data.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setOrders(data);
    };
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, []);

  const openOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status === "open" && (!tableFilter || o.tableName === tableFilter)
    );
  }, [orders, tableFilter]);

  const closedOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status === "closed" && (!tableFilter || o.tableName === tableFilter)
    );
  }, [orders, tableFilter]);

  const list = tab === "open" ? openOrders : closedOrders;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const badge = (status: Order["status"]) => {
    return status === "open"
      ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-gray-100 text-gray-700 border-gray-200";
  };

  // ✅ 伝票カードタップ → cashierへ（席ラベルで渡す）
  const cashierHref = (o: Order) => {
    const q = o.tableName ? `?table=${encodeURIComponent(o.tableName)}` : "";
    return `/pos/cashier${q}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">伝票一覧</h1>

          {/* 戻る導線は必ず /pos（→floor-mapへリダイレクト） */}
          <Link
            href="/pos"
            className="rounded-lg bg-blue-600 px-5 py-2 text-white transition-all active:scale-95 hover:bg-blue-700"
          >
            配置図に戻る
          </Link>
        </div>

        {/* タブ */}
        <div className="mb-4 rounded-xl bg-white p-2 shadow">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("open")}
              className={`flex-1 rounded-lg py-3 text-sm font-semibold lg:text-base ${
                tab === "open" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              開いている伝票 ({openOrders.length})
            </button>
            <button
              onClick={() => setTab("closed")}
              className={`flex-1 rounded-lg py-3 text-sm font-semibold lg:text-base ${
                tab === "closed" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              確定済み ({closedOrders.length})
            </button>
          </div>
        </div>

        {tableFilter && (
          <div className="mb-4 text-sm text-gray-600">
            フィルタ: <span className="font-semibold">{tableFilter}</span>{" "}
            <Link href="/pos/tickets" className="ml-2 text-blue-600 underline">
              解除
            </Link>
          </div>
        )}

        {/* 一覧 */}
        <div className="rounded-xl bg-white p-6 shadow">
          {list.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              {tab === "open" ? "開いている伝票がありません" : "確定済みの伝票がありません"}
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((o) => (
                <Link
                  key={o.id}
                  href={cashierHref(o)}
                  className="block rounded-lg border border-gray-200 p-4 transition-all hover:bg-gray-50 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-gray-900">
                          {o.tableName || "（席なし）"}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badge(
                            o.status
                          )}`}
                        >
                          {o.status === "open" ? "OPEN" : "CLOSED"}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        {o.people}名 ・ {o.items?.length ?? 0}品
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold">
                        ¥{(o.total ?? 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        更新 {formatTime(o.updatedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-gray-500">ID: {o.id}</div>

                  <div className="mt-3 text-xs text-blue-600">
                    タップでメニュー追加へ →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          ※伝票カードをタップすると、その席のメニュー追加画面（cashier）へ移動します。
        </div>
      </div>
    </div>
  );
}
