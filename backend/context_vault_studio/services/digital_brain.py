from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import uuid

from context_vault_studio.services.workspace_builder import slugify


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]{2,}")
STOPWORDS = {
    "about",
    "after",
    "agent",
    "analysis",
    "and",
    "atlas",
    "brain",
    "build",
    "chat",
    "context",
    "decision",
    "digital",
    "document",
    "draft",
    "file",
    "files",
    "focus",
    "from",
    "graph",
    "history",
    "index",
    "into",
    "lane",
    "latest",
    "memory",
    "note",
    "notes",
    "phase",
    "plan",
    "project",
    "recent",
    "related",
    "summary",
    "system",
    "that",
    "the",
    "this",
    "timeline",
    "vault",
    "view",
    "what",
    "where",
    "with",
    "workspace",
}


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


def sync_policy_for_entry(entry: dict, settings: dict) -> str:
    adapter_id = entry.get("adapter_id")
    if adapter_id == "approved_workspace_files":
        return settings.get("workspace_file_sync_policy", "metadata_then_focus")
    if adapter_id == "internal_notes":
        return settings.get("notes_sync_policy", "metadata_then_focus")
    if adapter_id == "internal_chats":
        return settings.get("chat_sync_policy", "planned")
    if adapter_id == "recent_workspace_activity":
        return settings.get("recent_activity_sync_policy", "ranking_only")
    return "surface_only"


def deeper_read_eligible(sync_policy: str) -> bool:
    return sync_policy in {"metadata_then_focus", "always_deepen"}


def priority_score_for_entry(entry: dict, settings: dict) -> int:
    adapter_id = entry.get("adapter_id")
    if adapter_id == "approved_workspace_files":
        return 100
    if adapter_id == "internal_notes":
        return 76 if settings.get("include_notes", True) else 18
    if adapter_id == "recent_workspace_activity":
        return 64 if settings.get("prioritize_recent_files", True) else 26
    if adapter_id == "internal_chats":
        return 58 if settings.get("include_chats", True) else 12
    return 20


def attention_reason_for_entry(entry: dict, settings: dict) -> str:
    adapter_id = entry.get("adapter_id")
    if adapter_id == "approved_workspace_files":
        return "Approved workspace files stay first because they define the governed Digital Brain boundary."
    if adapter_id == "internal_notes":
        if not settings.get("include_notes", True):
            return "Notes are disabled, so they remain out of the active attention set."
        return "Notes are treated as first-class cognitive objects and can deepen after the surface pass."
    if adapter_id == "recent_workspace_activity":
        if settings.get("prioritize_recent_files", True):
            return "Recent activity stays high because recency is turned into an explicit attention signal."
        return "Recent activity is retained only as a lightweight hint because recent-file priority is off."
    if adapter_id == "internal_chats":
        if not settings.get("include_chats", True):
            return "Chat ingestion is reserved for later because chat inclusion is currently disabled."
        return "Chats stay planned but visible so future connectors can join the same governed attention model."
    return "This source class remains available inside the current governed index."


def build_source_priority_summary(registry_entries: list[dict], settings: dict) -> list[dict]:
    rows = []
    for entry in registry_entries:
        sync_policy = sync_policy_for_entry(entry, settings)
        rows.append(
            {
                "source_id": entry.get("source_id"),
                "adapter_id": entry.get("adapter_id"),
                "label": entry.get("display_name"),
                "source_type": entry.get("source_type"),
                "status": entry.get("status"),
                "sync_policy": sync_policy,
                "deeper_read_eligible": deeper_read_eligible(sync_policy),
                "priority_score": priority_score_for_entry(entry, settings),
                "reason": attention_reason_for_entry(entry, settings),
            }
        )
    return sorted(rows, key=lambda item: (-item["priority_score"], item["label"].lower()))


