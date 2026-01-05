"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import RoadmapCard, { RoadmapItem, Zone } from "@/components/roadmap/RoadmapCard";

type Props = {
  initialItems: RoadmapItem[];
};

const MAX_NOW = 3;

export default function RoadmapBoard({ initialItems }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<RoadmapItem[]>(initialItems);

  const nowItems = items.filter((i) => i.zone === "NOW");
  const nextItems = items.filter((i) => i.zone === "NEXT").slice(0, 3);
  const laterItems = items.filter((i) => i.zone === "LATER");

  const moveItem = async (id: string, zone: Zone) => {
    if (zone === "NOW") {
      const nowCountExcludingThis = items.filter((x) => x.zone === "NOW" && x.id !== id).length;
      if (nowCountExcludingThis >= MAX_NOW) {
        alert(`NOWゾーンには最大${MAX_NOW}つまで設定できます`);
        return;
      }
    }

    // 先に画面を更新（UX優先）
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, zone } : x)));

    const { error } = await supabase.from("roadmap_items").update({ zone }).eq("id", id);
    if (error) {
      alert(error.message);
      window.location.reload();
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* NOW */}
      <div className="lg:col-span-1">
        <div className="sticky top-8">
          <h2 className="mb-4 text-lg font-medium text-zinc-500 dark:text-zinc-400">NOW</h2>
          <div className="min-h-[400px] space-y-4">
            {nowItems.length > 0 ? (
              nowItems.map((item) => (
                <RoadmapCard key={item.id} item={item} variant="now" onMove={moveItem} />
              ))
            ) : (
              <div className="flex min-h-[400px] items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                <div className="text-center text-zinc-400">
                  <div className="mb-2 text-sm">今は“置いている”状態です</div>
                </div>
              </div>
            )}
          </div>

          {/* 補足 */}
          <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            NOWは最大{MAX_NOW}つまで
          </div>
        </div>
      </div>

      {/* NEXT */}
      <div className="lg:col-span-1">
        <h2 className="mb-4 text-lg font-medium text-zinc-500 dark:text-zinc-400">NEXT</h2>
        <div className="space-y-4">
          {nextItems.length > 0 ? (
            nextItems.map((item) => (
              <RoadmapCard key={item.id} item={item} variant="next" onMove={moveItem} />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
              後でやることはありません
            </div>
          )}
        </div>
      </div>

      {/* LATER */}
      <div className="lg:col-span-1">
        <h2 className="mb-4 text-lg font-medium text-zinc-500 dark:text-zinc-400">LATER</h2>
        <div className="space-y-3">
          {laterItems.length > 0 ? (
            laterItems.map((item) => (
              <RoadmapCard key={item.id} item={item} variant="later" onMove={moveItem} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
              今日は触らなくていいことはありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
