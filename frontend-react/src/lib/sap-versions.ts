import type { CSSProperties } from "react";

/**
 * SAP kernel and SP version staleness helpers.
 * Basis consultants need to know at a glance if components are on maintenance.
 *
 * Kernel version history (long-term maintenance):
 *   785 — current LTM (as of 2025)
 *   784 — supported
 *   781 — supported
 *   777 — supported
 *   773 — end-of-maintenance, extended support only
 *   753 and below — out of standard maintenance
 */

export type VersionStatus = "ok" | "warning" | "critical" | "unknown";

const CURRENT_KERNEL   = 785;
const SUPPORTED_KERNELS = new Set([785, 784, 781, 777]);

export function getKernelStatus(kernelRelease: string | null | undefined): VersionStatus {
  if (!kernelRelease) return "unknown";
  const num = parseInt(kernelRelease.replace(/\D/g, "").slice(0, 3), 10);
  if (isNaN(num)) return "unknown";
  if (num >= CURRENT_KERNEL) return "ok";
  if (SUPPORTED_KERNELS.has(num)) return "warning";
  return "critical";
}

export function getKernelStatusLabel(kernelRelease: string | null | undefined): string {
  const s = getKernelStatus(kernelRelease);
  if (s === "ok") return "Current";
  if (s === "warning") return "Outdated";
  if (s === "critical") return "Obsolete";
  return "";
}

/** @deprecated use getVersionStatusStyle() for inline styles */
export const VERSION_STATUS_CLASS: Record<VersionStatus, string> = {
  ok:      "",
  warning: "",
  critical:"",
  unknown: "",
};

export function getVersionStatusStyle(status: VersionStatus): CSSProperties {
  switch (status) {
    case "ok":
      return {
        color: "hsl(var(--status-ok))",
        borderColor: "hsl(var(--status-ok) / 0.4)",
        backgroundColor: "hsl(var(--status-ok) / 0.1)",
      };
    case "warning":
      return {
        color: "hsl(var(--status-warning))",
        borderColor: "hsl(var(--status-warning) / 0.4)",
        backgroundColor: "hsl(var(--status-warning) / 0.1)",
      };
    case "critical":
      return {
        color: "hsl(var(--status-critical))",
        borderColor: "hsl(var(--status-critical) / 0.4)",
        backgroundColor: "hsl(var(--status-critical) / 0.1)",
      };
    default:
      return {};
  }
}
