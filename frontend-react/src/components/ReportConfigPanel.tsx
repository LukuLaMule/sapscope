import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Plus, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useReportConfig, useUpdateReportConfig } from "@/hooks/useReportConfig";
import { sendReportNow, type ApiReportConfig } from "@/lib/api";

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

interface Props {
  clientId: string;
  clientName?: string;
}

export default function ReportConfigPanel({ clientId, clientName }: Props) {
  const { data, isLoading, isError } = useReportConfig(clientId);
  const updateMut = useUpdateReportConfig(clientId);

  // Local state mirrors server data
  const [enabled, setEnabled]           = useState(false);
  const [emails, setEmails]             = useState<string[]>([]);
  const [emailInput, setEmailInput]     = useState("");
  const [emailError, setEmailError]     = useState("");
  const [schedule, setSchedule]         = useState<ApiReportConfig["schedule"]>("weekly");
  const [scheduleDay, setScheduleDay]   = useState(0);
  const [language, setLanguage]         = useState<ApiReportConfig["language"]>("fr");
  const [sending, setSending]           = useState(false);

  // Sync from server when data arrives
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setEmails(data.recipient_emails ?? []);
    setSchedule(data.schedule);
    setScheduleDay(data.schedule_day ?? 0);
    setLanguage(data.language);
  }, [data]);

  const handleAddEmail = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setEmailError("Adresse email invalide");
      return;
    }
    if (emails.includes(trimmed)) {
      setEmailError("Adresse déjà présente");
      return;
    }
    setEmails(prev => [...prev, trimmed]);
    setEmailInput("");
    setEmailError("");
  };

  const handleRemoveEmail = (email: string) => {
    setEmails(prev => prev.filter(e => e !== email));
  };

  const handleSave = () => {
    updateMut.mutate(
      { enabled, recipient_emails: emails, schedule, schedule_day: scheduleDay, language },
      {
        onSuccess: () => toast.success("Configuration sauvegardée"),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      await sendReportNow(clientId);
      toast.success("Rapport envoyé");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Chargement…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-6 text-sm text-muted-foreground text-center">
        Impossible de charger la configuration du rapport.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Toggle envoi automatique ── */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-[hsl(var(--surface-1))] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Envoi automatique activé</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Envoie le rapport PDF selon le planning défini ci-dessous
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Activer l'envoi automatique"
        />
      </div>

      {/* ── Emails destinataires ── */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Emails destinataires</Label>

        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {emails.map(email => (
              <span
                key={email}
                className="inline-flex items-center gap-1 text-xs bg-[hsl(var(--surface-1))] border border-border rounded-full px-2.5 py-1 text-muted-foreground"
              >
                {email}
                <button
                  onClick={() => handleRemoveEmail(email)}
                  className="hover:text-destructive transition-colors"
                  aria-label={`Supprimer ${email}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            type="email"
            placeholder="email@entreprise.com"
            value={emailInput}
            onChange={e => { setEmailInput(e.target.value); setEmailError(""); }}
            onKeyDown={e => e.key === "Enter" && handleAddEmail()}
            className="flex-1 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddEmail}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </Button>
        </div>
        {emailError && (
          <p className="text-xs text-destructive">{emailError}</p>
        )}
      </div>

      {/* ── Planning ── */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Planning d'envoi</Label>
        <div className="flex items-center gap-3">
          <select
            className="bg-[hsl(var(--surface-1))] border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
            value={schedule}
            onChange={e => setSchedule(e.target.value as ApiReportConfig["schedule"])}
          >
            <option value="daily">Quotidien</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuel</option>
          </select>

          {schedule === "weekly" && (
            <select
              className="bg-[hsl(var(--surface-1))] border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              value={scheduleDay}
              onChange={e => setScheduleDay(Number(e.target.value))}
            >
              {DAYS_FR.map((day, idx) => (
                <option key={idx} value={idx}>{day}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Langue ── */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Langue du rapport</Label>
        <select
          className="bg-[hsl(var(--surface-1))] border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
          value={language}
          onChange={e => setLanguage(e.target.value as ApiReportConfig["language"])}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* ── Dernier envoi ── */}
      {data?.last_sent_at && (
        <p className="text-xs text-muted-foreground">
          Dernier envoi : {fmtDateTime(data.last_sent_at)}
        </p>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateMut.isPending}
          className="gap-1.5"
        >
          {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Sauvegarder
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSendNow}
          disabled={sending}
          className="gap-1.5"
        >
          {sending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />
          }
          Envoyer maintenant
        </Button>
      </div>
    </div>
  );
}
