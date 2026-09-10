# Deploying CarMazium Backend to Fly.io

This guide assumes you have the [flyctl CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and are logged in (`fly auth login`).

## 1. Initialize Fly App

Navigate to the `backend` directory and launch the app.

```bash
cd backend
fly launch
```

- **App Name**: Choose a unique name (for example, `carmazium-backend-production`).
- **Region**: Choose the one closest to your users (for example, `lhr` for London/Europe).
- **Configuration**: It will detect the existing `Dockerfile` and `fly.toml`. Do not overwrite working project configuration unless you have reviewed the diff.
- **Database**: Say **No** because CarMazium uses Supabase.
- **Redis**: Use the existing production Redis configuration if one is configured; otherwise leave it unset only when the application is intentionally using its documented fallback.

## 2. Set Secrets

Never commit real database passwords, Supabase service-role keys, Stripe secrets, session secrets, Resend keys, or other credentials to Git.

Set the production values from your password manager / current deployment environment. The examples below are placeholders only:

```bash
fly secrets set \
  DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true" \
  DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres" \
  SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
  SUPABASE_SERVICE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY" \
  SESSION_SECRET="GENERATE_A_LONG_RANDOM_SECRET" \
  NODE_ENV="production"
```

Generate a fresh session secret rather than reusing a value from documentation or source control, for example:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

If a real secret was ever committed, remove it from the current source and rotate the credential in the service that issued it. Removing a secret from the latest file does not remove it from Git history.

## 3. Deploy

Once the required secrets are set:

```bash
fly deploy
```

The backend build should install dependencies, generate the Prisma client, compile the NestJS application, and start using the configuration in `fly.toml` / the backend Dockerfile. Database schema changes should be applied through reviewed migrations rather than relying on an undocumented production `db push`.

## 4. Verification

Check application status and logs:

```bash
fly status
fly logs
```

After a successful backend deployment, confirm the frontend environment points to the intended API host:

```text
NEXT_PUBLIC_API_URL=https://your-app-name.fly.dev
```

Then smoke-test authentication, listing submission, auction bidding, checkout, HPI, TradeXchange, and admin-only endpoints before promoting a frontend release.
