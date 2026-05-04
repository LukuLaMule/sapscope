import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminClients, createAdminClient, deleteAdminClient,
  updateClientLogo,
  fetchUsers, createUser, assignClient, unassignClient,
  fetchTokens, issueToken, revokeToken,
  fetchClients,
  type ApiClient, type ApiUser, type ApiToken, type ApiTokenCreated,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/sap-utils";
import { Plus, Copy, Terminal, Users, Key, Building2, Trash2, RefreshCw, ImagePlus, X, FileText, Server, ScrollText } from "lucide-react";
import { toast } from "sonner";
import ReportConfigPanel from "@/components/ReportConfigPanel";
import AgentHealthPanel from "@/components/AgentHealthPanel";
import DecommissionPanel from "@/components/DecommissionPanel";
import { AgentLogsPanel } from "@/components/AgentLogsPanel";

export default function AdminPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Administration</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage clients, users, and agent tokens</p>
      </div>

      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList className="bg-[hsl(var(--surface-1))] border border-border">
          <TabsTrigger value="clients"        className="gap-1.5"><Building2 className="w-3.5 h-3.5" />Clients</TabsTrigger>
          <TabsTrigger value="users"          className="gap-1.5"><Users      className="w-3.5 h-3.5" />Users</TabsTrigger>
          <TabsTrigger value="tokens"         className="gap-1.5"><Key        className="w-3.5 h-3.5" />Tokens</TabsTrigger>
          <TabsTrigger value="infrastructure" className="gap-1.5"><Server     className="w-3.5 h-3.5" />Infrastructure</TabsTrigger>
        </TabsList>

        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="tokens"><TokensTab /></TabsContent>
        <TabsContent value="infrastructure"><InfrastructureTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Clients tab ────────────────────────────────────────────────────────────────

function ClientsTab() {
  const qc = useQueryClient();
  const [newName, setNewName]         = useState("");
  const [open, setOpen]               = useState(false);
  const [wizard, setWizard]           = useState<string | null>(null); // clientId
  const [reportPanel, setReportPanel] = useState<string | null>(null); // clientId

  const { data: clients = [], isLoading } = useQuery({ queryKey: ["admin-clients"], queryFn: fetchAdminClients });

  const createMut = useMutation({
    mutationFn: () => createAdminClient(newName.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-clients"] }); qc.invalidateQueries({ queryKey: ["clients"] }); setOpen(false); setNewName(""); toast.success("Client created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAdminClient(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-clients"] }); qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Client deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />New Client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Client</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Client Name</Label>
                <Input className="mt-1" placeholder="Company name" value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && newName.trim() && createMut.mutate()} />
              </div>
              <Button className="w-full" disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--surface-2))] text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Client</th>
                <th className="text-left px-4 py-2.5 font-medium">Logo</th>
                <th className="text-left px-4 py-2.5 font-medium">Created</th>
                <th className="text-left px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? "bg-card" : "bg-[hsl(var(--surface-1))]"}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-2.5">
                    <LogoUploadCell client={c} onUpdated={() => { qc.invalidateQueries({ queryKey: ["admin-clients"] }); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-2.5 flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setWizard(wizard === c.id ? null : c.id)} className="text-xs">
                      <Terminal className="w-3.5 h-3.5 mr-1" />Install Agent
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReportPanel(reportPanel === c.id ? null : c.id)}
                      className={`text-xs ${reportPanel === c.id ? "text-primary" : ""}`}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1" />Rapports
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete client "${c.name}"?`)) deleteMut.mutate(c.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wizard && <TokenWizard clientId={wizard} clients={clients} onClose={() => setWizard(null)} />}

      {reportPanel && (
        <div className="rounded-lg border border-primary/30 bg-[hsl(var(--surface-1))] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-primary" />
              Rapports PDF — {clients.find(c => c.id === reportPanel)?.name}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setReportPanel(null)}>Fermer</Button>
          </div>
          <ReportConfigPanel
            clientId={reportPanel}
            clientName={clients.find(c => c.id === reportPanel)?.name}
          />
        </div>
      )}
    </div>
  );
}

function TokenWizard({ clientId, clients, onClose }: { clientId: string; clients: ApiClient[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel]           = useState("default");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const issueMut = useMutation({
    mutationFn: () => issueToken(clientId, label),
    onSuccess: (t: ApiTokenCreated) => { setIssuedToken(t.token); qc.invalidateQueries({ queryKey: ["tokens", clientId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cmd = issuedToken
    ? `curl -sSL https://sapscope.io/install.sh | bash -s -- --token ${issuedToken}`
    : "";

  const copy = () => { navigator.clipboard.writeText(cmd); toast.success("Command copied"); };

  const client = clients.find(c => c.id === clientId);

  return (
    <div className="rounded-lg border border-primary/30 bg-[hsl(var(--surface-1))] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Agent Token — {client?.name}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      {!issuedToken ? (
        <div className="flex items-center gap-2">
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Token label" className="flex-1 text-xs" />
          <Button size="sm" onClick={() => issueMut.mutate()} disabled={issueMut.isPending}>
            {issueMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Generate Token"}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Paste this command on the SAP server to install and register the SAPscope agent:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs font-mono text-primary overflow-x-auto">
              {cmd}
            </code>
            <Button size="icon" variant="outline" onClick={copy}><Copy className="w-4 h-4" /></Button>
          </div>
          <p className="text-[11px] text-muted-foreground">This token will not be shown again.</p>
        </>
      )}
    </div>
  );
}

