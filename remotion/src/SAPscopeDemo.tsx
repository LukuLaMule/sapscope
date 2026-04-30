import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       "#0f1117",
  card:     "#1a1f2e",
  border:   "#2a3040",
  accent:   "#4a9eff",
  green:    "#34d399",
  yellow:   "#fbbf24",
  red:      "#f87171",
  fg:       "#e8eaf0",
  fg2:      "#8b9ab0",
  sapBlue:  "#0070c0",
};

// ── Utility ───────────────────────────────────────────────────────────────────
function fadeIn(frame: number, start: number, duration = 20) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function slideUp(frame: number, start: number, fps: number) {
  const progress = spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 120 } });
  return interpolate(progress, [0, 1], [40, 0]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ color }: { color: string }) {
  return <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function HealthBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ background: C.border, borderRadius: 4, height: 6, flex: 1 }}>
      <div style={{ background: color, width: `${score}%`, height: "100%", borderRadius: 4 }} />
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "20px 24px", ...style,
    }}>
      {children}
    </div>
  );
}

// ── Scene 1 : Titre ───────────────────────────────────────────────────────────
function SceneTitle() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const tagOpacity = fadeIn(frame, 20);
  const subOpacity = fadeIn(frame, 35);
  const ctaOpacity = fadeIn(frame, 55);

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
      {/* Grid bg */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize: "80px 80px",
        opacity: 0.3,
      }} />
      {/* Glow */}
      <div style={{
        position: "absolute", width: 600, height: 600,
        background: `radial-gradient(circle, ${C.accent}22 0%, transparent 70%)`,
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
      }} />

      <div style={{ transform: `scale(${logoScale})`, zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2, color: C.fg, fontFamily: "system-ui" }}>
          SAP<span style={{ color: C.accent }}>scope</span>
        </div>
      </div>

      <div style={{ opacity: tagOpacity, zIndex: 1, fontSize: 28, color: C.fg2, fontFamily: "system-ui", fontWeight: 300 }}>
        Stop guessing. Know your SAP.
      </div>

      <div style={{ opacity: subOpacity, zIndex: 1, fontSize: 18, color: C.fg2, fontFamily: "system-ui", maxWidth: 600, textAlign: "center", lineHeight: 1.6 }}>
        Real-time monitoring & analysis for SAP Basis administrators
      </div>

      <div style={{ opacity: ctaOpacity, zIndex: 1, marginTop: 16 }}>
        <div style={{
          background: C.accent, color: "#fff", padding: "12px 32px",
          borderRadius: 8, fontSize: 16, fontWeight: 600, fontFamily: "system-ui",
        }}>
          30-day free trial
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 2 : Landscape ───────────────────────────────────────────────────────
function SceneLandscape() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const systems = [
    { sid: "PRD", client: "Accenture", score: 87, status: "OK",       color: C.green  },
    { sid: "QAS", client: "Accenture", score: 62, status: "WARNING",  color: C.yellow },
    { sid: "DEV", client: "Accenture", score: 91, status: "OK",       color: C.green  },
    { sid: "PRD", client: "Sopra",     score: 43, status: "CRITICAL", color: C.red    },
    { sid: "QAS", client: "Sopra",     score: 78, status: "OK",       color: C.green  },
    { sid: "PRD", client: "Capgemini", score: 95, status: "OK",       color: C.green  },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, padding: "60px 80px", flexDirection: "column", gap: 32 }}>
      {/* Header */}
      <div style={{ opacity: fadeIn(frame, 0), display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 14, color: C.accent, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
          Landscape Overview
        </div>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>6 systems · 3 clients</div>
      </div>

      <div style={{ fontSize: 36, fontWeight: 700, color: C.fg, fontFamily: "system-ui", opacity: fadeIn(frame, 5) }}>
        All your SAP landscapes,<br />at a glance.
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 8 }}>
        {systems.map((s, i) => {
          const delay = i * 6;
          const op = fadeIn(frame, 15 + delay);
          const ty = slideUp(frame, 15 + delay, fps);
          return (
            <div key={i} style={{ opacity: op, transform: `translateY(${ty}px)` }}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>{s.client}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.fg, fontFamily: "monospace" }}>{s.sid}</div>
                  </div>
                  <div style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: s.color + "22", color: s.color, fontFamily: "system-ui",
                    border: `1px solid ${s.color}44`,
                  }}>
                    {s.status}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui", width: 60 }}>Health</div>
                  <HealthBar score={s.score} color={s.color} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "monospace", width: 32, textAlign: "right" }}>{s.score}</div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 3 : System Detail ───────────────────────────────────────────────────
