import { z } from 'zod';

/**
 * Validated build-time configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the bundle by Metro at build time,
 * which has two consequences worth being explicit about:
 *
 * 1. They must be read as static property accesses — `process.env.EXPO_PUBLIC_X`
 *    works, `process.env[key]` does not, because the substitution is textual.
 * 2. Anything with this prefix ships to the client and is readable by anyone
 *    with the IPA. Only the Supabase *anon* key belongs here; it is designed to
 *    be public and is safe precisely because row-level security constrains it.
 *    A service-role key here would hand every user full database access.
 */
const urlSchema = z
  .string()
  .min(1, 'must not be empty')
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    },
    { message: 'must be a valid http(s) URL' }
  );

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: urlSchema,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'must not be empty'),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  // Fail at import time rather than at the first network call. A missing
  // Supabase URL otherwise surfaces as an opaque fetch failure inside a sign-in
  // handler, which is a much worse place to discover a misconfigured build.
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Invalid environment configuration:\n${details}\n\n` +
      'Copy .env.example to .env.local and fill in your Supabase project values, ' +
      'then restart the bundler with `npx expo start --clear`. ' +
      'Environment variables are inlined at build time, so a running bundler will ' +
      'not pick up changes to .env files.'
  );
}

export const env = parsed.data;
