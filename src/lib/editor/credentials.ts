// ============================================================
// EDITOR — the writer's own keys
// ------------------------------------------------------------
// The desk has no server half. Instead of a password that unlocks
// keys held somewhere else, the writer holds the keys herself:
// a fine-grained GitHub token scoped to this repository alone,
// and, if she wants the assistant, an OpenAI key.
//
// Both live in this browser and nowhere else. Neither is ever
// built into the published bundle.
// ============================================================

/** The one repository a desk token is expected to be scoped to. */
export const REPO = "zeynepdorukk/statevera";

/** The catalogue writes it GPT-5.6 Luna; the API id is lower case with dots. */
export const DEFAULT_MODEL = "gpt-5.6-luna";

const STORE_KEY = "statevera.desk.keys";

export interface Credentials {
  /** GitHub token. Without it there is no desk at all. */
  github: string;
  /** OpenAI key. Optional: the desk works, only the assistant goes quiet. */
  openai: string;
  model: string;
}

const EMPTY: Credentials = { github: "", openai: "", model: DEFAULT_MODEL };

/** A browser with storage switched off still gets one working sitting. */
let cache: Credentials | null = null;

/**
 * A GitHub token is the sign-in. Both shapes are accepted: `github_pat_` for
 * fine-grained tokens, `ghp_` for the older classic ones.
 */
export const looksLikeGithubToken = (value: string): boolean =>
  /^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,})$/.test(value.trim());

export const looksLikeOpenAiKey = (value: string): boolean => /^sk-[A-Za-z0-9_-]{20,}$/.test(value.trim());

export function readCredentials(): Credentials {
  if (cache) return { ...cache };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Credentials>) : {};
    cache = {
      github: typeof stored.github === "string" ? stored.github : "",
      openai: typeof stored.openai === "string" ? stored.openai : "",
      model: typeof stored.model === "string" && stored.model.trim() ? stored.model.trim() : DEFAULT_MODEL,
    };
  } catch {
    cache = { ...EMPTY };
  }
  return { ...cache };
}

export function writeCredentials(next: Partial<Credentials>): Credentials {
  cache = { ...readCredentials(), ...next };
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(cache));
  } catch {
    /* the sitting survives in memory even when nothing can be persisted */
  }
  return { ...cache };
}

export function clearCredentials(): void {
  cache = { ...EMPTY };
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing kept, nothing to clear */
  }
}

/** A GitHub token expires on its own; the assistant key it sat next to does not. */
export const forgetGithubToken = (): void => {
  writeCredentials({ github: "" });
};

export const forgetAssistantKey = (): void => {
  writeCredentials({ openai: "" });
};
