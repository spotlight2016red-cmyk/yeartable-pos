"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    console.log("🔄 [REGISTER] Redirecting to /pos");
    // 即座にリダイレクト
    router.replace("/pos");
    console.log("🔄 [REGISTER] router.replace called");
  }, [router]);
  
  // リダイレクト中は何も表示しない（または最小限の表示）
  return null;
}
