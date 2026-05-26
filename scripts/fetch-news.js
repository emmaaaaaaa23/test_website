const { writeFile, mkdir } = require("node:fs/promises");
const path = require("node:path");

const MAX_ARTICLES = 120;
const WINDOW = "when:7d";

function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} ${WINDOW}`)}&hl=en-US&gl=US&ceid=US:en`;
}

const SEARCH_FEEDS = [
  { name: "Google News: Semiconductors", url: googleNewsUrl("semiconductor OR chip OR chipmaker"), category: "Semiconductors", kind: "google-news" },
  { name: "Google News: AI Hardware", url: googleNewsUrl("AI chip OR GPU OR accelerator OR HBM OR datacenter silicon"), category: "AI Hardware", kind: "google-news" },
  { name: "Google News: Foundry", url: googleNewsUrl("TSMC OR Samsung Foundry OR Intel Foundry OR wafer fab"), category: "Foundry", kind: "google-news" },
  { name: "Google News: Memory", url: googleNewsUrl("Micron OR SK Hynix OR Samsung memory OR DRAM OR NAND OR HBM"), category: "Memory", kind: "google-news" },
  { name: "Google News: Equipment", url: googleNewsUrl("ASML OR lithography OR chip equipment OR semiconductor tools"), category: "Equipment", kind: "google-news" },
  { name: "Google News: Policy", url: googleNewsUrl("chip export control OR CHIPS Act OR semiconductor supply chain"), category: "Policy and Supply Chain", kind: "google-news" },
  { name: "Google News: EDA", url: googleNewsUrl("Synopsys OR Cadence OR EDA OR chip design software"), category: "EDA and IP", kind: "google-news" },
];

