import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../../../shared/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true });

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      console.error('Failed to fetch profile:', error.message);
      return null;
    }
    return data as Profile | null;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const profile = session ? await fetchProfile(session.user.id) : null;
      setState({ session, profile, loading: false });
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const profile = session ? await fetchProfile(session.user.id) : null;
      setState((s) => ({
        session,
        profile: profile ?? s.profile,
        loading: false,
      }));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Signup succeeded but no user returned.' };

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, display_name: displayName })
        .select()
        .single();

      if (profileError) return { error: profileError.message };

      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) return { error: signInError.message };
      }

      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();

      if (freshSession) {
        setState({ session: freshSession, profile: newProfile as Profile, loading: false });
      }

      window.api.notifyAuthChanged();
      return { error: null };
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) window.api.notifyAuthChanged();
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.api.hideAllPopups();
    window.api.notifyAuthChanged();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state.session) return;
    const profile = await fetchProfile(state.session.user.id);
    setState((s) => ({ ...s, profile }));
    window.api.notifyAuthChanged();
  }, [state.session, fetchProfile]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }, []);

  return { ...state, signUp, signIn, signOut, refreshProfile, resetPassword };
}
