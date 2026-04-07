/**
 * Corpus Preprocessor
 *
 * Reads raw markdown files from the ITC corpus, strips nav/footer boilerplate,
 * extracts the source URL, chunks content, and writes a processed JSON index.
 *
 * Usage: npx tsx scripts/preprocess-corpus.ts <corpus-dir>
 * Output: data/chunks.json
 */

import fs from "fs";
import path from "path";

const CORPUS_DIR = process.argv[2];
if (!CORPUS_DIR) {
  console.error("Usage: npx tsx scripts/preprocess-corpus.ts <corpus-dir>");
  process.exit(1);
}

const OUTPUT_FILE = path.join(__dirname, "..", "data", "chunks.json");
const CHUNK_SIZE = 800; // ~800 chars per chunk (good balance for embeddings)
const CHUNK_OVERLAP = 100;

interface Chunk {
  id: string;
  source_url: string;
  filename: string;
  title: string;
  content: string;
  section: string;
  chunk_index: number;
}

// --- Boilerplate stripping ---

function extractSourceUrl(content: string): string {
  const match = content.match(/^\*\*Source:\*\*\s*(https?:\/\/\S+)/m);
  return match ? match[1] : "";
}

function extractTitle(content: string): string {
  const match = content.match(/^#{1,3}\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

/**
 * Robust boilerplate stripper.
 * Strategy: cut to first real heading (content start) and first footer marker (content end).
 * This is reliable because every CPP page has a main heading, and the footer
 * is consistent across all 8K pages.
 */
function stripBoilerplate(raw: string): string {
  const lines = raw.split("\n");

  // --- Find content start: first markdown heading ---
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,3}\s+\S/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  // --- Find content end: first footer marker scanning from bottom ---
  let endIdx = lines.length;
  for (let i = lines.length - 1; i > startIdx; i--) {
    const line = lines[i].trim();
    if (
      line.includes("Ripped green paper") ||
      line.includes("Cal Poly Pomona logo, building") ||
      /^Copyright ©\d{4} California State Polytechnic University/.test(line) ||
      line === "[Feedback](https://www.cpp.edu/website-feedback.shtml)" ||
      line === "A campus of" ||
      line === "[The California State University](https://www.calstate.edu/)."
    ) {
      // Walk back past the footer block (social links, logo, etc.)
      endIdx = i;
      while (endIdx > startIdx) {
        const prev = lines[endIdx - 1].trim();
        if (prev === "" || prev.startsWith("[![") || prev.startsWith("[Apply]") ||
            prev.startsWith("[Maps]") || prev.startsWith("[Visit]") ||
            prev.startsWith("[Contact Us]") || /^\[!\[(Instagram|LinkedIn|Youtube|Facebook|X)/.test(prev) ||
            prev.includes("Ripped green paper") || prev.includes("### Follow Us")) {
          endIdx--;
        } else {
          break;
        }
      }
      break;
    }
  }

  let content = lines.slice(startIdx, endIdx).join("\n");

  // Clean remaining artifacts
  content = content.replace(/^!\[.*?\]\(\/common\/.*?\)\s*$/gm, "");
  content = content.replace(/^\*\s*\[!\[(Instagram|LinkedIn|Youtube|Facebook|X)\b.*$/gm, "");
  content = content.replace(/\n{3,}/g, "\n\n");
  content = content.trim();

  return content;
}

function chunkContent(content: string, filename: string, sourceUrl: string): Chunk[] {
  const title = extractTitle(content);
  const chunks: Chunk[] = [];

  // Split by sections (headings)
  const sections = content.split(/(?=^#{1,3}\s)/m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const sectionTitle = section.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() || title;

    if (section.length <= CHUNK_SIZE) {
      // Small enough to be one chunk
      if (section.trim().length > 20) {
        chunks.push({
          id: `${filename}:${chunks.length}`,
          source_url: sourceUrl,
          filename,
          title: title || sectionTitle,
          content: section.trim(),
          section: sectionTitle,
          chunk_index: chunks.length,
        });
      }
    } else {
      // Split into overlapping chunks by paragraphs
      const paragraphs = section.split(/\n\n+/);
      let buffer = "";

      for (const para of paragraphs) {
        if (buffer.length + para.length > CHUNK_SIZE && buffer.length > 20) {
          chunks.push({
            id: `${filename}:${chunks.length}`,
            source_url: sourceUrl,
            filename,
            title: title || sectionTitle,
            content: buffer.trim(),
            section: sectionTitle,
            chunk_index: chunks.length,
          });
          // Keep overlap
          const words = buffer.split(" ");
          const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / 5));
          buffer = overlapWords.join(" ") + "\n\n" + para;
        } else {
          buffer += (buffer ? "\n\n" : "") + para;
        }
      }

      // Flush remaining buffer
      if (buffer.trim().length > 20) {
        chunks.push({
          id: `${filename}:${chunks.length}`,
          source_url: sourceUrl,
          filename,
          title: title || sectionTitle,
          content: buffer.trim(),
          section: sectionTitle,
          chunk_index: chunks.length,
        });
      }
    }
  }

  return chunks;
}

// --- Main ---

async function main() {
  console.log(`Reading corpus from: ${CORPUS_DIR}`);

  // Load index.json for URL mapping
  const indexPath = path.join(CORPUS_DIR, "index.json");
  const urlMap: Record<string, string> = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

  // Invert: filename → URL
  const filenameToUrl: Record<string, string> = {};
  for (const [url, filename] of Object.entries(urlMap)) {
    filenameToUrl[filename] = url;
  }

  const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} markdown files`);

  const allChunks: Chunk[] = [];
  let skipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(CORPUS_DIR, file), "utf-8");
    const sourceUrl = extractSourceUrl(raw) || filenameToUrl[file] || "";
    const cleaned = stripBoilerplate(raw);

    // Skip files with no meaningful content after stripping
    if (cleaned.length < 50) {
      skipped++;
      continue;
    }

    const chunks = chunkContent(cleaned, file, sourceUrl);
    allChunks.push(...chunks);
  }

  console.log(`\nResults:`);
  console.log(`  Files processed: ${files.length - skipped}`);
  console.log(`  Files skipped (too short): ${skipped}`);
  console.log(`  Total chunks: ${allChunks.length}`);
  console.log(`  Avg chunk size: ${Math.round(allChunks.reduce((s, c) => s + c.content.length, 0) / allChunks.length)} chars`);

  // Write output — split into JSONL shards (5000 chunks each, ~5MB per file)
  const SHARD_SIZE = 5000;
  const outDir = path.dirname(OUTPUT_FILE);
  fs.mkdirSync(outDir, { recursive: true });
  const totalShards = Math.ceil(allChunks.length / SHARD_SIZE);

  for (let s = 0; s < totalShards; s++) {
    const shardPath = path.join(outDir, `chunks-${s}.jsonl`);
    const fd = fs.openSync(shardPath, "w");
    const start = s * SHARD_SIZE;
    const end = Math.min(start + SHARD_SIZE, allChunks.length);
    for (let i = start; i < end; i++) {
      fs.writeSync(fd, JSON.stringify(allChunks[i]) + "\n");
    }
    fs.closeSync(fd);
    console.log(`  Shard ${s}: ${end - start} chunks → ${shardPath}`);
  }
  console.log(`\nWritten ${totalShards} shards (${allChunks.length} chunks) to: ${outDir}`);
}

main().catch(console.error);
