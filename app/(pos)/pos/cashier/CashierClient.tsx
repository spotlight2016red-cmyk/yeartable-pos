// app/(pos)/pos/cashier/CashierClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type MenuItemRow = {
  id: string;
  shop_id: string;
  name: string;
  price: number;
  is_active: boolean;
  menu_item_tags?: Array<{
    tag: { name: string } | null;
  }>;
};

type TicketRow = {
  id: string;
  shop_id: string;
  table_id: string | null;
  status: string; // open/closed
  opened_at: string;
  closed_at: string | null;
};

type TicketItemRow = {
  id: string;
  ticket_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  price_snapshot: number;
  qty: number;
  created_at: string;
};

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

function safeTag(main?: string) {
  return main && main.trim() ? main : "その他";
}

// localStorage のキー（“今の店” を固定するため）
const LS_KEYS = {
  shopId: "pos_active_shop_id",
} as const;

export default function CashierClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const table = sp.get("table") ?? "";
  const tableId = sp.get("tableId") ?? ""; // floor_tables.id

  // ===== Shop =====
  const [shopId, setShopId] = useState<string>("");

  // ===== Menu =====
  const [menu, setMenu] = useState<MenuItemRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // ===== Ticket =====
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [ticketItems, setTicketItems] = useState<TicketItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ===== UI =====
  const [toast, setToast] = useState<string>("");

  // --------------------------------
  // 0) Toast auto clear
  // --------------------------------
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  // --------------------------------
  // 1) shopId を確定（王道：ログインユーザーの所属ショップ）
  //    - localStorage に一度保存して、以後は固定
  // --------------------------------
  useEffect(() => {
    const boot = async () => {
      setLoading(true);

      // 1) localStorage 優先
      const cached = typeof window !== "undefined" ? localStorage.getItem(LS_KEYS.shopId) : null;
      if (cached) {
        setShopId(cached);
        setLoading(false);
        return;
      }

      // 2) Supabase auth session
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // ログインが必要な設計なら /login に飛ばす
        //（既にログイン済みならここは通らない）
        router.replace("/login");
        return;
      }

      // 3) shop_members から最初の shop_id を取る
      const { data: memberRow, error } = await supabase
        .from("shop_members")
        .select("shop_id")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(error);
        setToast("shop_members 取得エラー");
        setLoading(false);
        return;
      }

      const sid = memberRow?.shop_id as string | undefined;
      if (!sid) {
        setToast("所属ショップがありません（shop_members）");
        setLoading(false);
        return;
      }

      localStorage.setItem(LS_KEYS.shopId, sid);
      setShopId(sid);
      setLoading(false);
    };

    boot();
  }, [router]);

  // --------------------------------
  // 2) メニューを取得
  // --------------------------------
  useEffect(() => {
    if (!shopId) return;

    const loadMenu = async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(
          `
          id, shop_id, name, price, is_active,
          menu_item_tags (
            tag:menu_tags ( name )
          )
        `
        )
        .eq("shop_id", shopId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        setToast("メニュー取得エラー");
        return;
      }

      // データを正しい型に変換
      const transformedData: MenuItemRow[] = (data ?? []).map((item: any) => ({
        id: item.id,
        shop_id: item.shop_id,
        name: item.name,
        price: item.price,
        is_active: item.is_active,
        menu_item_tags: item.menu_item_tags?.map((mit: any) => ({
          tag: Array.isArray(mit.tag) ? mit.tag[0] : mit.tag,
        })) || [],
      }));

      setMenu(transformedData);
    };

    loadMenu();
  }, [shopId]);

  // --------------------------------
  // 3) テーブルの open ticket を取得（なければ null）
  // --------------------------------
  useEffect(() => {
    if (!shopId) return;

    const loadTicketAndItems = async () => {
      // tableId が無い (= 単発会計など) の場合は ticket を持たない
      if (!tableId) {
        setTicket(null);
        setTicketItems([]);
        return;
      }

      // open ticket を探す
      const { data: t, error: tErr } = await supabase
        .from("tickets")
        .select("id, shop_id, table_id, status, opened_at, closed_at")
        .eq("shop_id", shopId)
        .eq("table_id", tableId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tErr) {
        console.error(tErr);
        setToast("伝票取得エラー");
        return;
      }

      const ticketRow = (t ?? null) as TicketRow | null;
      setTicket(ticketRow);

      if (!ticketRow) {
        setTicketItems([]);
        return;
      }

      // items
      const { data: items, error: iErr } = await supabase
        .from("ticket_items")
        .select("id, ticket_id, menu_item_id, name_snapshot, price_snapshot, qty, created_at")
        .eq("shop_id", shopId)
        .eq("ticket_id", ticketRow.id)
        .order("created_at", { ascending: true });

      if (iErr) {
        console.error(iErr);
        setToast("伝票明細取得エラー");
        return;
      }

      setTicketItems((items ?? []) as TicketItemRow[]);
    };

    loadTicketAndItems();

    // 3秒ごとに軽く同期（“既存オーダーが残っている感覚” を出す）
    const interval = setInterval(loadTicketAndItems, 3000);
    return () => clearInterval(interval);
  }, [shopId, tableId]);

  // --------------------------------
  // 4) 検索・グルーピング
  // --------------------------------
  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return menu;
    return menu.filter((m) => (m.name ?? "").toLowerCase().includes(q));
  }, [menu, searchQuery]);

  const menuGrouped = useMemo(() => {
    const map = new Map<string, MenuItemRow[]>();
    for (const it of filteredMenu) {
      const mainTag = it.menu_item_tags?.[0]?.tag?.name ?? "その他";
      const k = safeTag(mainTag);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }, [filteredMenu]);

  // --------------------------------
  // 5) 合計（ticketItems）
  // --------------------------------
  const total = useMemo(() => {
    return ticketItems.reduce((sum, it) => sum + it.price_snapshot * it.qty, 0);
  }, [ticketItems]);

  // --------------------------------
  // 6) ticket が無ければ作る（テーブル用）
  // --------------------------------
  const ensureOpenTicket = async (): Promise<TicketRow | null> => {
    if (!shopId || !tableId) return null;
    if (ticket) return ticket;

    // create
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        shop_id: shopId,
        table_id: tableId,
        status: "open",
      })
      .select("id, shop_id, table_id, status, opened_at, closed_at")
      .single();

    if (error) {
      console.error(error);
      setToast("伝票作成エラー");
      return null;
    }

    const created = data as TicketRow;
    setTicket(created);
    setTicketItems([]);
    return created;
  };

  // --------------------------------
  // 7) メニュー追加（ticket_items に insert / 既存は qty+1）
  // --------------------------------
  const addMenuToTicket = async (m: MenuItemRow) => {
    if (!tableId) {
      setToast("tableId がありません（URL）");
      return;
    }

    setSaving(true);
    try {
      const t = await ensureOpenTicket();
      if (!t) return;

      // 既存行があれば qty+1、なければ insert
      const found = ticketItems.find((x) => x.menu_item_id === m.id);
      if (found) {
        const { error } = await supabase
          .from("ticket_items")
          .update({ qty: found.qty + 1 })
          .eq("shop_id", shopId)
          .eq("id", found.id);

        if (error) {
          console.error(error);
          setToast("数量更新エラー");
          return;
        }

        setTicketItems((prev) =>
          prev.map((x) => (x.id === found.id ? { ...x, qty: x.qty + 1 } : x))
        );
        setToast("追加しました");
        return;
      }

      const { data, error } = await supabase
        .from("ticket_items")
        .insert({
          shop_id: shopId,
          ticket_id: t.id,
          menu_item_id: m.id,
          name_snapshot: m.name,
          price_snapshot: m.price,
          qty: 1,
        })
        .select("id, ticket_id, menu_item_id, name_snapshot, price_snapshot, qty, created_at")
        .single();

      if (error) {
        console.error(error);
        setToast("追加エラー");
        return;
      }

      setTicketItems((prev) => [...prev, data as TicketItemRow]);
      setToast("追加しました");
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------
  // 8) qty 変更
  // --------------------------------
  const changeQty = async (rowId: string, delta: number) => {
    const row = ticketItems.find((x) => x.id === rowId);
    if (!row) return;

    const next = row.qty + delta;
    if (next <= 0) {
      // delete
      setSaving(true);
      try {
        const { error } = await supabase
          .from("ticket_items")
          .delete()
          .eq("shop_id", shopId)
          .eq("id", rowId);

        if (error) {
          console.error(error);
          setToast("削除エラー");
          return;
        }

        setTicketItems((prev) => prev.filter((x) => x.id !== rowId));
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("ticket_items")
        .update({ qty: next })
        .eq("shop_id", shopId)
        .eq("id", rowId);

      if (error) {
        console.error(error);
        setToast("更新エラー");
        return;
      }

      setTicketItems((prev) => prev.map((x) => (x.id === rowId ? { ...x, qty: next } : x)));
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------
  // 9) 会計確定（ticket close）
  // --------------------------------
  const closeTicket = async () => {
    if (!ticket) {
      setToast("伝票がありません");
      return;
    }
    if (ticketItems.length === 0) {
      setToast("明細が空です");
      return;
    }
    if (!confirm(`会計確定します。\n合計: ${yen(total)}`)) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tickets")
        .update({ status: "closed", closed_at: now })
        .eq("shop_id", shopId)
        .eq("id", ticket.id);

      if (error) {
        console.error(error);
        setToast("確定エラー");
        return;
      }

      setToast("会計確定しました");
      // 画面上は open でなくなるので、再読込
      setTicket(null);
      setTicketItems([]);
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------
  // UI
  // --------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-lg bg-white p-4 shadow">読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-4">
      {/* 上部固定バー */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-6xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-gray-500">レジ</div>
              <div className="text-base font-bold text-gray-900">
                {table ? `テーブル: ${table}` : "単発会計（tableなし）"}
              </div>
              <div className="text-[11px] text-gray-500">shopId: {shopId || "-"}</div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="料理名で検索..."
                className="w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />

              <Link
                href="/pos"
                className="rounded-lg border border-gray-300 bg白 px-4 py-2 text-sm text-gray-700 transition-all active:scale-95"
              >
                配置図へ
              </Link>

              <Link
                href="/pos/tickets"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-all active:scale-95"
              >
                伝票一覧
              </Link>
            </div>
          </div>

          {toast && (
            <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {toast}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* メニュー（左） */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800 lg:text-xl">メニュー</h2>
              {saving && <div className="text-sm text-gray-500">更新中...</div>}
            </div>

            {menuGrouped.length === 0 ? (
              <div className="rounded-lg bg-white p-8 text-center text-gray-500 shadow">
                メニューがありません（menu_items）
              </div>
            ) : (
              <div className="space-y-6">
                {menuGrouped.map(([tag, items]) => (
                  <div key={tag} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-base font-bold text-gray-900">{tag}</div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                      {items.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => addMenuToTicket(m)}
                          disabled={!tableId || saving}
                          className="flex min-h-[92px] flex-col items-center justify-center rounded-lg bg-gray-50 p-4 transition-all active:scale-95 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 lg:hover:bg-gray-100"
                          title={!tableId ? "tableId が無いので追加できません" : ""}
                        >
                          <div className="text-base font-semibold text-gray-900 lg:text-lg">
                            {m.name}
                          </div>
                          <div className="mt-1 text-xl font-bold text-blue-600 lg:mt-2 lg:text-2xl">
                            {yen(m.price)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 伝票（右） */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-lg bg-white p-5 shadow-lg">
              <div className="mb-2">
                <div className="text-xs text-gray-500">現在の伝票</div>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold text-gray-900">
                    {ticket ? "OPEN" : "未作成"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {ticket ? `ticket: ${ticket.id.slice(0, 8)}...` : ""}
                  </div>
                </div>
              </div>

              {!tableId && (
                <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                  URLに tableId がないため、テーブル注文として追加できません。
                  （配置図から入ると tableId が付与されます）
                </div>
              )}

              {ticketItems.length === 0 ? (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">
                  明細が空です（ここに“既存オーダーが残る感覚”を出すなら、まずは追加してみて）
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {ticketItems.map((it) => (
                    <div key={it.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-900">
                            {it.name_snapshot}
                          </div>
                          <div className="text-xs text-gray-500">
                            {yen(it.price_snapshot)} × {it.qty}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => changeQty(it.id, -1)}
                            disabled={saving}
                            className="h-8 w-8 rounded bg-gray-200 text-gray-700 transition-all active:bg-gray-300 disabled:opacity-50"
                          >
                            −
                          </button>
                          <div className="w-6 text-center font-bold">{it.qty}</div>
                          <button
                            onClick={() => changeQty(it.id, +1)}
                            disabled={saving}
                            className="h-8 w-8 rounded bg-gray-200 text-gray-700 transition-all active:bg-gray-300 disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 text-right text-sm font-bold text-blue-600">
                        小計: {yen(it.price_snapshot * it.qty)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">合計</div>
                  <div className="text-2xl font-bold text-blue-600">{yen(total)}</div>
                </div>

                <button
                  onClick={closeTicket}
                  disabled={!ticket || ticketItems.length === 0 || saving}
                  className="mt-3 w-full rounded-lg bg-blue-600 py-3 text-lg font-bold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  会計確定
                </button>

                <div className="mt-2 text-[11px] text-gray-500">
                  ※会計確定すると tickets.status が closed になります（履歴で確認）
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 下部：状態メモ（デバッグ） */}
        <div className="mt-6 text-xs text-gray-400">
          table: {table || "-"} / tableId: {tableId || "-"} / ticket:{" "}
          {ticket?.id || "-"} / items: {ticketItems.length}
        </div>
      </div>
    </div>
  );
}
