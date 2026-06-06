import { useState, useActionState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { state } = useApp()
  const { signInWithGoogle, signInWithMagicLink } = useAuth()
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const [magicLinkError, submitMagicLink, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const email = formData.get('email') as string
      const error = await signInWithMagicLink(email)
      if (error) return error.message
      setMagicLinkSent(true)
      return null
    },
    null
  )

  if (state.user) return <Navigate to="/shop" replace />

  return (
    <div className="home">
      <div className="home__hero">
        <h1>Sealed</h1>
        <p>Rip packs. Collect cards. Feel the holo.</p>
      </div>

      <div className="home__auth">
        <button className="btn btn--primary" onClick={signInWithGoogle}>
          Continue with Google
        </button>

        <div className="home__divider">or</div>

        {magicLinkSent ? (
          <p className="home__success">Check your email for a magic link!</p>
        ) : (
          <form action={submitMagicLink} className="home__magic-form">
            <input
              name="email"
              type="email"
              placeholder="your@email.com"
              required
              className="home__input"
            />
            <button type="submit" className="btn btn--secondary" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send Magic Link'}
            </button>
            {magicLinkError && <p className="home__error">{magicLinkError}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
