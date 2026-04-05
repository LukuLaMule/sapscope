import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchOnboarding } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, Copy, Terminal, Rocket, ArrowRight,
  Server, Shield, Activity, ChevronRight,
} from "lucide-react";

const STEPS = ["Welcome", "Your Token", "Install Agent", "Done"] as const;

type Platform = "linux" | "macos" | "windows";

function installCmd(token: string, platform: Platform): string {
  if (platform === "windows") {
    return `$env:SAPSCOPE_TOKEN="${token}"\nInvoke-WebRequest https://app.sapscope.com/install.ps1 | Invoke-Expression`;
  }
  return `SAPSCOPE_TOKEN="${token}" \\\n  bash <(curl -fsSL https://app.sapscope.com/install.sh)`;
}

export default function OnboardingPage() {
  const navigate       = useNavigate();
  const [params]       = useSearchParams();
  const activated      = params.get("activated") === "1";
  const [step, setStep]     = useState(0);
  const [platform, setPlatform] = useState<Platform>("linux");
  const [copied, setCopied] = useState(false);

  const { data: onboarding, isLoading } = useQuery({
    queryKey:  ["onboarding"],
    queryFn:   fetchOnboarding,
    staleTime: Infinity,
    retry:     false,
  });

  // Skip directly to token step if already past welcome
  useEffect(() => {
    if (!activated && step === 0) setStep(1);
  }, [activated]);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const token       = onboarding?.token ?? null;
  const clientName  = onboarding?.client_name ?? "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">

        {/* Progress */}
        <div className="flex items-center gap-2 justify-center mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-medium transition-all ${
                i === step ? "text-primary" : i < step ? "text-[hsl(var(--status-ok))]" : "text-muted-foreground/40"
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono border transition-all ${
                  i === step ? "border-primary bg-primary/10 text-primary"
                  : i < step ? "border-[hsl(var(--status-ok))] bg-[hsl(var(--status-ok))]/10 text-[hsl(var(--status-ok))]"
                  : "border-border text-muted-foreground/40"
                }`}>
                  {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="section-card !p-8 space-y-6">

          {/* ── Step 0 : Welcome ── */}
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Rocket className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Subscription activated!</h1>
                <p className="text-muted-foreground mt-2">
                  {clientName
                    ? <>Your client <span className="text-foreground font-semibold">{clientName}</span> has been created. Let's set up your first SAP agent.</>
                    : "Let's set up your first SAP agent."
                  }
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center pt-2">
                {[
                  { icon: <Server className="w-5 h-5" />, label: "Monitor SAP systems" },
                  { icon: <Shield className="w-5 h-5" />, label: "Security analysis" },
                  { icon: <Activity className="w-5 h-5" />, label: "Health scoring" },
                ].map(({ icon, label }) => (
                  <div key={label} className="kpi-card flex flex-col items-center gap-2 py-4">
                    <span className="text-primary">{icon}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-2" onClick={() => setStep(1)}>
                Get started <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── Step 1 : Token ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">Your agent token</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This token authenticates your SAP agent. {!token && "A new token can be created from the Admin panel."}
                </p>
              </div>

              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : token ? (
                <>
                  <div className="rounded-lg border border-border bg-[hsl(var(--surface-1))] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Agent Token</span>
                      <button
                        onClick={() => copy(token)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <code className="font-mono text-sm text-foreground break-all">{token}</code>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--status-warning))]/20 bg-[hsl(var(--status-warning))]/5 p-3 text-xs text-[hsl(var(--status-warning))]">
                    ⚠ This token is shown only once. Save it now — it cannot be retrieved later.
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-border bg-[hsl(var(--surface-1))] p-4 text-sm text-muted-foreground">
                  No pending token. You can create one in <button onClick={() => navigate("/admin")} className="text-primary underline">Admin → Clients → Tokens</button>.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1">Back</Button>
                <Button onClick={() => setStep(2)} className="flex-1">
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2 : Install ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">Install the agent</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Run this command on the SAP application server (ABAP instance).
                </p>
              </div>

              {/* Platform picker */}
              <div className="flex gap-2">
                {(["linux", "macos", "windows"] as Platform[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all capitalize ${
                      platform === p
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-[hsl(var(--surface-1))] border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    {p === "linux" ? "Linux" : p === "macos" ? "macOS" : "Windows"}
                  </button>
                ))}
              </div>

              {/* Command block */}
              <div className="rounded-lg border border-border bg-[hsl(var(--surface-2))] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Terminal className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {platform === "windows" ? "PowerShell" : "Terminal"}
                    </span>
                  </div>
                  <button
                    onClick={() => copy(installCmd(token ?? "YOUR_TOKEN", platform))}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-all leading-relaxed">
                  {installCmd(token ?? "YOUR_TOKEN", platform)}
                </pre>
              </div>

              <div className="rounded-lg border border-border bg-[hsl(var(--surface-1))] p-4 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">What the agent collects</div>
                {[
                  "System info (release, kernel, BASIS SP)",
                  "ABAP dumps, work processes, RFC errors",
                  "Transport queue, background jobs, spool",
                  "Security: default users, SAP_ALL, locked accounts",
                  "Installed components (CVERS), tablespace usage",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--status-ok))] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button onClick={() => setStep(3)} className="flex-1">
                  Done, show my dashboard <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3 : Done ── */}
          {step === 3 && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--status-ok))]/10 border border-[hsl(var(--status-ok))]/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-[hsl(var(--status-ok))]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">You're all set!</h2>
                <p className="text-muted-foreground mt-2">
                  Once the agent runs, your first snapshot will appear on the dashboard within a minute.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button variant="outline" onClick={() => navigate("/admin")}>
                  Admin panel
                </Button>
                <Button onClick={() => navigate("/")}>
                  Go to dashboard <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Skip link */}
        {step < 3 && (
          <div className="text-center">
            <button onClick={() => navigate("/")} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              Skip setup — go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
