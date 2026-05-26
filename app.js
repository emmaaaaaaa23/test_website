const state = {
  articles: [],
  filtered: [],
  analysis: null,
};

const elements = {
  lastUpdated: document.querySelector("#lastUpdated"),
  totalStories: document.querySelector("#totalStories"),
  totalSources: document.querySelector("#totalSources"),
  importantStories: document.querySelector("#importantStories"),
  resultCount: document.querySelector("#resultCount"),
  highlightCount: document.querySelector("#highlightCount"),
  highlightList: document.querySelector("#highlightList"),
  summaryText: document.querySelector("#summaryText"),
  themeList: document.querySelector("#themeList"),
  usSignals: document.querySelector("#usSignals"),
  chinaSignals: document.querySelector("#chinaSignals"),
  newsList: document.querySelector("#newsList"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  template: document.querySelector("#articleTemplate"),
};

async function loadNews() {
  try {
    const response = await fetch(`data/news.json?ts=${Date.now()}`);
    if (!response.ok) throw new Error(`News data failed with ${response.status}`);

    const data = await response.json();
    state.articles = Array.isArray(data.articles) ? data.articles : [];
    state.analysis = normalizeAnalysis(data);
    updateMetadata(data);
    populateFilters();
    applyFilters();
  } catch (error) {
    elements.lastUpdated.textContent = "Unable to load news";
    elements.newsList.innerHTML = "";
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = "News data is not available yet. Run the update workflow to refresh it.";
    console.error(error);
  }
}

function updateMetadata(data) {
  const updatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
  elements.lastUpdated.textContent = updatedAt && !Number.isNaN(updatedAt.getTime())
    ? updatedAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "Waiting for first update";

  elements.totalStories.textContent = state.articles.length.toString();
  elements.totalSources.textContent = new Set(state.articles.map((item) => item.source)).size.toString();
  elements.importantStories.textContent = state.articles.filter((item) => (item.importanceScore || 0) >= 7).length.toString();
}

function populateFilters() {
  fillSelect(elements.categoryFilter, uniqueValues("category"), "All categories");
  fillSelect(elements.sourceFilter, uniqueValues("source"), "All sources");
}

function uniqueValues(key) {
  return [...new Set(state.articles.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(select, values, defaultLabel) {
  const current = select.value;
  select.innerHTML = `<option value="all">${defaultLabel}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  select.value = values.includes(current) ? current : "all";
}

function applyFilters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const category = elements.categoryFilter.value;
  const source = elements.sourceFilter.value;

  state.filtered = state.articles.filter((article) => {
    const haystack = [article.title, article.summary, article.source, article.category, ...(article.keywords || [])]
      .join(" ")
      .toLowerCase();

    return (!query || haystack.includes(query))
      && (category === "all" || article.category === category)
      && (source === "all" || article.source === source);
  });

  sortArticles();
  renderAnalysis();
  renderArticles();
}

function sortArticles() {
  const sortMode = elements.sortSelect.value;
  state.filtered.sort((a, b) => {
    if (sortMode === "source") return a.source.localeCompare(b.source) || newestFirst(a, b);
    if (sortMode === "category") return a.category.localeCompare(b.category) || newestFirst(a, b);
    if (sortMode === "newest") return newestFirst(a, b);
    return (b.importanceScore || 0) - (a.importanceScore || 0) || newestFirst(a, b);
  });
}

function newestFirst(a, b) {
  return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
}

function renderAnalysis() {
  const analysis = buildVisibleAnalysis();
  renderHighlights(analysis.highlights);
  renderSummary(analysis.summary, analysis.themes);
  renderSignals(elements.usSignals, analysis.marketSignals.us);
  renderSignals(elements.chinaSignals, analysis.marketSignals.china);
}

function normalizeAnalysis(data) {
  const fallback = buildAnalysisFromArticles(state.articles);
  return {
    summary: data.summary || fallback.summary,
    themes: Array.isArray(data.themes) && data.themes.length ? data.themes : fallback.themes,
    highlights: Array.isArray(data.highlights) && data.highlights.length ? data.highlights : fallback.highlights,
    marketSignals: {
      us: data.marketSignals?.us?.length ? data.marketSignals.us : fallback.marketSignals.us,
      china: data.marketSignals?.china?.length ? data.marketSignals.china : fallback.marketSignals.china,
    },
  };
}

function buildVisibleAnalysis() {
  if (state.filtered.length === state.articles.length) return state.analysis;
  return buildAnalysisFromArticles(state.filtered);
}

function buildAnalysisFromArticles(articles) {
  const scored = articles.map((article) => ({ ...article, importanceScore: article.importanceScore || scoreArticle(article) }))
    .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0) || newestFirst(a, b));
  const themes = topThemes(scored);
  return {
    highlights: scored.slice(0, 5).map((article) => ({
      title: article.title,
      url: article.url,
      source: article.source,
      category: article.category,
      importanceScore: article.importanceScore,
      reason: article.importanceReason || reasonForArticle(article),
    })),
    summary: summarizeThemes(scored, themes),
    themes,
    marketSignals: buildMarketSignals(scored),
  };
}

function scoreArticle(article) {
  const text = `${article.title} ${article.summary} ${(article.keywords || []).join(" ")}`.toLowerCase();
  const weights = [
    ["nvidia", 3], ["tsmc", 3], ["asml", 3], ["hbm", 3], ["export control", 3], ["chips act", 3],
    ["ai chip", 2], ["gpu", 2], ["foundry", 2], ["fab", 2], ["memory", 2], ["earnings", 2],
    ["guidance", 2], ["sanction", 2], ["supply chain", 2], ["advanced packaging", 2],
  ];
  return Math.min(10, 2 + weights.reduce((sum, [term, weight]) => sum + (text.includes(term) ? weight : 0), 0));
}

function reasonForArticle(article) {
  const terms = article.keywords?.slice(0, 3).join(", ") || article.category || "semiconductors";
  return `Flagged because it touches ${terms}, which can affect chip demand, capacity, pricing, or supply chains.`;
}

function topThemes(articles) {
  const counts = new Map();
  articles.forEach((article) => {
    if (!article.category) return;
    counts.set(article.category, (counts.get(article.category) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

function summarizeThemes(articles, themes) {
  if (!articles.length) return "No matching semiconductor news is available for this filter yet.";
  const themeText = themes.map((theme) => theme.name).join(", ") || "semiconductor activity";
  const important = articles.filter((article) => (article.importanceScore || 0) >= 7).length;
  return `${articles.length} relevant stories are being tracked. The strongest themes are ${themeText}. ${important} stories are currently flagged as high importance based on company mentions, supply-chain impact, policy risk, capacity changes, AI hardware demand, or memory/equipment signals.`;
}

const MARKET_MAP = {
  us: [
    { ticker: "NVDA", name: "NVIDIA", terms: ["nvidia", "gpu", "ai chip", "accelerator", "hbm", "blackwell", "rubin"] },
    { ticker: "AMD", name: "Advanced Micro Devices", terms: ["amd", "gpu", "ai chip", "accelerator", "server cpu"] },
    { ticker: "INTC", name: "Intel", terms: ["intel", "intel foundry", "fab", "process node", "pc chip"] },
    { ticker: "TSM", name: "TSMC ADR", terms: ["tsmc", "foundry", "wafer", "advanced packaging"] },
    { ticker: "ASML", name: "ASML ADR", terms: ["asml", "lithography", "euv", "duv"] },
    { ticker: "MU", name: "Micron", terms: ["micron", "memory", "dram", "nand", "hbm"] },
    { ticker: "AVGO", name: "Broadcom", terms: ["broadcom", "asic", "networking chip", "ai infrastructure"] },
    { ticker: "AMAT", name: "Applied Materials", terms: ["applied materials", "chip equipment", "semiconductor tools"] },
    { ticker: "LRCX", name: "Lam Research", terms: ["lam research", "etch", "deposition", "chip equipment"] },
    { ticker: "CDNS", name: "Cadence", terms: ["cadence", "eda", "chip design"] },
    { ticker: "SNPS", name: "Synopsys", terms: ["synopsys", "eda", "chip design"] },
  ],
  china: [
    { ticker: "0981.HK / 688981.SS", name: "SMIC", terms: ["smic", "china foundry", "foundry", "fab"] },
    { ticker: "1347.HK / 688347.SS", name: "Hua Hong Semiconductor", terms: ["hua hong", "foundry", "china chip"] },
    { ticker: "002371.SZ", name: "NAURA", terms: ["naura", "chip equipment", "semiconductor tools"] },
    { ticker: "688012.SS", name: "AMEC", terms: ["amec", "etch", "chip equipment"] },
    { ticker: "600584.SS", name: "JCET", terms: ["jcet", "advanced packaging", "packaging"] },
    { ticker: "603501.SS", name: "Will Semiconductor", terms: ["will semiconductor", "image sensor", "automotive chip"] },
    { ticker: "688008.SS", name: "Montage Technology", terms: ["montage", "memory interface", "dram", "server memory"] },
    { ticker: "688256.SS", name: "Cambricon", terms: ["cambricon", "ai chip", "accelerator"] },
    { ticker: "688041.SS", name: "Hygon", terms: ["hygon", "server cpu", "cpu"] },
  ],
};

function buildMarketSignals(articles) {
  return {
    us: scoreMarket(MARKET_MAP.us, articles),
    china: scoreMarket(MARKET_MAP.china, articles),
  };
}

function scoreMarket(stocks, articles) {
  return stocks.map((stock) => {
    const matching = articles.filter((article) => {
      const text = `${article.title} ${article.summary} ${(article.keywords || []).join(" ")}`.toLowerCase();
      return stock.terms.some((term) => text.includes(term));
    });
    const score = Math.min(10, matching.reduce((sum, article) => sum + Math.max(1, Math.round((article.importanceScore || 4) / 3)), 0));
    return {
      ...stock,
      score,
      rationale: matching.length
        ? `${matching.length} related story${matching.length === 1 ? "" : "ies"} detected; watch for follow-through in orders, margins, capacity, or policy exposure.`
        : "No direct high-signal article match in the current filter.",
      risk: "News signal only. Validate valuation, liquidity, earnings dates, and regulatory risk before acting.",
    };
  }).filter((stock) => stock.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}

function renderHighlights(highlights) {
  elements.highlightList.innerHTML = "";
  elements.highlightCount.textContent = `${highlights.length} highlighted`;
  highlights.forEach((item) => {
    const row = document.createElement("article");
    row.className = "highlight-item";
    row.innerHTML = `
      <div class="card-meta">
        <span class="importance">${item.importanceScore || scoreArticle(item)}/10</span>
        <span class="category">${item.category || "Industry"}</span>
        <span class="source">${item.source || "Unknown"}</span>
      </div>
      <strong><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a></strong>
      <p class="highlight-reason">${item.reason || reasonForArticle(item)}</p>
    `;
    elements.highlightList.append(row);
  });
}

function renderSummary(summary, themes) {
  elements.summaryText.textContent = summary;
  elements.themeList.innerHTML = "";
  themes.forEach((theme) => {
    const chip = document.createElement("div");
    chip.className = "theme-chip";
    chip.innerHTML = `<span>${theme.name}</span><span>${theme.count}</span>`;
    elements.themeList.append(chip);
  });
}

function renderSignals(container, signals) {
  container.innerHTML = "";
  if (!signals.length) {
    container.innerHTML = `<p class="briefing-text">No strong news-linked stock signals in the current filter.</p>`;
    return;
  }
  signals.forEach((signal) => {
    const card = document.createElement("article");
    card.className = "signal-card";
    card.innerHTML = `
      <header>
        <div><strong>${signal.ticker}</strong><small> ${signal.name}</small></div>
        <span class="signal-score">${signal.score}/10</span>
      </header>
      <p class="signal-rationale">${signal.rationale}</p>
      <p class="signal-risk">${signal.risk}</p>
    `;
    container.append(card);
  });
}

function renderArticles() {
  elements.newsList.innerHTML = "";
  elements.resultCount.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? "" : "s"}`;
  elements.emptyState.hidden = state.filtered.length > 0;

  state.filtered.forEach((article) => {
    const card = elements.template.content.cloneNode(true);
    const link = card.querySelector("a");
    const time = card.querySelector("time");
    const keywordRow = card.querySelector(".keyword-row");
    const score = article.importanceScore || scoreArticle(article);
    const importance = card.querySelector(".importance");

    importance.textContent = `${score}/10`;
    importance.classList.toggle("medium", score < 7 && score >= 4);
    importance.classList.toggle("low", score < 4);
    card.querySelector(".category").textContent = article.category || "Industry";
    card.querySelector(".source").textContent = article.source || "Unknown source";
    link.href = article.url;
    link.textContent = article.title;
    card.querySelector(".summary").textContent = article.summary || "No summary provided.";

    const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;
    time.dateTime = publishedAt ? publishedAt.toISOString() : "";
    time.textContent = publishedAt && !Number.isNaN(publishedAt.getTime())
      ? publishedAt.toLocaleDateString([], { month: "short", day: "numeric" })
      : "Undated";

    (article.keywords || []).slice(0, 5).forEach((keyword) => {
      const chip = document.createElement("span");
      chip.textContent = keyword;
      keywordRow.append(chip);
    });

    elements.newsList.append(card);
  });
}

[elements.searchInput, elements.categoryFilter, elements.sourceFilter, elements.sortSelect].forEach((control) => {
  control.addEventListener("input", applyFilters);
  control.addEventListener("change", applyFilters);
});

loadNews();
