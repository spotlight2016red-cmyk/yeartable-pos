// app/(pos)/pos/history/page.tsx
import React, { Suspense } from "react";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-6">読み込み中...</div>}>
      <HistoryClient />
    </Suspense>
  );
}
