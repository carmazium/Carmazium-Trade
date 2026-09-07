"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { ArrowLeft, Loader2, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { friendlyAuthError } from "@/lib/authErrors"

export default function ForgotPasswordPage() {
    const [email, setEmail] = React.useState("")
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [success, setSuccess] = React.useState(false)

    const getBaseUrl = () => {
        if (typeof window !== 'undefined') {
            return window.location.origin
        }
        return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    }

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const redirectTo = `${getBaseUrl()}/auth/callback?redirect_to=/auth/reset-password`
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo,
            })

            if (resetError) throw resetError

            setSuccess(true)
        } catch (err: any) {
            // Same Supabase email quota as signup — surface it in plain English
            // rather than as "email rate limit exceeded".
            console.error('Password reset request failed:', err)
            setError(friendlyAuthError(err, 'An error occurred while requesting the reset link. Please try again.'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-[url('/assets/images/signup-bg.png')] bg-cover bg-center relative">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

            <div className="relative z-10 w-full max-w-md bg-white/10 backdrop-blur-md p-8 shadow-2xl border border-white/20 rounded-2xl text-white">
                <Link href="/auth/login" className="inline-flex items-center text-gray-300 hover:text-white mb-6 text-sm font-medium transition-colors">
                    <ArrowLeft size={16} className="mr-1" /> Back to Login
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2 font-heading">Reset Password</h1>
                    <p className="text-gray-300">Enter your email and we'll send you a link to reset your password.</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex gap-3 text-left">
                        {error}
                    </div>
                )}

                {success ? (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/50">
                            <Mail size={32} />
                        </div>
                        <h2 className="text-xl font-bold mb-2">Check your email</h2>
                        <p className="text-gray-300 mb-6">We've sent a password reset link to <span className="text-white font-medium">{email}</span>.</p>
                        <Button onClick={() => setSuccess(false)} variant="outline" className="w-full h-12 border-white/20 hover:bg-white/10 text-white">
                            Try another email
                        </Button>
                    </div>
                ) : (
                    <form className="space-y-6" onSubmit={handleReset}>
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-xs font-bold uppercase tracking-wide block text-gray-200">Email Address</label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="john@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-white/20 border-white/10 text-white placeholder:text-gray-400 focus:bg-white/30"
                            />
                        </div>

                        <Button type="submit" disabled={loading} className="w-full h-12 text-lg shadow-[0_4px_15px_rgba(237,28,36,0.4)]" shape="default">
                            {loading ? <Loader2 className="animate-spin" /> : 'Send Reset Link'}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    )
}
