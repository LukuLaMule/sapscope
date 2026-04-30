import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchClients, fetchSnapshots } from "@/lib/api";
import { snapshotToSystem } from "@/lib/data-adapter";
import { getScoreColor, getStatusBadgeClass, getTierBadgeClass } from "@/lib/sap-utils";
import { getKernelStatus, getKernelStatusLabel, VERSION_STATUS_CLASS } from "@/lib/sap-versions";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// Formate une date SAP YYYYMMDD + heure HHMMSS
function fmtSapDateTime(date: string, time?: string): string {
  if (!date || date.length < 8) return "—";
  const d = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  if (time && time.length >= 6) {
    return `${date.slice(6,8)}/${date.slice(4,6)}/${date.slice(0,4)} ${time.slice(0,2)}:${time.slice(2,4)}`;
  }
  return `${date.slice(6,8)}/${date.slice(4,6)}/${date.slice(0,4)}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_FR: Record<string, string> = {
  OK: "Opérationnel",
  WARNING: "Attention",
  CRITICAL: "Critique",
  UNKNOWN: "Inconnu",
};

const DOMAIN_FR: Record<string, string> = {
  stability:      "Stabilité",
  performance:    "Performance",
  connectivity:   "Connectivité",
  infrastructure: "Infrastructure",
  security:       "Sécurité utilisateurs",
  security_ops:   "Sécurité opérationnelle",
  transports:     "Transports",
};

// RAG pill — solid colors for print fidelity
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; border: string }> = {
    OK:       { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
    WARNING:  { bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
    CRITICAL: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
    UNKNOWN:  { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" },
  };
  const c = cfg[status] ?? cfg.UNKNOWN;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      display: "inline-block", whiteSpace: "nowrap",
    }}>
      {STATUS_FR[status] ?? status}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "#15803d" : score >= 50 ? "#b45309" : "#b91c1c";
  const bg    = score >= 80 ? "#dcfce7" : score >= 50 ? "#fef3c7" : "#fee2e2";
  return (
    <span style={{
      background: bg, color, fontFamily: "monospace", fontWeight: 700,
      fontSize: 13, padding: "1px 8px", borderRadius: 4,
    }}>
      {score}
    </span>
  );
}

function TierPill({ tier }: { tier: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    Production:  { bg: "#fee2e2", text: "#991b1b" },
    Quality:     { bg: "#fef3c7", text: "#92400e" },
    Development: { bg: "#dbeafe", text: "#1e40af" },
  };
  const c = cfg[tier] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{
      background: c.bg, color: c.text, fontSize: 10, fontWeight: 600,
      padding: "1px 7px", borderRadius: 3,
    }}>
      {tier}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const clientInfo = clients.find(c => c.id === clientId);

  const { data: rawSnapshots = [], isLoading } = useQuery({
    queryKey: ["snapshots", clientId],
    queryFn:  () => fetchSnapshots(clientId!),
    enabled:  !!clientId,
  });

  // Latest snapshot per SID
  const systemsBySid = new Map<string, typeof rawSnapshots[0]>();
  for (const s of rawSnapshots) {
    const ex = systemsBySid.get(s.system_sid);
    if (!ex || s.collected_at > ex.collected_at) systemsBySid.set(s.system_sid, s);
  }
  const systems = Array.from(systemsBySid.values())
    .sort((a, b) => (b.health?.score ?? 0) - (a.health?.score ?? 0));

  const totalSystems  = systems.length;
  const okCount       = systems.filter(s => s.health?.status === "OK").length;
  const warnCount     = systems.filter(s => s.health?.status === "WARNING").length;
  const criticalCount = systems.filter(s => s.health?.status === "CRITICAL").length;
  const avgScore      = totalSystems
    ? Math.round(systems.reduce((s, sys) => s + (sys.health?.score ?? 0), 0) / totalSystems)
    : 0;

  const alertSystems = systems.filter(s => (s.health?.status ?? "OK") !== "OK");

  const now           = new Date();
  const generatedDate = fmtDateTime(now.toISOString());
  const periodLabel   = systems.length > 0
    ? `Dernière collecte : ${fmtDate(systems[0].collected_at)}`
    : "—";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
        Génération du rapport…
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar (masquée à l'impression) ───────────────────────────── */}
      <div className="print:hidden flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground flex-1">
          Rapport paysage SAP — {clientInfo?.name || clientId}
        </span>
        <Button size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-3.5 h-3.5" />
          Télécharger PDF
        </Button>
      </div>

      {/* ── Contenu rapport ─────────────────────────────────────────────── */}
      <div id="report-root" style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        background: "white",
        color: "#1a1a2e",
        minHeight: "100vh",
      }}>

        {/* ══ PAGE DE COUVERTURE ══════════════════════════════════════════ */}
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          padding: "0",
          pageBreakAfter: "always",
          breakAfter: "page",
        }}>
          {/* Bandeau supérieur navy */}
          <div style={{
            background: "#0a1628",
            padding: "28px 48px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <span style={{ fontSize: 22, fontWeight: 800, color: "white", letterSpacing: -0.5 }}>
                SAP<span style={{ color: "#4a9eff" }}>scope</span>
              </span>
              <div style={{ fontSize: 10, color: "#4a7ab5", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
                SAP Landscape Intelligence
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {clientInfo?.logo_b64 && (
                <img
                  src={clientInfo.logo_b64}
                  alt="Logo client"
                  style={{ maxHeight: 48, maxWidth: 160, objectFit: "contain" }}
                />
              )}
              <div style={{ fontSize: 11, color: "#4a7ab5", textAlign: "right" }}>
                <div>Rapport généré le</div>
                <div style={{ color: "#8ab4d4", marginTop: 2 }}>{generatedDate}</div>
              </div>
            </div>
          </div>

          {/* Zone centrale couverture */}
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 48px",
          }}>
            {/* Ligne décorative */}
            <div style={{ display: "flex", gap: 6, marginBottom: 40 }}>
              <div style={{ width: 40, height: 4, background: "#0a1628", borderRadius: 2 }} />
              <div style={{ width: 20, height: 4, background: "#4a9eff", borderRadius: 2 }} />
              <div style={{ width: 10, height: 4, background: "#c9a84c", borderRadius: 2 }} />
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "#4a9eff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              Rapport de santé du paysage SAP
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: "#0a1628", margin: "0 0 8px", lineHeight: 1.1 }}>
              {clientInfo?.name || "Client"}
            </h1>
            <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 56 }}>
              {periodLabel}
            </div>

            {/* KPIs couverture */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, maxWidth: 640 }}>
              {[
                { label: "Score moyen",       value: `${avgScore}/100`, color: avgScore >= 80 ? "#15803d" : avgScore >= 50 ? "#b45309" : "#b91c1c", bg: avgScore >= 80 ? "#dcfce7" : avgScore >= 50 ? "#fef3c7" : "#fee2e2" },
                { label: "Systèmes OK",       value: String(okCount),       color: "#15803d", bg: "#f0fdf4" },
                { label: "En attention",      value: String(warnCount),     color: warnCount > 0 ? "#b45309" : "#374151", bg: warnCount > 0 ? "#fffbeb" : "#f9fafb" },
                { label: "Critiques",         value: String(criticalCount), color: criticalCount > 0 ? "#b91c1c" : "#374151", bg: criticalCount > 0 ? "#fff1f2" : "#f9fafb" },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  background: kpi.bg,
                  border: `1px solid ${kpi.color}22`,
                  borderRadius: 8,
                  padding: "16px 20px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color, fontFamily: "monospace" }}>
                    {kpi.value}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    {kpi.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pied de couverture */}
          <div style={{
            borderTop: "1px solid #e5e7eb",
            padding: "20px 48px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              Document confidentiel — Usage interne
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              {totalSystems} système{totalSystems > 1 ? "s" : ""} surveillé{totalSystems > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* ══ PAGE 2 — SYNTHÈSE + TABLEAU ════════════════════════════════ */}
        <div style={{ padding: "40px 48px", pageBreakAfter: "always", breakAfter: "page" }}>

          {/* En-tête de section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 10, color: "#4a9eff", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                Synthèse exécutive
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0a1628", margin: 0 }}>
                Vue d'ensemble du paysage
              </h2>
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
              <div style={{ fontWeight: 600, color: "#374151" }}>{clientInfo?.name}</div>
              <div>{generatedDate}</div>
            </div>
          </div>

          {/* Barre de santé globale */}
          <div style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "20px 24px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}>
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <div style={{
                fontSize: 40,
                fontWeight: 800,
                fontFamily: "monospace",
                color: avgScore >= 80 ? "#15803d" : avgScore >= 50 ? "#b45309" : "#b91c1c",
              }}>
                {avgScore}
              </div>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Score global
              </div>
            </div>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { label: `${okCount} opérationnel${okCount > 1 ? "s" : ""}`, color: "#15803d", dot: "#22c55e" },
                { label: `${warnCount} en attention`,                         color: "#b45309", dot: "#f59e0b" },
                { label: `${criticalCount} critique${criticalCount > 1?"s":""}`, color: "#b91c1c", dot: "#ef4444" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: item.color, fontWeight: 600 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.dot }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Tableau des systèmes */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0a1628" }}>
                {["SID", "Environnement", "Version SAP", "Kernel", "BASIS SP", "Base de données", "Score", "Statut", "Dernière collecte"].map(h => (
                  <th key={h} style={{
                    padding: "9px 12px", textAlign: "left",
                    fontSize: 10, fontWeight: 700, color: "#94a3b8",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {systems.map((s, i) => {
                const kStatus = getKernelStatus(s.kernel_release);
                const kLabel  = getKernelStatusLabel(s.kernel_release);
                const kernelStr = s.kernel_release
                  ? `${s.kernel_release}${s.kernel_patch ? "."+s.kernel_patch : ""}`
                  : "—";
                const tier = snapshotToSystem(s, clientId!).tier;
                return (
                  <tr key={s.system_sid} style={{ background: i % 2 === 0 ? "white" : "#f8fafc" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 700, color: "#0a1628", fontSize: 13 }}>
                      {s.system_sid}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <TierPill tier={tier} />
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#374151" }}>
                      {s.system_release || "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontFamily: "monospace", color: "#374151" }}>{kernelStr}</span>
                      {kStatus !== "unknown" && (
                        <span style={{
                          marginLeft: 4, fontSize: 9, padding: "1px 5px",
                          borderRadius: 3, border: "1px solid currentColor",
                          color: kStatus === "eol" ? "#b91c1c" : kStatus === "maintenance" ? "#b45309" : "#15803d",
                          background: kStatus === "eol" ? "#fee2e2" : kStatus === "maintenance" ? "#fef3c7" : "#dcfce7",
                        }}>
                          {kLabel}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#6b7280" }}>
                      {s.basis_sp ? `SP ${s.basis_sp.padStart(4,"0")}` : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#6b7280" }}>{s.db_type || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <ScoreBadge score={s.health?.score ?? 0} />
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <StatusPill status={s.health?.status ?? "UNKNOWN"} />
                    </td>
                    <td style={{ padding: "8px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {fmtDate(s.collected_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pied de page */}
          <ReportFooter clientName={clientInfo?.name} />
        </div>

        {/* ══ PAGE 3 — INDICATEURS OPÉRATIONNELS ════════════════════════ */}
        <div style={{ padding: "40px 48px", pageBreakAfter: "always", breakAfter: "page" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: "#4a9eff", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              Monitoring opérationnel
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0a1628", margin: 0 }}>
              Détail par transaction
            </h2>
          </div>

          {systems.map(s => {
            const hasOps =
              (s.st22_count_24h ?? 0) > 0 ||
              (s.jobs_error_24h_count ?? 0) > 0 ||
              (s.sm12_locks_count ?? 0) > 0 ||
              (s.qrfc_outbound_errors ?? 0) > 0 ||
              (s.qrfc_inbound_errors ?? 0) > 0 ||
              (s.update_errors ?? 0) > 0;

            return (
              <div key={s.system_sid} style={{ marginBottom: 32, breakInside: "avoid" }}>
                {/* En-tête système */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", background: "#0a1628", borderRadius: "8px 8px 0 0",
                }}>
                  <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: "white" }}>
                    {s.system_sid}
                  </span>
                  <span style={{ fontSize: 11, color: "#4a7ab5" }}>{s.system_host}</span>
                  {!hasOps && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#2dd4a0", fontWeight: 600 }}>
                      ✓ Aucun incident opérationnel
                    </span>
                  )}
                </div>

                <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>

                  {/* ── ST22 Dumps ── */}
                  <OpsRow
                    tcode="ST22"
                    label="Short Dumps (24h)"
                    count={s.st22_count_24h ?? 0}
                    severity={s.st22_count_24h ? (s.st22_count_24h > 5 ? "critical" : "warning") : "ok"}
                  >
                    {(s.st22_list_24h?.length ?? 0) > 0 && (
                      <MiniTable
                        headers={["Programme", "Utilisateur", "Client", "Date / Heure"]}
                        rows={(s.st22_list_24h ?? []).slice(0, 10).map((d: any) => [
                          d.program || "—",
                          d.user    || "—",
                          d.client  || "—",
                          fmtSapDateTime(d.date, d.time),
                        ])}
                      />
                    )}
                  </OpsRow>

                  {/* ── SM37 Jobs en erreur ── */}
                  <OpsRow
                    tcode="SM37"
                    label="Jobs en erreur (24h)"
                    count={s.jobs_error_24h_count ?? 0}
                    severity={s.jobs_error_24h_count ? (s.jobs_error_24h_count > 10 ? "critical" : "warning") : "ok"}
                    border
                  >
                    {(s.jobs_error_24h_list?.length ?? 0) > 0 && (
                      <MiniTable
                        headers={["Nom du job", "Lancé par", "Date / Heure"]}
                        rows={(s.jobs_error_24h_list ?? []).slice(0, 10).map((j: any) => [
                          j.name || "—",
                          j.user || "—",
                          fmtSapDateTime(j.date, j.time),
                        ])}
                      />
                    )}
                  </OpsRow>

                  {/* ── SM12 Entrées bloquées ── */}
                  <OpsRow
                    tcode="SM12"
                    label="Entrées bloquées (en cours)"
                    count={s.sm12_locks_count ?? 0}
                    severity={s.sm12_locks_count ? (s.sm12_locks_count > 20 ? "critical" : "warning") : "ok"}
                    border
                  >
                    {(s.sm12_locks_list?.length ?? 0) > 0 && (
                      <MiniTable
                        headers={["Objet de blocage", "Utilisateur", "Mode", "Mandant"]}
                        rows={(s.sm12_locks_list ?? []).slice(0, 10).map((l: any) => [
                          l.object || "—",
                          l.user   || "—",
                          l.mode === "E" ? "Exclusif" : l.mode === "S" ? "Partagé" : l.mode || "—",
                          l.client || "—",
                        ])}
                      />
                    )}
                  </OpsRow>

                  {/* ── SMQ1 / SMQ2 qRFC ── */}
                  <OpsRow
                    tcode="SMQ1/2"
                    label="Files qRFC (Outbound / Inbound)"
                    count={null}
                    severity={
                      (s.qrfc_outbound_errors ?? 0) > 0 || (s.qrfc_inbound_errors ?? 0) > 0
                        ? "warning" : "ok"
                    }
                    border
                  >
                    <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                      {[
                        { label: "SMQ1 Outbound — total", val: s.qrfc_outbound_total ?? "—" },
                        { label: "SMQ1 Outbound — erreurs", val: s.qrfc_outbound_errors ?? "—", alert: (s.qrfc_outbound_errors ?? 0) > 0 },
                        { label: "SMQ2 Inbound — total",   val: s.qrfc_inbound_total ?? "—" },
                        { label: "SMQ2 Inbound — erreurs", val: s.qrfc_inbound_errors ?? "—", alert: (s.qrfc_inbound_errors ?? 0) > 0 },
                      ].map(item => (
                        <div key={item.label} style={{
                          background: (item as any).alert ? "#fff1f2" : "#f8fafc",
                          border: `1px solid ${(item as any).alert ? "#fca5a5" : "#e2e8f0"}`,
                          borderRadius: 6, padding: "8px 14px", flex: 1, textAlign: "center",
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: (item as any).alert ? "#b91c1c" : "#0a1628" }}>
                            {String(item.val)}
                          </div>
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </OpsRow>

                  {/* ── SM13 Update errors ── */}
                  {(s.update_errors ?? 0) > 0 && (
                    <OpsRow
                      tcode="SM13"
                      label="Erreurs de mise à jour"
                      count={s.update_errors ?? 0}
                      severity="critical"
                      border
                    />
                  )}

                </div>
              </div>
            );
          })}

          <ReportFooter clientName={clientInfo?.name} />
        </div>

        {/* ══ PAGE 4 — DÉTAIL DES ALERTES SANTÉ (si nécessaire) ═══════════ */}
        {alertSystems.length > 0 && (
          <div style={{ padding: "40px 48px" }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                Points d'attention
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0a1628", margin: 0 }}>
                Systèmes nécessitant une intervention
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {alertSystems.map(s => {
                const hc = s.health;
                const indicators = hc?.indicators ?? {};
                return (
                  <div key={s.system_sid} style={{
                    border: `1px solid ${hc?.status === "CRITICAL" ? "#fca5a5" : "#fcd34d"}`,
                    borderLeft: `4px solid ${hc?.status === "CRITICAL" ? "#ef4444" : "#f59e0b"}`,
                    borderRadius: 8,
                    padding: "18px 20px",
                    background: hc?.status === "CRITICAL" ? "#fff8f8" : "#fffdf0",
                    breakInside: "avoid",
                  }}>
                    {/* Entête système */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: "#0a1628" }}>
                        {s.system_sid}
                      </span>
                      <StatusPill status={hc?.status ?? "UNKNOWN"} />
                      <ScoreBadge score={hc?.score ?? 0} />
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
                        {s.system_host}
                      </span>
                    </div>

                    {/* Domaines */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {Object.entries(indicators).map(([domain, ind]: [string, any]) => {
                        if (ind?.score == null) return null;
                        const isAlert = ind.score < 80;
                        return (
                          <div key={domain} style={{
                            background: isAlert ? (ind.score < 50 ? "#fff1f2" : "#fffbeb") : "#f0fdf4",
                            border: `1px solid ${isAlert ? (ind.score < 50 ? "#fca5a5" : "#fcd34d") : "#bbf7d0"}`,
                            borderRadius: 6,
                            padding: "10px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}>
                            <span style={{ fontSize: 11, color: "#374151" }}>
                              {DOMAIN_FR[domain] ?? domain}
                            </span>
                            <ScoreBadge score={ind.score} />
                          </div>
                        );
                      })}
                    </div>

                    {/* Alertes sécurité */}
                    {s.security_default_users?.length > 0 && (
                      <div style={{ marginTop: 12, padding: "8px 12px", background: "#fff1f2", borderRadius: 6, fontSize: 11, color: "#b91c1c" }}>
                        ⚠ Utilisateurs par défaut actifs : {s.security_default_users.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <ReportFooter clientName={clientInfo?.name} />
          </div>
        )}

      </div>
    </>
  );
}

// ── Ligne opérationnelle (ST22, SM37, SM12…) ──────────────────────────────

function OpsRow({
  tcode, label, count, severity, border, children,
}: {
  tcode: string;
  label: string;
  count: number | null;
  severity: "ok" | "warning" | "critical";
  border?: boolean;
  children?: React.ReactNode;
}) {
  const colors = {
    ok:       { bg: "#f0fdf4", text: "#15803d", dot: "#22c55e" },
    warning:  { bg: "#fffbeb", text: "#b45309", dot: "#f59e0b" },
    critical: { bg: "#fff1f2", text: "#b91c1c", dot: "#ef4444" },
  };
  const c = colors[severity];

  return (
    <div style={{
      borderTop: border ? "1px solid #f1f5f9" : undefined,
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: children ? 10 : 0 }}>
        <span style={{
          fontFamily: "monospace", fontSize: 11, fontWeight: 700,
          background: "#0a1628", color: "#4a9eff",
          padding: "2px 8px", borderRadius: 4,
        }}>
          {tcode}
        </span>
        <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{label}</span>
        {count !== null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: c.bg, color: c.text,
            border: `1px solid ${c.dot}44`,
            padding: "3px 12px", borderRadius: 20,
            fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
            {count === 0 ? "Aucun" : `${count} entrée${count > 1 ? "s" : ""}`}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Mini tableau de détail ─────────────────────────────────────────────────

function MiniTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 }}>
      <thead>
        <tr style={{ background: "#f8fafc" }}>
          {headers.map(h => (
            <th key={h} style={{
              padding: "5px 10px", textAlign: "left",
              color: "#6b7280", fontWeight: 600,
              fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              borderBottom: "1px solid #e2e8f0",
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f8fafc" }}>
            {row.map((cell, j) => (
              <td key={j} style={{
                padding: "5px 10px", color: "#374151",
                fontFamily: j === 0 ? "monospace" : undefined,
                borderBottom: "1px solid #f1f5f9",
              }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Footer réutilisable ────────────────────────────────────────────────────

function ReportFooter({ clientName }: { clientName?: string }) {
  return (
    <div style={{
      marginTop: 40,
      paddingTop: 16,
      borderTop: "1px solid #e5e7eb",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 10,
      color: "#9ca3af",
    }}>
      <span>SAPscope · Rapport de santé SAP</span>
      <span style={{ fontWeight: 600, color: "#374151" }}>{clientName}</span>
    </div>
  );
}
