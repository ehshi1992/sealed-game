import { supabase } from '../lib/supabase'

export function useAuth() {
  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/shop' },
    })
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/shop' },
    })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { signInWithGoogle, signInWithMagicLink, signOut }
}
