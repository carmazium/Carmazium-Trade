"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { ArrowLeft, Car, CreditCard, Loader2, Eye, EyeOff, Building2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { fetchWithRetry } from "@/lib/fetchWithRetry"
import { friendlyAuthError } from "@/lib/authErrors"

const VALID_SIGNUP_ROLES = ["BUYER", "SELLER", "DEALER", "CONTRACTOR", "FINANCE_PARTNER", "INSURANCE_PARTNER"] as const

export default function SignupPage() {
    return (
        <React.Suspense fallback={null}>
            <SignupForm />
        </React.Suspense>
    )
}

function SignupForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const roleParam = searchParams.get("role")?.toUpperCase()
    // Empty by default — the role picker must be a deliberate choice, not a
    // silent BUYER default. A valid ?role= query param (e.g. from a "Sell as
    // a dealer" link) still pre-fills it.
    const initialRole = (VALID_SIGNUP_ROLES as readonly string[]).includes(roleParam ?? "") ? roleParam as typeof VALID_SIGNUP_ROLES[number] : ""
    const [formData, setFormData] = React.useState<{
        firstName: string
        lastName: string
        email: string
        password: string
        role: typeof VALID_SIGNUP_ROLES[number] | ""
    }>({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: initialRole
    })
    const [loading, setLoading] = React.useState(false)
    const [googleLoading, setGoogleLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [showPassword, setShowPassword] = React.useState(false)

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://carmazium-hjoh9w.fly.dev';

    // Get the base URL for email redirects
    const getBaseUrl = () => {
        if (typeof window !== 'undefined') {
            return window.location.origin
        }
        // Fallback for SSR
        return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    }

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.role) {
            setError("Please select a role to continue.")
            return
        }
        setLoading(true)
        setError(null)

        try {
            const baseUrl = getBaseUrl()
            const redirectTo = `${baseUrl}/auth/callback?redirect_to=/auth/onboarding`

            // 1. Supabase Signup with proper email redirect
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    emailRedirectTo: redirectTo,
                    data: {
                        first_name: formData.firstName,
                        last_name: formData.lastName,
                        role: formData.role
                    }
                }
            })

            if (authError) throw authError

            // 2. Sync with Backend (retry + long timeout for cold start)
            if (authData.user) {
                const apiBase = API_URL.replace(/\/$/, '')
                try {
                    const syncResponse = await fetchWithRetry(
                        `${apiBase}/users/sync`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: authData.user.id,
                                email: formData.email,
                                firstName: formData.firstName,
                                lastName: formData.lastName,
                                role: formData.role
                            })
                        },
                        { timeoutMs: 60000, retries: 2 }
                    )
                    if (!syncResponse.ok) {
                        console.error('Backend sync failed, but account created in Supabase')
                    } else {
                        await fetchWithRetry(
                            `${apiBase}/auth/supabase-session`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ token: authData.session?.access_token }),
                                credentials: 'include',
                            },
                            { timeoutMs: 60000, retries: 2 }
                        ).catch(err => console.error('Session bridge failed:', err))
                    }
                } catch (e) {
                    console.error('Backend sync failed, but account created in Supabase', e)
                }
            }

            // 3. Stash email so onboarding page can show it even before the session exists
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('pending_verification_email', formData.email)
            }

            // 4. Redirect immediately — don't block on verification email send
            //
            // Deliberately no second send here. supabase.auth.signUp() above
            // already sends the confirmation email, and Supabase's custom SMTP
            // now delivers it through Resend — so firing /auth/send-verification
            // as well put two near-simultaneous confirmation emails in the
            // user's inbox and charged both quotas twice: one Supabase Auth
            // email slot plus two Resend sends per signup. Resend throttles on
            // requests per second, not just daily volume, so concurrent signups
            // could trip it well under the daily cap.
            //
            // The branded Resend email is still one click away: the onboarding
            // page's "Resend email" button calls that endpoint on demand, which
            // is the right place for it — user-initiated, rate-limited by its
            // own cooldown, and only sent when the first one actually failed to
            // arrive.
            router.push('/auth/onboarding')
        } catch (err: any) {
            // Keep the raw error in the console — the user gets plain English,
            // we keep the code and status needed to debug it.
            console.error('Signup failed:', err)
            setError(friendlyAuthError(err, 'An error occurred during signup. Please try again.'))
        } finally {
            setLoading(false)
        }
    }

    // Each role carries its own accent so the three are distinguishable at a
    // glance — they previously all rendered in brand red, which made the
    // dropdown read as one repeated option.
    //
    // Tailwind classes are written out in full rather than composed from a
    // colour name: the JIT compiler only sees complete class strings in the
    // source, so `bg-${colour}-500/20` would silently produce no styles.
    const roles = [
        {
            id: 'BUYER',
            icon: Car,
            label: 'User - Retail Customers',
            sub: 'Buy & Sell Vehicles',
            active: 'bg-blue-500/20 text-blue-400',
            hover: 'group-hover:bg-blue-500/20 group-hover:text-blue-400',
        },
        {
            id: 'DEALER',
            icon: Building2,
            label: 'Dealer - Trade Buyer Account',
            sub: 'Dealership account',
            active: 'bg-primary/20 text-primary',
            hover: 'group-hover:bg-primary/20 group-hover:text-primary',
        },
        {
            id: 'FINANCE_PARTNER',
            icon: CreditCard,
            label: 'Finance Provider',
            sub: 'Vehicle financing services',
            active: 'bg-emerald-500/20 text-emerald-400',
            hover: 'group-hover:bg-emerald-500/20 group-hover:text-emerald-400',
        },
    ]

    const selectedRole = roles.find(r => r.id === formData.role)

    return (
        <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-[url('/assets/images/signup-bg.png')] bg-cover bg-center relative">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

            <div className="relative z-10 w-full max-w-md bg-white/10 backdrop-blur-md p-8 shadow-2xl border border-white/20 rounded-2xl text-white">
                <Link href="/" className="inline-flex items-center text-gray-300 hover:text-white mb-6 text-sm font-medium transition-colors">
                    <ArrowLeft size={16} className="mr-1" /> Back to Home
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2 font-heading">Create Account</h1>
                    <p className="text-gray-300">Join CarMazium to buy, sell, and auction</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm">
                        {error}
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleSignup}>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="fname" className="text-xs font-bold uppercase tracking-wide block text-gray-200">First Name</label>
                            <Input
                                id="fname"
                                type="text"
                                placeholder="John"
                                required
                                value={formData.firstName}
                                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                className="bg-white/20 border-white/10 text-white placeholder:text-gray-400 focus:bg-white/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="lname" className="text-xs font-bold uppercase tracking-wide block text-gray-200">Last Name</label>
                            <Input
                                id="lname"
                                type="text"
                                placeholder="Doe"
                                required
                                value={formData.lastName}
                                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                className="bg-white/20 border-white/10 text-white placeholder:text-gray-400 focus:bg-white/30"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="email" className="text-xs font-bold uppercase tracking-wide block text-gray-200">Email Address</label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="john@example.com"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            className="bg-white/20 border-white/10 text-white placeholder:text-gray-400 focus:bg-white/30"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="password" className="text-xs font-bold uppercase tracking-wide block text-gray-200">Password</label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Create a password"
                                required
                                value={formData.password}
                                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                className="bg-white/20 border-white/10 text-white placeholder:text-gray-400 focus:bg-white/30 pr-11"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2 relative group-dropdown">
                        <label className="text-xs font-bold uppercase tracking-wide block text-gray-200">Select Role</label>
                        <div className="relative">
                            <input type="checkbox" id="dropdown-toggle" className="peer hidden" />
                            <label htmlFor="dropdown-toggle" className="flex items-center justify-between w-full h-14 px-4 bg-slate-900/60 border border-white/10 rounded-xl cursor-pointer text-white hover:border-primary/50 transition-colors">
                                {selectedRole ? (
                                    <span className="flex items-center gap-3">
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedRole.active}`}>
                                            <selectedRole.icon size={16} />
                                        </span>
                                        <span>{selectedRole.label}</span>
                                    </span>
                                ) : (
                                    <span className="text-gray-400">Select your role...</span>
                                )}
                                <ArrowLeft className="rotate-[-90deg] text-gray-400 peer-checked:rotate-90 transition-transform" size={16} />
                            </label>

                            {/* Dropdown Menu */}
                            <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden hidden peer-checked:block z-50 animate-in fade-in zoom-in-95 duration-200">
                                {roles.map((role) => (
                                    <div
                                        key={role.id}
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, role: role.id as any }))
                                            // Close dropdown (simplified)
                                            const toggle = document.getElementById('dropdown-toggle') as HTMLInputElement
                                            if (toggle) toggle.checked = false
                                        }}
                                        className="flex items-center gap-4 p-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors group"
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${formData.role === role.id ? role.active : `bg-slate-800 text-gray-400 ${role.hover}`}`}>
                                            <role.icon size={20} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-white text-sm">{role.label}</p>
                                            <p className="text-xs text-gray-500">{role.sub}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full h-12 text-lg shadow-[0_4px_15px_rgba(237,28,36,0.4)]" shape="default">
                        {loading ? <Loader2 className="animate-spin" /> : 'Create Account'}
                    </Button>
                </form>

                <div className="my-8 flex items-center gap-4 text-gray-400">
                    <div className="h-px bg-white/10 flex-1" />
                    <span className="text-sm">Or continue with</span>
                    <div className="h-px bg-white/10 flex-1" />
                </div>

                <div className="flex gap-4">
                    <Button
                        variant="outline"
                        disabled={googleLoading}
                        onClick={async () => {
                            if (!formData.role) {
                                setError("Please select a role to continue.")
                                return
                            }
                            setGoogleLoading(true)
                            setError(null)
                            try {
                                const roleParam = formData.role ? `&role=${formData.role}` : ''
                                const redirectTo = `${getBaseUrl()}/auth/callback?redirect_to=/auth/onboarding${roleParam}`
                                const { error: oauthError } = await supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: { redirectTo },
                                })
                                if (oauthError) throw oauthError
                            } catch (err: any) {
                                console.error('Google sign-up failed:', err)
                                setError(friendlyAuthError(err, 'Google sign-up failed. Please try again.'))
                                setGoogleLoading(false)
                            }
                        }}
                        className="flex-1 border-white/20 hover:bg-white/10 text-white h-12 gap-3"
                    >
                        {googleLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Image src="/assets/images/google-icon.png" alt="Google" width={20} height={20} className="w-5 h-5" />
                        )}
                        <span className="text-sm font-medium">Google</span>
                    </Button>
                    <Button variant="outline" className="flex-1 border-white/20 hover:bg-white/10 text-white h-12 gap-3">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 384 512">
                            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                        </svg>
                        <span className="text-sm font-medium">Apple</span>
                    </Button>
                </div>

                <div className="mt-8 text-center text-sm text-gray-300">
                    Already have an account? <Link href="/auth/login" className="text-primary font-bold hover:text-red-400 transition-colors">Log In</Link>
                </div>
            </div>
        </div>
    )
}
