// app/(pos)/pos/tickets/TicketsClient.tsx
"use client";

import { useSearchParams } from "next/navigation";
import React from "react";

// 👇 ここに「元の tickets/page.tsx の中身を丸ごと移す」
export default function TicketsClient() {
  const searchParams = useSearchParams();

  // 例:
  // const table = searchParams.get("table");

  return (
    <div className="p-6">
      {/* 以前 page.tsx に書いてた JSX を全部ここへ */}
    </div>
  );
}
