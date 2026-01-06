// app/(pos)/pos/cashier/CashierClient.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

// ここに「元の /pos/cashier/page.tsx の中身」を移植
export default function CashierClient() {
  const sp = useSearchParams();
  const table = sp.get("table") ?? "";
  const tableId = sp.get("tableId") ?? "";

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg bg-white p-4 shadow">
          {/* ここから元のUI */}
          <div className="text-sm text-gray-600">
            table: {table} / tableId: {tableId}
          </div>
        </div>
      </div>
    </div>
  );
}
