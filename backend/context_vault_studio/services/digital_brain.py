from __future__ import annotations

from datetime import datetime, timezone
import uuid

from context_vault_studio.services.workspace_builder import slugify


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def list_digital_brain_source_adapter_contracts() -> list[dict]:
    return [
        {
            "adapter_id": "approved_workspace_files",
            "label": "Approved workspace files",
            "source_type": "filesystem",
            "status": "active",
            "retention_modes": ["metadata_only", "extracted_text", "cached_content"],
            "capabilities": ["discover", "normalize", "sync", "provenance"],
            "notes": "Primary v1 source adapter for Atlas-approved folders and files.",
        },
        {
            "adapter_id": "internal_notes",
            "label": "Digital Brain notes",
            "source_type": "internal_note",
            "status": "derived",
            "retention_modes": ["metadata_only", "extracted_text"],
            "capabilities": ["discover", "normalize", "provenance"],
            "notes": "Builds note-like source objects from approved workspace documents and app-managed notes.",
        },
        {
            "adapter_id": "internal_chats",
            "label": "Neutron chats and agent sessions",
            "source_type": "chat_session",
            "status": "planned",
            "retention_modes": ["metadata_only", "extracted_text", "cached_content"],
            "capabilities": ["discover", "normalize", "sync", "episode"],
            "notes": "Reserved for app-owned chat/session ingestion as Digital Brain moves beyond file-first scope.",
        },
        {
            "adapter_id": "recent_workspace_activity",
            "label": "Recent workspace activity",
            "source_type": "activity",
            "status": "derived",
            "retention_modes": ["metadata_only"],
            "capabilities": ["derive", "rank"],
            "notes": "Derived activity source used to prioritize recent files inside approved workspaces.",
        },
    ]