// ── Logo upload cell ──────────────────────────────────────────────────────────

function LogoUploadCell({ client, onUpdated }: { client: ApiClient; onUpdated: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("File must be an image"); return; }
    if (file.size > 375_000) { toast.error("Image too large (max 375 KB)"); return; }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = reader.result as string; // data:image/...;base64,...
        await updateClientLogo(client.id, b64);
        toast.success("Logo updated");
        onUpdated();
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = async () => {
    setLoading(true);
    try {
      await updateClientLogo(client.id, null);
      toast.success("Logo removed");
      onUpdated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {client.logo_b64 ? (
        <>
          <img src={client.logo_b64} alt="logo" className="h-7 max-w-[80px] object-contain rounded" />
          <button
            title="Remove logo"
            disabled={loading}
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button
          title="Upload logo"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          {loading ? "…" : "Add logo"}
        </button>
      )}
      {client.logo_b64 && !loading && (
        <button
          title="Change logo"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ImagePlus className="w-3.5 h-3.5" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const [newEmail, setNewEmail]   = useState("");
  const [newPwd, setNewPwd]       = useState("");
  const [open, setOpen]           = useState(false);

  const { data: users = [],   isLoading: uLoading } = useQuery({ queryKey: ["admin-users"],   queryFn: fetchUsers });
  const { data: clients = [] }                        = useQuery({ queryKey: ["admin-clients"], queryFn: fetchAdminClients });

  const createMut = useMutation({
    mutationFn: () => createUser(newEmail.trim(), newPwd),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setOpen(false); setNewEmail(""); setNewPwd(""); toast.success("User created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: ({ userId, clientId }: { userId: string; clientId: string }) => assignClient(userId, clientId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Client assigned"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMut = useMutation({
    mutationFn: ({ userId, clientId }: { userId: string; clientId: string }) => unassignClient(userId, clientId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Client removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />New User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Email</Label><Input className="mt-1" type="email" placeholder="email@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
              <div><Label>Password</Label><Input className="mt-1" type="password" placeholder="••••••••" value={newPwd} onChange={e => setNewPwd(e.target.value)} /></div>
              <Button className="w-full" disabled={!newEmail.trim() || !newPwd || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {uLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--surface-2))] text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Email</th>
                <th className="text-left px-4 py-2.5 font-medium">Role</th>
                <th className="text-left px-4 py-2.5 font-medium">Clients</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? "bg-card" : "bg-[hsl(var(--surface-1))]"}>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={u.is_admin ? "default" : "secondary"} className="text-xs">
                      {u.is_admin ? "Admin" : "Consultant"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {u.client_ids.map(cid => {
                        const name = clients.find(c => c.id === cid)?.name || cid.slice(0, 8);
                        return (
                          <span key={cid} className="inline-flex items-center gap-1 text-[11px] bg-[hsl(var(--surface-1))] border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                            {name}
                            <button className="hover:text-destructive ml-0.5" onClick={() => unassignMut.mutate({ userId: u.id, clientId: cid })}>×</button>
                          </span>
                        );
                      })}
                      {clients.filter(c => !u.client_ids.includes(c.id)).length > 0 && (
                        <select
                          className="text-[11px] bg-[hsl(var(--surface-1))] border border-border rounded px-1.5 py-0.5 text-muted-foreground cursor-pointer"
                          value=""
                          onChange={e => e.target.value && assignMut.mutate({ userId: u.id, clientId: e.target.value })}
                        >
                          <option value="">+ assign…</option>
                          {clients.filter(c => !u.client_ids.includes(c.id)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Infrastructure tab ────────────────────────────────────────────────────────

function InfrastructureTab() {
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const [logsClientId, setLogsClientId] = useState("");

  const effectiveClientId = logsClientId || (clients[0]?.id ? String(clients[0].id) : "");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Santé des agents</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Statut de connexion de chaque agent au serveur SAPscope.
        </p>
        <AgentHealthPanel />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Candidats à la décommission</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Systèmes inactifs détectés automatiquement. Confirmez la décommission pour supprimer les données historiques.
        </p>
        <DecommissionPanel />
      </div>

      <div>
        <div className="flex items-center gap-3 mb-1">
          <ScrollText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Logs agent</h2>
          {clients.length > 1 && (
            <select
              value={logsClientId}
              onChange={e => setLogsClientId(e.target.value)}
              className="ml-auto text-xs bg-[hsl(var(--surface-1))] border border-border rounded px-2 py-1 text-foreground"
            >
              {clients.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Logs des 7 derniers jours remontés par l'agent à chaque collecte.
        </p>
        {effectiveClientId && <AgentLogsPanel clientId={effectiveClientId} />}
      </div>
    </div>
  );
}

// ── Tokens tab ────────────────────────────────────────────────────────────────

function TokensTab() {
  const qc = useQueryClient();
  const [selectedClient, setSelectedClient] = useState("");

  const { data: clients = [] } = useQuery({ queryKey: ["admin-clients"], queryFn: fetchAdminClients });

  useEffect(() => {
    if (!selectedClient && clients.length > 0) setSelectedClient(clients[0].id);
  }, [clients, selectedClient]);

  const { data: tokens = [], isLoading: tLoading } = useQuery({
    queryKey: ["tokens", selectedClient],
    queryFn:  () => fetchTokens(selectedClient),
    enabled:  !!selectedClient,
  });

  const revokeMut = useMutation({
    mutationFn: (tokenId: string) => revokeToken(selectedClient, tokenId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tokens", selectedClient] }); toast.success("Token revoked"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</span>
        <select
          className="bg-[hsl(var(--surface-1))] border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
        >
          <option value="">Select client…</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!selectedClient ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Select a client to view its tokens</div>
      ) : tLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : tokens.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No tokens yet — use the Clients tab to issue one</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--surface-2))] text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Label</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Created</th>
                <th className="text-left px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t, i) => (
                <tr key={t.id} className={i % 2 === 0 ? "bg-card" : "bg-[hsl(var(--surface-1))]"}>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.label}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={t.is_revoked ? "destructive" : "secondary"} className="text-xs">
                      {t.is_revoked ? "Revoked" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-2.5">
                    {!t.is_revoked && (
                      <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive"
                        onClick={() => revokeMut.mutate(t.id)}>Revoke</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
