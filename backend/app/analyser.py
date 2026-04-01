"""
Claude API analysis for SAP snapshots.
Builds a compact summary of the snapshot and calls Claude
to produce a structured technical assessment.
"""

import asyncio
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"

_ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are a senior SAP Basis consultant reviewing a technical landscape snapshot.
You write concise, precise assessments — no filler, no marketing language.
Respond in the same language as the user's request (default: English).
Use plain text with light markdown (##, -, **bold**). No tables."""

ANALYSIS_PROMPT = """\
Analyse this SAP system snapshot and produce a technical assessment.

## System
SID: {sid}
Host: {host}
OS: {os}
DB engine: {db}
SAP release: {sap_rel}
Kernel release: {kernel_rel}

## Installed components ({comp_count})
{components}

## Support packages — most recent per component ({sp_count} total)
{support_packages}

## Custom development footprint
Total Z/Y objects: {custom_total}
By type (top 15):
{custom_breakdown}

---
Provide the following sections:

## Release & Maintenance Status
Is this SAP release still in mainstream maintenance? Any upcoming end-of-maintenance deadlines? Is the kernel up to date?

## Support Package Currency
How current are the support packages? Estimate the lag for key components (BASIS, ABA). Flag any obvious gaps.

## Custom Development Footprint
Assess the volume and distribution of custom objects. Is this typical, light, or heavy? What does the type distribution suggest?

## Key Risks
List 3–5 concrete technical risks or action items, ordered by priority.

## Recommendations
Practical next steps for the Basis team or project team."""


def _sanitize(s: str, max_len: int = 100) -> str:
    """Truncate and strip newlines to prevent prompt injection."""
    return str(s)[:max_len].replace("\n", " ").replace("\r", " ")


def _build_prompt(payload: dict) -> str:
    sys   = payload.get("system", {})
    comps = payload.get("components", [])
    sps   = payload.get("support_packages", [])
    co    = payload.get("custom_objects", {})

    comp_lines = "\n".join(
        f"  - {_sanitize(c.get('component',''))} {_sanitize(c.get('release',''))} "
        f"SP {_sanitize(c.get('extrelease','?'))}"
        for c in sorted(comps, key=lambda x: x.get("component", ""))
    ) or "  (none)"

    latest_sp: dict[str, dict] = {}
    for sp in sps:
        comp = sp.get("component", "")
        if comp not in latest_sp or sp.get("patch", "") > latest_sp[comp].get("patch", ""):
            latest_sp[comp] = sp
    sp_lines = "\n".join(
        f"  - {_sanitize(comp)}: {_sanitize(sp['patch'])} ({_fmt_sap_date(sp.get('applied', ''))})"
        for comp, sp in sorted(latest_sp.items())
    ) or "  (none)"

    by_type = co.get("by_type", {})
    top15 = sorted(by_type.items(), key=lambda x: -x[1])[:15]
    obj_lines = "\n".join(f"  - {_sanitize(t)}: {n:,}" for t, n in top15) or "  (none)"

    return ANALYSIS_PROMPT.format(
        sid=_sanitize(sys.get("rfcsysid", "?")),
        host=_sanitize(sys.get("rfchost", "?")),
        os=_sanitize(sys.get("rfcopsys", "?")),
        db=_sanitize(sys.get("rfcdbsys", "?")),
        sap_rel=_sanitize(sys.get("rfcsaprl", "?")),
        kernel_rel=_sanitize(sys.get("rfckernrl", "?")),
        comp_count=len(comps),
        components=comp_lines,
        sp_count=len(sps),
        support_packages=sp_lines,
        custom_total=f"{co.get('total', 0):,}",
        custom_breakdown=obj_lines,
    )


def _fmt_sap_date(s: str) -> str:
    if len(s) == 8:
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s or "?"


async def analyse(payload: dict, language: str = "English") -> tuple[str, int, int]:
    """
    Call Claude and return (analysis_text, input_tokens, output_tokens).
    Raises ValueError if ANTHROPIC_API_KEY is not set.
    Raises anthropic.APIError on API failure.
    """
    if not _ANTHROPIC_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    user_prompt = _build_prompt(payload)
    if language.lower() != "english":
        user_prompt = f"(Respond in {_sanitize(language, 30)}.)\n\n" + user_prompt

    def _call() -> anthropic.types.Message:
        client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
        return client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

    message = await asyncio.to_thread(_call)

    text = message.content[0].text
    return text, message.usage.input_tokens, message.usage.output_tokens
