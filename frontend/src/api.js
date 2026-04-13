async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const payload = await response.json();
      detail = payload.detail ?? detail;
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  return response.json();
}

export function fetchBootstrap() {
  return request("/api/bootstrap");
}

export function fetchBookmarks() {
  return request("/api/bookmarks");
}

export function createBookmark(payload) {
  return request("/api/bookmarks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteBookmark(bookmarkId) {
  return request(`/api/bookmarks/${bookmarkId}`, {
    method: "DELETE",
  });
}

export function fetchLayout() {
  return request("/api/layout");
}

export function saveLayout(payload) {
  return request("/api/layout", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchJobs() {
  return request("/api/jobs");
}

export function createJob(kind, config, clean = true) {
  return request("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ kind, config, clean }),
  });
}

export function fetchJob(jobId) {
  return request(`/api/jobs/${jobId}`);
}

export function saveWorkspaceConfig(config) {
  return request("/api/workspace-config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function fetchPresets() {
  return request("/api/presets");
}

export function createPreset(payload) {
  return request("/api/presets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePreset(presetId, payload) {
  return request(`/api/presets/${presetId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePreset(presetId) {
  return request(`/api/presets/${presetId}`, {
    method: "DELETE",
  });
}

export function fetchBuildHistory() {
  return request("/api/build-history");
}

export function fetchCanvases() {
  return request("/api/canvases");
}

export function createCanvas(payload) {
  return request("/api/canvases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCanvas(canvasId, payload) {
  return request(`/api/canvases/${canvasId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteCanvas(canvasId) {
  return request(`/api/canvases/${canvasId}`, {
    method: "DELETE",
  });
}

export function fetchSnapshots() {
  return request("/api/snapshots");
}

export function restoreSnapshot(snapshotId) {
  return request("/api/snapshots/restore", {
    method: "POST",
    body: JSON.stringify({ snapshot_id: snapshotId }),
  });
}

export function previewWorkspace(config, clean = true) {
  return request("/api/preview", {
    method: "POST",
    body: JSON.stringify({ config, clean }),
  });
}

export function buildWorkspace(config, clean = true) {
  return request("/api/build", {
    method: "POST",
    body: JSON.stringify({ config, clean }),
  });
}

export function inspectPath(path, access) {
  return request("/api/path-inspect", {
    method: "POST",
    body: JSON.stringify({ path, access }),
  });
}

export function fetchFilePreview(path, access) {
  return request("/api/file-preview", {
    method: "POST",
    body: JSON.stringify({ path, access }),
  });
}

export function saveFile(path, content, access) {
  return request("/api/file-save", {
    method: "POST",
    body: JSON.stringify({ path, content, access }),
  });
}

export function createFile(directory, name, content, access) {
  return request("/api/file-create", {
    method: "POST",
    body: JSON.stringify({ directory, name, content, access }),
  });
}

export function exportBundle() {
  return request("/api/export-bundle", {
    method: "POST",
  });
}

export function createLogicProfile(config, maxWorkers = 4) {
  return request("/api/logic/profile", {
    method: "POST",
    body: JSON.stringify({ config, max_workers: maxWorkers }),
  });
}

export function createExplainBundle(snapshotBundleId, logicProfileId = null) {
  return request("/api/explain/bundles", {
    method: "POST",
    body: JSON.stringify({
      snapshot_bundle_id: snapshotBundleId,
      logic_profile_id: logicProfileId,
    }),
  });
}

export function createPatchPreview(payload) {
  return request("/api/build-adapters/patch-gate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function applyPatchPreview(previewId) {
  return request(`/api/build-adapters/apply-preview/${previewId}`, {
    method: "POST",
  });
}

export function createParallelScanProfile(config, maxWorkers = 4) {
  return request("/api/parallel-scan/profile", {
    method: "POST",
    body: JSON.stringify({ config, max_workers: maxWorkers }),
  });
}

export function createDeltaSnapshot(config, previousSnapshotBundleId) {
  return request("/api/parallel-scan/delta", {
    method: "POST",
    body: JSON.stringify({
      config,
      previous_snapshot_bundle_id: previousSnapshotBundleId,
    }),
  });
}

export function fetchHistoryTimeline() {
  return request("/api/history/timeline");
}

export function compareHistorySnapshots(leftSnapshotBundleId, rightSnapshotBundleId) {
  return request("/api/history/compare", {
    method: "POST",
    body: JSON.stringify({
      left_snapshot_bundle_id: leftSnapshotBundleId,
      right_snapshot_bundle_id: rightSnapshotBundleId,
    }),
  });
}