const SPECIALIST_FEEDS = [
  { name: "Semiconductor Engineering", url: "https://semiengineering.com/feed/", category: "Manufacturing" },
  { name: "EE Times", url: "https://www.eetimes.com/feed/", category: "Semiconductors" },
  { name: "AnandTech", url: "https://www.anandtech.com/rss/", category: "Hardware" },
  { name: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", category: "Hardware" },
  { name: "TechPowerUp", url: "https://www.techpowerup.com/rss/news", category: "Hardware" },
  { name: "The Register", url: "https://www.theregister.com/headlines.atom", category: "Compute" },
  { name: "Nikkei Asia Technology", url: "https://asia.nikkei.com/rss/feed/nar", category: "Asia Supply Chain" },
  { name: "IEEE Spectrum", url: "https://spectrum.ieee.org/rss/fulltext", category: "Research" },
  { name: "HPCwire", url: "https://www.hpcwire.com/feed/", category: "Datacenter" },
];

const SOURCES = [...SEARCH_FEEDS, ...SPECIALIST_FEEDS];

const KEYWORDS = [
  "semiconductor", "semiconductors", "chip", "chips", "chipmaker", "silicon", "foundry", "fab", "wafer", "tsmc",
  "nvidia", "amd", "intel", "qualcomm", "broadcom", "micron", "sk hynix", "samsung", "asml", "arm", "eda",
  "synopsys", "cadence", "memory", "dram", "nand", "hbm", "gpu", "ai accelerator", "ai chip", "data center",
  "datacenter", "packaging", "advanced packaging", "lithography", "export control", "chips act", "supply chain",
  "automotive chip", "chip equipment", "chip design", "risc-v", "riscv", "tariff", "sanction", "sanctions"
];

const CATEGORY_RULES = [
  { category: "AI Hardware", terms: ["nvidia", "gpu", "ai chip", "ai accelerator", "hbm", "datacenter", "data center", "blackwell", "rubin", "tpu"] },
  { category: "Foundry", terms: ["tsmc", "foundry", "fab", "wafer", "process node", "intel foundry", "samsung foundry"] },
  { category: "Equipment", terms: ["asml", "lithography", "euv", "duv", "chip equipment", "semiconductor tools", "applied materials"] },
  { category: "Memory", terms: ["memory", "dram", "nand", "hbm", "micron", "sk hynix"] },
  { category: "EDA and IP", terms: ["eda", "synopsys", "cadence", "arm", "risc-v", "riscv", "chip design"] },
  { category: "Policy and Supply Chain", terms: ["export control", "tariff", "subsidy", "chips act", "supply chain", "trade", "sanction", "sanctions"] },
  { category: "Automotive", terms: ["automotive", "vehicle", "ev", "adas"] },
];

const IMPORTANCE_RULES = [
  { term: "export control", weight: 5 }, { term: "sanction", weight: 5 }, { term: "tariff", weight: 5 },
  { term: "chips act", weight: 4 }, { term: "hbm", weight: 4 }, { term: "ai chip", weight: 4 },
  { term: "nvidia", weight: 4 }, { term: "tsmc", weight: 4 }, { term: "asml", weight: 4 },
  { term: "micron", weight: 3 }, { term: "sk hynix", weight: 3 }, { term: "samsung", weight: 3 },
  { term: "china", weight: 3 }, { term: "huawei", weight: 3 }, { term: "foundry", weight: 3 },
  { term: "memory", weight: 2 }, { term: "equipment", weight: 2 }, { term: "advanced packaging", weight: 2 },
];

const MARKET_MAP = {
  us: [
    { ticker: "NVDA", name: "Nvidia", terms: ["nvidia", "gpu", "blackwell", "rubin", "ai accelerator"] },
    { ticker: "AMD", name: "AMD", terms: ["amd", "gpu", "ai chip", "accelerator"] },
    { ticker: "INTC", name: "Intel", terms: ["intel", "intel foundry", "process node", "fab"] },
    { ticker: "TSM", name: "TSMC ADR", terms: ["tsmc", "taiwan semiconductor", "foundry", "a14"] },
    { ticker: "ASML", name: "ASML", terms: ["asml", "euv", "duv", "lithography"] },
    { ticker: "MU", name: "Micron", terms: ["micron", "dram", "nand", "hbm", "memory"] },
    { ticker: "AVGO", name: "Broadcom", terms: ["broadcom", "custom silicon", "asic"] },
    { ticker: "AMAT", name: "Applied Materials", terms: ["applied materials", "semiconductor tools", "equipment"] },
    { ticker: "LRCX", name: "Lam Research", terms: ["lam research", "etch", "deposition", "wafer equipment"] },
    { ticker: "CDNS", name: "Cadence", terms: ["cadence", "eda", "chip design"] },
    { ticker: "SNPS", name: "Synopsys", terms: ["synopsys", "eda", "ip"] },
  ],
  china: [
    { ticker: "0981.HK / 688981.SS", name: "SMIC", terms: ["smic", "china foundry", "chinese foundry"] },
    { ticker: "1347.HK / 688347.SS", name: "Hua Hong Semiconductor", terms: ["hua hong", "china foundry"] },
    { ticker: "002371.SZ", name: "NAURA", terms: ["naura", "china equipment", "semiconductor equipment"] },
    { ticker: "688012.SS", name: "AMEC", terms: ["amec", "etch", "china equipment"] },
    { ticker: "600584.SS", name: "JCET", terms: ["jcet", "advanced packaging", "packaging", "chiplet"] },
    { ticker: "603501.SS", name: "Will Semiconductor", terms: ["will semiconductor", "image sensor", "automotive chip"] },
    { ticker: "688008.SS", name: "Montage Technology", terms: ["montage", "memory interface", "dram"] },
    { ticker: "688256.SS", name: "Cambricon", terms: ["cambricon", "ai chip", "accelerator"] },
    { ticker: "688041.SS", name: "Hygon", terms: ["hygon", "cpu", "server chip"] },
    { ticker: "Huawei supply chain", name: "Huawei-related chip supply chain", terms: ["huawei", "sanctions", "china", "chip design"] },
  ],
};

async function main() {
  const fetched = await Promise.allSettled(SOURCES.map(fetchSource));
  const articles = fetched
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter(isRelevant)
    .map(enrichArticle)
    .sort((a, b) => b.importanceScore - a.importanceScore || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const deduped = dedupeArticles(articles).slice(0, MAX_ARTICLES);
  const analysis = buildAnalysis(deduped);
  const payload = {
    updatedAt: new Date().toISOString(),
    articleCount: deduped.length,
    sourceCount: new Set(deduped.map((article) => article.source)).size,
    searchFeedCount: SEARCH_FEEDS.length,
    ...analysis,
    articles: deduped,
  };

  const outputDir = path.join(process.cwd(), "data");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "news.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Saved ${deduped.length} articles with ${payload.highlights.length} highlighted stories.`);
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "SemiconductorNewsWatch/1.0 (+https://github.com/emmaaaaaaa23/test_website)",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  return parseFeed(await response.text(), source);
}

function parseFeed(xml, source) {
  const blocks = matchBlocks(xml, "item").length ? matchBlocks(xml, "item") : matchBlocks(xml, "entry");
  return blocks.map((block) => {
    const rawTitle = cleanText(textFromTag(block, "title"));
    const inferred = inferGoogleNewsSource(rawTitle, cleanText(textFromTag(block, "source")), source);
    const url = cleanText(textFromTag(block, "link")) || linkFromAtom(block);
    const summary = textFromTag(block, "description") || textFromTag(block, "summary") || textFromTag(block, "content");
    const publishedAt = textFromTag(block, "pubDate") || textFromTag(block, "published") || textFromTag(block, "updated");
    return {
      title: inferred.title,
      url: normalizeUrl(url),
      summary: summarize(cleanText(stripHtml(summary)) || inferred.title),
      publishedAt: toIsoDate(publishedAt),
      source: inferred.source,
      category: source.category,
    };
  }).filter((article) => article.title && article.url);
}

function inferGoogleNewsSource(title, sourceTag, source) {
  if (source.kind !== "google-news") return { title, source: sourceTag || source.name };
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    return { title: parts.slice(0, -1).join(" - ").trim(), source: sourceTag || parts.at(-1).trim() || source.name };
  }
  return { title, source: sourceTag || source.name };
}

function isRelevant(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return KEYWORDS.some((keyword) => text.includes(keyword));
}

function enrichArticle(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const matchedKeywords = KEYWORDS.filter((keyword) => text.includes(keyword)).slice(0, 8);
  const categoryRule = CATEGORY_RULES.find((rule) => rule.terms.some((term) => text.includes(term)));
  const importanceScore = scoreArticle(text, article.publishedAt);
  return {
    ...article,
    category: categoryRule ? categoryRule.category : article.category,
    keywords: matchedKeywords,
    importanceScore,
    importance: importanceLabel(importanceScore),
    whyImportant: whyImportant(text, categoryRule ? categoryRule.category : article.category),
  };
}

function scoreArticle(text, publishedAt) {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt || Date.now()).getTime()) / 3600000);
  const recency = ageHours < 24 ? 4 : ageHours < 72 ? 2 : 0;
  return IMPORTANCE_RULES.reduce((score, rule) => score + (text.includes(rule.term) ? rule.weight : 0), recency);
}

