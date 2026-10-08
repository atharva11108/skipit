import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";

export default function Recovery() {
  const navigate = useNavigate(); const location = useLocation(); const callback = location.pathname === "/auth/callback";
  const [tokens] = useState(() => { const params = new URLSearchParams(window.location.hash.slice(1)); return { access_token: params.get("access_token") ?? "", refresh_token: params.get("refresh_token") ?? undefined, error: params.get("error_description") }; });
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const reset = location.pathname === "/reset-password" && Boolean(tokens.access_token);
  const submit = useMutation({ mutationFn: () => apiPost(reset ? "/auth/password" : "/auth/recover", reset ? { ...tokens, password } : { email: email.trim() }), onSuccess: () => { if (reset) { beginSession(); toast.success("Password updated. Sign in again."); navigate("/login", { replace: true }); } else toast.success("If an account exists, a reset link is on its way."); }, onError: (error) => toast.error(error.message) });
  const accept = useMutation({ mutationFn: () => apiPost("/auth/session", tokens), onSuccess: () => { beginSession(); navigate("/dashboard", { replace: true }); } });
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; window.history.replaceState(null, "", window.location.pathname); if (callback && tokens.access_token) accept.mutate(); }, [callback, accept, tokens.access_token]);
  return <main className="grid min-h-screen place-items-center px-5 py-12"><div className="w-full max-w-md"><Link to="/" className="font-heading text-3xl">Skipti AI</Link><section className="panel mt-8 p-7"><h1 className="font-heading text-4xl">{callback ? "Confirming your account" : reset ? "Choose a new password" : "Reset your password"}</h1>
    {callback ? <p className="mt-5 text-sm text-muted-foreground" role="status">{accept.isError ? accept.error.message : tokens.error ?? (!tokens.access_token ? "This account link is invalid or expired. Please sign in or request a new link." : "Securing your session…")}</p> : <form className="mt-6 space-y-5" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>{tokens.error ? <p role="alert" className="text-sm text-red-300">{tokens.error}</p> : null}{reset ? <><div><label htmlFor="new-password" className="mb-2 block text-sm">New password</label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></div><div><label htmlFor="confirm-password" className="mb-2 block text-sm">Confirm password</label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>{confirm && password !== confirm ? <p className="text-xs text-red-300">Passwords must match.</p> : null}</> : <><p className="text-sm leading-6 text-muted-foreground">Enter your account email to receive a password reset link.</p><div><label htmlFor="recovery-email" className="mb-2 block text-sm">Email address</label><Input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div></>}
    <Button type="submit" className="w-full" disabled={submit.isPending || (reset && (password.length < 8 || password !== confirm))}>{submit.isPending ? "Please wait…" : reset ? "Update password" : "Send reset link"}</Button>{submit.isSuccess && !reset ? <p className="text-sm text-emerald-300" role="status">Check your inbox for the reset link.</p> : null}</form>}
    <Link to="/login" className="mt-6 inline-block text-sm text-[#d7a0b1]">Back to sign in</Link></section></div></main>;
}
