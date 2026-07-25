# Edge Functions

Deno, not React Native. This directory is excluded from the app's `tsconfig.json`
and `eslint.config.js` on purpose — it resolves `jsr:` specifiers and uses Deno
globals, neither of which exists in the app's compiler context.

## Type-check and lint

```bash
deno check supabase/functions/delete-account/index.ts
deno lint supabase/functions
```

## Deploy

```bash
supabase functions deploy delete-account
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected by the platform — do **not** add them to `supabase/functions/.env` or
to any `EXPO_PUBLIC_*` variable. The service role key bypasses row-level
security entirely; it exists only inside this runtime.

## `delete-account`

Implements Apple Guideline 5.1.1(v). Verifies the caller from their JWT (never
from the request body), deletes their `sessions` and `profiles` rows
explicitly, then deletes the `auth.users` row. `JWT verification` must stay
**enabled** for this function — it is the only thing making "delete the caller"
meaningful.

Verify after deploying:

```bash
# Should be 401 — no token.
curl -i -X POST "$SUPABASE_URL/functions/v1/delete-account" \
  -H "apikey: $ANON_KEY"

# Should be 200 {"deleted":true} — throwaway account's access token.
curl -i -X POST "$SUPABASE_URL/functions/v1/delete-account" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN"
```
