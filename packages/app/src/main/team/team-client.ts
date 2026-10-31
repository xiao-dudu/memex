import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TeamConfig } from './team-config.js';
import type { TeamSessionStorage } from './team-session-storage.js';

export interface TeamClient {
  getSupabase(): SupabaseClient;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  getSession(): Promise<{ userId: string; email: string; displayName: string } | null>;
}

export function createTeamClient(config: TeamConfig, storage: TeamSessionStorage): TeamClient {
  if (!config.configured) throw new Error('团队服务未配置');
  const supabase = createClient(config.url, config.anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return {
    getSupabase: () => supabase,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password, displayName) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw new Error(error.message);
      return { needsEmailConfirmation: data.session === null };
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
    },
    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message);
      const user = data.session?.user;
      if (!user?.email) return null;
      const displayName =
        typeof user.user_metadata.display_name === 'string' && user.user_metadata.display_name.trim()
          ? user.user_metadata.display_name.trim()
          : user.email.split('@')[0]!;
      return { userId: user.id, email: user.email, displayName };
    },
  };
}
