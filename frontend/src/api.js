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
