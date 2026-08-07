export const PRIMARY_SOURCE_TYPES = [
  "Documents",
  "Statements",
  "Legislation",
  "Treaties",
  "Sanctions",
  "Speeches",
  "Official Data",
] as const;

export type PrimarySourceType = (typeof PRIMARY_SOURCE_TYPES)[number];

/** The stable contract shared by every official-source adapter. */
export interface PrimarySourceResult {
  id: string;
  title: string;
  institution: string;
  organization: string;
  country: string;
  documentType: PrimarySourceType;
  publicationDate: string;
  snippet: string;
  url: string;
  sourceIdentifier: string;
}

export interface PrimarySourceContext {
  query: string;
  env: PrimarySourceEnv;
  signal?: AbortSignal;
}

export interface PrimarySourceEnv {
  GOVINFO_API_KEY?: string;
  CONGRESS_API_KEY?: string;
  OSCE_SEARCH_API_KEY?: string;
}

export interface PrimarySourceAdapter {
  id: string;
  institution: string;
  organization: string;
  country: string;
  search: (context: PrimarySourceContext) => Promise<PrimarySourceResult[]>;
}

export interface PrimarySourceStatus {
  id: string;
  institution: string;
  count: number;
  ok: boolean;
}

export interface PrimarySourceSearchResponse {
  query: string;
  results: PrimarySourceResult[];
  sources: PrimarySourceStatus[];
}
