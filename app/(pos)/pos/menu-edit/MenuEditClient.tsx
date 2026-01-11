"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Shop = {
  id: string;
  name: string;
};

type MenuItem = {
  id: string;
  shop_id: string;
  name: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const LS_SELECTED_SHOP_KEY = "pos_selected_shop_id";

export default function MenuEditClient() {
  const [loading, setLoading] = useState(true);

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");

  const [items, setItems] = useState<MenuItem[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  // 追加フォーム
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState<number>(0);

  // 編集（行単位）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState<number>(0);

  const visibleItems = useMemo(() => {
    return showInactive ? items : items.filter((x) => x.is_active);
  }, [items, showInactive]);

  useEffect(() => {
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    setLoading(true);

    // 1) ログイン確認
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) console.error(userErr);

    if (!user) {
      setLoading(false);
      alert("未ログインです。先にログインしてください（RLSでデータが見えません）。");
      return;
    }

    // 2) 所属shop一覧取得（shop_members → shops join）
    // Supabaseのリレーションが効いていればこれで取れます
    const { data: memberships, error: mErr } = await supabase
      .from("shop_members")
      .select("shop:shops(id,name)")
      .eq("user_id", user.id);

    if (mErr) {
      console.error(mErr);
      alert("shop一覧の取得に失敗。RLS/リレーション設定を確認してください。");
      setLoading(false);
      return;
    }

    const shopList: Shop[] =
      (memberships ?? [])
        .map((m: any) => m.shop)
        .filter(Boolean) as Shop[];

    setShops(shopList);

    // 3) 選択shop（localStorageに“選択だけ”保存。メニューデータは保存しない）
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_SELECTED_SHOP_KEY) : null;
    const initial =
      (saved && shopList.some((s) => s.id === saved) && saved) ||
      (shopList[0]?.id ?? "");

    setSelectedShopId(initial);

    if (initial) {
      await reloadMenuItems(initial);
    }

    setLoading(false);
  }

  async function reloadMenuItems(shopId: string) {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      alert("menu_items の取得に失敗しました。RLS/ENV/ログイン状態を確認してください。");
      return;
    }

    setItems((data ?? []) as MenuItem[]);
  }

  async function onChangeShop(id: string) {
    setSelectedShopId(id);
    localStorage.setItem(LS_SELECTED_SHOP_KEY, id);
    await reloadMenuItems(id);
  }

  async function addMenuItem() {
    if (!selectedShopId) return;
    const name = newName.trim();
    if (!name) return alert("名前が空です");
    if (!Number.isFinite(newPrice)) return alert("価格が不正です");

    const { error } = await supabase.from("menu_items").insert({
      shop_id: selectedShopId,
      name,
      price: Math.max(0, Math.floor(newPrice)),
      is_active: true,
    });

    if (error) {
      console.error(error);
      alert("追加に失敗しました（RLS/入力値）。");
      return;
    }

    setNewName("");
    setNewPrice(0);
    await reloadMenuItems(selectedShopId);
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(item.price);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPrice(0);
  }

  async function saveEdit() {
    if (!selectedShopId || !editingId) return;
    const name = editName.trim();
    if (!name) return alert("名前が空です");
    if (!Number.isFinite(editPrice)) return alert("価格が不正です");

    const { error } = await supabase
      .from("menu_items")
      .update({
        name,
        price: Math.max(0, Math.floor(editPrice)),
      })
      .eq("id", editingId)
      .eq("shop_id", selectedShopId);

    if (error) {
      console.error(error);
      alert("更新に失敗しました（RLS/対象行）。");
      return;
    }

    cancelEdit();
    await reloadMenuItems(selectedShopId);
  }

  async function setActive(itemId: string, active: boolean) {
    if (!selectedShopId) return;

    const { error } = await supabase
      .from("menu_items")
      .update({ is_active: active })
      .eq("id", itemId)
      .eq("shop_id", selectedShopId);

    if (error) {
      console.error(error);
      alert("有効/無効の切替に失敗しました。");
      return;
    }

    await reloadMenuItems(selectedShopId);
  }

  async function seedSample() {
    // “涙の手入力”回避：とりあえず動作確認用のサンプル一括投入
    if (!selectedShopId) return;

    const sample = [
      { name: "生ビール", price: 550 },
      { name: "ハイボール", price: 500 },
      { name: "唐揚げ", price: 650 },
      { name: "枝豆", price: 350 },
    ];

    const { error } = await supabase.from("menu_items").insert(
      sample.map((s) => ({
        shop_id: selectedShopId,
        name: s.name,
        price: s.price,
        is_active: true,
      }))
    );

    if (error) {
      console.error(error);
      alert("サンプル投入に失敗しました。");
      return;
    }

    await reloadMenuItems(selectedShopId);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">メニュー</h1>
            <div className="mt-1 text-sm text-gray-600">
              Supabase版（localStorageの menuItems / register_menu 依存ゼロ）
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/pos"
              className="rounded-lg bg-white px-4 py-2 text-sm shadow hover:bg-gray-50"
            >
              配置図に戻る
            </Link>
          </div>
        </div>

        {/* Shop selector */}
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-gray-700">店舗</div>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={selectedShopId}
              onChange={(e) => onChangeShop(e.target.value)}
              disabled={loading || shops.length === 0}
            >
              {shops.length === 0 ? (
                <option value="">（所属店舗がありません）</option>
              ) : (
                shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>

            <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              無効メニューも表示
            </label>

            <button
              onClick={() => selectedShopId && reloadMenuItems(selectedShopId)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              disabled={!selectedShopId || loading}
            >
              再読み込み
            </button>
          </div>

          {shops.length === 0 && !loading && (
            <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">
              <div className="font-semibold">所属店舗が0件です</div>
              <div className="mt-1">
                shops と shop_members にデータが入っているか、RLSポリシーで弾かれていないか確認してね。
              </div>
            </div>
          )}
        </div>

        {/* Add new */}
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="text-xs font-semibold text-gray-600">メニュー名</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例：生ビール"
                disabled={!selectedShopId}
              />
            </div>

            <div className="w-[160px]">
              <div className="text-xs font-semibold text-gray-600">価格</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(Number(e.target.value))}
                placeholder="550"
                disabled={!selectedShopId}
              />
            </div>

            <button
              onClick={addMenuItem}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              disabled={!selectedShopId}
            >
              追加
            </button>

            <button
              onClick={seedSample}
              className="rounded-lg bg-white px-4 py-2 text-sm shadow hover:bg-gray-50 disabled:opacity-50"
              disabled={!selectedShopId}
              title="動作確認用のサンプルを一括投入"
            >
              サンプル投入
            </button>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            ※ 今後CSVインポートも追加できる（でも今日はまず“動く王道”優先）
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              メニュー数: <span className="font-semibold">{visibleItems.length}</span>
              {" / "}
              全体: <span className="font-semibold">{items.length}</span>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">読み込み中...</div>
          ) : !selectedShopId ? (
            <div className="text-sm text-gray-500">店舗が選択されていません</div>
          ) : visibleItems.length === 0 ? (
            <div className="text-sm text-gray-500">
              メニューがありません（追加してください）
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-600">
                    <th className="py-2">名前</th>
                    <th className="py-2 w-[120px]">価格</th>
                    <th className="py-2 w-[120px]">状態</th>
                    <th className="py-2 w-[260px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it) => {
                    const isEditing = editingId === it.id;

                    return (
                      <tr key={it.id} className="border-b">
                        <td className="py-2">
                          {isEditing ? (
                            <input
                              className="w-full rounded border px-2 py-1"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          ) : (
                            <div className={it.is_active ? "" : "text-gray-400 line-through"}>
                              {it.name}
                            </div>
                          )}
                        </td>

                        <td className="py-2">
                          {isEditing ? (
                            <input
                              className="w-full rounded border px-2 py-1"
                              type="number"
                              value={editPrice}
                              onChange={(e) => setEditPrice(Number(e.target.value))}
                            />
                          ) : (
                            <div className={it.is_active ? "" : "text-gray-400"}>
                              ¥{Number(it.price).toLocaleString("ja-JP")}
                            </div>
                          )}
                        </td>

                        <td className="py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                              it.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {it.is_active ? "有効" : "無効"}
                          </span>
                        </td>

                        <td className="py-2">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={saveEdit}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:opacity-90"
                              >
                                保存
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-lg bg-white px-3 py-1.5 shadow hover:bg-gray-50"
                              >
                                キャンセル
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => startEdit(it)}
                                className="rounded-lg bg-white px-3 py-1.5 shadow hover:bg-gray-50"
                              >
                                編集
                              </button>

                              {it.is_active ? (
                                <button
                                  onClick={() => setActive(it.id, false)}
                                  className="rounded-lg bg-white px-3 py-1.5 shadow hover:bg-gray-50"
                                >
                                  無効化
                                </button>
                              ) : (
                                <button
                                  onClick={() => setActive(it.id, true)}
                                  className="rounded-lg bg-white px-3 py-1.5 shadow hover:bg-gray-50"
                                >
                                  有効化
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Debug */}
        <div className="rounded-xl bg-white p-4 text-xs text-gray-600 shadow">
          <div className="font-semibold">デバッグ</div>
          <div className="mt-2">
            selectedShopId: <span className="font-mono">{selectedShopId || "(none)"}</span>
          </div>
          <div>
            shops: <span className="font-mono">{shops.length}</span> / items:{" "}
            <span className="font-mono">{items.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
