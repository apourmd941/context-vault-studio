from __future__ import annotations

import uuid

from context_vault_studio.storage import save_explain_bundle


def build_explain_bundle(snapshot_bundle: dict, logic_profile: dict | None = None) -> dict:
    snapshot_contents = snapshot_bundle.get("contents") or {}
    manifest = snapshot_contents.get("file_manifest") or {}
    files = manifest.get("files") or []
    logic_contents = logic_profile.get("contents") if logic_profile else None
    if logic_contents is None and logic_profile:
        logic_contents = logic_profile.get("profile")
    logic_contents = logic_contents or {}

    top_files = [
        {
            "rel_path": item.get("rel_path"),
            "summary": item.get("summary"),
            "source_name": item.get("source_name"),
        }
        for item in files[:10]
    ]
    logic_files = logic_contents.get("files") or []
    top_symbols = []
    for item in logic_files[:10]:
        for symbol in item.get("symbols", [])[:5]:
            top_symbols.append({"symbol": symbol, "file": item.get("rel_path")})
    top_symbols = top_symbols[:20]

    bundle = {
        "summary": {
            "snapshot_bundle_id": snapshot_bundle.get("id"),
            "logic_profile_id": logic_profile.get("id") if logic_profile else None,
            "top_file_count": len(top_files),
            "top_symbol_count": len(top_symbols),
        },
        "architecture_summary": snapshot_contents.get("architecture_summary", ""),
        "top_files": top_files,
        "top_symbols": top_symbols,
        "feature_clusters": snapshot_contents.get("feature_clusters", []),
        "logic_summary": (logic_contents.get("summary") or {}),
    }

    record = save_explain_bundle(
        {
            "id": f"explain-bundle-{uuid.uuid4().hex[:8]}",
            "label": f"Explain bundle for {snapshot_bundle.get('label')}",
            "snapshot_bundle_id": snapshot_bundle.get("id"),
            "logic_profile_id": logic_profile.get("id") if logic_profile else None,
            "bundle": bundle,
        }
    )
    return {"record": record, "bundle": bundle}
