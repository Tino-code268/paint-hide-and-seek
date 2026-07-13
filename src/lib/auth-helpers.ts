import { supabase } from "@/integrations/supabase/client";

// Supabase requires an email for password auth. We map username -> synthetic email.
export const USERNAME_EMAIL_DOMAIN = "mecha-chameleon.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export function isValidUsername(u: string): boolean {
  // Login ID: ASCII only (used to synthesize an email)
  return /^[a-zA-Z0-9_]{2,20}$/.test(u.trim());
}

export function isValidNickname(n: string): boolean {
  // Display name: allows Korean, letters, numbers, underscore, space
  return /^[a-zA-Z0-9_가-힣 ]{2,16}$/.test(n.trim());
}

export async function signUpWithUsername(username: string, password: string, nickname: string) {
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: username.trim(), nickname: nickname.trim() },
      emailRedirectTo: `${window.location.origin}/lobby`,
    },
  });
  return { data, error };
}

export async function signInWithUsername(username: string, password: string) {
  const email = usernameToEmail(username);
  return supabase.auth.signInWithPassword({ email, password });
}

export function generateRoomCode(): string {
  // 6-digit numeric room code
  return String(Math.floor(100000 + Math.random() * 900000));
}
