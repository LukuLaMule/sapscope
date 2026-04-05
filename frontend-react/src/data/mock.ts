import type {
  SAPSystem, Client, User, AgentToken, SystemDetail, Snapshot, ClientOverview,
} from "@/types/sap";

export const clients: Client[] = [
  { id: "c1", name: "Acme Corporation", systemCount: 9, lastSnapshot: "2026-04-05T08:30:00Z", agentTokenStatus: "active" },
  { id: "c2", name: "GlobalTech Industries", systemCount: 5, lastSnapshot: "2026-04-04T22:15:00Z", agentTokenStatus: "active" },
  { id: "c3", name: "Schneider Logistics", systemCount: 3, lastSnapshot: "2026-04-03T06:00:00Z", agentTokenStatus: "expired" },
];

export const clientOverviews: ClientOverview[] = [
  {
    id: "c1", name: "Acme Corporation", industry: "Manufacturing",
    systemCount: 9, lastSnapshot: "2026-04-05T08:30:00Z", agentTokenStatus: "active",
    avgHealthScore: 76, criticalSystems: 1, warningSystems: 3, okSystems: 5, totalAlerts: 8,
    systems: [
      { sid: "PRD", tier: "Production", healthScore: 92, healthStatus: "OK" },
      { sid: "S4P", tier: "Production", healthScore: 96, healthStatus: "OK" },
      { sid: "BW1", tier: "Production", healthScore: 34, healthStatus: "CRITICAL" },
      { sid: "PPR", tier: "Pre-Production", healthScore: 90, healthStatus: "OK" },
      { sid: "QAS", tier: "Quality", healthScore: 78, healthStatus: "WARNING" },
      { sid: "S4Q", tier: "Quality", healthScore: 88, healthStatus: "OK" },
      { sid: "DEV", tier: "Development", healthScore: 65, healthStatus: "WARNING" },
      { sid: "S4D", tier: "Development", healthScore: 82, healthStatus: "OK" },
      { sid: "SBX", tier: "Sandbox", healthScore: 55, healthStatus: "WARNING" },
    ],
    healthHistory: [68, 70, 69, 72, 71, 73, 74, 72, 70, 68, 65, 67, 70, 72, 74, 75, 73, 71, 69, 72, 74, 76, 75, 74, 73, 75, 76, 77, 76, 76],
  },
  {
    id: "c2", name: "GlobalTech Industries", industry: "Technology",
    systemCount: 5, lastSnapshot: "2026-04-04T22:15:00Z", agentTokenStatus: "active",
    avgHealthScore: 91, criticalSystems: 0, warningSystems: 1, okSystems: 4, totalAlerts: 2,
    systems: [
      { sid: "GTP", tier: "Production", healthScore: 95, healthStatus: "OK" },
      { sid: "GTQ", tier: "Quality", healthScore: 89, healthStatus: "OK" },
      { sid: "GTD", tier: "Development", healthScore: 87, healthStatus: "OK" },
      { sid: "GTS", tier: "Production", healthScore: 93, healthStatus: "OK" },
      { sid: "GTX", tier: "Sandbox", healthScore: 72, healthStatus: "WARNING" },
    ],
    healthHistory: [85, 86, 87, 88, 87, 89, 90, 89, 88, 90, 91, 90, 89, 91, 92, 91, 90, 89, 90, 91, 92, 93, 92, 91, 90, 91, 92, 91, 91, 91],
  },
  {
    id: "c3", name: "Schneider Logistics", industry: "Logistics & Transport",
    systemCount: 3, lastSnapshot: "2026-04-03T06:00:00Z", agentTokenStatus: "expired",
    avgHealthScore: 58, criticalSystems: 1, warningSystems: 1, okSystems: 1, totalAlerts: 11,
    systems: [
      { sid: "SLP", tier: "Production", healthScore: 48, healthStatus: "CRITICAL" },
      { sid: "SLQ", tier: "Quality", healthScore: 62, healthStatus: "WARNING" },
      { sid: "SLD", tier: "Development", healthScore: 71, healthStatus: "OK" },
    ],
    healthHistory: [72, 70, 68, 65, 63, 60, 58, 55, 53, 50, 48, 50, 52, 54, 52, 50, 48, 50, 52, 55, 53, 51, 50, 52, 54, 56, 55, 57, 58, 58],
  },
];

