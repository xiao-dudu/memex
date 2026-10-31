declare const __MEMEX_SUPABASE_URL__: string;
declare const __MEMEX_SUPABASE_ANON_KEY__: string;

export interface TeamConfig {
  url: string;
  anonKey: string;
  configured: boolean;
}

export function getTeamConfig(): TeamConfig {
  const url = __MEMEX_SUPABASE_URL__.trim();
  const anonKey = __MEMEX_SUPABASE_ANON_KEY__.trim();
  return { url, anonKey, configured: url.length > 0 && anonKey.length > 0 };
}
