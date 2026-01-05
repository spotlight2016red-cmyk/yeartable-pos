"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type MenuItem = {
  id: number;
  name: string;
  price: number;
  isActive: boolean;
  tags?: string[]; // タグ（例: ["サラダ", "一品"]）
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
  items: Array<{
    id: number;
    name: string;
    price: number;
    qty: number;
  }>;
  total: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

type PaymentMethod = "cash" | "card" | "other";

export default function CashierPage() {
  const router = useRouter();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTableName, setSelectedTableName] = useState<string>("");
  const [checkoutMode, setCheckoutMode] = useState<"standalone" | "table">("standalone");
  const [showTableSelect, setShowTableSelect] = useState(false);
  const [tableConfigs, setTableConfigs] = useState<TableConfig[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [miniMapFloor, setMiniMapFloor] = useState<string>("1F");

  // メニューを読み込み
  useEffect(() => {
    const savedMenu = localStorage.getItem("menuItems");
    if (savedMenu) {
      try {
        const menuData: MenuItem[] = JSON.parse(savedMenu);
        const activeMenu = menuData.filter((item) => item.isActive);
        setMenu(activeMenu);
      } catch (e) {
        console.error("メニュー読み込みエラー:", e);
      }
    }

    // メニュー更新イベントをリッスン
    const handleMenuUpdate = () => {
      const savedMenu = localStorage.getItem("menuItems");
      if (savedMenu) {
        try {
          const menuData: MenuItem[] = JSON.parse(savedMenu);
          // マイグレーション: tagsがない場合は空配列を設定
          const migratedMenu = menuData.map((item) => ({
            ...item,
            tags: item.tags || [],
          }));
          const activeMenu = migratedMenu.filter((item) => item.isActive);
          setMenu(activeMenu);
        } catch (e) {
          console.error("メニュー更新エラー:", e);
        }
      }
    };

    window.addEventListener("menuUpdated", handleMenuUpdate);
    return () => {
      window.removeEventListener("menuUpdated", handleMenuUpdate);
    };
  }, []);

  // テーブル設定と注文データを読み込み
  useEffect(() => {
    const loadTableConfigs = () => {
      const savedConfigs = localStorage.getItem("table_configs");
      if (savedConfigs) {
        try {
          const configs: TableConfig[] = JSON.parse(savedConfigs);
          setTableConfigs(configs);
        } catch (e) {
          console.error("Failed to load table configs:", e);
        }
      }
    };

    const loadOrders = () => {
      const ordersData = localStorage.getItem("register_orders");
      if (ordersData) {
        try {
          const ordersList: Order[] = JSON.parse(ordersData);
          setOrders(ordersList);
        } catch (e) {
          console.error("Failed to load orders:", e);
        }
      }
    };

    loadTableConfigs();
    loadOrders();

    const interval = setInterval(() => {
      loadOrders();
    }, 5000);

    const handleTableConfigUpdate = () => {
      loadTableConfigs();
    };
    window.addEventListener("tableConfigUpdated", handleTableConfigUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("tableConfigUpdated", handleTableConfigUpdate);
    };
  }, []);

  // 検索でフィルタリング
  const filteredMenu = useMemo(() => {
    if (!searchQuery.trim()) return menu;
    const query = searchQuery.toLowerCase();
    return menu.filter((item) => item.name.toLowerCase().includes(query));
  }, [menu, searchQuery]);

  // 合計金額を計算
  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  // 商品をカートに追加
  const addToCart = (item: MenuItem) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
      if (existingItem) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, qty: cartItem.qty + 1 }
            : cartItem
        );
      } else {
        return [
          ...prevCart,
          { id: item.id, name: item.name, price: item.price, qty: 1 },
        ];
      }
    });
  };

  // カートの数量を変更
  const updateCartQuantity = (itemId: number, delta: number) => {
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.qty + delta;
            if (newQty <= 0) return null;
            return { ...item, qty: newQty };
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  // カートから削除
  const removeFromCart = (itemId: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  // 会計画面へ
  const goToCheckout = () => {
    if (cart.length === 0) return;
    setShowCheckout(true);
    setCashReceived("");
    setPaymentMethod("cash");
  };

  // お釣りを計算
  const change = useMemo(() => {
    if (paymentMethod !== "cash" || !cashReceived) return 0;
    const received = parseInt(cashReceived, 10) || 0;
    return Math.max(0, received - total);
  }, [paymentMethod, cashReceived, total]);

  // 支払い確定
  const confirmPayment = () => {
    if (cart.length === 0) return;

    // 現金の場合、受取金額のバリデーション
    if (paymentMethod === "cash") {
      const received = parseInt(cashReceived, 10) || 0;
      if (received < total) {
        alert(`受取金額が不足しています。\n合計: ¥${total.toLocaleString()}\n受取: ¥${received.toLocaleString()}`);
        return;
      }
    }

    const now = new Date().toISOString();
    const timestamp = now;

    if (checkoutMode === "table" && selectedTableId) {
      // テーブルに追加する場合
      const ordersData = localStorage.getItem("register_orders");
      const orders: Order[] = ordersData ? JSON.parse(ordersData) : [];
      
      const existingOrder = orders.find(
        (o) => o.tableId === selectedTableId && o.status === "open"
      );

      if (existingOrder) {
        // 既存の注文に追加
        const mergedItems = [...existingOrder.items];
        cart.forEach((cartItem) => {
          const existingIndex = mergedItems.findIndex((item) => item.id === cartItem.id);
          if (existingIndex >= 0) {
            mergedItems[existingIndex] = {
              ...mergedItems[existingIndex],
              qty: mergedItems[existingIndex].qty + cartItem.qty,
            };
          } else {
            mergedItems.push({
              id: cartItem.id,
              name: cartItem.name,
              price: cartItem.price,
              qty: cartItem.qty,
            });
          }
        });

        const newTotal = mergedItems.reduce(
          (sum, item) => sum + item.price * item.qty,
          0
        );

        const updatedOrders = orders.map((o) =>
          o.id === existingOrder.id
            ? {
                ...o,
                items: mergedItems,
                total: newTotal,
                updatedAt: now,
              }
            : o
        );

        localStorage.setItem("register_orders", JSON.stringify(updatedOrders));
        window.dispatchEvent(new Event("ordersUpdated"));
      } else {
        // 新規注文を作成
        const tableConfig = tableConfigs.find((c) => c.id === selectedTableId);
        const tableName = tableConfig?.label || selectedTableName || "未設定";

        const newOrder: Order = {
          id: `order_${Date.now()}`,
          status: "open",
          tableId: selectedTableId,
          tableName: tableName,
          people: 1,
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            qty: item.qty,
          })),
          total: total,
          createdAt: now,
          updatedAt: now,
        };

        orders.push(newOrder);
        localStorage.setItem("register_orders", JSON.stringify(orders));
        window.dispatchEvent(new Event("ordersUpdated"));
      }
    } else {
      // テーブルなし単発会計（register_ordersにclosed状態で保存）
      const ordersData = localStorage.getItem("register_orders");
      const orders: Order[] = ordersData ? JSON.parse(ordersData) : [];

      const standaloneOrder: Order = {
        id: `order_${Date.now()}`,
        status: "closed",
        tableId: "",
        tableName: "単発会計",
        people: 1,
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          qty: item.qty,
        })),
        total: total,
        createdAt: now,
        updatedAt: now,
        closedAt: now,
      };

      orders.push(standaloneOrder);
      localStorage.setItem("register_orders", JSON.stringify(orders));
      window.dispatchEvent(new Event("ordersUpdated"));
    }

    // カートをクリア
    setCart([]);
    setSearchQuery("");
    setShowCheckout(false);
    setCheckoutMode("standalone");
    setSelectedTableId(null);
    setSelectedTableName("");

    // 成功メッセージ
    const methodText = {
      cash: "現金",
      card: "カード",
      other: "その他",
    }[paymentMethod];

    alert(
      `決済完了！\n支払い方法: ${methodText}\n合計: ¥${total.toLocaleString()}${
        paymentMethod === "cash" ? `\n受取: ¥${parseInt(cashReceived, 10).toLocaleString()}\nお釣り: ¥${change.toLocaleString()}` : ""
      }`
    );
  };

  // カートをクリア
  const clearCart = () => {
    if (cart.length === 0) return;
    if (confirm("カートをクリアしますか？")) {
      setCart([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-4">
      {/* 検索バー（最上部固定） */}
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
            <Link
              href="/pos"
              className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all active:bg-gray-50"
            >
              戻る
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* メニューエリア */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-gray-800 lg:text-xl">
              メニュー
            </h2>
            {filteredMenu.length === 0 ? (
              <div className="rounded-lg bg-white p-8 text-center text-gray-500">
                {searchQuery ? "検索結果が見つかりません" : "メニューがありません"}
              </div>
            ) : (
              // タグごとにセクション表示
              (() => {
                // メインタグ（tags[0]）でグループ化
                const menuByTag = filteredMenu.reduce((acc, item) => {
                  const mainTag = item.tags && item.tags.length > 0 ? item.tags[0] : "その他";
                  if (!acc[mainTag]) {
                    acc[mainTag] = [];
                  }
                  acc[mainTag].push(item);
                  return acc;
                }, {} as Record<string, typeof filteredMenu>);

                // タグの順序を決定（アルファベット順）
                const allTags = Object.keys(menuByTag).sort();

                return (
                  <div className="space-y-6">
                    {allTags.map((tag) => {
                      const items = menuByTag[tag] || [];
                      if (items.length === 0) return null;

                      return (
                        <div
                          key={tag}
                          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                        >
                          <h3 className="mb-3 text-base font-semibold text-gray-800 lg:text-lg">
                            {tag}
                          </h3>
                          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                            {items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => addToCart(item)}
                                className="flex min-h-[100px] flex-col items-center justify-center rounded-lg bg-gray-50 p-4 transition-all active:scale-95 active:bg-gray-100 lg:h-32 lg:hover:bg-gray-100"
                              >
                                <div className="text-base font-semibold text-gray-900 lg:text-lg">
                                  {item.name}
                                </div>
                                <div className="mt-1 text-xl font-bold text-blue-600 lg:mt-2 lg:text-2xl">
                                  ¥{item.price.toLocaleString()}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* カートエリア（PC用） */}
          <div className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-20 rounded-lg bg-white p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">カート</h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-sm text-red-600 transition-all active:text-red-700"
                  >
                    クリア
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <p className="py-8 text-center text-gray-500">カートは空です</p>
              ) : (
                <>
                  <div className="mb-4 max-h-[400px] space-y-2 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded bg-gray-50 p-3"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {item.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            ¥{item.price.toLocaleString()} × {item.qty}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-blue-600">
                            小計: ¥{(item.price * item.qty).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartQuantity(item.id, -1)}
                            className="h-8 w-8 rounded bg-gray-200 text-gray-700 transition-all active:bg-gray-300"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-semibold">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => updateCartQuantity(item.id, 1)}
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

                  <div className="mb-4 border-t-2 border-gray-400 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-gray-900">合計</span>
                      <span className="text-4xl font-bold text-blue-600">
                        ¥{total.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={goToCheckout}
                    className="w-full rounded-lg bg-blue-600 py-4 text-xl font-bold text-white transition-all active:scale-95 active:bg-blue-700"
                  >
                    会計へ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* スマホ用: 下部固定カート */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-2xl lg:hidden">
        <div className="mx-auto max-w-md p-4">
          {cart.length > 0 && (
            <div className="mb-3 max-h-[200px] space-y-2 overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.id}
                    className="flex items-center justify-between rounded bg-gray-50 p-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {item.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        ¥{item.price.toLocaleString()} × {item.qty} = ¥{(item.price * item.qty).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateCartQuantity(item.id, -1)}
                        className="h-7 w-7 rounded bg-gray-200 text-gray-700 active:bg-gray-300"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.id, 1)}
                        className="h-7 w-7 rounded bg-gray-200 text-gray-700 active:bg-gray-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-600">合計</div>
              <div className="text-2xl font-bold text-blue-600">
                ¥{total.toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 active:bg-gray-50"
                >
                  クリア
                </button>
              )}
              <button
                onClick={goToCheckout}
                disabled={cart.length === 0}
                className="rounded-lg bg-blue-600 px-6 py-3 text-lg font-bold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                会計へ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 会計画面モーダル */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">会計</h2>

            {/* 注文内容 */}
            <div className="mb-4 rounded-lg bg-gray-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">注文内容</h3>
              <div className="space-y-1">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm text-gray-700"
                  >
                    <span>
                      {item.name} × {item.qty}
                    </span>
                    <span>¥{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2">
                <span className="text-lg font-semibold text-gray-900">合計</span>
                <span className="text-3xl font-bold text-blue-600">
                  ¥{total.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 支払い方法選択 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                支払い方法
              </label>
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

            {/* 現金の場合：受取金額入力 */}
            {paymentMethod === "cash" && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  受取金額
                </label>
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
                    <div className={`text-2xl font-bold ${
                      change >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      ¥{change.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 出口選択 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                会計方法
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setCheckoutMode("standalone");
                    setSelectedTableId(null);
                    setShowTableSelect(false);
                  }}
                  className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                    checkoutMode === "standalone"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 active:bg-gray-50"
                  }`}
                >
                  単発会計
                </button>
                <button
                  onClick={() => {
                    setCheckoutMode("table");
                    setShowTableSelect(true);
                  }}
                  className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                    checkoutMode === "table"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 active:bg-gray-50"
                  }`}
                >
                  テーブルに追加
                </button>
              </div>
            </div>

            {/* テーブル選択（ミニ配置図） */}
            {checkoutMode === "table" && showTableSelect && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">テーブルを選択</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-gray-300 bg-white">
                      <button
                        onClick={() => setMiniMapFloor("1F")}
                        className={`px-2 py-1 text-xs font-medium transition-all ${
                          miniMapFloor === "1F"
                            ? "rounded-lg bg-blue-600 text-white"
                            : "text-gray-700 active:bg-gray-100"
                        }`}
                      >
                        1F
                      </button>
                      <button
                        onClick={() => setMiniMapFloor("2F")}
                        className={`px-2 py-1 text-xs font-medium transition-all ${
                          miniMapFloor === "2F"
                            ? "rounded-lg bg-blue-600 text-white"
                            : "text-gray-700 active:bg-gray-100"
                        }`}
                      >
                        2F
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tableConfigs
                    .filter((config) => config.floorId === miniMapFloor)
                    .map((config) => {
                      const openOrder = orders.find(
                        (o) => o.tableId === config.id && o.status === "open"
                      );
                      const hasClosed = orders.some(
                        (o) => o.tableId === config.id && o.status === "closed"
                      );

                      let status: "empty" | "open" | "closed" = "empty";
                      if (openOrder) {
                        status = "open";
                      } else if (hasClosed) {
                        status = "closed";
                      }

                      const statusStyles = {
                        empty: "bg-gray-100 text-gray-700 border-gray-300",
                        open: "bg-blue-100 text-blue-700 border-blue-400",
                        closed: "bg-gray-200 text-gray-600 border-gray-400",
                      };

                      return (
                        <button
                          key={config.id}
                          onClick={() => {
                            setSelectedTableId(config.id);
                            setSelectedTableName(config.label);
                            setShowTableSelect(false);
                          }}
                          className={`flex min-w-[60px] flex-col items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-all active:scale-95 ${
                            statusStyles[status]
                          } ${
                            selectedTableId === config.id
                              ? "ring-2 ring-blue-500 ring-offset-1"
                              : ""
                          }`}
                        >
                          <div className="font-bold">{config.label}</div>
                          {status === "open" && openOrder && (
                            <div className="mt-0.5 text-[10px] opacity-80">
                              ¥{openOrder.total.toLocaleString()}
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
                {selectedTableId && (
                  <div className="mt-2 text-center text-sm text-blue-600">
                    選択中: {selectedTableName}
                  </div>
                )}
              </div>
            )}

            {/* ボタン */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCheckout(false);
                  setCheckoutMode("standalone");
                  setSelectedTableId(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 transition-all active:scale-95"
              >
                キャンセル
              </button>
              <button
                onClick={confirmPayment}
                disabled={
                  (checkoutMode === "table" && !selectedTableId) ||
                  (paymentMethod === "cash" && (!cashReceived || parseInt(cashReceived, 10) < total))
                }
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-bold text-white transition-all active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                支払い確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

