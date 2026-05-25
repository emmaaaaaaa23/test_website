const state = {
  articles: [],
  filtered: [],
};

const elements = {
  lastUpdated: document.querySelector("#lastUpdated"),
  totalStories: document.querySelector("#totalStories"),
  totalSources: document.querySelector("#totalSources"),
  totalCategories: document.querySelector("#totalCategories"),
  resultCount: document.querySelector("#resultCount"),
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
    if (!response.ok) {
      throw new Error(`News data failed with ${response.status}`);
    }

    const data = await response.json();
    state.articles = Array.isArray(data.articles) ? data.articles : [];
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
  elements.totalCategories.textContent = new Set(state.articles.map((item) => item.category)).size.toString();
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
  renderArticles();
}

function sortArticles() {
  const sortMode = elements.sortSelect.value;

  state.filtered.sort((a, b) => {
    if (sortMode === "source") {
      return a.source.localeCompare(b.source) || newestFirst(a, b);
    }

    if (sortMode === "category") {
      return a.category.localeCompare(b.category) || newestFirst(a, b);
    }

    return newestFirst(a, b);
  });
}

function newestFirst(a, b) {
  return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
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