function importanceLabel(score) {
  if (score >= 12) return "High";
  if (score >= 7) return "Medium";
  return "Watch";
}

function whyImportant(text, category) {
  if (text.includes("export control") || text.includes("sanction") || text.includes("tariff")) return "Policy risk could change supply chains, margins, or China access.";
  if (text.includes("hbm") || text.includes("memory")) return "AI memory supply is a key bottleneck for accelerator demand.";
  if (text.includes("tsmc") || text.includes("foundry") || text.includes("fab")) return "Foundry capacity and process leadership affect the whole chip stack.";
  if (text.includes("asml") || text.includes("lithography") || text.includes("equipment")) return "Equipment signals future capacity and technology-node progress.";
  if (text.includes("ai chip") || text.includes("gpu") || text.includes("accelerator")) return "AI hardware demand is driving semiconductor revenue mix and capex.";
  return `${category} story with potential read-through for semiconductor demand or supply.`;
}

function buildAnalysis(articles) {
  const highlights = articles
    .filter((article) => article.importanceScore >= 7)
    .slice(0, 8)
    .map(({ title, url, source, category, publishedAt, importance, importanceScore, whyImportant }) => ({ title, url, source, category, publishedAt, importance, importanceScore, whyImportant }));
  const themes = topThemes(articles);
  return {
    summary: summarizeThemes(themes, articles),
    themes,
    highlights,
    marketSignals: {
      disclaimer: "News-based watchlist only, not personalized financial advice. Validate valuation, liquidity, earnings dates, and regulatory risk before acting.",
      us: buildMarketSignals(articles, MARKET_MAP.us),
      china: buildMarketSignals(articles, MARKET_MAP.china),
    },
  };
}

function topThemes(articles) {
  const counts = new Map();
  articles.forEach((article) => counts.set(article.category, (counts.get(article.category) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

function summarizeThemes(themes, articles) {
  if (!articles.length) return "No semiconductor stories matched the current filters yet.";
  const top = themes.slice(0, 3).map((theme) => `${theme.name} (${theme.count})`).join(", ");
  const high = articles.filter((article) => article.importance === "High").length;
  return `Filtered ${articles.length} recent semiconductor stories. The strongest clusters are ${top}. ${high} stories are marked high importance because they touch policy, AI accelerators, memory supply, foundry capacity, or equipment constraints.`;
}

function buildMarketSignals(articles, stocks) {
  return stocks.map((stock) => {
    const matches = articles.filter((article) => stock.terms.some((term) => `${article.title} ${article.summary} ${article.keywords.join(" ")}`.toLowerCase().includes(term)));
    const score = matches.reduce((sum, article) => sum + article.importanceScore, 0);
    return {
      ticker: stock.ticker,
      name: stock.name,
      signal: score >= 20 ? "Strong watch" : score >= 8 ? "Active watch" : "Monitor",
      score,
      rationale: matches.length ? `${matches.length} related stories; strongest link: ${matches[0].title}` : "No direct high-signal story in the current batch.",
      relatedStories: matches.slice(0, 3).map(({ title, url, source }) => ({ title, url, source })),
    };
  }).filter((stock) => stock.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = article.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchBlocks(xml, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function textFromTag(block, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const match = block.match(pattern);
  return match ? decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")) : "";
}

function linkFromAtom(block) {
  const match = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return match ? decodeEntities(match[1]) : "";
}

function cleanText(value) {
  return decodeEntities(String(value || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function summarize(value) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 260 ? `${clean.slice(0, 257).trim()}...` : clean;
}

function normalizeUrl(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function toIsoDate(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCharCode(parseInt(number, 10)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
