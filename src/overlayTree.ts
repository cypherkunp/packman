import {
  createScanner,
  findNodeAtLocation,
  parseTree,
  ScanError,
  SyntaxKind,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";
import { DEPENDENCY_BAGS } from "./packageViewModel";

/**
 * Broken-JSON recovery for the Overlay. While a `package.json` is broken
 * mid-edit, the entries that can still be located are rebuilt into a
 * well-formed tree at their original offsets, so the Overlay stays steady.
 */

/** The blocks whose entries carry an Overlay. */
const OVERLAY_BLOCKS: readonly string[] = ["scripts", ...DEPENDENCY_BAGS];

type Token = { kind: SyntaxKind; offset: number; length: number; ok: boolean };
type LocatedEntry = { key: Token; colon: Token; value: Token; name: string };
type LocatedBlock = {
  name: string;
  key: Token;
  colon: Token;
  brace: Token;
  entries: LocatedEntry[];
};

function parse(text: string): { root: JsonNode | undefined; ok: boolean } {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors);
  return { root, ok: errors.length === 0 };
}

/** Whether `text` parses as JSON without a single error. */
export function isWellFormed(text: string): boolean {
  return parse(text).ok;
}

/** The tree of `text` if it parses as JSON without a single error. */
export function parseWellFormed(text: string): JsonNode | undefined {
  const { root, ok } = parse(text);
  return ok ? root : undefined;
}

/**
 * The tree the Overlay reads. Well-formed text is parsed as is. Broken text
 * (mid-edit) is re-scanned: every block entry that can still be located by
 * its block and name is copied, at its original offset, into a well-formed
 * skeleton, so the rest of the builder sees accurate ranges and never an
 * entry the parser mis-attributed while recovering.
 */
export function overlayRoot(
  text: string,
  lastGoodText?: string,
): JsonNode | undefined {
  const parsed = parse(text);
  if (parsed.ok) {
    return parsed.root;
  }
  const located = locateBlocks(text);
  const lastGood =
    lastGoodText === undefined ? undefined : entryIds(lastGoodText);
  if (located && lastGood) {
    for (const block of located.blocks) {
      block.entries = block.entries.filter((entry) =>
        lastGood.has(entryId(block.name, entry.name)),
      );
    }
  }
  const repaired = repairedText(text, located);
  return repaired === undefined ? undefined : parseTree(repaired);
}

const entryId = (block: string, name: string) => `${block}\u0000${name}`;

/** `(block, name)` identities of the Overlay entries in well-formed text. */
function entryIds(text: string): Set<string> | undefined {
  const root = parseWellFormed(text);
  if (root?.type !== "object") {
    return undefined;
  }
  const ids = new Set<string>();
  for (const block of OVERLAY_BLOCKS) {
    const node = findNodeAtLocation(root, [block]);
    for (const property of node?.type === "object"
      ? (node.children ?? [])
      : []) {
      const key = property.children?.[0]?.value;
      if (typeof key === "string") {
        ids.add(entryId(block, key));
      }
    }
  }
  return ids;
}

function scanTokens(text: string): Token[] {
  const scanner = createScanner(text, true);
  const tokens: Token[] = [];
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EOF;
    kind = scanner.scan()
  ) {
    if (
      kind === SyntaxKind.LineCommentTrivia ||
      kind === SyntaxKind.BlockCommentTrivia
    ) {
      continue;
    }
    tokens.push({
      kind,
      offset: scanner.getTokenOffset(),
      length: scanner.getTokenLength(),
      ok: scanner.getTokenError() === ScanError.None,
    });
  }
  return tokens;
}

/**
 * Finds the root `{`, each top-level Overlay block, and each
 * `"name": "value"` entry directly inside it, trusting only tokens that
 * scanned cleanly.
 */
