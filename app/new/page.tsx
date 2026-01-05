"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Zone = "NOW" | "NEXT" | "LATER";
type Maturity = "着想" | "着手" | "巡行" | "手放し";

// ここが本丸
const MAX_NOW = 3;

const zones: { value: Zone; label: string }[] = [
  { value: "NOW", label: "NOW（今やっていること）" },
  { value: "NEXT", label: "NEXT（次にやること）" },
  { value: "LATER", label: "LATER（今日は触らなくていいこと）" },
];

const maturities: { value: Maturity; label: string }[] = [
  { value: "着想", label: "着想" },
  { value: "着手", label: "着手" },
  { value: "巡行", label: "巡行" },
  { value: "手放し", label: "手放し" },
];

// "2025-Q4" 形式
function getQuarterString(d = new Date()) {
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1; // 1-4
  return `${y}-Q${q}` as const;
}

export default function NewItemPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);

  const [zone, setZone] = useState<Zone>("NOW");
  const [category, setCategory] = useState<string>(""); // 任意だけどDBがNOT NULLならここで埋める
  const [title, setTitle] = useState<string>("");
  const [maturity, setMaturity] = useState<Maturity>("着手");

  const quarter = useMemo(() => getQuarterString(), []);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.push("/login");
        return;
      }
      setUserId(data.user.id);
    })();
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!userId) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg("タイトルを入力してください");
      return;
    }

    // DBが NOT NULL だったので、空なら自動で「未分類」に寄せる（これが一番ラク）
    const safeCategory = category.trim() ? category.trim() : "未分類";

    // ★ NOW最大数チェック（追加画面でもガード）
    if (zone === "NOW") {
      const { count, error: countError } = await supabase
        .from("roadmap_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("quarter", quarter)
        .eq("zone", "NOW");

      if (countError) {
        setErrorMsg(countError.message);
        return;
      }

      if ((count ?? 0) >= MAX_NOW) {
        setErrorMsg(`NOWゾーンには最大${MAX_NOW}つまでアイテムを設定できます`);
        return;
      }
    }

    // status はテーブルに NOT NULL があったので、固定で "DO" を入れる
    const payload = {
      user_id: userId,
      quarter,
      zone,
      category: safeCategory,
      title: trimmedTitle,
      maturity,
      status: "DO",
    };

    const { error } = await supabase.from("roadmap_items").insert(payload);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="mb-6 inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
          ← 戻る
        </Link>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-4xl font-semibold text-black dark:text-zinc-50">アイテム追加</h1>

          <form onSubmit={handleSubmit} className="mt-10 space-y-8">
            {/* Zone */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                ゾーン *
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as Zone)}
                className="w-full rounded-md border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                NOWゾーンは最大{MAX_NOW}つまで
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                カテゴリ（任意）
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例：プロジェクト、学習、健康など"
                className="w-full rounded-md border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                未入力の場合は「未分類」で登録します
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                タイトル *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Maturity */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                成熟度 *
              </label>
              <select
                value={maturity}
                onChange={(e) => setMaturity(e.target.value as Maturity)}
                className="w-full rounded-md border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {maturities.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Error */}
            {errorMsg ? (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {errorMsg}
              </div>
            ) : null}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-md bg-black px-6 py-3 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
              >
                追加
              </button>
              <Link
                href="/"
                className="rounded-md border border-zinc-300 px-6 py-3 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                キャンセル
              </Link>
            </div>

            <div className="pt-2 text-xs text-zinc-400">
              付与される quarter: {quarter}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
