import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types/database.types'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  role: UserRole | null
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    role: null,
  })

  const loadUserProfile = useCallback(async (userId: string, mounted: boolean) => {
    try {
      // Fetch profile and user in parallel
      const [profileResponse, userResponse] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        supabase.auth.getUser(),
      ])

      // Check if component is still mounted before updating state
      if (!mounted) {
        return
      }

      const profile = profileResponse.data as Profile | null
      const profileError = profileResponse.error
      const user = userResponse.data?.user || null
      const userError = userResponse.error

      // Log errors but don't block - we still want to set loading to false
      if (profileError) {
        console.error('[useAuth] Profile fetch error (non-blocking):', profileError)
      }

      if (userError) {
        console.error('[useAuth] User fetch error (non-blocking):', userError)
      }

      // Always set loading to false, even if there are errors
      setState({
        user: user,
        profile: profile || null,
        loading: false,
        role: profile?.role || null,
      })
    } catch (error) {
      console.error('[useAuth] Unexpected error loading profile:', error)
      // Always set loading to false on error
      if (mounted) {
        setState((prev) => ({
          ...prev,
          loading: false,
        }))
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout | null = null
    let isInitialLoad = true

    // Safety timeout - ensure loading never stays true forever
    timeoutId = setTimeout(() => {
      if (mounted) {
        setState((prev) => ({ ...prev, loading: false }))
      }
    }, 5000) // 5 second timeout

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) {
        return
      }
      
      // Clear timeout since we got a response
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      if (error) {
        console.error('[useAuth] Session error:', error)
        setState({ user: null, profile: null, loading: false, role: null })
        isInitialLoad = false
        return
      }

      if (session?.user) {
        // Load user profile
        loadUserProfile(session.user.id, mounted)
          .then(() => {
            isInitialLoad = false
          })
          .catch((err) => {
            console.error('[useAuth] Failed to load user profile:', err)
            if (mounted) {
              setState((prev) => ({ ...prev, loading: false }))
            }
            isInitialLoad = false
          })
      } else {
        // No session - user is not logged in
        setState({ user: null, profile: null, loading: false, role: null })
        isInitialLoad = false
      }
    }).catch((error) => {
      console.error('[useAuth] Session fetch error:', error)
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (mounted) {
        setState({ user: null, profile: null, loading: false, role: null })
      }
      isInitialLoad = false
    })

    // Listen for auth changes (but don't interfere with initial load)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      
      // Skip if this is the initial load (already handled above)
      if (isInitialLoad) {
        return
      }

      if (session?.user) {
        await loadUserProfile(session.user.id, mounted).catch((err) => {
          console.error('Failed to load user profile on auth change:', err)
          if (mounted) {
            setState((prev) => ({ ...prev, loading: false }))
          }
        })
      } else {
        setState({ user: null, profile: null, loading: false, role: null })
      }
    })

    return () => {
      mounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      subscription.unsubscribe()
    }
  }, [loadUserProfile])

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    if (data.user) {
      await loadUserProfile(data.user.id, true)
    }

    return data
  }

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[useAuth] Logout error:', error)
        throw error
      }
      setState({ user: null, profile: null, loading: false, role: null })
    } catch (error) {
      console.error('[useAuth] Logout failed:', error)
      // Clear state even if signOut fails
      setState({ user: null, profile: null, loading: false, role: null })
      throw error
    }
  }

  const hasPermission = (requiredRole: UserRole): boolean => {
    return state.role === requiredRole
  }

  const canManageRooms = (): boolean => {
    return state.role === 'frontdesk' || state.role === 'accounting'
  }

  const canManageReservations = (): boolean => {
    return state.role === 'frontdesk' || state.role === 'accounting'
  }

  const canManageBills = (): boolean => {
    return state.role === 'accounting'
  }

  return {
    ...state,
    login,
    logout,
    hasPermission,
    canManageRooms,
    canManageReservations,
    canManageBills,
  }
}

