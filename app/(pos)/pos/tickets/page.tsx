// app/(pos)/pos/tickets/page.tsx
import React, { Suspense } from "react";
import TicketsClient from "./TicketsClient";

export const dynamic = "force-dynamic";

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-6">読み込み中...</div>}>
      <TicketsClient />
    </Suspense>
  );
}
