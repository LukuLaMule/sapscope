/**
 * Analyse de dimensionnement SAP — DB-aware
 *
 * Adapte les indicateurs et recommandations selon :
 *  - Le type de base de données (HANA / Oracle / DB2 / MSSQL / MaxDB)
 *  - Le type fonctionnel du système (S/4HANA, BW/4HANA, ECC, BW…)
 *
 * Sources :
 *  payload.system.rfcdbsys      → type DB ("HDB", "ORA", "DB6", "MSS", "SYB"…)
 *  payload.system_type          → type fonctionnel ("S/4HANA", "BW/4HANA", "ECC"…)
 *  payload.instances            → WP counts (dia, bgd, free, busy)
 *  payload.performance          → avg_response_ms, buffer_hit_rates
 *  payload.health               → wp_priv, wp_stopped, tablespaces
 *  payload.profile_params       → rdisp/wp_no_dia, em/initial_size_MB… (agent v3+)
 *  payload.db_stats             → HANA memory, DB version (agent v3+)
 */

export type SizingStatus = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";

export interface SizingIndicator {
  label:          string;
  status:         SizingStatus;
  score:          number;
  value:          string;
  detail?:        string;           // détail supplémentaire (ex: liste de services HANA)
  recommendation: string | null;
  sap_note:       string | null;
}

export interface DbContext {
  type:        string;   // "HANA" | "Oracle" | "DB2" | "MSSQL" | "MaxDB" | "Inconnu"
  raw:         string;   // valeur brute rfcdbsys
  version:     string | null;
  system_type: string;   // "S/4HANA" | "BW/4HANA" | "ECC" | …
  is_hana:     boolean;
}

