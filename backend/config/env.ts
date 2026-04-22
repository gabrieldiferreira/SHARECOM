import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  DATABASE_URL: z.string().url().refine(
    (url) => !url.includes('localhost') || url.includes('127.0.0.1'),
    { message: 'DATABASE_URL must be a valid PostgreSQL URL' }
  ),
  
  REDIS_URL: z.string().url().optional(),
  
  FIREBASE_API_KEY: z.string().min(1),
  FIREBASE_AUTH_DOMAIN: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_STORAGE_BUCKET: z.string().min(1),
  FIREBASE_MESSAGING_SENDER_ID: z.string().regex(/^\d+$/),
  FIREBASE_APP_ID: z.string().min(1),
  
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32),
  
  GEMINI_API_KEY: z.string().min(1).optional(),
  
  SENTRY_DSN: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('[Config] Environment validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Invalid environment configuration');
  }
  
  return result.data;
}

export const env = validateEnv();

export function getDbUrl(): string {
  return env.DATABASE_URL;
}

export function getRedisUrl(): string | undefined {
  return env.REDIS_URL;
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}