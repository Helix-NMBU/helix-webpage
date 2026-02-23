import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Singleton Supabase client for the app
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY

// Only create the client if env vars are present to avoid hard crashes in dev
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export default supabase