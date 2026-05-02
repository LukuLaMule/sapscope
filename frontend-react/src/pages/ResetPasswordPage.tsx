import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

function PwdInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative mt-1.5">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "••••••••••••"}
        className="bg-background border-border pr-10"
        required
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [params]     = useSearchParams();
  const navigate     = useNavigate();
  const token        = params.get("reset_token") ?? "";

  const [pwd, setPwd]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState("");

  const mismatch = pwd && confirm && pwd !== confirm;
  const tooShort = pwd && pwd.length < 12;
  const canSubmit = token && pwd && confirm && pwd === confirm && pwd.length >= 12;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password: pwd }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Lien invalide ou expiré.");
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
          <p className="text-sm text-muted-foreground">Réinitialisation du mot de passe</p>
        </div>

        <div className="section-card p-6">
          {!token ? (
            <p className="text-sm text-[hsl(var(--status-critical))] text-center">
              Lien invalide ou expiré.
            </p>
          ) : done ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-10 h-10 text-[hsl(var(--status-ok))] mx-auto" />
              <p className="text-sm text-foreground">Mot de passe mis à jour.</p>
              <Button className="w-full" onClick={() => navigate("/")}>
                Se connecter
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Nouveau mot de passe
                </Label>
                <PwdInput value={pwd} onChange={setPwd} />
                {tooShort && (
                  <p className="text-xs text-[hsl(var(--status-warning))] mt-1">12 caractères minimum</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Confirmer
                </Label>
                <div className={mismatch ? "[&_input]:border-[hsl(var(--status-critical))]" : ""}>
                  <PwdInput value={confirm} onChange={setConfirm} />
                </div>
                {mismatch && (
                  <p className="text-xs text-[hsl(var(--status-critical))] mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              {error && (
                <div className="text-sm text-[hsl(var(--status-critical))] bg-[hsl(var(--status-critical))]/10 border border-[hsl(var(--status-critical))]/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
                {loading ? "Mise à jour…" : "Mettre à jour"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