export const systems: SAPSystem[] = [
  {
    id: "s1", sid: "PRD", hostname: "sapprd01.acme.local", tier: "Production",
    sapRelease: "SAP ECC 6.0 EHP8", basisSP: "SP 0029", kernelVersion: "753 Patch 1200",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 76", healthScore: 92, healthStatus: "OK",
    avgDialogResponse: 420, alerts: [], lastSnapshot: "2026-04-05T08:30:00Z", isStale: false,
    unicode: true, installationNumber: "0020876543", transportLine: "ECC",
  },
  {
    id: "s7", sid: "PPR", hostname: "sapprepr01.acme.local", tier: "Pre-Production",
    sapRelease: "SAP ECC 6.0 EHP8", basisSP: "SP 0029", kernelVersion: "753 Patch 1200",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 76", healthScore: 90, healthStatus: "OK",
    avgDialogResponse: 460, alerts: [], lastSnapshot: "2026-04-05T07:00:00Z", isStale: false,
    unicode: true, installationNumber: "0020876547", transportLine: "ECC",
  },
  {
    id: "s2", sid: "QAS", hostname: "sapqas01.acme.local", tier: "Quality",
    sapRelease: "SAP ECC 6.0 EHP8", basisSP: "SP 0029", kernelVersion: "753 Patch 1200",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 76", healthScore: 78, healthStatus: "WARNING",
    avgDialogResponse: 680,
    alerts: [
      { type: "transport_backlog", label: "Transport queue backlog", count: 12, severity: "WARNING" },
      { type: "delayed_jobs", label: "Delayed background jobs", count: 3, severity: "WARNING" },
    ],
    lastSnapshot: "2026-04-05T07:45:00Z", isStale: false,
    unicode: true, installationNumber: "0020876544", transportLine: "ECC",
  },
  {
    id: "s3", sid: "DEV", hostname: "sapdev01.acme.local", tier: "Development",
    sapRelease: "SAP ECC 6.0 EHP8", basisSP: "SP 0027", kernelVersion: "753 Patch 1100",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 72", healthScore: 65, healthStatus: "WARNING",
    avgDialogResponse: 890,
    alerts: [
      { type: "default_users", label: "Default SAP users active", count: 4, severity: "CRITICAL" },
      { type: "sap_all", label: "Users with SAP_ALL", count: 7, severity: "CRITICAL" },
      { type: "sm13_errors", label: "SM13 update errors", count: 2, severity: "WARNING" },
    ],
    lastSnapshot: "2026-04-05T06:00:00Z", isStale: false,
    unicode: true, installationNumber: "0020876545", transportLine: "ECC",
  },
  {
    id: "s8", sid: "SBX", hostname: "sapsbx01.acme.local", tier: "Sandbox",
    sapRelease: "SAP ECC 6.0 EHP8", basisSP: "SP 0025", kernelVersion: "753 Patch 900",
    dbType: "HANA", dbVersion: "2.0 SPS06 Rev 65", healthScore: 55, healthStatus: "WARNING",
    avgDialogResponse: 1100,
    alerts: [
      { type: "sap_all", label: "Users with SAP_ALL", count: 12, severity: "WARNING" },
    ],
    lastSnapshot: "2026-04-04T10:00:00Z", isStale: false,
    unicode: true, installationNumber: "0020876548", transportLine: "ECC",
  },
  {
    id: "s4", sid: "S4P", hostname: "s4pprd01.acme.local", tier: "Production",
    sapRelease: "S/4HANA 2023", basisSP: "SP 0003", kernelVersion: "789 Patch 200",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 78", healthScore: 96, healthStatus: "OK",
    avgDialogResponse: 310, alerts: [], lastSnapshot: "2026-04-05T08:30:00Z", isStale: false,
    unicode: true, installationNumber: "0020876550", transportLine: "S4",
  },
  {
    id: "s5", sid: "S4Q", hostname: "s4pqas01.acme.local", tier: "Quality",
    sapRelease: "S/4HANA 2023", basisSP: "SP 0003", kernelVersion: "789 Patch 200",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 78", healthScore: 88, healthStatus: "OK",
    avgDialogResponse: 450, alerts: [], lastSnapshot: "2026-04-05T07:00:00Z", isStale: false,
    unicode: true, installationNumber: "0020876551", transportLine: "S4",
  },
  {
    id: "s9", sid: "S4D", hostname: "s4pdev01.acme.local", tier: "Development",
    sapRelease: "S/4HANA 2023", basisSP: "SP 0002", kernelVersion: "789 Patch 100",
    dbType: "HANA", dbVersion: "2.0 SPS07 Rev 75", healthScore: 82, healthStatus: "OK",
    avgDialogResponse: 520, alerts: [], lastSnapshot: "2026-04-05T06:30:00Z", isStale: false,
    unicode: true, installationNumber: "0020876552", transportLine: "S4",
  },
  {
    id: "s6", sid: "BW1", hostname: "sapbw01.acme.local", tier: "Production",
    sapRelease: "SAP BW/4HANA 2.0", basisSP: "SP 0012", kernelVersion: "753 Patch 1000",
    dbType: "HANA", dbVersion: "2.0 SPS06 Rev 68", healthScore: 34, healthStatus: "CRITICAL",
    avgDialogResponse: 1850,
    alerts: [
      { type: "sm13_errors", label: "SM13 update errors", count: 47, severity: "CRITICAL" },
      { type: "delayed_jobs", label: "Delayed background jobs", count: 15, severity: "CRITICAL" },
      { type: "default_users", label: "Default SAP users active", count: 2, severity: "WARNING" },
    ],
    lastSnapshot: "2026-04-03T14:00:00Z", isStale: true,
    unicode: true, installationNumber: "0020876560", transportLine: "BW",
  },
];

