import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { supabase } from '../services/supabaseClient'
import type { Session, User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  username: string | null
  avatar_url: string | null
}

export interface UserStore {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean

  initialize: () => Promise<void>
  signOut: () => Promise<void>
}

export const useUserStore = create<UserStore>()(
  immer((set) => ({
    session: null,
    user: null,
    profile: null,
    loading: true,

    initialize: async () => {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession()
      
      set((state) => {
        state.session = session
        state.user = session?.user ?? null
        state.loading = false
      })

      // Listen for changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set((state) => {
          state.session = session
          state.user = session?.user ?? null
        })
      })
    },

    signOut: async () => {
      await supabase.auth.signOut()
      set((state) => {
        state.session = null
        state.user = null
        state.profile = null
      })
    },
  })),
)
