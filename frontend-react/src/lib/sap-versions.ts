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

export const VERSION_STATUS_CLASS: Record<VersionStatus, string> = {
  ok:      "text-[hsl(var(--status-ok))] border-[hsl(var(--status-ok)/0.3)] bg-[hsl(var(--status-ok)/0.08)]",
  warning: "text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.3)] bg-[hsl(var(--status-warning)/0.08)]",
  critical:"text-[hsl(var(--status-critical))] border-[hsl(var(--status-critical)/0.3)] bg-[hsl(var(--status-critical)/0.08)]",
  unknown: "text-muted-foreground border-border bg-transparent",
};
