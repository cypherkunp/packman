/** Socket/npm Package URL helpers. */
export function npmPurl(packageName: string, version: string): string {
  if (packageName.startsWith("@")) {
    const slash = packageName.indexOf("/");
    if (slash !== -1) {
      const scope = packageName.slice(1, slash);
      const name = packageName.slice(slash + 1);
      return `pkg:npm/%40${scope}%2F${name}@${version}`;
    }
  }
  return `pkg:npm/${packageName}@${version}`;
}

export function socketPackageUrl(packageName: string): string {
  return `https://socket.dev/npm/package/${packageName}`;
}
