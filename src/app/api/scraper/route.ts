import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { chunkPlainText, type Chunk } from "@/lib/chunker";
import { ingestChunks } from "@/lib/ingest";

export const maxDuration = 300;

const USER_AGENT =
  "BroncoBotDemo/1.0 (+Cal Poly Pomona campus agent; contact: ande@heylexxi.com)";
const FETCH_DELAY_MS = 2000;

// Real course pages from the 2026-2027 CPP catalog (catoid=78). Five CS
// courses — each yields title, units, description, prereqs, grading basis.
// coids resolved from the Index of Courses filter (navoid=7093, filter[27]=CS).
const CATALOG_URLS = [
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=436703", // CS 1400 - Intro to Programming and Problem Solving
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=436704", // CS 2400 - Data Structures and Advanced Programming
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=435643", // CS 2600 - Systems Programming
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=435644", // CS 2640 - Computer Organization and Assembly
  "https://catalog.cpp.edu/preview_course_nopop.php?catoid=78&coid=437782", // CS 2180 - Logic and Computing (GE 2)
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
  // Course pages have title "Course Information" — prefer the h1 instead.
  if (/^course information$/i.test(pageTitle)) {
    const h1 = html.match(/<h1[^>]*id=["']course_preview_title["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) pageTitle = decodeEntities(h1[1]).replace(/<[^>]+>/g, "").trim();
  }

  // Slice to the acalog CMS content region: from block_content_outer to
  // block_footer_lb. This drops the global nav, left-side N2 navigation, and
  // site footer — all of which are boilerplate repeated on every page.
  const startIdx = s.search(/<td[^>]*class="[^"]*block_content_outer/i);
  const endIdx = s.search(/<td[^>]*class="[^"]*block_footer_lb/i);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    s = s.slice(startIdx, endIdx);
  }

  // Drop scripts, styles, embedded widgets, and acalog chrome sections.
  s = s.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, "");
  // Strip all <a> tags pointing to social-share URLs (their title attributes
  // leak as text otherwise).
  s = s.replace(
    /<a[^>]*href="[^"]*(facebook\.com\/sharer|twitter\.com\/intent|linkedin\.com\/shareArticle)[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
    ""
  );
  s = s.replace(/<div[^>]*class="[^"]*acalog-social-media-links[^"]*"[\s\S]*?<\/div>/gi, "");
  s = s.replace(/<div[^>]*class="[^"]*help_block[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  s = s.replace(
    /<table[^>]*class="[^"]*acalog-export-remove[^"]*"[\s\S]*?<\/table>/gi,
    ""
  );
  s = s.replace(
    /<a[^>]*class="[^"]*(portfolio_link|print_link|acalog_top_link)[^"]*"[\s\S]*?<\/a>/gi,
    ""
  );

  // Headings → markdown
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n### $1\n\n");

  // Block elements → paragraph breaks
  s = s.replace(/<(p|div|section|tr)[^>]*>/gi, "\n");
  s = s.replace(/<\/(p|div|section|tr)>/gi, "\n");

  // List items
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");

  // Line breaks + cells
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/(td|th)>/gi, " ");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, "");

  s = decodeEntities(s);

  // Drop the "2026-2027 University Catalog Near-Final DRAFT" repeated banner.
  s = s.replace(/20\d{2}-20\d{2} University Catalog[^\n]*/gi, "");
  // Drop residual chrome text lines that survive tag-stripping.
  s = s.replace(/^\s*(Back to Top\s*\|?|HELP|Print-Friendly Page[^\n]*|Facebook this Page[^\n]*|Tweet this Page[^\n]*|Add to Portfolio[^\n]*|Close Window|Javascript is currently not supported[^\n]*)\s*$/gim, "");
  // Trailing orphan table separators after chrome removal.
  s = s.replace(/^\s*\|\s*$/gm, "");

  // Collapse whitespace
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return { title: pageTitle, content: s };
}

// GET: list scraper schedules
export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scraper_schedules")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedules: data || [] });
}

// POST: fetch a small batch of real catalog pages, extract, chunk, embed.
export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const { scheduleId } = (await req.json()) as { scheduleId?: string };

  const pages: Array<{ url: string; title: string; chunks: number }> = [];
  const fetchErrors: string[] = [];
  const allChunks: Chunk[] = [];

  for (let i = 0; i < CATALOG_URLS.length; i++) {
    const url = CATALOG_URLS[i];
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });

      if (!res.ok) {
        fetchErrors.push(`${url}: HTTP ${res.status}`);
      } else {
        const html = await res.text();
        const { title, content } = htmlToMarkdown(html);

        if (content.length < 200) {
          fetchErrors.push(`${url}: extracted ${content.length} chars (too short, skipping)`);
        } else {
          const chunks = chunkPlainText(content, title, url);
          allChunks.push(...chunks);
          pages.push({ url, title, chunks: chunks.length });
        }
      }
    } catch (e) {
      fetchErrors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (i < CATALOG_URLS.length - 1) {
      await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    }
  }

  const ingest = await ingestChunks(allChunks, "scraper");

  if (scheduleId) {
    const supabase = createAdminClient();
    await supabase
      .from("scraper_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        chunks_added: ingest.chunksUpserted,
        pages_crawled: pages.length,
      })
      .eq("id", scheduleId);
  }

  return NextResponse.json({
    pagesCrawled: pages.length,
    chunksCreated: ingest.chunksUpserted,
    chunksEmbedded: ingest.chunksEmbedded,
    errors: [...fetchErrors, ...ingest.errors],
    pages,
  });
}
