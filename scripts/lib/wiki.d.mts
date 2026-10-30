export interface WikiPage {
  title: string;
  path: string;
  tags: string[];
  summary: string;
  links: string[];
}
export interface WikiIndex {
  tags: Record<string, { meaning: string; pages: string[] }>;
  pages: WikiPage[];
}
export function parseFrontmatter(text: string): {
  data: Record<string, string | string[]> | null;
  body: string;
};
export function stripCode(body: string, options?: { inline?: boolean }): string;
export function pageTitle(body: string): string | null;
export function githubSlug(heading: string): string;
export function headingAnchors(body: string): Set<string>;
export function relativeLinks(body: string): string[];
export function repoLinks(body: string, repoUrl: string): string[];
export function tagVocabulary(markdown: string): Map<string, string>;
export function wikiPages(root: string): string[];
export function buildWikiIndex(
  root: string,
  options?: { home?: string; tagsPage?: string; repoUrl?: string },
): { index: WikiIndex; problems: string[] };
