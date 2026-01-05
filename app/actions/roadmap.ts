'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function updateZone(itemId: string, zone: 'NOW' | 'NEXT' | 'LATER') {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('認証が必要です')
  }

  // NOWゾーンに既にアイテムがある場合（自分以外）はエラー
  if (zone === 'NOW') {
    const { data: existingNow } = await supabase
      .from('roadmap_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('zone', 'NOW')
      .neq('id', itemId)
      .limit(1)

    if (existingNow && existingNow.length > 0) {
      throw new Error('NOWゾーンには1つだけアイテムを設定できます')
    }
  }

  // NEXTゾーンに既に3つある場合（自分以外）はエラー
  if (zone === 'NEXT') {
    const { data: existingNext } = await supabase
      .from('roadmap_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('zone', 'NEXT')
      .neq('id', itemId)

    if (existingNext && existingNext.length >= 3) {
      throw new Error('NEXTゾーンには最大3つまでアイテムを設定できます')
    }
  }

  const { error } = await supabase
    .from('roadmap_items')
    .update({ 
      zone,
      updated_at: new Date().toISOString(),
      // 後方互換性のため
      status: zone === 'NOW' ? 'DO' : zone === 'NEXT' ? 'PARK' : 'NO',
    })
    .eq('id', itemId)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/')
  return { success: true }
}






