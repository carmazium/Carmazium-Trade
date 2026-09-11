"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { fetchWithRetry } from "@/lib/fetchWithRetry"
import { Loader2 } from "lucide-react"
import { trackMetaEvent } from "@/components/analytics/MetaPixel"
import { trackSignupConversion } from "@/lib/googleAds"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://carmazium-hjoh9w.fly.dev";

/**
 * Parses hash fragment for Supabase auth redirect (e.g. #access_token=...&refresh_token=...&type=signup).
 * The verification email link uses this format; the hash is only available in the browser.
 */
function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {}
  if (!hash || !hash.startsWith("#")) return params
  const query = hash.slice(1)
  for (const part of query.split("&")) {
    const [key, value] = part.split("=")
    if (key && value) params[key] = decodeURIComponent(value)
  }
  return params
}

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const redirectTo = searchParams?.get("redirect_to") || "/auth/onboarding"
      const roleFromUrl = searchParams?.get("role") || undefined
      const code = searchParams?.get("code")
      const error = searchParams?.get("error")
      const errorDescription = searchParams?.get("error_description")

      if (error) {
        setErrorMessage(errorDescription || error)
        setStatus("error")
        return
      }

      // ── Parse hash fragment first so we can detect recovery type early ──
      if (typeof window !== "undefined") {
        const hashParams = parseHashParams(window.location.hash)
        const tokenType = hashParams.type  // "recovery", "signup", "magiclink", etc.

        // PASSWORD RECOVERY: set Supabase session, skip backend sync, go to reset page
        if (tokenType === "recovery" && hashParams.access_token) {
          try {
            await supabase.auth.setSession({
              access_token: hashParams.access_token,
              refresh_token: hashParams.refresh_token || "",
            })
          } catch {
            // AuthContext may have already consumed the session — safe to continue
          }
          if (cancelled) return
          router.replace("/auth/reset-password")
          return
        }
      }

      // 1) PKCE: server redirects with ?code=...
      if (code) {
        // Detect password recovery PKCE flow before doing anything expensive
        const isRecovery =
          redirectTo.includes("reset-password") ||
          searchParams?.get("type") === "recovery"

        try {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (cancelled) return

          if (exchangeError) {
            // Code may have been consumed by AuthContext's onAuthStateChange — rescue the session
            const { data: { session: existingSession } } = await supabase.auth.getSession()
            if (cancelled) return
            if (existingSession?.user) {
              if (isRecovery) {
                router.replace("/auth/reset-password")
              } else {
                await syncBackendAndRedirect(existingSession.user, existingSession.access_token, redirectTo, roleFromUrl)
              }
              return
            }
            setErrorMessage(exchangeError.message)
            setStatus("error")
            return
          }

          if (data.session && data.user) {
            if (isRecovery) {
              if (cancelled) return
              router.replace("/auth/reset-password")
            } else {
              await syncBackendAndRedirect(data.user, data.session.access_token, redirectTo, roleFromUrl)
            }
          }
        } catch (exchangeErr: any) {
          // AbortError = AuthContext beat us to the code exchange. Rescue the session.
          if (exchangeErr?.name === 'AbortError' || exchangeErr?.message?.includes('aborted')) {
            if (cancelled) return
            const { data: { session: rescuedSession } } = await supabase.auth.getSession()
            if (rescuedSession?.user) {
              if (isRecovery) {
                router.replace("/auth/reset-password")
              } else {
                await syncBackendAndRedirect(rescuedSession.user, rescuedSession.access_token, redirectTo, roleFromUrl)
              }
              return
            }
          }
          // Other errors
          setErrorMessage(exchangeErr?.message || "Failed to complete sign in")
          setStatus("error")
        }
        return
      }

      // 2) Implicit / email link: tokens in hash (#access_token=...&refresh_token=...)
      if (typeof window === "undefined") return
      const hashParams = parseHashParams(window.location.hash)
      const accessToken = hashParams.access_token
      const refreshToken = hashParams.refresh_token

      if (accessToken) {
        try {
          const { data, error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
          })
          if (cancelled) return
          if (setError) {
            setErrorMessage(setError.message)
            setStatus("error")
            return
          }
          if (data.user && data.session) {
            // hashParams.type is Supabase's own tag for which email link this
            // was — only "signup" is an actual new registration completing;
            // "magiclink"/other types are returning users and must not count.
            if (hashParams.type === "signup") {
              trackMetaEvent("CompleteRegistration")
            }
            await syncBackendAndRedirect(data.user, data.session.access_token, redirectTo, roleFromUrl)
            return
          }
        } catch (err: any) {
          if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            // AuthContext beat us — rescue whatever session it created
            const { data: { session: rescuedSess } } = await supabase.auth.getSession()
            if (rescuedSess?.user && !cancelled) {
              await syncBackendAndRedirect(rescuedSess.user, rescuedSess.access_token, redirectTo, roleFromUrl)
              return
            }
            if (!cancelled) router.replace(redirectTo)
            return
          }
          setErrorMessage(err?.message || "Failed to complete sign in")
          setStatus("error")
          return
        }
      }

      // Check if session somehow already exists (consumed by AuthContext or Supabase JS client)
      try {
        // Give Supabase enough time to settle — 15 seconds
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise<{data: {session: null}}>((resolve) => setTimeout(() => resolve({data: {session: null}}), 15000))
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise])
        
        if (session?.user && !cancelled) {
            // Still sync the backend even for fallback session recovery
            await syncBackendAndRedirect(session.user, session.access_token, redirectTo, roleFromUrl)
            return
        }
      } catch (e) {
        console.warn('getSession fallback failed', e)
      }

      // No code, no token, and no active session -> go to login
      router.replace("/auth/login")
    }

    // Safety fallback: if run() hangs for more than 15 seconds, force redirect
    const fallbackTimer = setTimeout(() => {
        if (!cancelled && typeof window !== 'undefined') {
            console.warn('Auth callback took too long. Forcing redirect to login.');
            window.location.href = '/auth/login';
        }
    }, 15000)

    async function syncBackendAndRedirect(
      user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
      accessToken: string,
      redirectTo: string,
      roleOverride?: string
    ) {
      if (cancelled) return
      const apiBase = API_URL.replace(/\/$/, "")
      const meta = (user.user_metadata || {}) as Record<string, string>

      // Resolve first/last name across our signup metadata AND Google/Apple OAuth metadata
      const fullNameFallback = (meta.full_name || meta.name || '').trim()
      const resolvedFirstName =
        meta.first_name ?? meta.firstName ?? meta.given_name ??
        (fullNameFallback ? fullNameFallback.split(' ')[0] : undefined)
      const resolvedLastName =
        meta.last_name ?? meta.lastName ?? meta.family_name ??
        (fullNameFallback.includes(' ') ? fullNameFallback.split(' ').slice(1).join(' ') : undefined)

      // Redirect immediately — don't block on backend sync
      router.replace(redirectTo)

      // Fire-and-forget: sync user to local DB in the background
      // The backend's verifySupabaseToken will auto-create the user on the next API call if this fails
      const syncController = new AbortController()
      const syncTimeout = setTimeout(() => syncController.abort(), 15000)
      fetch(`${apiBase}/users/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          // This is only a requested self-service account mode. The backend
          // clamps it to BUYER/SELLER/DEALER/CONTRACTOR and never accepts a
          // privileged role from client metadata.
          role: roleOverride || meta.role,
        }),
        signal: syncController.signal,
      }).then(async (res) => {
        clearTimeout(syncTimeout)
        // The Google Ads "Completed Seller Registration" conversion fires from
        // here, and only from here.
        //
        // This is the one point in the app where a brand-new account is a
        // confirmed fact rather than an inference: `isNewUser` is true only on
        // the request that actually inserted the user row, so it cannot be true
        // for a login, a dashboard refresh, a return visit, or an abandoned or
        // rejected signup — none of which reach a successful sync at all.
        // Firing on arrival at /dashboard instead would count every one of
        // those, and the Search campaign's Maximise Conversions bidding would
        // learn from the wrong number.
        //
        // Both signup routes converge here: email/password (arriving with the
        // Supabase verification link) and Google OAuth (arriving with ?code=),
        // so neither needs its own special case.
        //
        // router.replace above is a soft navigation, so this promise still
        // resolves in the same JS context with window.gtag intact.
        try {
          const body = await res.json()
          if (body?.isNewUser) trackSignupConversion(user.id)
        } catch {
          // A malformed/failed sync response must never break sign-in. Missing
          // a conversion is the safe failure here; inventing one is not.
        }
      }).catch((e) => {
        clearTimeout(syncTimeout)
        console.warn("Background user sync failed:", e?.message)
      })

      // Fire-and-forget: bridge the Supabase session to the backend
      const bridgeController = new AbortController()
      const bridgeTimeout = setTimeout(() => bridgeController.abort(), 15000)
      fetch(`${apiBase}/auth/supabase-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
        credentials: "include",
        signal: bridgeController.signal,
      }).then(() => clearTimeout(bridgeTimeout)).catch((e) => {
        clearTimeout(bridgeTimeout)
        console.warn("Background session bridge failed:", e?.message)
      })
    }

    run()
    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
    }
  }, [router, searchParams])

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-400 text-center">{errorMessage}</p>
        <a href="/auth/login" className="text-primary hover:underline">
          Back to login
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-[var(--text-muted)]">Completing sign in…</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-[var(--text-muted)]">Completing sign in…</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  )
}