def build_cognitive_view_recommendations(focus_graph: dict) -> list[dict]:
    nodes = focus_graph.get("nodes", [])
    topic_nodes = [node for node in nodes if node.get("type") == "topic"]
    project_nodes = [node for node in nodes if node.get("type") == "project"]
    memory_nodes = [node for node in nodes if node.get("type") == "memory"]

    recommendations: list[dict] = []
    for node in topic_nodes[:3]:
        recommendations.append(
            {
                "view_id": f"topic:{slugify(node.get('label') or node.get('id') or 'topic')}",
                "kind": "topic",
                "label": f"Topic focus: {node.get('label')}",
                "anchor_node_id": node.get("id"),
                "description": f"Track the approved files and memories clustering around {node.get('label')}.",
            }
        )
    for node in project_nodes[:2]:
        recommendations.append(
            {
                "view_id": f"project:{slugify(node.get('label') or node.get('id') or 'project')}",
                "kind": "project",
                "label": f"Project focus: {node.get('label')}",
                "anchor_node_id": node.get("id"),
                "description": f"Keep one saved cognitive view anchored on {node.get('label')}.",
            }
        )
    for node in memory_nodes[:2]:
        recommendations.append(
            {
                "view_id": f"memory:{slugify(node.get('label') or node.get('id') or 'memory')}",
                "kind": "memory",
                "label": f"Memory follow-up: {node.get('label')}",
                "anchor_node_id": node.get("id"),
                "description": "Track promoted or candidate memory items beside the files they derive from.",
            }
        )
    return recommendations


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


def file_modified_at(file_entry: dict, fallback: str) -> str:
    path_value = file_entry.get("original_path")
    if not path_value:
        return fallback
    try:
        return datetime.fromtimestamp(Path(path_value).stat().st_mtime, tz=timezone.utc).astimezone().isoformat(timespec="seconds")
    except OSError:
        return fallback


def graph_density_limits(graph_density: str) -> dict[str, int]:
    if graph_density == "concise":
      return {"documents": 8, "topics": 6, "memories": 3}
    if graph_density == "rich":
      return {"documents": 24, "topics": 16, "memories": 10}
    return {"documents": 14, "topics": 10, "memories": 6}


def extract_topic_terms(title: str, summary: str, rel_path: str | None) -> set[str]:
    candidates = set()
    joined = " ".join(filter(None, [title, summary, rel_path or ""]))
    for token in TOKEN_RE.findall(joined):
        normalized = token.lower()
        if normalized in STOPWORDS or normalized.isdigit():
            continue
        candidates.add(normalized)
    if rel_path:
        for part in Path(rel_path).parts[:-1]:
            normalized = part.lower()
            if normalized and normalized not in STOPWORDS and len(normalized) > 2:
                candidates.add(normalized)
    return candidates


