// app/(pos)/pos/cashier/page.tsx
import React, { Suspense } from "react";
import CashierClient from "./CashierClient";

// ✅ これで /pos/cashier を静的生成させない（Vercelのprerenderで落ちるのを止める）
export const dynamic = "force-dynamic";

export default function CashierPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-lg bg-white p-6 shadow">読み込み中...</div>
          </div>
        </div>
      }
    >
      <CashierClient />
    </Suspense>
  );
}
