import { supabase } from "@/integrations/supabase/client";

// Supabase requires an email for password auth. We map username -> synthetic email.
export const USERNAME_EMAIL_DOMAIN = "mecha-chameleon.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

// 로그인 아이디: 이메일로 변환되므로 영문/숫자만 가능
export function isValidLoginId(u: string): boolean {
  return /^[a-zA-Z0-9_]{2,20}$/.test(u.trim());
}

// 닉네임: 한글 포함 아무 글자나 1~12자 (게임에서 보이는 이름)
export function isValidNickname(n: string): boolean {
  const t = n.trim();
  return t.length >= 1 && t.length <= 12;
}

export async function signUpWithUsername(username: string, password: string, nickname: string) {
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: nickname.trim() }, // 닉네임이 게임 표시 이름(profiles.username)이 된다
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
