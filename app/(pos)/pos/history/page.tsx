"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SalesRecord = {
  id: string;
  createdAt: string; // ISO string
  tableName?: string;
  people?: number;
  items: Array<{
    id: number;
    name: string;
    price: number;
    qty: number;
  }>;
  total: number;
  status?: "open" | "closed";
};

type DailySummary = {
  date: string; // YYYY-MM-DD
  total: number;
  count: number;
  records: SalesRecord[];
};

type MonthlySummary = {
  month: string; // YYYY-MM
  total: number;
  count: number;
  dailySummaries: DailySummary[];
};

type ViewMode = "daily" | "monthly";

function SalesHistoryPageContent() {
  const searchParams = useSearchParams();
  const filterTable = searchParams.get("table");
  
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [grandTotal, setGrandTotal] = useState(0);

  useEffect(() => {
    // フロア情報をlocalStorageから復元（URLパラメータがあれば優先）
    const floorParam = searchParams.get("floor");
    if (floorParam && (floorParam === "1F" || floorParam === "2F")) {
      localStorage.setItem("currentFloor", floorParam);
    }
    
    loadSalesHistory();
  }, [filterTable, searchParams]);

  const loadSalesHistory = () => {
    // register_ordersから読み込む（新形式）
    const ordersData = localStorage.getItem("register_orders");
    // 互換性のためregister_salesも確認（旧形式）
    const salesData = localStorage.getItem("register_sales");
    
    let closedRecords: SalesRecord[] = [];

    if (ordersData) {
      try {
        const orders: Array<{
          id: string;
          status: "open" | "closed";
          createdAt: string;
          tableName?: string;
          people?: number;
          items: Array<{
            id: number;
            name: string;
            price: number;
            qty: number;
          }>;
          total: number;
        }> = JSON.parse(ordersData);
        
        // closed状態のみを集計対象にする
        closedRecords = orders
          .filter((o) => o.status === "closed")
          .map((o) => ({
            id: o.id,
            createdAt: o.createdAt,
            tableName: o.tableName,
            people: o.people,
            items: o.items,
            total: o.total,
            status: "closed" as const,
          }));
      } catch (e) {
        console.error("Failed to load orders:", e);
      }
    }

    // 旧形式のデータも読み込む（互換性）
    if (salesData && closedRecords.length === 0) {
      try {
        const sales: SalesRecord[] = JSON.parse(salesData);
        // closed状態のみを集計対象にする（statusがない場合は従来のデータとして扱う）
        closedRecords = sales.filter(
          (s) => !s.status || s.status === "closed"
        );
      } catch (e) {
        console.error("Failed to load sales:", e);
      }
    }

    // テーブルフィルタリング
    if (filterTable) {
      closedRecords = closedRecords.filter(
        (r) => r.tableName === filterTable
      );
    }

    if (closedRecords.length === 0) return;

    try {
      const closedSales = closedRecords;

      // 日別集計
      const dailyMap = new Map<string, DailySummary>();
      closedSales.forEach((record) => {
        const date = new Date(record.createdAt).toISOString().split("T")[0]; // YYYY-MM-DD
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            total: 0,
            count: 0,
            records: [],
          });
        }
        const daily = dailyMap.get(date)!;
        daily.total += record.total;
        daily.count += 1;
        daily.records.push(record);
      });

      // 日付でソート（新しい順）
      const sortedDaily = Array.from(dailyMap.values()).sort((a, b) =>
        b.date.localeCompare(a.date)
      );

      // 各日のレコードを時間順にソート（新しい順）
      sortedDaily.forEach((daily) => {
        daily.records.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      setDailySummaries(sortedDaily);

      // 月別集計
      const monthlyMap = new Map<string, MonthlySummary>();
      sortedDaily.forEach((daily) => {
        const month = daily.date.substring(0, 7); // YYYY-MM
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, {
            month,
            total: 0,
            count: 0,
            dailySummaries: [],
          });
        }
        const monthly = monthlyMap.get(month)!;
        monthly.total += daily.total;
        monthly.count += daily.count;
        monthly.dailySummaries.push(daily);
      });

      // 月でソート（新しい順）
      const sortedMonthly = Array.from(monthlyMap.values()).sort((a, b) =>
        b.month.localeCompare(a.month)
      );

      setMonthlySummaries(sortedMonthly);
      setGrandTotal(closedSales.reduce((sum, r) => sum + r.total, 0));
    } catch (e) {
      console.error("Failed to load sales history:", e);
    }
  };

  const toggleDateExpansion = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const toggleMonthExpansion = (month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  const handleClearHistory = () => {
    if (confirm("全ての売上履歴を削除しますか？この操作は取り消せません。")) {
      localStorage.removeItem("register_sales");
      setDailySummaries([]);
      setMonthlySummaries([]);
      setGrandTotal(0);
      setExpandedDates(new Set());
      setExpandedMonths(new Set());
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    return `${year}年${parseInt(month)}月`;
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20 lg:pb-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">
            売上履歴{filterTable && ` - ${filterTable}`}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-all active:scale-95 lg:text-base lg:hover:bg-blue-700"
            >
              配置図に戻る
            </Link>
            {filterTable && (
              <Link
                href="/pos/history"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-all active:scale-95 lg:text-base lg:hover:bg-gray-50"
              >
                全テーブル表示
              </Link>
            )}
            {dailySummaries.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-600 transition-all active:scale-95 lg:text-base lg:hover:bg-red-50"
              >
                履歴をクリア
              </button>
            )}
          </div>
        </div>

        {dailySummaries.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-500">売上履歴がありません</p>
          </div>
        ) : (
          <>
            {/* 合計表示 */}
            <div className="mb-6 rounded-lg bg-blue-50 p-4 shadow">
              <div className="text-center">
                <div className="text-sm text-gray-600">総売上</div>
                <div className="text-2xl font-bold text-blue-600 lg:text-3xl">
                  ¥{grandTotal.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 表示モード切り替え */}
            <div className="mb-4 flex gap-2 rounded-lg bg-white p-2 shadow">
              <button
                onClick={() => setViewMode("daily")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all lg:text-base ${
                  viewMode === "daily"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 active:bg-gray-200"
                }`}
              >
                日別
              </button>
              <button
                onClick={() => setViewMode("monthly")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all lg:text-base ${
                  viewMode === "monthly"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 active:bg-gray-200"
                }`}
              >
                月別
              </button>
            </div>

            {/* 日別表示 */}
            {viewMode === "daily" && (
              <div className="space-y-4">
                {dailySummaries.map((daily) => {
                  const isExpanded = expandedDates.has(daily.date);
                  return (
                    <div
                      key={daily.date}
                      className="rounded-lg bg-white shadow"
                    >
                      <button
                        onClick={() => toggleDateExpansion(daily.date)}
                        className="w-full p-4 text-left transition-all active:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900 lg:text-xl">
                              {formatDate(daily.date)}
                            </h2>
                            <div className="mt-1 text-sm text-gray-600">
                              {daily.count}件
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-lg font-bold text-blue-600 lg:text-xl">
                                ¥{daily.total.toLocaleString()}
                              </div>
                            </div>
                            <div className="text-gray-400">
                              {isExpanded ? "▼" : "▶"}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4">
                          <div className="space-y-3">
                            {daily.records.map((record) => (
                              <div
                                key={record.id}
                                className="rounded bg-gray-50 p-3"
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs text-gray-500 lg:text-sm">
                                      {formatTime(record.createdAt)}
                                    </span>
                                    {(record.tableName || record.people) && (
                                      <span className="text-xs text-gray-400">
                                        {record.tableName && `テーブル: ${record.tableName}`}
                                        {record.tableName && record.people && " / "}
                                        {record.people && `${record.people}名`}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-gray-900">
                                    ¥{record.total.toLocaleString()}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {record.items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between text-xs text-gray-700 lg:text-sm"
                                    >
                                      <span>
                                        {item.name} × {item.qty}
                                      </span>
                                      <span>
                                        ¥{(item.price * item.qty).toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 月別表示 */}
            {viewMode === "monthly" && (
              <div className="space-y-4">
                {monthlySummaries.map((monthly) => {
                  const isExpanded = expandedMonths.has(monthly.month);
                  return (
                    <div
                      key={monthly.month}
                      className="rounded-lg bg-white shadow"
                    >
                      <button
                        onClick={() => toggleMonthExpansion(monthly.month)}
                        className="w-full p-4 text-left transition-all active:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900 lg:text-xl">
                              {formatMonth(monthly.month)}
                            </h2>
                            <div className="mt-1 text-sm text-gray-600">
                              {monthly.count}件
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-lg font-bold text-blue-600 lg:text-xl">
                                ¥{monthly.total.toLocaleString()}
                              </div>
                            </div>
                            <div className="text-gray-400">
                              {isExpanded ? "▼" : "▶"}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4">
                          <div className="space-y-3">
                            {monthly.dailySummaries.map((daily) => {
                              const isDailyExpanded = expandedDates.has(
                                daily.date
                              );
                              return (
                                <div
                                  key={daily.date}
                                  className="rounded-lg border border-gray-200 bg-gray-50"
                                >
                                  <button
                                    onClick={() =>
                                      toggleDateExpansion(daily.date)
                                    }
                                    className="w-full p-3 text-left transition-all active:bg-gray-100"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="font-medium text-gray-900">
                                          {formatDate(daily.date)}
                                        </div>
                                        <div className="mt-0.5 text-xs text-gray-600">
                                          {daily.count}件
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="font-semibold text-blue-600">
                                          ¥{daily.total.toLocaleString()}
                                        </div>
                                        <div className="text-gray-400">
                                          {isDailyExpanded ? "▼" : "▶"}
                                        </div>
                                      </div>
                                    </div>
                                  </button>

                                  {isDailyExpanded && (
                                    <div className="border-t border-gray-200 p-3">
                                      <div className="space-y-2">
                                        {daily.records.map((record) => (
                                          <div
                                            key={record.id}
                                            className="rounded bg-white p-2"
                                          >
                                            <div className="mb-1 flex items-center justify-between">
                                              <div className="flex flex-col gap-0.5">
                                                <span className="text-xs text-gray-500">
                                                  {formatTime(record.createdAt)}
                                                </span>
                                                {(record.tableName || record.people) && (
                                                  <span className="text-xs text-gray-400">
                                                    {record.tableName && `テーブル: ${record.tableName}`}
                                                    {record.tableName && record.people && " / "}
                                                    {record.people && `${record.people}名`}
                                                  </span>
                                                )}
                                              </div>
                                              <span className="text-sm font-semibold text-gray-900">
                                                ¥{record.total.toLocaleString()}
                                              </span>
                                            </div>
                                            <div className="space-y-0.5">
                                              {record.items.map((item, idx) => (
                                                <div
                                                  key={idx}
                                                  className="flex justify-between text-xs text-gray-700"
                                                >
                                                  <span>
                                                    {item.name} × {item.qty}
                                                  </span>
                                                  <span>
                                                    ¥{(item.price * item.qty).toLocaleString()}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SalesHistoryPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    }>
      <SalesHistoryPageContent />
    </Suspense>
  );
}
