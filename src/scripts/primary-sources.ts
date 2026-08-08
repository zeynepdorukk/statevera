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
  sources?: { id?: string; institution?: string; count?: number; ok?: boolean }[];
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
  const defaultSubmitLabel = submit?.textContent?.trim() || "Search official sources";
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

  const officialUrl = (value: string | undefined): string => {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.origin);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
      return "";
    }
  };

  const domain = (value: string): string => {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return "Official institution website";
    }
  };

  const shortSnippet = (value: string | undefined): string => {
    const text = String(value || "Official record available at the source institution.").replace(/\s+/g, " ").trim();
    return text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text;
  };

  const setStatus = (message: string, state = "") => {
    if (!status) return;
    stopTyping();
    status.setAttribute("aria-live", "polite");
    status.removeAttribute("aria-label");
    status.textContent = message;
    status.dataset.state = state;
    status.setAttribute("aria-busy", String(state === "loading"));
  };

  let typing = 0;
  const stopTyping = () => {
    window.clearInterval(typing);
    typing = 0;
  };

  /**
   * The wait is a real wait, so the line that describes it is written out rather
   * than simply appearing. A reader hears the sentence once, from aria-label,
   * instead of one announcement per letter.
   */
  const typeStatus = (message: string) => {
    if (!status) return;
    stopTyping();
    status.dataset.state = "loading";
    status.setAttribute("aria-busy", "true");
    status.setAttribute("aria-live", "off");
    status.setAttribute("aria-label", message);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      status.textContent = message;
      return;
    }
    let shown = 0;
    status.textContent = "";
    typing = window.setInterval(() => {
      shown += 1;
      status.textContent = message.slice(0, shown);
      if (shown >= message.length) stopTyping();
    }, 26);
  };

  // The strip of institution marks doubles as the wait and the result: every
  // mark lights up when its institution answers, and stays dim when it did not.
  const poll = root.querySelector<HTMLElement>("[data-source-poll]");
  const pollMarks = [...root.querySelectorAll<HTMLElement>("[data-poll-id]")];

  const pollWaiting = () => {
    if (poll) poll.hidden = false;
    for (const mark of pollMarks) {
      mark.dataset.state = "waiting";
      delete mark.dataset.count;
    }
  };

  const pollAnswered = (sources: SourceResponse["sources"]) => {
    for (const mark of pollMarks) {
      const source = (sources ?? []).find((item) => item.id === mark.dataset.pollId);
      mark.dataset.state = source?.ok ? "ok" : "silent";
      if (source?.ok && source.count) mark.dataset.count = String(source.count);
      else delete mark.dataset.count;
    }
  };

  const pollSilent = () => {
    for (const mark of pollMarks) {
      mark.dataset.state = "silent";
      delete mark.dataset.count;
    }
  };

  const render = (items: SourceResult[]) => {
    if (!results) return;
    if (!items.length) {
      results.innerHTML = "<p class=\"primary-source-empty\">No official records matched this search. Try a broader keyword or another document type.</p>";
      return;
    }
    results.innerHTML = items.map((item, index) => {
      const url = officialUrl(item.url);
      const title = item.title || "Official record";
      const titleMarkup = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(title)} at the official source">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      const actionMarkup = url
        ? `<a class="primary-source-result-action" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open official document <span aria-hidden="true">↗</span></a>`
        : `<span class="primary-source-result-action is-unavailable">Official link unavailable</span>`;

      return `
      <article class="primary-source-result">
        <div class="primary-source-result-source">
          <span class="primary-source-result-eyebrow">Primary source · ${escapeHtml(domain(url))}</span>
          <strong>${escapeHtml(item.institution || "Official source")}</strong>
          <span>${escapeHtml(item.organization || item.country || "Issued by the institution above")}</span>
          <span class="primary-source-result-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        </div>
        <div class="primary-source-result-body">
          <h3 class="primary-source-result-title">${titleMarkup}</h3>
          <p class="primary-source-result-snippet">${escapeHtml(shortSnippet(item.snippet))}</p>
          <div class="primary-source-result-meta">
            <span class="primary-source-result-type">${escapeHtml(item.documentType || "Document")}</span>
            <span>${escapeHtml(date(item.publicationDate))}</span>
            ${item.sourceIdentifier ? `<span class="primary-source-result-id">Record ID: ${escapeHtml(item.sourceIdentifier)}</span>` : ""}
          </div>
          ${actionMarkup}
        </div>
      </article>
    `;
    }).join("");
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
    if (results) results.innerHTML = "";
    if (submit) {
      submit.disabled = true;
      submit.dataset.state = "loading";
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Checking official sources…";
    }
    typeStatus(`Checking official sources across ${pollMarks.length} institutions\u{2026}`);
    pollWaiting();
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
      pollAnswered(data.sources);
      const available = (data.sources ?? []).filter((source) => source.ok).length;
      setStatus(`${visibleResults().length} records shown \u{b7} ${allResults.length} total matches \u{b7} ${available} of ${pollMarks.length} institutions answered.`);
    } catch (error) {
      if (results) results.innerHTML = "";
      pollSilent();
      setStatus(error instanceof Error ? error.message : "The source search is unavailable. Try again shortly.", "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.dataset.state = "";
        submit.setAttribute("aria-busy", "false");
        submit.textContent = defaultSubmitLabel;
      }
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