def infer_object_type(file_entry: dict) -> str:
    extension = (file_entry.get("extension") or "").lower()
    if extension == ".md":
        return "note"
    if extension in {".pdf"}:
        return "document"
    if extension in {".csv", ".xlsx", ".xls"}:
        return "spreadsheet"
    if extension in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return "image"
    if extension in {".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".go", ".java"}:
        return "code_module"
    return "file"


def build_digital_brain_index_payload(config: dict, result: dict) -> dict:
    generated_at = (result.get("summary") or {}).get("generated_at") or now_iso()
    brain_settings = (config.get("digital_brain") or {})
    files = result.get("files") or []
    graph = result.get("graph") or {"nodes": [], "edges": []}
    sources = config.get("sources") or []

    registry_entries: list[dict] = []
    source_id_lookup: dict[str, str] = {}
    for source in sources:
        source_id = f"workspace:{slugify(source['name'])}"
        source_id_lookup[source["name"]] = source_id
        registry_entries.append(
            {
                "source_id": source_id,
                "adapter_id": "approved_workspace_files",
                "source_type": "filesystem",
                "display_name": source["name"],
                "status": "active",
                "scope_definition": {
                    "path": source["path"],
                    "include": source.get("include", []),
                    "exclude": source.get("exclude", []),
                    "mode": source.get("mode") or config.get("default_mode", "copy"),
                },
                "retention_mode": brain_settings.get("retention_mode", "extracted_text"),
                "metadata": {
                    "category": source.get("category", "Projects"),
                    "priority_mode": brain_settings.get("scan_mode", "quick_start"),
                },
            }
        )

    if brain_settings.get("include_notes", True):
        registry_entries.append(
            {
                "source_id": "derived:internal_notes",
                "adapter_id": "internal_notes",
                "source_type": "internal_note",
                "display_name": "Workspace notes",
                "status": "derived",
                "scope_definition": {"mode": "derived_from_workspace"},
                "retention_mode": "extracted_text",
                "metadata": {"enabled": True},
            }
        )

    registry_entries.append(
        {
            "source_id": "derived:recent_workspace_activity",
            "adapter_id": "recent_workspace_activity",
            "source_type": "activity",
            "display_name": "Recent workspace activity",
            "status": "derived",
            "scope_definition": {"prioritize_recent_files": bool(brain_settings.get("prioritize_recent_files", True))},
            "retention_mode": "metadata_only",
            "metadata": {"graph_density": brain_settings.get("graph_density", "balanced")},
        }
    )

    if brain_settings.get("include_chats", True):
        registry_entries.append(
            {
                "source_id": "planned:internal_chats",
                "adapter_id": "internal_chats",
                "source_type": "chat_session",
                "display_name": "Neutron chats and agent sessions",
                "status": "planned",
                "scope_definition": {"enabled": True},
                "retention_mode": brain_settings.get("retention_mode", "extracted_text"),
                "metadata": {"enabled": True},
            }
        )

    source_objects: list[dict] = []
    content_units: list[dict] = []
    provenance_ledger: list[dict] = []

    retention_mode = brain_settings.get("retention_mode", "extracted_text")
    for file_entry in files:
        source_name = file_entry.get("source_name") or file_entry.get("source") or "workspace"
        source_id = source_id_lookup.get(source_name, f"workspace:{slugify(source_name)}")
        object_id = f"source-object:{file_entry['id']}"
        object_type = infer_object_type(file_entry)

        source_objects.append(
            {
                "object_id": object_id,
                "source_id": source_id,
                "source_type": "filesystem",
                "external_id": file_entry["id"],
                "object_type": object_type,
                "title": file_entry.get("label") or file_entry.get("rel_path"),
                "locator": file_entry.get("original_path") or file_entry.get("rel_path"),
                "created_at": generated_at,
                "updated_at": generated_at,
                "last_seen_at": generated_at,
                "metadata_json": {
                    "rel_path": file_entry.get("rel_path"),
                    "extension": file_entry.get("extension"),
                    "size_bytes": file_entry.get("size_bytes"),
                    "source_name": source_name,
                },
                "content_ref": file_entry.get("original_path"),
                "content_hash": file_entry.get("content_hash"),
            }
        )

        if retention_mode != "metadata_only" and file_entry.get("summary"):
            content_units.append(
                {
                    "content_unit_id": f"content-unit:{file_entry['id']}",
                    "source_object_id": object_id,
                    "episode_id": f"episode:{source_id}:surface-pass",
                    "content_type": "summary",
                    "sequence_index": 0,
                    "text_body": file_entry.get("summary"),
                    "embedding_status": "not_started",
                    "token_count": len((file_entry.get("summary") or "").split()),
                    "content_hash": file_entry.get("content_hash"),
                    "metadata_json": {
                        "retention_mode": retention_mode,
                        "rel_path": file_entry.get("rel_path"),
                    },
                }
            )

        provenance_ledger.append(
            {
                "provenance_id": f"prov:{file_entry['id']}",
                "target_object_type": "source_object",
                "target_object_id": object_id,
                "source_type": "filesystem",
                "source_id": source_id,
                "source_object_id": object_id,
                "episode_id": f"episode:{source_id}:surface-pass",
                "extraction_method": "workspace_preview_surface_pass",
                "extracted_at": generated_at,
                "confidence": 1.0,
                "notes_json": {"rel_path": file_entry.get("rel_path")},
            }
        )

    episodes = [
        {
            "episode_id": f"episode:{entry['source_id']}:surface-pass",
            "episode_type": "workspace_surface_pass",
            "source_id": entry["source_id"],
            "title": f"{entry['display_name']} surface pass",
            "summary": f"Canonical Digital Brain intake for {entry['display_name']}.",
            "started_at": generated_at,
            "ended_at": generated_at,
            "confidence": 1.0,
            "provenance_json": {
                "adapter_id": entry["adapter_id"],
                "status": entry["status"],
            },
        }
        for entry in registry_entries
    ]

    graph_nodes = [
        {
            "node_id": node.get("id"),
            "node_type": node.get("type"),
            "title": node.get("label") or node.get("name") or node.get("rel_path") or node.get("id"),
            "summary": node.get("summary"),
            "project_id": node.get("source"),
            "source_object_id": f"source-object:{node.get('id')}" if node.get("type") != "source" else None,
            "source_episode_id": None,
            "confidence": 1.0,
            "metadata_json": {
                "category": node.get("category"),
                "path": node.get("path") or node.get("rel_path"),
            },
        }
        for node in graph.get("nodes", [])
    ]

    graph_edges = [
        {
            "edge_id": f"edge:{index}",
            "from_node_id": edge.get("from"),
            "to_node_id": edge.get("to"),
            "edge_type": edge.get("type"),
            "weight": 1.0,
            "confidence": 1.0,
            "source_type": "workspace_graph",
            "source_id": "workspace_graph",
            "source_object_id": None,
            "derived_by": "workspace_builder",
            "created_at": generated_at,
            "updated_at": generated_at,
            "provenance": {"kind": "workspace_graph"},
            "metadata_json": {},
        }
        for index, edge in enumerate(graph.get("edges", []), start=1)
    ]

    index = {
        "summary": {
            "generated_at": generated_at,
            "source_count": len(registry_entries),
            "source_object_count": len(source_objects),
            "episode_count": len(episodes),
            "content_unit_count": len(content_units),
            "graph_node_count": len(graph_nodes),
            "graph_edge_count": len(graph_edges),
            "memory_candidate_count": 0,
            "memory_count": 0,
        },
        "settings": brain_settings,
        "source_registry": registry_entries,
        "adapter_contracts": list_digital_brain_source_adapter_contracts(),
        "source_objects": source_objects[:600],
        "episodes": episodes,
        "content_units": content_units[:600],
        "graph_nodes": graph_nodes[:600],
        "graph_edges": graph_edges[:1000],
        "memory_candidates": [],
        "memories": [],
        "provenance_ledger": provenance_ledger[:600],
    }

    return {
        "id": f"digital-brain-index-{uuid.uuid4().hex[:8]}",
        "label": f"{config.get('vault_name', 'Context Vault Studio')} Digital Brain index",
        "created_at": generated_at,
        "index": index,
    }