export const systemDetail: SystemDetail = {
  ...systems[0],
  healthDomains: [
    {
      name: "Stability", score: 95, status: "OK",
      indicators: [
        { label: "ABAP dumps (7d)", value: "2", status: "OK" },
        { label: "Short dumps trend", value: "Decreasing", status: "OK" },
        { label: "System restarts (30d)", value: "0", status: "OK" },
      ],
    },
    {
      name: "Performance", score: 88, status: "OK",
      indicators: [
        { label: "Avg dialog response", value: "420 ms", status: "OK" },
        { label: "Buffer hit ratio", value: "99.2%", status: "OK" },
        { label: "Stopped work processes", value: "0", status: "OK" },
      ],
    },
    {
      name: "Security", score: 82, status: "WARNING",
      indicators: [
        { label: "Default users active", value: "0", status: "OK" },
        { label: "Users with SAP_ALL", value: "2", status: "WARNING" },
        { label: "Failed logon attempts (24h)", value: "12", status: "OK" },
      ],
    },
    {
      name: "Connectivity", score: 98, status: "OK",
      indicators: [
        { label: "RFC connections OK", value: "34/34", status: "OK" },
        { label: "IDOC errors (24h)", value: "0", status: "OK" },
      ],
    },
    {
      name: "Infrastructure", score: 94, status: "OK",
      indicators: [
        { label: "Filesystem usage", value: "62%", status: "OK" },
        { label: "DB growth (30d)", value: "+2.1 GB", status: "OK" },
        { label: "Memory utilization", value: "71%", status: "OK" },
      ],
    },
    {
      name: "Transports", score: 100, status: "OK",
      indicators: [
        { label: "Queue size", value: "0", status: "OK" },
        { label: "Failed imports (7d)", value: "0", status: "OK" },
      ],
    },
  ],
  components: [
    { name: "SAP_BASIS", release: "756", supportPackage: "0029", description: "SAP Basis Component" },
    { name: "SAP_ABA", release: "756", supportPackage: "0029", description: "Cross-Application Component" },
    { name: "SAP_GWFND", release: "756", supportPackage: "0029", description: "SAP Gateway Foundation" },
    { name: "ST-PI", release: "740", supportPackage: "0025", description: "SAP Solution Tools Plug-In" },
    { name: "SAP_UI", release: "756", supportPackage: "0021", description: "User Interface Technology" },
    { name: "SAP_HR", release: "608", supportPackage: "0099", description: "Human Capital Management" },
  ],
  supportPackages: [
    { name: "SAPKB75629", version: "29", date: "2025-11-15" },
    { name: "SAPKA75629", version: "29", date: "2025-11-15" },
    { name: "SAPK-74025INSTPI", version: "25", date: "2025-10-20" },
  ],
  customObjects: [
    { type: "Reports (Z*)", count: 342 },
    { type: "Function Groups", count: 128 },
    { type: "Classes", count: 89 },
    { type: "Interfaces", count: 34 },
    { type: "Tables", count: 156 },
    { type: "Structures", count: 87 },
    { type: "Data Elements", count: 201 },
    { type: "Domains", count: 94 },
  ],
  defaultUsersActive: [
    { user: "SAP*", status: "Locked" },
    { user: "DDIC", status: "Locked" },
    { user: "TMSADM", status: "Active" },
    { user: "EARLYWATCH", status: "Locked" },
  ],
  sapAllUsers: 2,
  transportQueueSize: 0,
  lastTransportImport: "2026-04-04T16:30:00Z",
  activeJobs: 14,
  delayedJobs: 0,
  appServers: [
    {
      hostname: "sapprd01", instance: "ASCS00",
      workProcesses: [
        { type: "dialog", count: 0 },
        { type: "enqueue", count: 1 },
      ],
    },
    {
      hostname: "sapprd02", instance: "D01",
      workProcesses: [
        { type: "dialog", count: 20 },
        { type: "background", count: 6 },
        { type: "spool", count: 3 },
        { type: "update", count: 4 },
      ],
    },
    {
      hostname: "sapprd03", instance: "D02",
      workProcesses: [
        { type: "dialog", count: 20 },
        { type: "background", count: 6 },
        { type: "spool", count: 2 },
        { type: "update", count: 4 },
      ],
    },
  ],
};

