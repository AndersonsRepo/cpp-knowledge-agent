/**
 * Reusable chunking library — shared by CLI scripts and admin API routes.
 * Extracted from scripts/preprocess-corpus.ts.
 */

export interface Chunk {
  id: string;
  source_url: string;
  filename: string;
  title: string;
  content: string;
  section: string;
  chunk_index: number;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export function extractTitle(content: string): string {
  const match = content.match(/^#{1,3}\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

export function stripBoilerplate(raw: string): string {
  const lines = raw.split("\n");

  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,3}\s+\S/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

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
      endIdx = i;
      while (endIdx > startIdx) {
        const prev = lines[endIdx - 1].trim();
        if (
          prev === "" ||
          prev.startsWith("[![") ||
          prev.startsWith("[Apply]") ||
          prev.startsWith("[Maps]") ||
          prev.startsWith("[Visit]") ||
          prev.startsWith("[Contact Us]") ||
          /^\[!\[(Instagram|LinkedIn|Youtube|Facebook|X)/.test(prev) ||
          prev.includes("Ripped green paper") ||
          prev.includes("### Follow Us")
        ) {
          endIdx--;
        } else {
          break;
        }
      }
      break;
    }
  }

  let content = lines.slice(startIdx, endIdx).join("\n");
  content = content.replace(/^!\[.*?\]\(\/common\/.*?\)\s*$/gm, "");
  content = content.replace(
    /^\*\s*\[!\[(Instagram|LinkedIn|Youtube|Facebook|X)\b.*$/gm,
    ""
  );
  content = content.replace(/\n{3,}/g, "\n\n");
  return content.trim();
}

export function chunkText(
  content: string,
  sourceUrl: string,
  titleOverride?: string
): Chunk[] {
  const title = titleOverride || extractTitle(content) || "Untitled";
  const filename = sourceUrl
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 80);

  const chunks: Chunk[] = [];
  const sections = content
    .split(/(?=^#{1,3}\s)/m)
    .filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const sectionTitle =
      section.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() || title;

    if (section.length <= CHUNK_SIZE) {
      if (section.trim().length > 20) {
        chunks.push({
          id: `${filename}:${chunks.length}`,
          source_url: sourceUrl,
          filename,
          title,
          content: section.trim(),
          section: sectionTitle,
          chunk_index: chunks.length,
        });
      }
    } else {
      const paragraphs = section.split(/\n\n+/);
      let buffer = "";

      for (const para of paragraphs) {
        if (buffer.length + para.length > CHUNK_SIZE && buffer.length > 20) {
          chunks.push({
            id: `${filename}:${chunks.length}`,
            source_url: sourceUrl,
            filename,
            title,
            content: buffer.trim(),
            section: sectionTitle,
            chunk_index: chunks.length,
          });
          const words = buffer.split(" ");
          const overlapWords = words.slice(
            -Math.floor(CHUNK_OVERLAP / 5)
          );
          buffer = overlapWords.join(" ") + "\n\n" + para;
        } else {
          buffer += (buffer ? "\n\n" : "") + para;
        }
      }

      if (buffer.trim().length > 20) {
        chunks.push({
          id: `${filename}:${chunks.length}`,
          source_url: sourceUrl,
          filename,
          title,
          content: buffer.trim(),
          section: sectionTitle,
          chunk_index: chunks.length,
        });
      }
    }
  }

  return chunks;
}

export function chunkPlainText(
  text: string,
  title: string,
  sourceUrl: string
): Chunk[] {
  const markdownWrapped = `# ${title}\n\n${text}`;
  return chunkText(markdownWrapped, sourceUrl, title);
}
