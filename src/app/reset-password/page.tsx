"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><div className="text-muted">Loading...</div></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(data.message);
      setDone(true);
    } catch { setError("Something went wrong"); }
    finally { setLoading(false); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setError(""); setMessage(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(data.message);
      setDone(true);
    } catch { setError("Something went wrong"); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-4xl inline-block mb-4">&#9971;</Link>
          <h1 className="text-3xl font-bold">{token ? "Set New Password" : "Reset Password"}</h1>
        </div>

        <div className="bg-surface rounded-xl p-8 border border-border space-y-4">
          {error && <div className="bg-red-50 text-danger border border-red-200 rounded-lg p-3 text-sm">{error}</div>}
          {message && <div className="bg-green-50 text-success border border-green-200 rounded-lg p-3 text-sm">{message}</div>}

          {!done && !token && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="you@example.com"/>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-primary hover:bg-primary-light text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          )}

          {!done && token && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="At least 6 characters"/>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6}
                  className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Confirm password"/>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-primary hover:bg-primary-light text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-muted">
            <Link href="/login" className="text-primary font-medium hover:underline">Back to Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
