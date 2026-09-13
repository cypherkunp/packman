import type { FetchLike } from "./fetchNpmLatest";

export type SocketScoreHit = {
  purl: string;
  overall100: number;
  highSeverity: boolean;
};

export type SocketFetchResult =
  | { status: "ok"; byPurl: Map<string, SocketScoreHit> }
  | { status: "error"; message: string };

export type SocketBatchRequest = {
  orgSlug: string;
  apiToken: string;
  components: Array<{ purl: string }>;
};

const HIGH_SEVERITIES = new Set(["high", "critical"]);

export function parseSocketArtifact(artifact: unknown): SocketScoreHit | null {
  if (artifact === null || typeof artifact !== "object") {
    return null;
  }
  const record = artifact as {
    purl?: unknown;
    score?: { overall?: unknown };
    alerts?: unknown;
  };
  if (typeof record.purl !== "string") {
    return null;
  }
  const overall = record.score?.overall;
  if (typeof overall !== "number" || Number.isNaN(overall)) {
    return null;
  }
  const overall100 = Math.round(Math.min(1, Math.max(0, overall)) * 100);
  const alerts = Array.isArray(record.alerts) ? record.alerts : [];
  const highSeverity = alerts.some((alert) => {
    if (alert === null || typeof alert !== "object") {
      return false;
    }
    const severity = (alert as { severity?: unknown }).severity;
    return typeof severity === "string" && HIGH_SEVERITIES.has(severity);
  });
  return { purl: record.purl, overall100, highSeverity };
}

export async function fetchSocketScoresByPurl(
  request: SocketBatchRequest,
  fetchImpl: FetchLike = fetch,
): Promise<SocketFetchResult> {
  if (request.components.length === 0) {
    return { status: "ok", byPurl: new Map() };
  }

  const byPurl = new Map<string, SocketScoreHit>();
  const chunks = chunkComponents(request.components, 1024);
  for (const components of chunks) {
    const part = await fetchSocketScoresChunk(
      { ...request, components },
      fetchImpl,
    );
    if (part.status === "error") {
      return part;
    }
    for (const [purl, hit] of part.byPurl) {
      byPurl.set(purl, hit);
    }
  }
  return { status: "ok", byPurl };
}

async function fetchSocketScoresChunk(
  request: SocketBatchRequest,
  fetchImpl: FetchLike,
): Promise<SocketFetchResult> {
  const url = `https://api.socket.dev/v0/orgs/${encodeURIComponent(request.orgSlug)}/purl?alerts=true`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ components: request.components }),
    });

    if (!response.ok) {
      return {
        status: "error",
        message: `Socket HTTP ${response.status}`,
      };
    }

    const body: unknown = await response.json();
    const artifacts = Array.isArray(body)
      ? body
      : body !== null &&
          typeof body === "object" &&
          Array.isArray((body as { artifacts?: unknown }).artifacts)
        ? (body as { artifacts: unknown[] }).artifacts
        : body !== null &&
            typeof body === "object" &&
            Array.isArray((body as { packages?: unknown }).packages)
          ? (body as { packages: unknown[] }).packages
          : null;

    if (!artifacts) {
      return { status: "error", message: "Socket response shape unexpected" };
    }

    const byPurl = new Map<string, SocketScoreHit>();
    for (const artifact of artifacts) {
      const hit = parseSocketArtifact(artifact);
      if (hit) {
        byPurl.set(hit.purl, hit);
      }
    }
    return { status: "ok", byPurl };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Socket fetch failed",
    };
  }
}

function chunkComponents<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
