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
  "automotive chip", "chip equipment", "chip design", "risc-v", "riscv"
];

const CATEGORY_RULES = [
  { category: "AI Hardware", terms: ["nvidia", "gpu", "ai chip", "ai accelerator", "hbm", "datacenter", "data center", "blackwell", "rubin"] },
  { category: "Foundry", terms: ["tsmc", "foundry", "fab", "wafer", "process node", "intel foundry", "samsung foundry"] },
  { category: "Equipment", terms: ["asml", "lithography", "euv", "duv", "chip equipment", "semiconductor tools"] },
  { category: "Memory", terms: ["memory", "dram", "nand", "hbm", "micron", "sk hynix"] },
  { category: "EDA and IP", terms: ["eda", "synopsys", "cadence", "arm", "risc-v", "riscv", "chip design"] },
  { category: "Policy and Supply Chain", terms: ["export control", "tariff", "subsidy", "chips act", "supply chain", "trade"] },
  { category: "Automotive", terms: ["automotive", "vehicle", "ev", "adas"] },
];

async function main() {
  const fetched = await Promise.allSettled(SOURCES.map(fetchSource));
  const articles = fetched
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter(isRelevant)
    .map(enrichArticle)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const deduped = dedupeArticles(articles).slice(0, MAX_ARTICLES);
  const payload = {
    updatedAt: new Date().toISOString(),
    articleCount: deduped.length,
    sourceCount: new Set(deduped.map((article) => article.source)).size,
    searchFeedCount: SEARCH_FEEDS.length,
    articles: deduped,
  };

  const outputDir = path.join(process.cwd(), "data");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "news.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Saved ${deduped.length} semiconductor news articles from ${payload.sourceCount} sources.`);
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "SemiconductorNewsWatch/1.0 (+https://github.com/emmaaaaaaa23/test_website)",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`${source.name} returned ${response.status}`);
  }

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
  if (source.kind !== "google-news") {
    return { title, source: sourceTag || source.name };
  }

  const separator = " - ";
  if (title.includes(separator)) {
    const parts = title.split(separator);
    return { title: parts.slice(0, -1).join(separator).trim(), source: sourceTag || parts.at(-1).trim() || source.name };
  }

  return { title, source: sourceTag || source.name };
}

function matchBlocks(xml, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function textFromTag(block, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(pattern);
  return match ? decodeEntities(match[1].replace(/^<!\\[CDATA\\[/, "").replace(/\\]\\]>$/, "")) : "";
}

function linkFromAtom(block) {
  const match = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return match ? decodeEntities(match[1]) : "";
}

function isRelevant(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return KEYWORDS.some((keyword) => text.includes(keyword));
}

function enrichArticle(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const matchedKeywords = KEYWORDS.filter((keyword) => text.includes(keyword)).slice(0, 8);
  const categoryRule = CATEGORY_RULES.find((rule) => rule.terms.some((term) => text.includes(term)));
  return { ...article, category: categoryRule ? categoryRule.category : article.category, keywords: matchedKeywords };
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = `${article.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${article.url.replace(/[?#].*$/, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value) {
  return decodeEntities(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
