import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [step, setStep]         = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleLogin(e: FormEvent) {
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

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStep("sent");
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1 mb-2">
            <span className="font-mono text-2xl font-bold text-primary tracking-tight">SAP</span>
            <span className="text-2xl font-semibold text-foreground">scope</span>
          </div>
          <p className="text-sm text-muted-foreground">SAP Landscape Intelligence</p>
        </div>

        {step === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
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
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="bg-background border-border pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-status-critical bg-status-critical/10 border border-status-critical/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Connexion…" : "Se connecter"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setStep("forgot"); setError(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </div>
          </form>
        )}

        {step === "forgot" && (
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="section-card p-6 space-y-4">
              <button
                type="button"
                onClick={() => { setStep("login"); setError(""); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Retour
              </button>
              <p className="text-sm text-muted-foreground">
                Entrez votre email pour recevoir un lien de réinitialisation.
              </p>
              <div>
                <Label htmlFor="reset-email" className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="consultant@company.com"
                  className="mt-1.5 bg-background border-border"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="text-sm text-[hsl(var(--status-critical))] bg-[hsl(var(--status-critical))]/10 border border-[hsl(var(--status-critical))]/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Envoi…" : "Envoyer le lien"}
              </Button>
            </div>
          </form>
        )}

        {step === "sent" && (
          <div className="section-card p-6 text-center space-y-4">
            <CheckCircle className="w-10 h-10 text-[hsl(var(--status-ok))] mx-auto" />
            <p className="text-sm text-foreground">
              Si cet email est enregistré, vous recevrez un lien dans quelques minutes.
            </p>
            <button
              type="button"
              onClick={() => { setStep("login"); setError(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            >
              Retour à la connexion
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          SAPscope · SAP Basis Monitoring Platform
        </p>
      </div>
    </div>
  );
}
