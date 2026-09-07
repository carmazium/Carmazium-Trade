"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Lock, LogIn, UserPlus, Loader2, ShieldOff, Home } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

interface Props {
    children: React.ReactNode
    /** Shown above the buttons — say what signing in unlocks, not just that it's required. */
    message?: string
    title?: string
    /**
     * Pre-selects a role on the signup form via ?role=. Trade Exchange passes
     * DEALER because that is who the room is for — bidding is verified-dealers
     * only, so landing a trade buyer on an empty role picker asks them to guess
     * at something we already know.
     *
     * It is a default, not a lock: the picker stays visible and changeable, so
     * a retail visitor who wandered in can still correct it.
     */
    signupRole?: string
    /**
     * When set, being signed in is not enough — the account's role must appear
     * in this list. A signed-in user whose role is not allowed gets the
     * unauthorized panel (not the signup prompt: they already have an account,
     * so inviting them to make another is nonsense).
     *
     * Roles come from `profile.role`, which is fetched from the backend, not
     * from anything the client sets — but this is still a UI gate. The API is
     * the real boundary and must enforce the same rule independently.
     */
    allowedRoles?: readonly string[]
    /** Copy for the wrong-role panel. Defaults to Trade Exchange wording. */
    unauthorizedTitle?: string
    unauthorizedMessage?: string
}

/**
 * Route-level authentication and role gate.
 *
 * WHY NOT MIDDLEWARE: the Supabase session is held in localStorage
 * (`sb-<ref>-auth-token`, see lib/supabase.ts), not a cookie. Next.js
 * middleware runs on the server and can only read cookies, so it would find no
 * session for ANYONE and bounce signed-in users too. The backend's `sid` cookie
 * is no help either — it belongs to the API origin, not this one. Protecting
 * routes server-side would mean migrating to @supabase/ssr cookie auth, which
 * touches every auth surface in the app; that is a deliberate decision, not
 * something to smuggle in behind a route guard.
 *
 * THE LOADING STATE IS NOT COSMETIC. `loading` stays true until AuthContext has
 * read localStorage, bridged the session and settled the profile. Rendering the
 * prompt during that window would flash "please sign in" at users who are in
 * fact signed in, on every hard refresh — and rendering `children` would flash
 * the protected content at guests, which is the whole thing being prevented.
 * The same applies to `allowedRoles`: the role lives on `profile`, which is not
 * populated until loading settles, so no branch may run until it has.
 *
 * Deliberately an in-place prompt rather than a redirect to /auth/login: the
 * visitor keeps the URL they asked for, sees what they'd be signing in FOR,
 * and lands back here afterwards via ?redirect=.
 */
export function RequireAuth({
    children,
    title = "Sign up to enter the Trade Exchange",
    message = "The Trade Exchange is open to registered dealers. Signing up takes a minute.",
    signupRole,
    allowedRoles,
    unauthorizedTitle = "Dealers only",
    unauthorizedMessage = "The Trade Exchange — auctions, part exchange and trade jobs — is restricted to dealer accounts. Your account doesn't have trade access.",
}: Props) {
    const { user, profile, loading } = useAuth()
    const pathname = usePathname()

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        )
    }

    // Signed in, but the wrong kind of account. No teaser and no vehicle data
    // reaches this branch — the children never render.
    if (user && allowedRoles && !allowedRoles.includes(profile?.role ?? "")) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center px-5 py-20">
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                        <ShieldOff size={26} className="text-primary" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black font-heading tracking-tight mb-3">
                        {unauthorizedTitle}
                    </h1>
                    <p className="text-[var(--text-muted)] leading-relaxed mb-8">
                        {unauthorizedMessage}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
                        >
                            <Home size={16} /> Back to home
                        </Link>
                        <Link
                            href="/search"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-body)]/60 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-primary/40 transition-colors"
                        >
                            Browse cars for sale
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    if (user) return <>{children}</>

    const redirect = encodeURIComponent(pathname || "/auctions")
    const signupHref = `/auth/signup?redirect=${redirect}${signupRole ? `&role=${encodeURIComponent(signupRole)}` : ""}`

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-5 py-20">
            <div className="w-full max-w-md text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 backdrop-blur-sm">
                    <Lock size={26} className="text-primary" />
                </div>

                <h1 className="text-2xl sm:text-3xl font-black font-heading tracking-tight mb-3">
                    {title}
                </h1>
                <p className="text-[var(--text-muted)] leading-relaxed mb-8">
                    {message}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href={signupHref}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
                    >
                        <UserPlus size={16} /> Sign up
                    </Link>
                    <Link
                        href={`/auth/login?redirect=${redirect}`}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-body)]/60 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-primary/40 transition-colors"
                    >
                        <LogIn size={16} /> Sign in
                    </Link>
                </div>

                {/* The How It Works block on /auctions sits below this gate and
                    stays public on purpose — it is what persuades a dealer the
                    account is worth creating. */}
                <p className="text-xs text-[var(--text-muted)] mt-8">
                    New to auctions?{" "}
                    <Link href="/auctions#how-it-works" className="text-primary font-semibold hover:underline">
                        See how it works
                    </Link>
                </p>
            </div>
        </div>
    )
}
