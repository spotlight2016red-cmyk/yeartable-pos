// app/(pos)/pos/history/HistoryClient.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

export default function HistoryClient() {
  const sp = useSearchParams();

  // TODO: ここに「元の history/page.tsx の中身」を丸ごと移植してOK

  return <div className="p-6">History</div>;
}
