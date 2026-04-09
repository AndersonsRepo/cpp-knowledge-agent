/**
 * Extract structured data from corpus chunks for dedicated tool use.
 *
 * Produces:
 *   data/faculty.json       — faculty directory (name, email, phone, office, hours)
 *   data/financial-aid.json  — scholarships, aid types, deadlines
 *   data/programs.json       — courses, degree requirements, curricula
 *   data/source-pages.json   — page index (URL → title, section, description)
 *
 * Usage: npx tsx scripts/extract-structured-data.ts
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

interface Chunk {
  id: string;
  source_url: string;
  filename: string;
  title: string;
  content: string;
  section: string;
  chunk_index: number;
}

// --- Load all chunks ---

function loadChunks(): Chunk[] {
  const shardFiles = fs.readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("chunks-") && f.endsWith(".jsonl"))
    .sort();

  const chunks: Chunk[] = [];
  for (const file of shardFiles) {
    const lines = fs.readFileSync(path.join(DATA_DIR, file), "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      chunks.push(JSON.parse(line));
    }
  }
  console.log(`Loaded ${chunks.length} chunks from ${shardFiles.length} shards`);
  return chunks;
}

// ============================================================
// 1. FACULTY EXTRACTION
// ============================================================

interface FacultyEntry {
  name: string;
  email: string;
  phone: string;
  location: string;
  officeHours: string;
  department: string;
  title: string;
  sourceUrl: string;
}

function extractFaculty(chunks: Chunk[]): FacultyEntry[] {
  const byEmail = new Map<string, FacultyEntry>();

  // Any chunk with @cpp.edu is a candidate
  const emailChunks = chunks.filter((c) => c.content.includes("@cpp.edu"));

  for (const chunk of emailChunks) {
    const content = chunk.content;
    const lines = content.split("\n");

    // Strategy: find all emails in this chunk, then look backwards for context
    const emailMatches = [...content.matchAll(/([a-zA-Z0-9._-]+@cpp\.edu)/g)];
    if (emailMatches.length === 0) continue;

    // Skip generic/department emails
    const genericEmails = new Set([
      "library@cpp.edu", "engineering@cpp.edu", "studentsuccess@cpp.edu",
      "elr@cpp.edu", "travel@cpp.edu", "registrar@cpp.edu", "financial-aid@cpp.edu",
      "admissions@cpp.edu", "housing@cpp.edu", "asi@cpp.edu",
    ]);

    for (const emailMatch of emailMatches) {
      const email = emailMatch[1].toLowerCase();
      if (genericEmails.has(email)) continue;
      if (byEmail.has(email)) {
        // Enrich existing entry with missing fields
        const existing = byEmail.get(email)!;
        enrichEntry(existing, content, chunk);
        continue;
      }

      // Find name — look for ## or ### header above the email
      let name = "";
      let title = "";
      let phone = "";
      let location = "";
      let officeHours = "";

      const emailLineIdx = lines.findIndex((l) => l.includes(email));
      if (emailLineIdx < 0) continue;

      // Look backwards from email for name
      for (let i = emailLineIdx; i >= Math.max(0, emailLineIdx - 8); i--) {
        const line = lines[i].trim();

        // ## or ### Name
        const headerMatch = line.match(/^#{2,3}\s+(.+?)$/);
        if (headerMatch) {
          const candidate = headerMatch[1]
            .replace(/\[|\]|\(.*?\)/g, "")
            .replace(/\*+/g, "")
            .replace(/,?\s*(?:Ph\.?D\.?|Ed\.?D\.?|M\.?[ABSF]\.?A?\.?|Dr\.)\s*$/i, "")
            .trim();
          // Looks like a person name? (2-5 words, starts with uppercase)
          if (candidate.length >= 3 && candidate.length <= 80 && /^[A-Z]/.test(candidate)) {
            name = candidate;
            break;
          }
        }
      }

      // Also try "Last, First" pattern in table rows or bullet points
      if (!name) {
        // Check if this is in a table row
        const emailLine = lines[emailLineIdx];
        if (emailLine.includes("|")) {
          const cells = emailLine.split("|").map((c) => c.trim()).filter(Boolean);
          // Name is usually first cell in table
          if (cells.length >= 2) {
            const candidate = cells[0].replace(/\*+/g, "").trim();
            if (/^[A-Z][a-z]+/.test(candidate) && candidate.length >= 3 && candidate.length <= 60) {
              name = candidate;
            }
          }
        }
      }

      if (!name) continue; // Can't identify who this is

      // Extract phone — look in nearby lines
      for (let i = Math.max(0, emailLineIdx - 5); i < Math.min(lines.length, emailLineIdx + 5); i++) {
        const line = lines[i];
        // Pattern: "Phone: (909) 869-XXXX" or "* phone number or extension(909) 869-XXXX" or "**Phone**: 909-869-XXXX"
        const phoneMatch = line.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}/);
        if (phoneMatch && !line.includes("Fax")) {
          phone = phoneMatch[0].trim();
          break;
        }
      }

      // Extract location
      for (let i = Math.max(0, emailLineIdx - 5); i < Math.min(lines.length, emailLineIdx + 5); i++) {
        const line = lines[i];
        // Pattern: "Location: Building N: Room NNN" or "* office locationBuilding 8 - 333" or "**Office**: 9-407"
        const locMatch = line.match(/(?:Location|Office|office location)[:\s]*(.+?)$/i)
          || line.match(/(?:Building\s+\d+[\s:,-]*(?:Room\s*)?\d+[A-Z]?)/i)
          || line.match(/^\*?\s*(\d{1,3}[-\s]\d{2,4}[A-Z]?)\s*$/); // "9-407" or "1-340"
        if (locMatch) {
          location = (locMatch[1] || locMatch[0]).replace(/^\*\s*/, "").trim();
          break;
        }
      }

      // Extract title — line between name and contact info
      for (let i = Math.max(0, emailLineIdx - 6); i < emailLineIdx; i++) {
        const line = lines[i].trim().replace(/^\*+|\*+$/g, "");
        if (!line || line.startsWith("#") || line.includes("@") || line.includes("Phone") ||
            line.includes("Location") || line.includes("office") || /^\d/.test(line) ||
            line.includes("![")) continue;
        // Looks like a title? (Professor, Chair, Dean, Coordinator, etc.)
        if (/Professor|Chair|Dean|Director|Coordinator|Lecturer|Instructor|Advisor|Manager|Specialist|Analyst|Assistant|Associate/i.test(line)) {
          title = line.slice(0, 100);
          break;
        }
      }

      // Extract department from section or URL
      let department = "";
      const urlParts = chunk.source_url.match(/cpp\.edu\/(?:~)?([^/]+)\/([^/]+)/);
      if (urlParts) {
        department = urlParts[2].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (department === "Faculty Staff" || department === "Faculty And Staff") {
          department = urlParts[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
      if (!department && chunk.section) {
        department = chunk.section.replace(/^.*?—\s*/, "").trim();
      }

      byEmail.set(email, {
        name,
        email,
        phone,
        location,
        officeHours,
        department,
        title,
        sourceUrl: chunk.source_url,
      });
    }
  }

  // Pass 2: Office hours tables — enrich entries
  const officeHoursChunks = chunks.filter((c) =>
    /office-hours|officehours/i.test(c.source_url) || /office.hours/i.test(c.title)
  );

  for (const chunk of officeHoursChunks) {
    const rows = chunk.content.split("\n").filter((l) => l.includes("|") && !l.includes("---"));

    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 3) continue;

      const emailIdx = cells.findIndex((c) => /@cpp\.edu/i.test(c));
      if (emailIdx < 0) continue;

      const emailMatch = cells[emailIdx].match(/([a-zA-Z0-9._-]+@cpp\.edu)/i);
      if (!emailMatch) continue;
      const email = emailMatch[1].toLowerCase();

      // Find hours cell (contains AM/PM, appointment, zoom, etc.)
      const hoursIdx = cells.findIndex((c, i) =>
        i !== emailIdx && /(?:AM|PM|appointment|zoom|sabbatical|TBA|by email|office hours)/i.test(c)
      );
      const hours = hoursIdx >= 0 ? cells[hoursIdx].replace(/```/g, "").trim() : "";

      // Find location cell
      const locIdx = cells.findIndex((c, i) =>
        i !== emailIdx && i !== hoursIdx && /\d+-?\d+|Building|Virtual|TBD/i.test(c)
      );
      const loc = locIdx >= 0 ? cells[locIdx].trim() : "";

      const existing = byEmail.get(email);
      if (existing) {
        if (hours && !existing.officeHours) existing.officeHours = hours;
        if (loc && !existing.location) existing.location = loc;
      } else {
        const entryName = cells[0].replace(/\*+/g, "").trim();
        if (!entryName || /^Name|^Faculty|^\s*$/i.test(entryName)) continue;

        // Extract department from URL
        let dept = "";
        const urlParts = chunk.source_url.match(/cpp\.edu\/(?:~)?([^/]+)\/([^/]+)/);
        if (urlParts) {
          dept = urlParts[2].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        }

        byEmail.set(email, {
          name: entryName,
          email,
          phone: "",
          location: loc,
          officeHours: hours,
          department: dept,
          title: "",
          sourceUrl: chunk.source_url,
        });
      }
    }

    // Also handle bullet-point office hours: "* office hours\n  Monday 11am-1:00pm"
    const bulletMatches = [...chunk.content.matchAll(/\*\s*office hours\s*\n?\s*(.+?)(?:\n|$)/gi)];
    for (const bm of bulletMatches) {
      // Find nearest email
      const nearbyEmail = chunk.content.slice(
        Math.max(0, chunk.content.indexOf(bm[0]) - 300),
        chunk.content.indexOf(bm[0]) + bm[0].length + 100
      ).match(/([a-zA-Z0-9._-]+@cpp\.edu)/);
      if (nearbyEmail) {
        const email = nearbyEmail[1].toLowerCase();
        const existing = byEmail.get(email);
        if (existing && !existing.officeHours) {
          existing.officeHours = bm[1].trim();
        }
      }
    }
  }

  // Filter out junk entries (departments, offices, navigation)
  const results = Array.from(byEmail.values()).filter((f) => {
    if (f.name.length < 3) return false;
    // Navigation/generic headers
    if (/^(Follow Us|Share|Contact|Email|Apply|Home|Back|Navigation|Menu|Search|Overview)/i.test(f.name)) return false;
    if (/^(email|phone|office|fax|tel|mailing):/i.test(f.name)) return false;
    // Not a person name — too many words or contains non-name patterns
    if (f.name.includes("![") || f.name.includes("http") || f.name.includes("](")) return false;
    // Department/office names (not people)
    if (/^(Administrative|Financial|Academic|Facilities|Curriculum|Graduation|Department of|Office of|Division of|Center for|Institute|Services|University|Student|International|Campus|Main Office)/i.test(f.name)) return false;
    // Generic email patterns (not personal emails)
    if (/^(info|admin|dept|office|general|support|help|webmaster|contact|hr|it)@/i.test(f.email)) return false;
    if (f.email.includes("_affairs@") || f.email.includes("customer@")) return false;
    // Names that are clearly not people
    if (/Fee$|Sheet|Roadmap|Service|Program|Affairs|Center|Information|Resources/i.test(f.name)) return false;
    // Name should have at least 2 parts (first + last) or be "Last, First" format
    const words = f.name.split(/[\s,]+/).filter((w) => w.length > 0);
    if (words.length < 2 && !f.name.includes(",")) return false;
    return true;
  });

  return results;
}

function enrichEntry(entry: FacultyEntry, content: string, chunk: Chunk) {
  // Add phone if missing
  if (!entry.phone) {
    const phoneMatch = content.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}/);
    if (phoneMatch) entry.phone = phoneMatch[0].trim();
  }
  // Add location if missing
  if (!entry.location) {
    const locMatch = content.match(/(?:Location|Office|office location)[:\s]*(.+?)$/im);
    if (locMatch) entry.location = locMatch[1].trim();
  }
}

// ============================================================
// 2. FINANCIAL AID EXTRACTION
// ============================================================

interface FinancialAidEntry {
  name: string;
  type: string;
  amount: string;
  description: string;
  eligibility: string;
  deadline: string;
  department: string;
  sourceUrl: string;
}

function extractFinancialAid(chunks: Chunk[]): FinancialAidEntry[] {
  const entries: FinancialAidEntry[] = [];
  const seen = new Set<string>();

  const aidChunks = chunks.filter((c) =>
    /financial-aid|scholarship|fellowships|grants|awards|honors/i.test(c.source_url) ||
    /scholarship|financial.aid|award|fellowship/i.test(c.title)
  );

  for (const chunk of aidChunks) {
    const content = chunk.content;

    // Pattern 1: **Scholarship Name ($amount)** with recipients below
    const boldAmountMatches = content.matchAll(
      /\*\*(.+?)\s*\(\$([0-9,]+(?:\.\d{2})?)\)\*\*/g
    );
    for (const m of boldAmountMatches) {
      const name = m[1].trim();
      const amount = `$${m[2]}`;
      const key = name.toLowerCase();
      if (seen.has(key) || name.length < 5) continue;
      seen.add(key);

      entries.push({
        name,
        type: guessAidType(name),
        amount,
        description: "",
        eligibility: "",
        deadline: "",
        department: chunk.section || "",
        sourceUrl: chunk.source_url,
      });
    }

    // Pattern 2: ### Scholarship Name with description paragraph
    const headerMatches = content.matchAll(
      /(?:###?\s+)(.+?(?:Scholarship|Grant|Award|Fellowship|Fund|Prize|Bursary).+?)(?:\n)([\s\S]*?)(?=\n#{2,3}\s|$)/gi
    );
    for (const m of headerMatches) {
      const name = m[1].replace(/\*+/g, "").trim();
      const desc = m[2].trim();
      const key = name.toLowerCase();
      if (seen.has(key) || name.length < 5 || name.length > 150) continue;
      seen.add(key);

      const amountMatch = desc.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
      const eligMatch = desc.match(/(?:eligib|require|criteria|must|open to|available to|awarded to)[^.]*\./i);
      const deadlineMatch = desc.match(/(?:deadline|due|by|before|apply by)[:\s]*([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i);

      entries.push({
        name,
        type: guessAidType(name),
        amount: amountMatch ? `$${amountMatch[1]}` : "",
        description: desc.slice(0, 300),
        eligibility: eligMatch ? eligMatch[0].trim() : "",
        deadline: deadlineMatch ? deadlineMatch[1] : "",
        department: chunk.section || "",
        sourceUrl: chunk.source_url,
      });
    }

    // Pattern 3: Bullet lists with scholarship names and amounts
    const bulletMatches = content.matchAll(
      /^\*\s+\*?\*?(.+?(?:Scholarship|Grant|Award|Fellowship).*?)\*?\*?\s*(?:[-–—:]\s*)?(?:\$\s?([\d,]+))?\s*$/gim
    );
    for (const m of bulletMatches) {
      const name = m[1].replace(/\*+/g, "").trim();
      const key = name.toLowerCase();
      if (seen.has(key) || name.length < 5 || name.length > 150) continue;
      seen.add(key);

      entries.push({
        name,
        type: guessAidType(name),
        amount: m[2] ? `$${m[2]}` : "",
        description: "",
        eligibility: "",
        deadline: "",
        department: chunk.section || "",
        sourceUrl: chunk.source_url,
      });
    }
  }

  return entries;
}

function guessAidType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("grant")) return "grant";
  if (n.includes("loan")) return "loan";
  if (n.includes("work-study") || n.includes("work study")) return "work-study";
  if (n.includes("fellowship")) return "fellowship";
  if (n.includes("award") || n.includes("prize")) return "award";
  if (n.includes("fund")) return "fund";
  return "scholarship";
}

// ============================================================
// 3. ACADEMIC PROGRAM EXTRACTION
// ============================================================

interface CourseEntry {
  code: string;
  title: string;
  units: number;
  description: string;
  prerequisites: string;
  sourceUrl: string;
  department: string;
}

interface ProgramEntry {
  name: string;
  degree: string;
  college: string;
  totalUnits: number;
  requiredCourses: string[];
  description: string;
  sourceUrl: string;
}

interface AcademicData {
  courses: CourseEntry[];
  programs: ProgramEntry[];
}

function extractAcademicData(chunks: Chunk[]): AcademicData {
  const courses: CourseEntry[] = [];
  const programs: ProgramEntry[] = [];
  const seenCourses = new Set<string>();
  const seenPrograms = new Set<string>();

  for (const chunk of chunks) {
    const content = chunk.content;

    // --- COURSE DESCRIPTIONS ---
    // Pattern 1: ### CODE – Title (N unit(s))  (en-dash variant)
    const dashMatches = content.matchAll(
      /###\s+([A-Z]{2,4}\s?\d{3,4}[A-Z]?(?:L|H)?)\s*[-–—]\s*(.+?)\s*\((\d+)[\s-]*units?\)\s*(?:\\?\*)?\s*\n([\s\S]*?)(?=\n###\s|$)/g
    );
    for (const m of dashMatches) {
      addCourse(m[1], m[2], m[3], m[4], chunk);
    }

    // Pattern 2: ### CODE Title (N units) — no dash separator
    const noDashMatches = content.matchAll(
      /###\s+([A-Z]{2,4}\s?\d{3,4}[A-Z]?(?:L|H)?)\s+([A-Z][^(]+?)\s*\((\d+)\s*units?\)\s*\n([\s\S]*?)(?=\n###\s|$)/g
    );
    for (const m of noDashMatches) {
      addCourse(m[1], m[2], m[3], m[4], chunk);
    }

    // Pattern 3: **CODE -- Title (N units)**
    const boldMatches = content.matchAll(
      /\*\*([A-Z]{2,4}\s?\d{3,4}[A-Z]?(?:L|H)?)\s*[-–—]+\s*(.+?)\s*\((\d+)\s*units?\)\*\*\s*\n?([\s\S]*?)(?=\n\*\*[A-Z]{2,4}\s?\d|$)/g
    );
    for (const m of boldMatches) {
      addCourse(m[1], m[2], m[3], m[4], chunk);
    }

    // Pattern 4: Table rows | CODE | Title | Units |
    const tableMatches = content.matchAll(
      /\|\s*([A-Z]{2,4}\s?\d{3,4}[A-Z]?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|/g
    );
    for (const m of tableMatches) {
      const code = m[1].trim();
      if (seenCourses.has(code)) continue;
      seenCourses.add(code);
      courses.push({
        code,
        title: m[2].replace(/\[|\]|\(.*?\)/g, "").trim(),
        units: parseInt(m[3]),
        description: "",
        prerequisites: "",
        sourceUrl: chunk.source_url,
        department: chunk.section || "",
      });
    }
  }

  function addCourse(codeRaw: string, titleRaw: string, unitsRaw: string, descRaw: string, chunk: Chunk) {
    const code = codeRaw.trim();
    if (seenCourses.has(code)) return;
    seenCourses.add(code);

    const desc = descRaw.trim();

    // Extract prerequisites — multiple patterns
    const prereqMatch = desc.match(/\*?\*?(?:Prerequisite|Corequisite)\(?s?\)?\*?\*?[:\s]*(.+?)(?:\.\s|\n\*\*|$)/i);

    courses.push({
      code,
      title: titleRaw.replace(/\\/g, "").trim(),
      units: parseInt(unitsRaw),
      description: desc
        .replace(/\*?\*?(?:Prerequisite|Corequisite)\(?s?\)?\*?\*?[:\s]*.+?(?:\.\s|\n|$)/gi, "")
        .replace(/\*?\*?Component\(?s?\)?\*?\*?[:\s]*.+?(?:\n|$)/gi, "")
        .replace(/\*?\*?Grading Basis\*?\*?[:\s]*.+?(?:\n|$)/gi, "")
        .replace(/\*?\*?Repeat for Credit[^]*?(?:\n|$)/gi, "")
        .trim()
        .slice(0, 500),
      prerequisites: prereqMatch ? prereqMatch[1].trim() : "",
      sourceUrl: chunk.source_url,
      department: chunk.section || "",
    });
  }

  // --- PROGRAM / DEGREE REQUIREMENTS ---
  // Be more selective — only match chunks that clearly describe a degree program
  const programChunks = chunks.filter((c) => {
    const url = c.source_url.toLowerCase();
    const title = c.title.toLowerCase();
    return (
      /program-description|degree-requirements|curriculum|program-overview/i.test(url) ||
      /bachelor|master|minor in|certificate in|program overview/i.test(title) ||
      (/program|major/i.test(url) && /unit|requirement|curriculum/i.test(c.content.slice(0, 300)))
    );
  });

  for (const chunk of programChunks) {
    const content = chunk.content;

    // Look for degree program headers
    const progHeaders = content.matchAll(
      /(?:^|\n)#{1,3}\s+(.+?(?:Bachelor|Master|Minor|Certificate|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|M\.?F\.?A\.?|Ph\.?D\.?).+?)(?:\n|$)/gim
    );

    for (const m of progHeaders) {
      const progName = m[1].replace(/#+\s*/g, "").replace(/\*+/g, "").trim();
      const key = progName.toLowerCase().replace(/\s+/g, " ");
      if (seenPrograms.has(key) || progName.length < 8 || progName.length > 150) continue;
      if (/^!\[|^\[.*\]\(|^<|http/i.test(progName)) continue; // skip images/links/HTML
      seenPrograms.add(key);

      let degree = "";
      if (/\bB\.?S\.?\b|Bachelor of Science/i.test(progName)) degree = "BS";
      else if (/\bB\.?A\.?\b|Bachelor of Art/i.test(progName)) degree = "BA";
      else if (/\bB\.?F\.?A\.?\b/i.test(progName)) degree = "BFA";
      else if (/\bM\.?B\.?A\.?\b/i.test(progName)) degree = "MBA";
      else if (/\bM\.?S\.?\b|Master of Science/i.test(progName)) degree = "MS";
      else if (/\bM\.?A\.?\b|Master of Art/i.test(progName)) degree = "MA";
      else if (/\bM\.?F\.?A\.?\b/i.test(progName)) degree = "MFA";
      else if (/\bPh\.?D\.?\b/i.test(progName)) degree = "PhD";
      else if (/\bMinor\b/i.test(progName)) degree = "Minor";
      else if (/\bCertificate\b/i.test(progName)) degree = "Certificate";

      const unitMatch = content.match(/(\d+)\s*(?:total\s*)?(?:semester\s*)?units/i);
      const courseCodes = [...content.matchAll(/\b([A-Z]{2,4})\s?(\d{3,4}[A-Z]?)\b/g)]
        .map((m) => `${m[1]} ${m[2]}`)
        .filter((c, i, arr) => arr.indexOf(c) === i)
        .slice(0, 50);

      // Get college from URL
      let college = "";
      const collegeMatch = chunk.source_url.match(/cpp\.edu\/(?:~)?([^/]+)/);
      if (collegeMatch) {
        college = collegeMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }

      programs.push({
        name: progName,
        degree,
        college,
        totalUnits: unitMatch ? parseInt(unitMatch[1]) : 0,
        requiredCourses: courseCodes,
        description: content.slice(content.indexOf(progName) + progName.length, content.indexOf(progName) + progName.length + 400).replace(/^[\n#*\s]+/, "").trim(),
        sourceUrl: chunk.source_url,
      });
    }
  }

  return { courses, programs };
}

// ============================================================
// 4. SOURCE PAGES INDEX
// ============================================================

interface SourcePage {
  url: string;
  title: string;
  section: string;
  description: string;
}

function extractSourcePages(chunks: Chunk[]): SourcePage[] {
  const pages = new Map<string, SourcePage>();

  // Prefer chunk_index 0 for each URL
  for (const chunk of chunks) {
    const url = chunk.source_url;
    if (!url) continue;

    if (!pages.has(url) || chunk.chunk_index === 0) {
      pages.set(url, {
        url,
        title: chunk.title,
        section: chunk.section,
        description: chunk.content.slice(0, 250).replace(/\n+/g, " ").replace(/#{1,3}\s*/g, "").trim(),
      });
    }
  }

  return Array.from(pages.values());
}

// ============================================================
// MAIN
// ============================================================

function main() {
  const chunks = loadChunks();

  console.log("\n--- Extracting faculty ---");
  const faculty = extractFaculty(chunks);
  fs.writeFileSync(path.join(DATA_DIR, "faculty.json"), JSON.stringify(faculty, null, 2));
  console.log(`  ${faculty.length} faculty entries → data/faculty.json`);
  const withHours = faculty.filter((f) => f.officeHours).length;
  const withPhone = faculty.filter((f) => f.phone).length;
  const withLoc = faculty.filter((f) => f.location).length;
  console.log(`  ${withHours} with office hours, ${withPhone} with phone, ${withLoc} with location`);

  console.log("\n--- Extracting financial aid ---");
  const aid = extractFinancialAid(chunks);
  fs.writeFileSync(path.join(DATA_DIR, "financial-aid.json"), JSON.stringify(aid, null, 2));
  console.log(`  ${aid.length} financial aid entries → data/financial-aid.json`);
  const withAmount = aid.filter((a) => a.amount).length;
  console.log(`  ${withAmount} with dollar amounts`);

  console.log("\n--- Extracting academic programs ---");
  const academic = extractAcademicData(chunks);
  fs.writeFileSync(path.join(DATA_DIR, "programs.json"), JSON.stringify(academic, null, 2));
  console.log(`  ${academic.courses.length} courses, ${academic.programs.length} programs → data/programs.json`);
  const withPrereqs = academic.courses.filter((c) => c.prerequisites).length;
  console.log(`  ${withPrereqs} courses with prerequisites`);

  console.log("\n--- Extracting source pages ---");
  const pages = extractSourcePages(chunks);
  fs.writeFileSync(path.join(DATA_DIR, "source-pages.json"), JSON.stringify(pages, null, 2));
  console.log(`  ${pages.length} source pages → data/source-pages.json`);

  console.log("\nDone!");
}

main();
