# AI Diagnostic

**Duration:** 10 to 30 seconds (generation)

---

## Run a diagnostic

1. Open a **system detail** (click a SID in the sidebar)
2. The **AI Diagnostic** section is displayed at the top of the view
3. If no diagnostic exists yet → click **Generate diagnostic**
4. Choose the desired **language** from the selector (English, Français, Deutsch…)
5. Wait for generation (10 to 30 seconds)

---

## Re-run a diagnostic

A diagnostic is cached. To force a new analysis:
- Click **Regenerate** (replaces the existing diagnostic)

> Useful after a fresh collection or a kernel/SP change.

---

## What the diagnostic contains

- **System health summary** (kernel, main components, patch level)
- **Identified issues** (components behind on SPs, outdated kernel, etc.)
- **Actionable recommendations** for the Basis consultant
- **Custom object analysis** if present (volume, types)

---

## Export the diagnostic

Click **Print / Export PDF** to generate a full PDF report including:
- System information
- Components table
- Support Packages table
- AI diagnostic
- Custom ABAP objects

> The PDF opens in a new tab → use **Ctrl+P** / **Cmd+P** to print or save.

---

## Common issues

| Symptom | Cause | Solution |
|---|---|---|
| Generation stuck | Claude API timeout | Retry in a few seconds |
| Diagnostic in English despite French selection | Language not saved | Re-select and regenerate |
