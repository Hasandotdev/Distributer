import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const PAGE_SIZE = 1000

export async function fetchAllRows<T = any>(build: () => any): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (let page = 0; page < 100; page++) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data || []) as T[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += chunk.length
  }
  return rows
}