export const systemDetailBW: SystemDetail = {
  ...systems.find(s => s.sid === "BW1")!,
  healthDomains: [
    {
      name: "Stability", score: 35, status: "CRITICAL",
      indicators: [
        { label: "ABAP dumps (7d)", value: "142", status: "CRITICAL" },
        { label: "Short dumps trend", value: "Increasing", status: "CRITICAL" },
        { label: "System restarts (30d)", value: "3", status: "WARNING" },
      ],
    },
    {
      name: "Performance", score: 28, status: "CRITICAL",
      indicators: [
        { label: "Avg dialog response", value: "1850 ms", status: "CRITICAL" },
        { label: "Buffer hit ratio", value: "94.1%", status: "WARNING" },
        { label: "Stopped work processes", value: "2", status: "CRITICAL" },
      ],
    },
    {
      name: "Security", score: 55, status: "WARNING",
      indicators: [
        { label: "Default users active", value: "2", status: "WARNING" },
        { label: "Users with SAP_ALL", value: "4", status: "CRITICAL" },
        { label: "Failed logon attempts (24h)", value: "87", status: "WARNING" },
      ],
    },
    {
      name: "Connectivity", score: 72, status: "WARNING",
      indicators: [
        { label: "RFC connections OK", value: "18/22", status: "WARNING" },
        { label: "IDOC errors (24h)", value: "14", status: "WARNING" },
      ],
    },
    {
      name: "Infrastructure", score: 40, status: "CRITICAL",
      indicators: [
        { label: "Filesystem usage", value: "91%", status: "CRITICAL" },
        { label: "DB growth (30d)", value: "+18.5 GB", status: "WARNING" },
        { label: "Memory utilization", value: "94%", status: "CRITICAL" },
      ],
    },
    {
      name: "Transports", score: 60, status: "WARNING",
      indicators: [
        { label: "Queue size", value: "23", status: "WARNING" },
        { label: "Failed imports (7d)", value: "5", status: "WARNING" },
      ],
    },
  ],
  components: [
    { name: "SAP_BASIS", release: "756", supportPackage: "0022", description: "SAP Basis Component" },
    { name: "SAP_ABA", release: "756", supportPackage: "0022", description: "Cross-Application Component" },
    { name: "SAP_BW", release: "756", supportPackage: "0020", description: "SAP Business Warehouse" },
    { name: "ST-PI", release: "740", supportPackage: "0020", description: "SAP Solution Tools Plug-In" },
  ],
  supportPackages: [
    { name: "SAPKB75622", version: "22", date: "2025-06-10" },
  ],
  customObjects: [
    { type: "Reports (Z*)", count: 89 },
    { type: "Function Groups", count: 34 },
    { type: "Classes", count: 22 },
    { type: "Tables", count: 67 },
  ],
  defaultUsersActive: [
    { user: "SAP*", status: "Active" },
    { user: "DDIC", status: "Active" },
    { user: "TMSADM", status: "Active" },
    { user: "EARLYWATCH", status: "Locked" },
  ],
  sapAllUsers: 4,
  transportQueueSize: 23,
  lastTransportImport: "2026-03-28T09:15:00Z",
  activeJobs: 42,
  delayedJobs: 15,
  appServers: [
    {
      hostname: "sapbw01", instance: "D00",
      workProcesses: [
        { type: "dialog", count: 10 },
        { type: "background", count: 12 },
        { type: "spool", count: 2 },
        { type: "update", count: 3 },
      ],
    },
  ],
};

