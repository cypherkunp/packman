export type SocketCredentials =
  | { status: "missing" }
  | { status: "ready"; apiToken: string; orgSlug: string };

export function resolveSocketCredentials(
  apiToken: string | undefined,
  orgSlug: string | undefined,
): SocketCredentials {
  const token = apiToken?.trim() ?? "";
  const org = orgSlug?.trim() ?? "";
  if (!token || !org) {
    return { status: "missing" };
  }
  return { status: "ready", apiToken: token, orgSlug: org };
}
