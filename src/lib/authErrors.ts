/**
 * Turns a Supabase auth error into something a person can act on.
 *
 * The auth forms used to render `err.message` straight from the SDK, so a user
 * who tripped the email quota was shown the literal string "email rate limit
 * exceeded" — developer text that tells them nothing about what to do next, and
 * reads like the site is broken.
 *
 * Match on `code` first: it is the stable identifier. Supabase's `message`
 * wording changes between SDK releases, so the string checks underneath are a
 * fallback for older errors that carry no code, not the primary path.
 *
 * The raw error is deliberately still logged by the caller — a friendlier
 * message for the user must not cost us the diagnostic.
 */
export function friendlyAuthError(err: unknown, fallback = "Something went wrong. Please try again."): string {
    const e = err as { code?: string; status?: number; message?: string } | null
    const code = e?.code ?? ""
    const message = e?.message ?? ""
    const said = (...needles: string[]) =>
        needles.some(n => message.toLowerCase().includes(n))

    // Too many emails — either the per-user interval or the project's hourly
    // Auth quota. Deliberately vague about the wait: the two limits have very
    // different windows, and promising "a minute" when it is an hour is worse
    // than not saying.
    if (code === "over_email_send_rate_limit" || said("email rate limit")) {
        return "We couldn't send your confirmation email just now — too many requests have gone out recently. Please wait a few minutes and try again."
    }

    if (code === "over_request_rate_limit" || e?.status === 429 || said("rate limit", "too many requests")) {
        return "Too many attempts. Please wait a few minutes and try again."
    }

    if (code === "user_already_exists" || said("already registered", "already been registered")) {
        return "An account with this email already exists. Try signing in instead."
    }

    if (code === "invalid_credentials" || said("invalid login credentials")) {
        return "That email and password don't match. Please check them and try again."
    }

    if (code === "email_not_confirmed" || said("email not confirmed")) {
        return "Please confirm your email address first — check your inbox for the link we sent."
    }

    if (code === "weak_password" || said("password should be", "weak password")) {
        return "Please choose a stronger password — at least 8 characters, mixing letters and numbers."
    }

    if (code === "email_address_invalid" || said("invalid email", "unable to validate email")) {
        return "That email address doesn't look right. Please check it and try again."
    }

    if (code === "signup_disabled" || code === "email_provider_disabled") {
        return "New sign-ups are temporarily unavailable. Please try again shortly."
    }

    // Thrown by fetch itself, so there is no code — the request never reached
    // Supabase at all.
    if (said("failed to fetch", "networkerror", "network request failed")) {
        return "We couldn't reach the server. Check your connection and try again."
    }

    return fallback
}
