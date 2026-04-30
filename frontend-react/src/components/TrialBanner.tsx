import { useNavigate } from "react-router-dom";
import { Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingStatus } from "@/hooks/useBillingStatus";

export function TrialBanner() {
  const navigate = useNavigate();
  const billing = useBillingStatus();

  if (!billing || billing.tier !== "trial" || billing.status !== "active") {
    return null;
  }

  const days = billing.days_remaining ?? 0;
  const isExpired = days === 0;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 border-b text-xs ${
        isExpired
          ? "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400"
          : "bg-yellow-400/10 border-yellow-400/30 text-yellow-700 dark:text-yellow-400"
      }`}
    >
      {isExpired ? (
        <AlertCircle className="w-4 h-4 shrink-0" />
      ) : (
        <Zap className="w-4 h-4 shrink-0" />
      )}

      <span className="flex-1">
        {isExpired ? (
          <strong>Votre essai gratuit a expiré.</strong>
        ) : (
          <>
            Essai gratuit —{" "}
            <strong>
              {days} jour{days > 1 ? "s" : ""} restant{days > 1 ? "s" : ""}
            </strong>
          </>
        )}
      </span>

      <Button
        variant="outline"
        size="sm"
        className="h-6 px-3 text-xs border-current hover:bg-current/10"
        onClick={() => navigate("/settings")}
      >
        Passer à un plan payant
      </Button>
    </div>
  );
}