function SceneSystemDetail() {
  const frame = useCurrentFrame();

  const metrics = [
    { label: "Work Processes (SM50)", value: "47 / 50 free", status: "OK",       color: C.green  },
    { label: "ABAP Dumps (ST22)",     value: "12 today",     status: "WARNING",  color: C.yellow },
    { label: "Open Transports",       value: "3 critical",   status: "CRITICAL", color: C.red    },
    { label: "Spool Requests",        value: "1,204 total",  status: "WARNING",  color: C.yellow },
    { label: "System Locks (SM12)",   value: "2 entries",    status: "OK",       color: C.green  },
    { label: "qRFC Queues",           value: "All running",  status: "OK",       color: C.green  },
  ];

  const domains = [
    { name: "Stability",      score: 74, color: C.yellow },
    { name: "Performance",    score: 91, color: C.green  },
    { name: "Security",       score: 58, color: C.yellow },
    { name: "Transports",     score: 43, color: C.red    },
    { name: "Infrastructure", score: 88, color: C.green  },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, padding: "50px 80px", flexDirection: "column", gap: 24 }}>
      <div style={{ opacity: fadeIn(frame, 0), display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 14, color: C.accent, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>System Detail</div>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: C.fg }}>PRD · Sopra</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: metrics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui", marginBottom: 4, opacity: fadeIn(frame, 5) }}>KEY METRICS</div>
          {metrics.map((m, i) => (
            <div key={i} style={{ opacity: fadeIn(frame, 10 + i * 5) }}>
              <Card style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StatusDot color={m.color} />
                  <div style={{ flex: 1, fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>{m.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: m.color, fontFamily: "monospace" }}>{m.value}</div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* Right: health score */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ opacity: fadeIn(frame, 5), fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>HEALTH SCORE</div>
          <Card style={{ opacity: fadeIn(frame, 8), padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: 72, fontWeight: 800, color: C.yellow, fontFamily: "monospace", lineHeight: 1 }}>62</div>
            <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui", marginTop: 8 }}>Needs attention</div>
          </Card>

          <div style={{ opacity: fadeIn(frame, 15), fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>BY DOMAIN</div>
          {domains.map((d, i) => (
            <div key={i} style={{ opacity: fadeIn(frame, 18 + i * 4) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: C.fg2, fontFamily: "system-ui", width: 100 }}>{d.name}</div>
                <HealthBar score={d.score} color={d.color} />
                <div style={{ fontSize: 12, fontWeight: 700, color: d.color, fontFamily: "monospace", width: 28, textAlign: "right" }}>{d.score}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 4 : Diff ────────────────────────────────────────────────────────────
function SceneDiff() {
  const frame = useCurrentFrame();

  const changes = [
    { label: "SAP Release",     before: "7.56",     after: "7.58",     type: "changed" },
    { label: "Kernel",          before: "785/0010",  after: "793/0014", type: "changed" },
    { label: "ABAP Dumps",      before: "3",         after: "12",       type: "worse"   },
    { label: "Open Transports", before: "1",         after: "3",        type: "worse"   },
    { label: "Work Processes",  before: "50",        after: "50",       type: "same"    },
    { label: "System Locks",    before: "5",         after: "2",        type: "better"  },
  ];

  const typeColor = { changed: C.accent, worse: C.red, better: C.green, same: C.fg2 };
  const typeLabel = { changed: "CHANGED", worse: "↑ WORSE", better: "↓ BETTER", same: "—" };

  return (
    <AbsoluteFill style={{ background: C.bg, padding: "50px 80px", flexDirection: "column", gap: 24 }}>
      <div style={{ opacity: fadeIn(frame, 0), display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 14, color: C.accent, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>Snapshot Diff</div>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>Yesterday → Today · PRD</div>
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, color: C.fg, fontFamily: "system-ui", opacity: fadeIn(frame, 5) }}>
        What changed since yesterday?
      </div>

      {/* Column headers */}
      <div style={{ opacity: fadeIn(frame, 10), display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 16, padding: "0 24px" }}>
        {["Metric", "Before", "After", "Change"].map(h => (
          <div key={h} style={{ fontSize: 11, color: C.fg2, fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 1 }}>{h}</div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {changes.map((c, i) => {
          const color = typeColor[c.type as keyof typeof typeColor];
          return (
            <div key={i} style={{ opacity: fadeIn(frame, 15 + i * 6) }}>
              <Card style={{ padding: "14px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 16, alignItems: "center" }}>
                  <div style={{ fontSize: 14, color: C.fg, fontFamily: "system-ui" }}>{c.label}</div>
                  <div style={{ fontSize: 13, color: C.fg2, fontFamily: "monospace" }}>{c.before}</div>
                  <div style={{ fontSize: 13, color: c.type === "same" ? C.fg2 : C.fg, fontFamily: "monospace", fontWeight: 600 }}>{c.after}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "system-ui" }}>
                    {typeLabel[c.type as keyof typeof typeLabel]}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 5 : PDF Report ──────────────────────────────────────────────────────
function SceneReport() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: C.bg, padding: "50px 80px", flexDirection: "column", gap: 28, alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: fadeIn(frame, 0), fontSize: 14, color: C.accent, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
        PDF Report
      </div>

      <div style={{ fontSize: 36, fontWeight: 700, color: C.fg, fontFamily: "system-ui", textAlign: "center", opacity: fadeIn(frame, 5) }}>
        One click.<br />A professional report<br />for your client.
      </div>

      {/* Mock PDF */}
      <div style={{ opacity: fadeIn(frame, 15), transform: `scale(${interpolate(frame, [15, 35], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})` }}>
        <Card style={{ width: 480, padding: "28px 32px", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.fg, fontFamily: "system-ui" }}>SAP Basis Report</div>
              <div style={{ fontSize: 12, color: C.fg2, fontFamily: "system-ui", marginTop: 4 }}>Sopra · PRD · April 30, 2026</div>
            </div>
            <div style={{ fontSize: 13, color: C.accent, fontFamily: "system-ui", fontWeight: 700 }}>SAPscope</div>
          </div>

          {[
            { label: "Overall Health", value: "62 / 100", color: C.yellow },
            { label: "Critical Issues", value: "2 found",  color: C.red    },
            { label: "Transports",      value: "3 pending", color: C.red    },
            { label: "Uptime",          value: "99.8%",     color: C.green  },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, color: C.fg2, fontFamily: "system-ui" }}>{row.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: row.color, fontFamily: "monospace" }}>{row.value}</div>
            </div>
          ))}

          <div style={{ marginTop: 16, fontSize: 11, color: C.fg2, fontFamily: "system-ui", fontStyle: "italic" }}>
            Generated by SAPscope · sapscope.com
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 6 : CTA ─────────────────────────────────────────────────────────────
function SceneCTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28 }}>
      <div style={{
        position: "absolute", width: 800, height: 800,
        background: `radial-gradient(circle, ${C.accent}18 0%, transparent 70%)`,
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
      }} />

      <div style={{ transform: `scale(${logoScale})`, zIndex: 1, fontSize: 56, fontWeight: 800, letterSpacing: -2, color: C.fg, fontFamily: "system-ui" }}>
        SAP<span style={{ color: C.accent }}>scope</span>
      </div>

      <div style={{ opacity: fadeIn(frame, 15), zIndex: 1, fontSize: 32, fontWeight: 700, color: C.fg, fontFamily: "system-ui", textAlign: "center" }}>
        Try it free for 30 days.
      </div>

      <div style={{ opacity: fadeIn(frame, 25), zIndex: 1, fontSize: 18, color: C.fg2, fontFamily: "system-ui" }}>
        Self-hosted · Your data stays on your servers
      </div>

      <div style={{ opacity: fadeIn(frame, 35), zIndex: 1, display: "flex", gap: 16, marginTop: 8 }}>
        <div style={{
          background: C.accent, color: "#fff", padding: "14px 40px",
          borderRadius: 8, fontSize: 18, fontWeight: 700, fontFamily: "system-ui",
        }}>
          Start free trial →
        </div>
      </div>

      <div style={{ opacity: fadeIn(frame, 45), zIndex: 1, fontSize: 16, color: C.fg2, fontFamily: "system-ui" }}>
        app.sapscope.com
      </div>
    </AbsoluteFill>
  );
}

// ── Main composition ──────────────────────────────────────────────────────────
// Total: 2700 frames = 90s @ 30fps
// Scene timings (frames):
//   0   – 240  : Title       (8s)
//   240 – 750  : Landscape   (17s)
//   750 – 1350 : SystemDetail(20s)
//   1350– 1950 : Diff        (20s)
//   1950– 2400 : Report      (15s)
//   2400– 2700 : CTA         (10s)

export const SAPscopeDemo: React.FC = () => (
  <AbsoluteFill style={{ background: "#0f1117" }}>
    <Sequence from={0} durationInFrames={240}>
      <SceneTitle />
    </Sequence>
    <Sequence from={240} durationInFrames={510}>
      <SceneLandscape />
    </Sequence>
    <Sequence from={750} durationInFrames={600}>
      <SceneSystemDetail />
    </Sequence>
    <Sequence from={1350} durationInFrames={600}>
      <SceneDiff />
    </Sequence>
    <Sequence from={1950} durationInFrames={450}>
      <SceneReport />
    </Sequence>
    <Sequence from={2400} durationInFrames={300}>
      <SceneCTA />
    </Sequence>
  </AbsoluteFill>
);
