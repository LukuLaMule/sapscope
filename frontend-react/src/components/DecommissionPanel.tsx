import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchDecommissionCandidates,
  confirmDecommission,
  restoreSystem,
  type ApiDecommissionCandidate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/sap-utils";
import { toast } from "sonner";

function ConfirmDecommissionDialog({
  candidate,
  onClose,
  onConfirm,
  isPending,
}: {
  candidate: ApiDecommissionCandidate;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer la décommission de {candidate.system_sid} ?</DialogTitle>
          <DialogDescription>
            Cette action supprimera tous les snapshots historiques de ce système. Irréversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DecommissionPanel() {
  const qc = useQueryClient();
  const [pendingDecommission, setPendingDecommission] = useState<ApiDecommissionCandidate | null>(null);

  const { data: candidates = [], isLoading, error } = useQuery({
    queryKey: ["decommission-candidates"],
    queryFn: fetchDecommissionCandidates,
  });

  const decommissionMut = useMutation({
    mutationFn: ({ clientId, sid }: { clientId: string; sid: string }) =>
      confirmDecommission(clientId, sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decommission-candidates"] });
      toast.success("Système décommissionné");
      setPendingDecommission(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPendingDecommission(null);
    },
  });

  const restoreMut = useMutation({
    mutationFn: ({ clientId, sid }: { clientId: string; sid: string }) =>
      restoreSystem(clientId, sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decommission-candidates"] });
      toast.success("Système restauré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-10 text-destructive text-sm">
        Erreur lors du chargement des candidats
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        Aucun système candidat à la décommission
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[hsl(var(--surface-2))] text-xs text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium">Client</th>
              <th className="text-left px-4 py-2.5 font-medium">SID</th>
              <th className="text-left px-4 py-2.5 font-medium">Raison</th>
              <th className="text-left px-4 py-2.5 font-medium">Détecté le</th>
              <th className="text-left px-4 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={c.id} className={i % 2 === 0 ? "bg-card" : "bg-[hsl(var(--surface-1))]"}>
                <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs">{c.client_id}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{c.system_sid}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.reason}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatDate(c.detected_at)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs"
                      disabled={decommissionMut.isPending || restoreMut.isPending}
                      onClick={() => setPendingDecommission(c)}
                    >
                      Décommissionner
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={decommissionMut.isPending || restoreMut.isPending}
                      onClick={() => restoreMut.mutate({ clientId: c.client_id, sid: c.system_sid })}
                    >
                      Restaurer
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingDecommission && (
        <ConfirmDecommissionDialog
          candidate={pendingDecommission}
          onClose={() => setPendingDecommission(null)}
          onConfirm={() =>
            decommissionMut.mutate({
              clientId: pendingDecommission.client_id,
              sid: pendingDecommission.system_sid,
            })
          }
          isPending={decommissionMut.isPending}
        />
      )}
    </>
  );
}
