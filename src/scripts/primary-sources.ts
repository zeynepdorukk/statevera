interface SourceResult {
  title?: string;
  institution?: string;
  organization?: string;
  country?: string;
  documentType?: string;
  publicationDate?: string;
  snippet?: string;
  url?: string;
  sourceIdentifier?: string;
}

interface SourceResponse {
  query?: string;
  results?: SourceResult[];
  sources?: { institution?: string; count?: number; ok?: boolean }[];
}

const root = document.querySelector<HTMLElement>("[data-primary-sources]");
if (root) {
  const form = root.querySelector<HTMLFormElement>("[data-primary-source-form]");
  const input = root.querySelector<HTMLInputElement>("[data-primary-source-input]");
  const submit = root.querySelector<HTMLButtonElement>("[data-primary-source-submit]");
  const status = root.querySelector<HTMLElement>("[data-primary-source-status]");
  const results = root.querySelector<HTMLElement>("[data-primary-source-results]");
  const filters = [...root.querySelectorAll<HTMLButtonElement>("[data-source-filter]")];
  const endpoint = root.dataset.endpoint ?? "";
  let activeType = "All";
  let lastQuery = "";
  let allResults: SourceResult[] = [];

  const escapeHtml = (value: unknown): string => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const date = (value: string | undefined): string => {
    if (!value) return "Date not listed";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Date not listed";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
  };

  const setStatus = (message: string, state = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };

  const render = (items: SourceResult[]) => {
    if (!results) return;
    if (!items.length) {
      results.innerHTML = "<p class=\"primary-source-empty\">No official records matched this search. Try a broader keyword or another document type.</p>";
      return;
    }
    results.innerHTML = items.map((item) => `
      <article class="primary-source-result">
        <div class="primary-source-result-source">
          <strong>${escapeHtml(item.institution || "Official source")}</strong>
          <span>${escapeHtml(item.organization || item.country || "")}</span>
        </div>
        <div>
          <h3 class="primary-source-result-title">${escapeHtml(item.title)}</h3>
          <p class="primary-source-result-snippet">${escapeHtml(item.snippet || "Official record available at the source institution.")}</p>
          <div class="primary-source-result-meta">
            <span class="primary-source-result-type">${escapeHtml(item.documentType || "Document")}</span>
            <span>${escapeHtml(date(item.publicationDate))}</span>
          </div>
          ${item.sourceIdentifier ? `<span class="primary-source-result-id">ID: ${escapeHtml(item.sourceIdentifier)}</span>` : ""}
        </div>
        <a class="primary-source-result-action" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">View Original Source ↗</a>
      </article>
    `).join("");
  };

  const visibleResults = () => activeType === "All"
    ? allResults
    : allResults.filter((item) => item.documentType === activeType);

  const search = async () => {
    const query = input?.value.trim() ?? "";
    if (query.length < 2) {
      setStatus("Enter at least two characters to search official records.", "error");
      if (results) results.innerHTML = "";
      return;
    }
    if (!endpoint) {
      setStatus("The official-source endpoint is not configured.", "error");
      return;
    }
    lastQuery = query;
    allResults = [];
    if (submit) submit.disabled = true;
    setStatus("Searching official records across the source map…");
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("q", query);
      // Fetch the ranked superset once; document-type filters are instant and
      // do not make twelve official sources repeat a network request.
      url.searchParams.set("type", "All");
      const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
      const data = (await response.json()) as SourceResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "The source search is unavailable.");
      allResults = data.results ?? [];
      render(visibleResults());
      const available = (data.sources ?? []).filter((source) => source.ok).length;
      setStatus(`${visibleResults().length} records shown · ${allResults.length} total matches · ${available} of 12 source adapters responded.`);
    } catch (error) {
      if (results) results.innerHTML = "";
      setStatus(error instanceof Error ? error.message : "The source search is unavailable. Try again shortly.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  };

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void search();
  });

  filters.forEach((filter) => filter.addEventListener("click", () => {
    activeType = filter.dataset.sourceFilter || "All";
    filters.forEach((item) => {
      const active = item === filter;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    if (lastQuery && allResults.length) {
      render(visibleResults());
      setStatus(`${visibleResults().length} records shown · ${allResults.length} total matches.`);
    }
  }));
}
