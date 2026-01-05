"use client";

import { useState } from "react";

export type Zone = "NOW" | "NEXT" | "LATER";
export type Maturity = "着想" | "着手" | "巡行" | "手放し";

export type RoadmapItem = {
  id: string;
  zone: Zone;
  category: string | null;
  title: string;
  maturity: Maturity;
};

type Variant = "now" | "next" | "later";

type Props = {
  item: RoadmapItem;
  variant: Variant;
  onMove?: (id: string, zone: Zone) => void;
};

function getMaturityClass(maturity: Maturity) {
  switch (maturity) {
    case "着想":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    case "着手":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "巡行":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "手放し":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function variantClass(variant: Variant) {
  // NOWだけ少し“存在感”
  if (variant === "now") {
    return "rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950";
  }
  return "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
}

export default function RoadmapCard({ item, variant, onMove }: Props) {
  const [open, setOpen] = useState(false);
  const maturityClass = getMaturityClass(item.maturity);

  return (
    <div className={variantClass(variant)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
      >
        <div className="p-6">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {item.category && item.category.trim().length > 0 ? item.category : "未分類"}
          </div>

          <div className="mt-2 text-2xl font-semibold leading-snug text-black dark:text-zinc-50">
            {item.title}
          </div>

          <div className="mt-4 inline-flex items-center">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${maturityClass}`}>
              {item.maturity}
            </span>
          </div>

          <div className="mt-4 text-xs text-zinc-400">
            クリックで移動メニュー
          </div>
        </div>
      </button>

      {/* 移動メニュー（まずは確実に動く版） */}
      {open && onMove && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onMove(item.id, "NOW");
                setOpen(false);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              NOWへ
            </button>

            <button
              type="button"
              onClick={() => {
                onMove(item.id, "NEXT");
                setOpen(false);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              NEXTへ
            </button>

            <button
              type="button"
              onClick={() => {
                onMove(item.id, "LATER");
                setOpen(false);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              LATERへ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
