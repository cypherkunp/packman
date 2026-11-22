export const DEPENDENCY_BAGS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export type DependencyBag = (typeof DEPENDENCY_BAGS)[number];

export type DependencyRow = {
  name: string;
  range: string;
};
