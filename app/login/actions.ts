"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  redirect("/");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  // メール確認が必要な設定なら、ここでは /login に戻すだけでOK
  redirect("/login?signup=1");
}






