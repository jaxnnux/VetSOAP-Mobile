const configErrors: string[] = [];

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    configErrors.push(`Missing required environment variable: ${key}`);
    return '';
  }
  return value;
}

function getUrl(key: string): string {
  const value = getEnv(key);
  if (value && !value.startsWith('https://')) {
    configErrors.push(`${key} must use HTTPS in production`);
    return '';
  }
  return value;
}

export const API_URL = __DEV__
  ? (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000')
  : getUrl('EXPO_PUBLIC_API_URL');

export const SUPABASE_URL = __DEV__
  ? (process.env.EXPO_PUBLIC_SUPABASE_URL || '')
  : getUrl('EXPO_PUBLIC_SUPABASE_URL');

export const SUPABASE_ANON_KEY = __DEV__
  ? (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '')
  : getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

export const CONFIG_MISSING = configErrors.length > 0;

if (CONFIG_MISSING) {
  console.error('[Config] Missing or invalid environment variables:', configErrors);
}