def build_surface_pass_cognitive_graph(
    source_objects: list[dict],
    content_units: list[dict],
    settings: dict,
) -> tuple[dict, list[dict]]:
    density = graph_density_limits(settings.get("graph_density", "balanced"))
    content_by_object = {item["source_object_id"]: item for item in content_units}

    project_nodes = []
    project_node_lookup = {}
    for source_object in source_objects:
        project_key = source_object.get("metadata_json", {}).get("source_name") or "workspace"
        project_id = f"project:{slugify(project_key)}"
        if project_id in project_node_lookup:
            continue
        node = {
            "id": project_id,
            "type": "project",
            "label": project_key,
            "name": project_key,
            "summary": f"Approved Digital Brain project shell for {project_key}.",
            "path": project_key,
            "confidence": 0.98,
            "why_surfaced": [
                f"{project_key} is an approved workspace source inside the current Digital Brain boundary."
            ],
        }
        project_nodes.append(node)
        project_node_lookup[project_id] = node

    scored_source_objects = []
    for source_object in source_objects:
        object_type = source_object["object_type"]
        metadata = source_object.get("metadata_json", {})
        summary = (content_by_object.get(source_object["object_id"]) or {}).get("text_body", "")
        score = 0
        if object_type == "note":
            score += 4
        if object_type == "document":
            score += 3
        if settings.get("prioritize_recent_files", True):
            score += 2
        if summary:
            score += 2
        if metadata.get("rel_path", "").count("/") == 0:
            score += 1
        scored_source_objects.append((score, source_object, summary))

    scored_source_objects.sort(
        key=lambda item: (
            -item[0],
            item[1].get("updated_at", ""),
            item[1].get("title", "").lower(),
        ),
        reverse=False,
    )
    scored_source_objects = sorted(
        scored_source_objects,
        key=lambda item: (-item[0], item[1].get("updated_at", ""), item[1].get("title", "").lower()),
    )

    selected_objects = scored_source_objects[: density["documents"]]
    file_nodes = []
    topic_counts: dict[str, int] = {}
    topic_examples: dict[str, list[str]] = {}
    memory_shells: list[dict] = []

    for score, source_object, summary in selected_objects:
        metadata = source_object.get("metadata_json", {})
        rel_path = metadata.get("rel_path")
        source_name = metadata.get("source_name") or "workspace"
        project_id = f"project:{slugify(source_name)}"
        file_id = source_object.get("external_id")
        node_type = source_object["object_type"]
        why_surfaced = [
            f"Surface score {score} inside approved source {source_name}.",
        ]
        if node_type == "note":
            why_surfaced.append("Notes are prioritized as direct cognitive working material.")
        elif node_type == "document":
            why_surfaced.append("Documents rank highly because they usually carry durable context.")
        if settings.get("prioritize_recent_files", True):
            why_surfaced.append("Recent-file priority is enabled for this Digital Brain profile.")
        if summary:
            why_surfaced.append("A summary was available, so this object can surface with evidence text.")
        if rel_path and rel_path.count("/") == 0:
            why_surfaced.append("Top-level files are slightly favored during the surface pass.")
        file_nodes.append(
            {
                "id": f"brain:{source_object['object_id']}",
                "type": node_type,
                "label": source_object["title"],
                "name": source_object["title"],
                "summary": summary or source_object.get("title"),
                "rel_path": rel_path,
                "path": source_object.get("locator"),
                "source": source_name,
                "file_id": file_id,
                "importance_score": score,
                "project_id": project_id,
                "confidence": min(0.97, 0.55 + score * 0.05),
                "why_surfaced": why_surfaced,
            }
        )

        for term in extract_topic_terms(source_object["title"], summary, rel_path):
            topic_counts[term] = topic_counts.get(term, 0) + 1
            topic_examples.setdefault(term, []).append(source_object["title"])

        if re.search(r"\b(decision|decide|plan|roadmap|summary|conclusion)\b", f"{source_object['title']} {summary}", re.IGNORECASE):
            memory_shells.append(
                {
                    "id": f"memory-shell:{source_object['object_id']}",
                    "type": "memory",
                    "title": source_object["title"],
                    "summary": summary or source_object["title"],
                    "source_object_id": source_object["object_id"],
                    "file_id": file_id,
                    "project_id": project_id,
                    "source": source_name,
                    "confidence": 0.55,
                    "status": "candidate",
                    "why_surfaced": [
                        "Decision-like language was detected in the source title or summary.",
                        f"Candidate was derived from approved source {source_name}.",
                    ],
                }
            )

    topic_nodes = []
    for topic, count in sorted(topic_counts.items(), key=lambda item: (-item[1], item[0]))[: density["topics"]]:
        topic_nodes.append(
            {
                "id": f"topic:{topic}",
                "type": "topic",
                "label": topic.replace("-", " "),
                "name": topic.replace("-", " "),
                "summary": f"Surface-pass topic derived from {count} approved objects.",
                "path": "Digital Brain topic",
                "source": "Digital Brain",
                "topic_weight": count,
                "examples": topic_examples.get(topic, [])[:4],
                "confidence": min(0.95, 0.48 + count * 0.08),
                "why_surfaced": [
                    f"Derived from {count} approved objects during the surface pass.",
                    "Topic clustering stays selective so the Focus view remains interpretable.",
                ],
            }
        )

    memory_nodes = [
        {
            "id": item["id"],
            "type": "memory",
            "label": item["title"],
            "name": item["title"],
            "summary": item["summary"],
            "path": item["title"],
            "source": item["source"],
            "file_id": item["file_id"],
            "confidence": item["confidence"],
            "why_surfaced": item.get("why_surfaced", []),
        }
        for item in memory_shells[: density["memories"]]
    ]

    topic_lookup = {node["id"]: node for node in topic_nodes}
    nodes = [*project_nodes, *topic_nodes, *memory_nodes, *file_nodes]
    edges = []
    for node in file_nodes:
        edges.append(
            {
                "type": "belongs_to",
                "from": node["id"],
                "to": node["project_id"],
            }
        )
        for term in extract_topic_terms(node["label"], node.get("summary") or "", node.get("rel_path")):
            topic_id = f"topic:{term}"
            if topic_id in topic_lookup:
                edges.append(
                    {
                        "type": "about",
                        "from": node["id"],
                        "to": topic_id,
                    }
                )

    for memory_node in memory_nodes:
        matching_file = next((node for node in file_nodes if node.get("file_id") == memory_node.get("file_id")), None)
        if matching_file:
            edges.append(
                {
                    "type": "derived_from",
                    "from": memory_node["id"],
                    "to": matching_file["id"],
                }
            )
            edges.append(
                {
                    "type": "belongs_to",
                    "from": memory_node["id"],
                    "to": matching_file["project_id"],
                }
            )

    graph = {
        "summary": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "project_count": len(project_nodes),
            "topic_count": len(topic_nodes),
            "memory_shell_count": len(memory_shells),
            "view_recommendation_count": 0,
        },
        "nodes": nodes,
        "edges": edges,
    }
    return graph, memory_shells


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
        modified_at = file_modified_at(file_entry, generated_at)

        source_objects.append(
            {
                "object_id": object_id,
                "source_id": source_id,
                "source_type": "filesystem",
                "external_id": file_entry["id"],
                "object_type": object_type,
                "title": file_entry.get("label") or file_entry.get("rel_path"),
                "locator": file_entry.get("original_path") or file_entry.get("rel_path"),
                "created_at": modified_at,
                "updated_at": modified_at,
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

    focus_graph, memory_shells = build_surface_pass_cognitive_graph(source_objects, content_units, brain_settings)
    focus_graph["summary"]["view_recommendation_count"] = len(build_cognitive_view_recommendations(focus_graph))
    source_priority = build_source_priority_summary(registry_entries, brain_settings)
    cognitive_view_recommendations = build_cognitive_view_recommendations(focus_graph)

    index = {
        "summary": {
            "generated_at": generated_at,
            "source_count": len(registry_entries),
            "source_object_count": len(source_objects),
            "episode_count": len(episodes),
            "content_unit_count": len(content_units),
            "graph_node_count": len(graph_nodes),
            "graph_edge_count": len(graph_edges),
            "memory_candidate_count": len(memory_shells),
            "memory_count": 0,
            "source_priority_count": len(source_priority),
            "cognitive_view_recommendation_count": len(cognitive_view_recommendations),
        },
        "settings": brain_settings,
        "source_registry": registry_entries,
        "source_priority": source_priority,
        "adapter_contracts": list_digital_brain_source_adapter_contracts(),
        "source_objects": source_objects[:600],
        "episodes": episodes,
        "content_units": content_units[:600],
        "graph_nodes": graph_nodes[:600],
        "graph_edges": graph_edges[:1000],
        "focus_graph": focus_graph,
        "cognitive_view_recommendations": cognitive_view_recommendations,
        "memory_shells": memory_shells[:120],
        "memory_candidates": memory_shells[:120],
        "memories": [],
        "provenance_ledger": provenance_ledger[:600],
    }

    return {
        "id": f"digital-brain-index-{uuid.uuid4().hex[:8]}",
        "label": f"{config.get('vault_name', 'Context Vault Studio')} Digital Brain index",
        "created_at": generated_at,
        "index": index,
    }
