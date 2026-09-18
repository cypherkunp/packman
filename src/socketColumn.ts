import type { SocketCredentials } from "./socketCredentials";
import type { SocketFetchResult } from "./fetchSocketScores";
import { npmPurl, socketPackageUrl } from "./socketPurl";

export type SocketColumn =
  | { kind: "cta" }
  | { kind: "score"; overall100: number; highSeverity: boolean; url: string }
  | { kind: "empty" };

export type SocketEnrichable = {
  name: string;
  latest?: string;
  socket?: SocketColumn;
};

export function applySocketEnrichment<T extends SocketEnrichable>(
  rows: T[],
  credentials: SocketCredentials,
  fetchResult: SocketFetchResult | undefined,
): T[] {
  if (credentials.status === "missing") {
    return rows.map((row) => ({ ...row, socket: { kind: "cta" as const } }));
  }

  if (!fetchResult || fetchResult.status !== "ok") {
    return rows.map((row) => ({ ...row, socket: { kind: "empty" as const } }));
  }

  return rows.map((row) => {
    if (!row.latest) {
      return { ...row, socket: { kind: "empty" as const } };
    }
    const purl = npmPurl(row.name, row.latest);
    const hit = fetchResult.byPurl.get(purl);
    if (!hit) {
      return { ...row, socket: { kind: "empty" as const } };
    }
    return {
      ...row,
      socket: {
        kind: "score" as const,
        overall100: hit.overall100,
        highSeverity: hit.highSeverity,
        url: socketPackageUrl(row.name),
      },
    };
  });
}

export function socketComponentsFromRows(
  rows: Array<{ name: string; latest?: string }>,
): Array<{ purl: string }> {
  const seen = new Set<string>();
  const components: Array<{ purl: string }> = [];
  for (const row of rows) {
    if (!row.latest) {
      continue;
    }
    const purl = npmPurl(row.name, row.latest);
    if (seen.has(purl)) {
      continue;
    }
    seen.add(purl);
    components.push({ purl });
  }
  return components;
}