export interface SizingResult {
  score:       number;
  status:      SizingStatus;
  indicators:  SizingIndicator[];
  db:          DbContext;
  has_data:    boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusLabel(score: number): SizingStatus {
  if (score >= 80) return "OK";
  if (score >= 50) return "WARNING";
  return "CRITICAL";
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

const DB_LABELS: Record<string, string> = {
  HDB: "SAP HANA",
  ORA: "Oracle",
  DB6: "IBM DB2",
  MSS: "Microsoft SQL Server",
  SYB: "SAP ASE (Sybase)",
  ADA: "SAP MaxDB",
  "":  "Inconnu",
};

// ── Contexte DB ────────────────────────────────────────────────────────────

function buildDbContext(payload: Record<string, any>): DbContext {
  const raw        = (payload.system?.rfcdbsys ?? "").trim().toUpperCase();
  const systemType = payload.system_type ?? "Unknown";
  const dbStats    = payload.db_stats ?? {};

  const version =
    dbStats.hana_version   ??
    dbStats.db_version     ??
    null;

  return {
    type:        (DB_LABELS[raw] ?? raw) || "Inconnu",
    raw,
    version,
    system_type: systemType,
    is_hana:     raw === "HDB",
  };
}

// ── Indicateurs communs (ABAP layer — tous systèmes) ───────────────────────

function abapLayerIndicators(
  payload: Record<string, any>,
  db: DbContext,
): SizingIndicator[] {
  const indicators: SizingIndicator[] = [];
  const instances:  any[]             = payload.instances   ?? [];
  const performance: Record<string, any> = payload.performance ?? {};
  const health:      Record<string, any> = payload.health      ?? {};
  const profileParams: Record<string, any> = payload.profile_params ?? {};

  // ── WP Dialog ──────────────────────────────────────────────────────────
  const totalDia = instances.reduce((s: number, i: any) => s + (i.wp?.dia ?? 0), 0);
  const configured = parseNum(profileParams["rdisp/wp_no_dia"]) ?? (totalDia > 0 ? totalDia : null);

  if (configured != null) {
    // Seuils dépendent du type de système
    const minProd = db.system_type === "BW" || db.system_type === "BW/4HANA" ? 5 : 10;
    let score = 100;
    let rec: string | null = null;

    if (configured < 2) {
      score = 10;
      rec = "Minimum 2 WP Dialog requis. SAP recommande ≥ " + minProd + " pour la production.";
    } else if (configured < minProd / 2) {
      score = 40;
      rec = `SAP recommande minimum ${minProd} WP Dialog pour un système ${db.system_type} de production.`;
    } else if (configured < minProd) {
      score = 70;
      rec = `Pour un système ${db.system_type} chargé, visez ≥ ${minProd} WP Dialog (rdisp/wp_no_dia).`;
    }

    indicators.push({
      label:          "Work Processes Dialog",
      status:         statusLabel(score),
      score,
      value:          `${configured} configuré${configured > 1 ? "s" : ""}`,
      recommendation: rec,
      sap_note:       "SAP Note 39412",
    });
  }

  // ── Utilisation WP ─────────────────────────────────────────────────────
  const totalFree = instances.reduce((s: number, i: any) => s + (i.wp?.free ?? 0), 0);
  const totalBusy = instances.reduce((s: number, i: any) => s + (i.wp?.busy ?? 0), 0);
  const totalWp   = totalFree + totalBusy;

  if (totalWp > 0) {
    const busyPct = Math.round((totalBusy / totalWp) * 100);
    let score = 100;
    let rec: string | null = null;

    if (busyPct >= 95) {
      score = 10;
      rec = "Saturation critique des work processes. Ajouter des WP ou des instances d'application (SM50/SM66).";
    } else if (busyPct >= 85) {
      score = 50;
      rec = "Taux d'occupation élevé. Surveiller lors des pics de charge et envisager des WP supplémentaires.";
    } else if (busyPct >= 70) {
      score = 80;
    }

    indicators.push({
      label:          "Utilisation Work Processes",
      status:         statusLabel(score),
      score,
      value:          `${busyPct}% occupés — ${totalFree} libre${totalFree > 1 ? "s" : ""} / ${totalWp} total`,
      recommendation: rec,
      sap_note:       null,
    });
  }

  // ── WP Background ──────────────────────────────────────────────────────
  const totalBgd   = instances.reduce((s: number, i: any) => s + (i.wp?.bgd ?? 0), 0);
  const configBgd  = parseNum(profileParams["rdisp/wp_no_btc"]) ?? (totalBgd > 0 ? totalBgd : null);

  if (configBgd != null) {
    const minBgd = db.system_type === "BW" || db.system_type === "BW/4HANA" ? 5 : 3;
    let score = 100;
    let rec: string | null = null;

    if (configBgd < 2) {
      score = 40;
      rec = `SAP recommande minimum ${minBgd} WP Background pour la production (rdisp/wp_no_btc).`;
    } else if (configBgd < minBgd) {
      score = 75;
      rec = `${minBgd} WP Background recommandés pour ${db.system_type}. Particulièrement critique pour les traitements batch BW.`;
    }

    indicators.push({
      label:          "Work Processes Background",
      status:         statusLabel(score),
      score,
      value:          `${configBgd} configuré${configBgd > 1 ? "s" : ""}`,
      recommendation: rec,
      sap_note:       null,
    });
  }

  // ── Temps de réponse dialog ─────────────────────────────────────────────
  const avgMs = parseNum(performance.avg_response_ms);
  if (avgMs != null) {
    // Seuil plus strict pour S/4HANA (HANA est censé être rapide)
    const warnMs = db.is_hana ? 600 : 1000;
    const critMs = db.is_hana ? 2000 : 3000;
    let score = 100;
    let rec: string | null = null;

    if (avgMs > critMs) {
      score = 10;
      rec = `Temps de réponse critique (${avgMs}ms > ${critMs}ms). Analyser SM50/SM66${db.is_hana ? ", vérifier la mémoire HANA" : ""}.`;
    } else if (avgMs > warnMs) {
      score = 60;
      rec = `Temps de réponse élevé. Cible SAP${db.is_hana ? " S/4HANA" : ""} : < ${warnMs}ms.`;
    }

    indicators.push({
      label:          "Temps de réponse dialog",
      status:         statusLabel(score),
      score,
      value:          `${avgMs.toLocaleString()} ms (moy. journée)`,
      recommendation: rec,
      sap_note:       avgMs > warnMs ? "SAP Note 15248" : null,
    });
  }

  // ── Buffers ABAP (communs à tous les systèmes, y compris HANA) ───────────
  const bufferRates: Record<string, number> = performance.buffer_hit_rates ?? {};
  const rateEntries = Object.entries(bufferRates);

  if (rateEntries.length > 0) {
    const critBufs = rateEntries.filter(([, v]) => v < 90);
    const warnBufs = rateEntries.filter(([, v]) => v >= 90 && v < 95);
    const avgRate  = rateEntries.reduce((s, [, v]) => s + v, 0) / rateEntries.length;
    let score = 100;
    let rec: string | null = null;

    if (critBufs.length > 0) {
      score = 30;
      rec = `Buffers insuffisants : ${critBufs.map(([k]) => k).join(", ")}. Augmenter la taille (SE06 > Paramétrage buffers).`;
    } else if (warnBufs.length > 0) {
      score = 70;
      rec = `Taux de hit faible : ${warnBufs.map(([k]) => k).join(", ")}. SAP recommande > 95%.`;
    }

    indicators.push({
      label:          "Buffers ABAP",
      status:         statusLabel(score),
      score,
      value:          `${Math.round(avgRate)}% hit rate moyen (${rateEntries.length} buffer${rateEntries.length > 1 ? "s" : ""})`,
      detail:         rateEntries.map(([k, v]) => `${k}: ${v}%`).join(" · "),
      recommendation: rec,
      sap_note:       score < 80 ? "SAP Note 103747" : null,
    });
  }

  // ── Mémoire étendue (non-HANA uniquement) ──────────────────────────────
  if (!db.is_hana) {
    const emMb   = parseNum(profileParams["em/initial_size_MB"]);
    const wpPriv = parseNum(health.wp_priv) ?? 0;

    if (emMb != null) {
      let score = 100;
      let rec: string | null = null;

      if (emMb < 512) {
        score = 10;
        rec = "em/initial_size_MB critique. SAP recommande ≥ 2048 MB pour la production (60-70% de la RAM).";
      } else if (emMb < 1024) {
        score = 40;
        rec = "Augmenter em/initial_size_MB à ≥ 2048 MB pour réduire les WP en mode PRIV.";
      } else if (emMb < 2048) {
        score = 70;
        rec = "SAP recommande em/initial_size_MB ≥ 2048 MB pour la production.";
      }

      indicators.push({
        label:          "Mémoire étendue (em/initial_size_MB)",
        status:         statusLabel(score),
        score,
        value:          `${emMb.toLocaleString()} MB`,
        recommendation: rec,
        sap_note:       "SAP Note 153641",
      });
    } else if (wpPriv > 0) {
      const score = wpPriv <= 2 ? 50 : 20;
      indicators.push({
        label:          "Mémoire étendue (indicateur indirect)",
        status:         statusLabel(score),
        score,
        value:          `${wpPriv} WP en mode PRIV`,
        recommendation: "Des WP PRIV indiquent que em/initial_size_MB est insuffisant. SAP recommande 60-70% de la RAM totale.",
        sap_note:       "SAP Note 153641",
      });
    }
  }

  return indicators;
}

// ── Indicateurs spécifiques HANA ───────────────────────────────────────────

function hanaIndicators(payload: Record<string, any>): SizingIndicator[] {
  const indicators: SizingIndicator[] = [];
  const dbStats: Record<string, any> = payload.db_stats ?? {};

  // ── Mémoire HANA globale ────────────────────────────────────────────────
  const usedGb  = parseNum(dbStats.hana_total_used_gb);
  const allocGb = parseNum(dbStats.hana_total_alloc_gb);
  const limitGb = parseNum(dbStats.hana_alloc_limit_gb);
  const usedPct = parseNum(dbStats.hana_used_pct);

  if (usedGb != null && limitGb != null && limitGb > 0) {
    const pct   = usedPct ?? Math.round((usedGb / limitGb) * 100);
    let score   = 100;
    let rec: string | null = null;

    if (pct >= 95) {
      score = 10;
      rec = "Mémoire HANA quasi saturée (≥ 95%). Risque d'OOM imminent. Ajouter de la RAM ou réduire la charge.";
    } else if (pct >= 85) {
      score = 40;
      rec = "Mémoire HANA > 85% utilisée. Planifier une extension RAM avant saturation.";
    } else if (pct >= 70) {
      score = 75;
      rec = "Mémoire HANA > 70% utilisée. Surveiller la tendance de croissance.";
    }

    // Détail par service si disponible
    const services: any[] = dbStats.hana_services ?? [];
    const detail = services.length > 0
      ? services.map((s: any) => `${s.service}: ${s.used_gb}/${s.alloc_gb} GB`).join(" · ")
      : undefined;

    indicators.push({
      label:          "Mémoire HANA",
      status:         statusLabel(score),
      score,
      value:          `${usedGb} GB utilisés / ${limitGb} GB limite (${pct}%)`,
      detail,
      recommendation: rec,
      sap_note:       score < 80 ? "SAP Note 1999997" : null,
    });
  } else if (usedGb != null) {
    // Pas de limite connue — afficher juste la consommation
    indicators.push({
      label:          "Mémoire HANA (consommation)",
      status:         "UNKNOWN",
      score:          50,
      value:          `${usedGb} GB heap alloués${allocGb != null ? ` / ${allocGb} GB alloués` : ""}`,
      recommendation: "Limite mémoire HANA non disponible. Vérifier global.ini > [memorymanager] > global_allocation_limit.",
      sap_note:       "SAP Note 1999997",
    });
  } else {
    // Pas de données mémoire HANA — agent pas encore v3+
    indicators.push({
      label:          "Mémoire HANA",
      status:         "UNKNOWN",
      score:          0,
      value:          "Non disponible — agent v3+ requis",
      recommendation: "Mettre à jour l'agent SAPscope pour collecter les métriques HANA (M_SERVICE_MEMORY).",
      sap_note:       null,
    });
  }

  // ── Column Store HANA ───────────────────────────────────────────────────
  const colStoreGb = parseNum(dbStats.hana_column_store_gb);
  if (colStoreGb != null && colStoreGb > 0) {
    // Simplement informatif — la règle SAP est que column store doit tenir en RAM
    const limitRef = parseNum(dbStats.hana_alloc_limit_gb) ?? parseNum(dbStats.hana_total_alloc_gb);
    let score = 100;
    let rec: string | null = null;

    if (limitRef != null && colStoreGb / limitRef > 0.8) {
      score = 40;
      rec = "Le Column Store représente > 80% de la mémoire allouée. Risque d'éviction de données à chaud.";
    } else if (limitRef != null && colStoreGb / limitRef > 0.6) {
      score = 70;
      rec = "Column Store > 60% de la mémoire. Surveiller la croissance des tables de faits.";
    }

    indicators.push({
      label:          "HANA Column Store",
      status:         statusLabel(score),
      score,
      value:          `${colStoreGb} GB en mémoire`,
      recommendation: rec,
      sap_note:       null,
    });
  }

  // ── Version HANA ───────────────────────────────────────────────────────
  const hanaVersion = dbStats.hana_version as string | undefined;
  if (hanaVersion) {
    // Vérifier si version en fin de maintenance (règle simple : < 2.0 SR5 = EOL)
    const isOld = hanaVersion.startsWith("1.") ||
      (hanaVersion.startsWith("2.0") && parseInt(hanaVersion.split(".")[3] ?? "99") < 50);

    const score = isOld ? 40 : 100;
    indicators.push({
      label:          "Version SAP HANA",
      status:         statusLabel(score),
      score,
      value:          hanaVersion,
      recommendation: isOld
        ? "Version HANA en fin de maintenance ou non supportée. Planifier la mise à niveau vers HANA 2.0 SPS07+."
        : null,
      sap_note:       isOld ? "SAP Note 2349894" : null,
    });
  }

  return indicators;
}

// ── Indicateurs spécifiques Oracle / DB2 ───────────────────────────────────

function rdbmsIndicators(payload: Record<string, any>, db: DbContext): SizingIndicator[] {
  const indicators: SizingIndicator[] = [];
  const health: Record<string, any>  = payload.health ?? {};
  const dbStats: Record<string, any> = payload.db_stats ?? {};

  // ── Tablespaces ─────────────────────────────────────────────────────────
  const tablespaces: any[] = health.tablespaces ?? [];
  if (tablespaces.length > 0) {
    const maxPct     = Math.max(...tablespaces.map((t: any) => t.used_pct ?? 0));
    const critSpaces = tablespaces.filter((t: any) => (t.used_pct ?? 0) >= 90);
    const warnSpaces = tablespaces.filter((t: any) => (t.used_pct ?? 0) >= 80 && (t.used_pct ?? 0) < 90);

    let score = 100;
    let rec: string | null = null;

    if (critSpaces.length > 0) {
      score = 10;
      rec = `Tablespaces critiques (≥ 90%) : ${critSpaces.map((t: any) => `${t.name} (${t.used_pct}%)`).join(", ")}. Étendre immédiatement.`;
    } else if (warnSpaces.length > 0) {
      score = 60;
      rec = `Tablespaces proches de la saturation : ${warnSpaces.map((t: any) => `${t.name} (${t.used_pct}%)`).join(", ")}.`;
    }

    const detail = tablespaces
      .sort((a, b) => (b.used_pct ?? 0) - (a.used_pct ?? 0))
      .slice(0, 6)
      .map((t: any) => `${t.name}: ${t.used_pct}%`)
      .join(" · ");

    indicators.push({
      label:          `Tablespaces ${db.type}`,
      status:         statusLabel(score),
      score,
      value:          `${maxPct}% max — ${tablespaces.length} tablespace${tablespaces.length > 1 ? "s" : ""}`,
      detail,
      recommendation: rec,
      sap_note:       score < 80 ? "SAP Note 646681" : null,
    });
  }

  // ── Version DB ──────────────────────────────────────────────────────────
  if (dbStats.db_version) {
    indicators.push({
      label:          `Version ${db.type}`,
      status:         "OK",
      score:          100,
      value:          dbStats.db_version,
      recommendation: null,
      sap_note:       null,
    });
  }

  return indicators;
}

// ── Point d'entrée ─────────────────────────────────────────────────────────

export function analyzeSizing(payload: Record<string, any> | null | undefined): SizingResult {
  if (!payload) {
    return {
      score: 0, status: "UNKNOWN", indicators: [],
      db: { type: "Inconnu", raw: "", version: null, system_type: "Unknown", is_hana: false },
      has_data: false,
    };
  }

  const db         = buildDbContext(payload);
  const indicators: SizingIndicator[] = [
    ...abapLayerIndicators(payload, db),
    ...(db.is_hana ? hanaIndicators(payload) : rdbmsIndicators(payload, db)),
  ];

  if (indicators.length === 0) {
    return { score: 0, status: "UNKNOWN", indicators, db, has_data: false };
  }

  // Exclure les indicateurs UNKNOWN du calcul de score
  const scorable = indicators.filter(i => i.status !== "UNKNOWN");
  const globalScore = scorable.length > 0
    ? Math.round(scorable.reduce((s, i) => s + i.score, 0) / scorable.length)
    : 0;

  return {
    score:    globalScore,
    status:   statusLabel(globalScore),
    indicators,
    db,
    has_data: true,
  };
}
