import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1 mb-2">
            <span className="font-mono text-2xl font-bold text-primary tracking-tight">SAP</span>
            <span className="text-2xl font-semibold text-foreground">scope</span>
          </div>
          <p className="text-sm text-muted-foreground">SAP Landscape Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="section-card p-6 space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="consultant@company.com"
                className="mt-1.5 bg-background border-border"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs text-muted-foreground uppercase tracking-wider">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1.5 bg-background border-border"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-status-critical bg-status-critical/10 border border-status-critical/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          SAPscope · SAP Basis Monitoring Platform
        </p>
      </div>
    </div>
  );
}
