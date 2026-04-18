import { chunkPlainText } from "../src/lib/chunker";

const USER_AGENT = "BroncoBotDemo/1.0 (test)";
const URLS = [
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=436703",
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=436704",
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=435643",
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=435644",
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=437782",
];

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToMarkdown(html: string): { title: string; content: string } {
  let s = html;
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let pageTitle = titleMatch ? decodeEntities(titleMatch[1]).trim() : "Untitled";
  pageTitle = pageTitle.replace(/ - Cal Poly Pomona$/i, "").replace(/\s*-\s*$/, "").trim();
  if (/^course information$/i.test(pageTitle)) {
    const h1 = html.match(/<h1[^>]*id=["']course_preview_title["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) pageTitle = decodeEntities(h1[1]).replace(/<[^>]+>/g, "").trim();
  }
  const startIdx = s.search(/<td[^>]*class="[^"]*block_content_outer/i);
  const endIdx = s.search(/<td[^>]*class="[^"]*block_footer_lb/i);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    s = s.slice(startIdx, endIdx);
  }
  s = s.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<a[^>]*href="[^"]*(facebook\.com\/sharer|twitter\.com\/intent|linkedin\.com\/shareArticle)[^"]*"[^>]*>[\s\S]*?<\/a>/gi, "");
  s = s.replace(/<div[^>]*class="[^"]*acalog-social-media-links[^"]*"[\s\S]*?<\/div>/gi, "");
  s = s.replace(/<div[^>]*class="[^"]*help_block[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  s = s.replace(/<table[^>]*class="[^"]*acalog-export-remove[^"]*"[\s\S]*?<\/table>/gi, "");
  s = s.replace(/<a[^>]*class="[^"]*(portfolio_link|print_link|acalog_top_link)[^"]*"[\s\S]*?<\/a>/gi, "");
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n### $1\n\n");
  s = s.replace(/<(p|div|section|tr)[^>]*>/gi, "\n");
  s = s.replace(/<\/(p|div|section|tr)>/gi, "\n");
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/(td|th)>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/20\d{2}-20\d{2} University Catalog[^\n]*/gi, "");
  s = s.replace(/^\s*(Back to Top\s*\|?|HELP|Print-Friendly Page[^\n]*|Facebook this Page[^\n]*|Tweet this Page[^\n]*|Add to Portfolio[^\n]*|Close Window|Javascript is currently not supported[^\n]*)\s*$/gim, "");
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title: pageTitle, content: s };
}

async function main() {
  let totalChunks = 0;
  for (const url of URLS) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const html = await res.text();
    const { title, content } = htmlToMarkdown(html);
    const chunks = chunkPlainText(content, title, url);
    totalChunks += chunks.length;
    console.log(`\n=== ${url} ===`);
    console.log(`title      : ${title}`);
    console.log(`html bytes : ${html.length}`);
    console.log(`text bytes : ${content.length}`);
    console.log(`chunks     : ${chunks.length}`);
    console.log(`--- full content ---`);
    console.log(content);
    console.log(`--- end ---`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\n=== TOTAL: ${totalChunks} chunks across ${URLS.length} pages ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
