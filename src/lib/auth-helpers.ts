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

const GUEST_KEY = "mecha:guest-cred";

function randChars(n: number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** 게스트 시작: 닉네임만 받고 내부적으로 계정을 만들어 바로 로그인.
 *  같은 기기에서는 저장된 게스트 계정을 재사용한다. */
export async function signInAsGuest(nickname: string) {
  const nick = nickname.trim();
  // 1) 이 기기에 저장된 게스트 계정이 있으면 재사용
  try {
    const saved = localStorage.getItem(GUEST_KEY);
    if (saved) {
      const { id, pw } = JSON.parse(saved) as { id: string; pw: string };
      const r = await signInWithUsername(id, pw);
      if (!r.error) {
        const uid = r.data.user?.id;
        if (uid) {
          // 새로 입력한 닉네임으로 갱신 (겹치면 기존 닉네임 유지)
          await supabase.from("profiles").update({ username: nick }).eq("id", uid);
        }
        return { error: null };
      }
    }
  } catch { /* ignore */ }
  // 2) 새 게스트 계정 생성
  const id = `guest_${randChars(8)}`;
  const pw = randChars(16);
  const { error } = await signUpWithUsername(id, pw, nick);
  if (!error) {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify({ id, pw })); } catch { /* ignore */ }
  }
  return { error };
}

export function generateRoomCode(): string {
  // 6-digit numeric room code
  return String(Math.floor(100000 + Math.random() * 900000));
}