export function getSystemDetail(id: string): SystemDetail {
  if (id === "s6") return systemDetailBW;
  return { ...systemDetail, ...systems.find(s => s.id === id), healthDomains: systemDetail.healthDomains, components: systemDetail.components, supportPackages: systemDetail.supportPackages, customObjects: systemDetail.customObjects, defaultUsersActive: systemDetail.defaultUsersActive, sapAllUsers: systemDetail.sapAllUsers, transportQueueSize: systemDetail.transportQueueSize, lastTransportImport: systemDetail.lastTransportImport, activeJobs: systemDetail.activeJobs, delayedJobs: systemDetail.delayedJobs, appServers: systemDetail.appServers };
}

export const snapshots: Snapshot[] = [
  {
    date: "2026-04-05", healthScore: 92, healthStatus: "OK",
    kernelVersion: "753 Patch 1200", basisSP: "SP 0029",
    securityStatus: "WARNING", sapAllUsers: 2, transportQueueSize: 0,
    components: [
      { name: "SAP_BASIS", version: "756 SP29" },
      { name: "ST-PI", version: "740 SP25" },
    ],
  },
  {
    date: "2026-03-01", healthScore: 85, healthStatus: "WARNING",
    kernelVersion: "753 Patch 1100", basisSP: "SP 0027",
    securityStatus: "CRITICAL", sapAllUsers: 5, transportQueueSize: 8,
    components: [
      { name: "SAP_BASIS", version: "756 SP27" },
      { name: "ST-PI", version: "740 SP23" },
    ],
  },
  {
    date: "2026-02-01", healthScore: 79, healthStatus: "WARNING",
    kernelVersion: "753 Patch 1000", basisSP: "SP 0025",
    securityStatus: "CRITICAL", sapAllUsers: 5, transportQueueSize: 15,
    components: [
      { name: "SAP_BASIS", version: "756 SP25" },
      { name: "ST-PI", version: "740 SP22" },
    ],
  },
];

export const users: User[] = [
  { id: "u1", email: "admin@sapscope.io", name: "Thomas Müller", isAdmin: true, clients: ["c1", "c2", "c3"] },
  { id: "u2", email: "consultant@sapscope.io", name: "Marie Dupont", isAdmin: false, clients: ["c1", "c2"] },
  { id: "u3", email: "junior@sapscope.io", name: "Alex Johnson", isAdmin: false, clients: ["c1"] },
];

export const agentTokens: AgentToken[] = [
  { id: "t1", clientId: "c1", clientName: "Acme Corporation", token: "ssc_ak_7f3d...e9a1", status: "active", createdAt: "2026-01-15T10:00:00Z" },
  { id: "t2", clientId: "c2", clientName: "GlobalTech Industries", token: "ssc_ak_2b8c...f4d7", status: "active", createdAt: "2026-02-01T14:30:00Z" },
  { id: "t3", clientId: "c3", clientName: "Schneider Logistics", token: "ssc_ak_9e1a...b3c5", status: "revoked", createdAt: "2025-11-20T09:00:00Z" },
];