function locateBlocks(
  text: string,
): { rootBrace: Token; blocks: LocatedBlock[] } | undefined {
  const tokens = scanTokens(text);
  const isString = (token: Token | undefined) =>
    token?.kind === SyntaxKind.StringLiteral && token.ok;
  const stringValue = (token: Token) =>
    JSON.parse(text.slice(token.offset, token.offset + token.length)) as string;
  const stack: (LocatedBlock | undefined)[] = [];
  const blocks: LocatedBlock[] = [];
  let rootBrace: Token | undefined;
  tokens.forEach((token, i) => {
    switch (token.kind) {
      case SyntaxKind.OpenBraceToken: {
        if (stack.length === 0) {
          rootBrace ??= token;
          stack.push(undefined);
          return;
        }
        const key = tokens[i - 2];
        const colon = tokens[i - 1];
        let block: LocatedBlock | undefined;
        if (
          stack.length === 1 &&
          isString(key) &&
          colon?.kind === SyntaxKind.ColonToken
        ) {
          const name = stringValue(key!);
          if (
            OVERLAY_BLOCKS.includes(name) &&
            !blocks.some((other) => other.name === name)
          ) {
            block = { name, key: key!, colon, brace: token, entries: [] };
            blocks.push(block);
          }
        }
        stack.push(block);
        return;
      }
      case SyntaxKind.OpenBracketToken:
        stack.push(undefined);
        return;
      case SyntaxKind.CloseBraceToken:
      case SyntaxKind.CloseBracketToken:
        stack.pop();
        return;
      case SyntaxKind.StringLiteral: {
        const block = stack.length === 2 ? stack[1] : undefined;
        const colon = tokens[i + 1];
        const value = tokens[i + 2];
        if (
          block &&
          isString(token) &&
          colon?.kind === SyntaxKind.ColonToken &&
          isString(value) &&
          tokens[i + 3]?.kind !== SyntaxKind.ColonToken
        ) {
          block.entries.push({
            key: token,
            colon,
            value: value!,
            name: stringValue(token),
          });
        }
        return;
      }
    }
  });
  return rootBrace ? { rootBrace, blocks } : undefined;
}

/**
 * A well-formed text of the same layout: the located tokens stay at their
 * offsets, everything else becomes spaces (line breaks kept), and commas and
 * closing braces go into free gaps. Entries or blocks with no room for the
 * punctuation they need are dropped.
 */
function repairedText(
  text: string,
  located: ReturnType<typeof locateBlocks>,
): string | undefined {
  if (!located) {
    return undefined;
  }
  const out = Array.from(text, (char): string =>
    char === "\n" || char === "\r" ? char : " ",
  );
  const copy = (token: Token) => {
    for (let i = token.offset; i < token.offset + token.length; i += 1) {
      out[i] = text[i]!;
    }
  };
  /** Free (blank, non-line-break) positions in `[from, to)`. */
  const free = (from: number, to: number, count: number) => {
    const slots: number[] = [];
    for (let i = from; i < to && slots.length < count; i += 1) {
      if (out[i] === " ") {
        slots.push(i);
      }
    }
    return slots.length === count ? slots : undefined;
  };
  const end = (token: Token) => token.offset + token.length;

  copy(located.rootBrace);
  let cursor = end(located.rootBrace);
  let open = false;
  for (const block of located.blocks) {
    if (block.key.offset < cursor) {
      continue;
    }
    if (open) {
      const slots = free(cursor, block.key.offset, 2);
      if (!slots) {
        continue;
      }
      out[slots[0]!] = "}";
      out[slots[1]!] = ",";
    }
    copy(block.key);
    copy(block.colon);
    copy(block.brace);
    open = true;
    cursor = end(block.brace);
    let first = true;
    for (const entry of block.entries) {
      if (!first) {
        const slot = free(cursor, entry.key.offset, 1);
        if (!slot) {
          continue;
        }
        out[slot[0]!] = ",";
      }
      copy(entry.key);
      copy(entry.colon);
      copy(entry.value);
      cursor = end(entry.value);
      first = false;
    }
  }
  return out.join("") + (open ? "}}" : "}");
}
