import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { isValidUsername, signInWithUsername, signUpWithUsername } from "@/lib/auth-helpers";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/lobby", replace: true });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    if (!isValidUsername(username)) return toast.error("아이디는 2~20자, 영문/숫자/한글/_ 만");
    if (password.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다");
    setLoading(true);
    const { error } = await signInWithUsername(username, password);
    setLoading(false);
    if (error) return toast.error("로그인 실패: 아이디/비밀번호를 확인하세요");
    toast.success("로그인 성공");
    navigate({ to: "/lobby", replace: true });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    if (!isValidUsername(username)) return toast.error("아이디는 2~20자, 영문/숫자/한글/_ 만");
    if (password.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다");
    setLoading(true);
    const { error } = await signUpWithUsername(username, password);
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase().includes("registered") || error.message.toLowerCase().includes("exists")
        ? "이미 사용 중인 아이디입니다" : "회원가입 실패: " + error.message;
      return toast.error(msg);
    }
    toast.success("가입 완료! 로비로 이동합니다");
    navigate({ to: "/lobby", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center mb-6 font-bold tracking-widest text-primary text-glow">
          MECHA · CHAMELEON
        </Link>
        <Card className="border-border/60 bg-card/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="tracking-widest">접속</CardTitle>
            <CardDescription>아이디와 비밀번호로 게임에 입장합니다</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="signin">로그인</TabsTrigger>
                <TabsTrigger value="signup">회원가입</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form className="space-y-4 mt-4" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="signin-username">아이디</Label>
                    <Input id="signin-username" name="username" required autoComplete="username" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">비밀번호</Label>
                    <Input id="signin-password" name="password" type="password" required autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "접속 중..." : "로그인"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form className="space-y-4 mt-4" onSubmit={handleSignUp}>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">아이디 (2~20자)</Label>
                    <Input id="signup-username" name="username" required autoComplete="username" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">비밀번호 (6자 이상)</Label>
                    <Input id="signup-password" name="password" type="password" required autoComplete="new-password" minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "생성 중..." : "회원가입"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
