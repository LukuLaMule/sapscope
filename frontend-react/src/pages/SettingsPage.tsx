import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchMe } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, KeyRound, Shield, CheckCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Account preferences and security</p>
      </div>
      <AccountSection />
      <PasswordSection />
    </div>
  );
}

function AccountSection() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: Infinity });

  return (
    <div className="section-card space-y-4">
      <div className="section-header">
        <div className="section-icon"><User className="w-4 h-4" /></div>
        <h2 className="text-sm font-semibold text-foreground">Account</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="kpi-card">
          <div className="text-[11px] text-muted-foreground mb-1">Email</div>
          <div className="text-sm font-mono text-foreground">{me?.email || "—"}</div>
        </div>
        <div className="kpi-card">
          <div className="text-[11px] text-muted-foreground mb-1">Role</div>
          <div className="flex items-center gap-2 mt-0.5">
            {me?.is_admin
              ? <><Shield className="w-3.5 h-3.5 text-primary" /><Badge variant="default" className="text-xs">Admin</Badge></>
              : <Badge variant="secondary" className="text-xs">Consultant</Badge>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function PwdInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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

function PasswordSection() {
  const [current, setCurrent]     = useState("");
  const [next, setNext]           = useState("");
  const [confirm, setConfirm]     = useState("");
  const [success, setSuccess]     = useState(false);

  const { mutate: changePassword, isPending } = useMutation({
    mutationFn: () => apiFetch("/api/v1/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify({ current_password: current, new_password: next }),
    }),
    onSuccess: () => {
      setCurrent(""); setNext(""); setConfirm("");
      setSuccess(true);
      toast.success("Password updated");
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mismatch  = next && confirm && next !== confirm;
  const tooShort  = next && next.length < 12;
  const canSubmit = current && next && confirm && next === confirm && next.length >= 12;

  return (
    <div className="section-card space-y-4">
      <div className="section-header">
        <div className="section-icon"><KeyRound className="w-4 h-4" /></div>
        <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
      </div>

      <div className="space-y-3 max-w-sm">
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Current password</Label>
          <PwdInput value={current} onChange={setCurrent} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">New password</Label>
          <PwdInput value={next} onChange={setNext} />
          {tooShort && <p className="text-xs text-[hsl(var(--status-warning))] mt-1">Minimum 12 characters</p>}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Confirm new password</Label>
          <div className={mismatch ? "[&_input]:border-[hsl(var(--status-critical))]" : ""}>
            <PwdInput value={confirm} onChange={setConfirm} />
          </div>
          {mismatch && <p className="text-xs text-[hsl(var(--status-critical))] mt-1">Passwords do not match</p>}
        </div>

        <Button
          onClick={() => changePassword()}
          disabled={!canSubmit || isPending}
          className="w-full gap-2">
          {success
            ? <><CheckCircle className="w-4 h-4" />Updated</>
            : isPending ? "Updating…" : "Update Password"
          }
        </Button>
      </div>
    </div>
  );
}
