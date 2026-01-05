'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const zones = ['NOW', 'NEXT', 'LATER'] as const
const maturities = ['着想', '着手', '巡行', '手放し'] as const

type RoadmapItem = {
  id: string
  zone: 'NOW' | 'NEXT' | 'LATER'
  category: string
  title: string
  maturity: '着想' | '着手' | '巡行' | '手放し'
}

export default function EditItemPage() {
  const router = useRouter()
  const params = useParams()
  const itemId = params.id as string

  const [item, setItem] = useState<RoadmapItem | null>(null)
  const [zone, setZone] = useState<'NOW' | 'NEXT' | 'LATER'>('NOW')
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [maturity, setMaturity] = useState<'着想' | '着手' | '巡行' | '手放し'>('着手')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchItem = async () => {
      const supabase = createClient()
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data, error } = await supabase
          .from('roadmap_items')
          .select('*')
          .eq('id', itemId)
          .eq('user_id', user.id)
          .single()

        if (error) throw error
        if (!data) {
          setError('アイテムが見つかりません')
          return
        }

        setItem(data as RoadmapItem)
        setZone(data.zone || 'NOW')
        setCategory(data.category || '')
        setTitle(data.title || '')
        setMaturity(data.maturity || '着手')
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (itemId) {
      fetchItem()
    }
  }, [itemId, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
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
          setError('NOWゾーンには1つだけアイテムを設定できます')
          setSaving(false)
          return
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
          setError('NEXTゾーンには最大3つまでアイテムを設定できます')
          setSaving(false)
          return
        }
      }

      const { error } = await supabase
        .from('roadmap_items')
        .update({
          zone,
          category: category || '未分類',
          title,
          maturity,
          updated_at: new Date().toISOString(),
          // 後方互換性のため
          status: zone === 'NOW' ? 'DO' : zone === 'NEXT' ? 'PARK' : 'NO',
        })
        .eq('id', itemId)
        .eq('user_id', user.id)

      if (error) throw error

      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('このアイテムを削除しますか？')) {
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { error } = await supabase
        .from('roadmap_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', user.id)

      if (error) throw error

      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">読み込み中...</div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="mb-6">
            <Link
              href="/"
              className="text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              ← 戻る
            </Link>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-red-600 dark:text-red-400">{error || 'アイテムが見つかりません'}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 戻る
          </Link>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-6 text-2xl font-semibold text-black dark:text-zinc-50">
            アイテム編集
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                ゾーン *
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as typeof zone)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z === 'NOW' ? 'NOW（今やっていること）' : z === 'NEXT' ? 'NEXT（後でやること）' : 'LATER（今日は触らなくていいこと）'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {zone === 'NOW' && 'NOWゾーンには1つだけ設定できます'}
                {zone === 'NEXT' && 'NEXTゾーンには最大3つまで設定できます'}
                {zone === 'LATER' && 'LATERゾーンは表示のみ（操作不可）です'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                カテゴリ（任意）
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: プロジェクト、学習、健康など"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                タイトル *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-300 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                成熟度 *
              </label>
              <select
                value={maturity}
                onChange={(e) => setMaturity(e.target.value as typeof maturity)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              >
                {maturities.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-md border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                削除
              </button>
              <Link
                href="/"
                className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                キャンセル
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}






