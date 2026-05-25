const { writeFile, mkdir } = require("node:fs/promises");
const path = require("node:path");

const MAX_ARTICLES = 80;

const SOURCES = [
  { name: "Semiconductor Engineering", url: "https://semiengineering.com/feed/", category: "Manufacturing" },
  { name: "EE Times", url: "https://www.eetimes.com/feed/", category: "Semiconductors" },
  { name: "AnandTech", url: "https://www.anandtech.com/rss/", category: "Hardware" },
  { name: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", category: "Hardware" },
  { name: "TechPowerUp", url: "https://www.techpowerup.com/rss/news", category: "Hardware" },
  { name: "The Register", url: "https://www.theregister.com/headlines.atom", category: "Compute" },
  { name: "Reuters Technology", url: "https://feeds.reuters.com/reuters/technologyNews", category: "Markets" },
  { name: "Nikkei Asia Technology", url: "https://asia.nikkei.com/rss/feed/nar", category: "Asia Supply Chain" },
  { name: "IEEE Spectrum", url: "https://spectrum.ieee.org/rss/fulltext", category: "Research" },
  { name: "HPCwire", url: "https://www.hpcwire.com/feed/", category: "Datacenter" },
];

const KEYWORDS = [
  "semiconductor",
  "chip",
  "chips",
  "silicon",
  "foundry",
  "fab",
  "wafer",
  "tsmc",
  "nvidia",
  "amd",
  "intel",
  "qualcomm",
  "broadcom",
  "micron",
  "sk hynix",
  "samsung",
  "asml",
  "arm",
  "eda",
  "synopsys",
  "cadence",
  "memory",
  "dram",
  "nand",
  "hbm",
  "gpu",
  "ai accelerator",
  "ai chip",
  "data center",
  "datacenter",
  "packaging",
  "advanced packaging",
  "lithography",
  "export control",
  "supply chain",
  "automotive chip",
];

const CATEGORY_RULES = [
  { category: "AI Hardware", terms: ["nvidia", "gpu", "ai chip", "ai accelerator", "hbm", "datacenter", "data center"] },
  { category: "Foundry", terms: ["tsmc", "foundry", "fab", "wafer", "process node", "lithography", "asml"] },
  { category: "Memory", terms: ["memory", "dram", "nand", "hbm", "micron", "sk hynix"] },
  { category: "EDA and IP", terms: ["eda", "synopsys", "cadence", "arm", "risc-v", "riscv"] },
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

  const deduped = dedupeByUrl(articles).slice(0, MAX_ARTICLES);
  const payload = {
    updatedAt: new Date().toISOString(),
    articleCount: deduped.length,
    sourceCount: new Set(deduped.map((article) => article.source)).size,
    articles: deduped,
  };

  const outputDir = path.join(process.cwd(), "data");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "news.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Saved ${deduped.length} semiconductor news articles.`);
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

  const xml = await response.text();
  return parseFeed(xml, source);
}

function parseFeed(xml, source) {
  const itemBlocks = matchBlocks(xml, "item");
  const entryBlocks = matchBlocks(xml, "entry");
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  return blocks.map((block) => {
    const title = textFromTag(block, "title");
    const url = textFromTag(block, "link") || linkFromAtom(block);
    const summary = textFromTag(block, "description") || textFromTag(block, "summary") || textFromTag(block, "content");
    const publishedAt = textFromTag(block, "pubDate") || textFromTag(block, "published") || textFromTag(block, "updated");

    return {
      title: cleanText(title),
      url: normalizeUrl(cleanText(url)),
      summary: summarize(cleanText(stripHtml(summary))),
      publishedAt: toIsoDate(publishedAt),
      source: source.name,
      category: source.category,
    };
  }).filter((article) => article.title && article.url);
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

  return {
    ...article,
    category: categoryRule ? categoryRule.category : article.category,
    keywords: matchedKeywords,
  };
}

function dedupeByUrl(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = article.url.replace(/[?#].*$/, "");
    if (seen.has(key)) {
      return false;
    }
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
  return clean.length > 240 ? `${clean.slice(0, 237).trim()}...` : clean;
}

function normalizeUrl(value) {
  return value.replace(/\s+/g, "").trim();
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
