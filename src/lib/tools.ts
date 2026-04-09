/**
 * Tool implementations for the CPP Campus Knowledge Agent.
 *
 * Tools:
 *   1. search_corpus     — hybrid BM25+semantic search (existing, in search.ts)
 *   2. lookup_faculty     — structured faculty directory lookup
 *   3. get_source_documents — find official CPP pages by topic
 *   4. financial_aid_guide — scholarship/aid lookup
 *   5. academic_program_guide — course + degree requirement lookup
 */

import fs from "fs";
import path from "path";

// --- Data loading (lazy, cached) ---

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

interface SourcePage {
  url: string;
  title: string;
  section: string;
  description: string;
}

let facultyData: FacultyEntry[] | null = null;
let aidData: FinancialAidEntry[] | null = null;
let courseData: CourseEntry[] | null = null;
let programData: ProgramEntry[] | null = null;
let sourcePages: SourcePage[] | null = null;

function loadJSON<T>(filename: string): T {
  const filePath = path.join(process.cwd(), "data", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getFaculty(): FacultyEntry[] {
  if (!facultyData) facultyData = loadJSON<FacultyEntry[]>("faculty.json");
  return facultyData;
}

function getAid(): FinancialAidEntry[] {
  if (!aidData) aidData = loadJSON<FinancialAidEntry[]>("financial-aid.json");
  return aidData;
}

function getPrograms(): { courses: CourseEntry[]; programs: ProgramEntry[] } {
  if (!courseData || !programData) {
    const data = loadJSON<{ courses: CourseEntry[]; programs: ProgramEntry[] }>("programs.json");
    courseData = data.courses;
    programData = data.programs;
  }
  return { courses: courseData, programs: programData };
}

function getSourcePages(): SourcePage[] {
  if (!sourcePages) sourcePages = loadJSON<SourcePage[]>("source-pages.json");
  return sourcePages;
}

// --- Fuzzy matching helpers ---

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function matchScore(query: string, text: string): number {
  if (!text) return 0;
  const q = normalize(query);
  const t = normalize(text);
  if (!q || !t) return 0;
  if (t === q) return 1.0;
  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.8;

  const qWords = q.split(" ");
  const tWords = t.split(" ");
  const tWordSet = new Set(tWords);

  // Exact word matches
  let exactMatches = 0;
  // Substring matches (e.g., "compute" matches "computer")
  let substringMatches = 0;

  for (const qw of qWords) {
    if (tWordSet.has(qw)) {
      exactMatches++;
    } else if (tWords.some((tw) => tw.includes(qw) || qw.includes(tw))) {
      substringMatches++;
    }
  }

  // Weight exact matches higher than substring matches
  return (exactMatches + substringMatches * 0.5) / qWords.length;
}

// ============================================================
// TOOL: lookup_faculty
// ============================================================

export function lookupFaculty(query: string, limit: number = 5): string {
  const faculty = getFaculty();
  const q = normalize(query);

  const scored = faculty
    .map((f) => {
      const nameScore = matchScore(query, f.name) * 3;
      const deptScore = matchScore(query, f.department);
      const titleScore = matchScore(query, f.title);
      const emailScore = f.email.toLowerCase().startsWith(q.split(" ")[0]) ? 1.5 : 0;
      // Boost entries that have more complete data
      const completenessBoost = (f.phone ? 0.1 : 0) + (f.location ? 0.1 : 0) + (f.officeHours ? 0.15 : 0) + (f.title ? 0.1 : 0);

      return { entry: f, score: nameScore + deptScore + titleScore + emailScore + completenessBoost };
    })
    .filter((s) => s.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return JSON.stringify({ results: [], message: "No faculty found matching your query. Try a different name or department." });
  }

  const results = scored.map((s) => ({
    name: s.entry.name,
    email: s.entry.email,
    phone: s.entry.phone || "Not listed",
    office: s.entry.location || "Not listed",
    officeHours: s.entry.officeHours || "Not listed",
    department: s.entry.department,
    title: s.entry.title || "Not listed",
    sourceUrl: s.entry.sourceUrl,
    confidence: s.score >= 2.0 ? "high" : s.score >= 1.0 ? "medium" : "low",
  }));

  // If any results are missing key details, suggest a corpus search
  const missingDetails = results.some((r) => r.officeHours === "Not listed" || r.office === "Not listed");

  return JSON.stringify({
    results,
    ...(missingDetails && {
      suggestion: "Some results are missing office hours or location. Use search_corpus with the faculty member's name to find this information from their department page.",
    }),
  });
}

// ============================================================
// TOOL: financial_aid_guide
// ============================================================

export function financialAidGuide(query: string, limit: number = 8): string {
  const aid = getAid();
  const q = normalize(query);

  // Check if query mentions a specific type
  const typeFilter = /\bgrant\b/i.test(query) ? "grant"
    : /\bloan\b/i.test(query) ? "loan"
    : /\bwork.study\b/i.test(query) ? "work-study"
    : /\bfellowship\b/i.test(query) ? "fellowship"
    : null;

  let candidates = aid;
  if (typeFilter) {
    candidates = aid.filter((a) => a.type === typeFilter);
  }

  const scored = candidates
    .map((a) => {
      const nameScore = matchScore(query, a.name) * 2;
      const deptScore = matchScore(query, a.department);
      const descScore = matchScore(query, a.description);
      const eligScore = matchScore(query, a.eligibility);
      // Boost entries with amounts
      const amountBoost = a.amount ? 0.2 : 0;

      return { entry: a, score: nameScore + deptScore + descScore + eligScore + amountBoost };
    })
    .filter((s) => s.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // If no good matches, return top entries by amount
  if (scored.length === 0) {
    const topByAmount = (typeFilter ? candidates : aid)
      .filter((a) => a.amount)
      .sort((a, b) => {
        const amtA = parseInt(a.amount.replace(/[$,]/g, "")) || 0;
        const amtB = parseInt(b.amount.replace(/[$,]/g, "")) || 0;
        return amtB - amtA;
      })
      .slice(0, limit);

    return JSON.stringify({
      results: topByAmount.map((a) => ({ ...formatAidEntry(a), confidence: "low" })),
      message: `No exact matches for "${query}". Showing top scholarships by amount.`,
    });
  }

  return JSON.stringify({
    results: scored.map((s) => ({
      ...formatAidEntry(s.entry),
      confidence: s.score >= 1.5 ? "high" : s.score >= 0.7 ? "medium" : "low",
    })),
  });
}

function formatAidEntry(a: FinancialAidEntry) {
  return {
    name: a.name,
    type: a.type,
    amount: a.amount || "Amount varies",
    description: a.description || "See source page for details",
    eligibility: a.eligibility || "See source page for eligibility details",
    deadline: a.deadline || "Check source page for current deadline",
    department: a.department,
    sourceUrl: a.sourceUrl,
  };
}

// ============================================================
// TOOL: academic_program_guide
// ============================================================

export function academicProgramGuide(query: string, limit: number = 5): string {
  const { courses, programs } = getPrograms();
  const q = normalize(query);

  // Detect if query is about a specific course code
  const courseCodeMatch = query.match(/\b([A-Z]{2,4})\s?(\d{3,4}[A-Z]?(?:L|H)?)\b/i);

  if (courseCodeMatch) {
    const searchCode = `${courseCodeMatch[1].toUpperCase()} ${courseCodeMatch[2].toUpperCase()}`;
    const altCode = `${courseCodeMatch[1].toUpperCase()}${courseCodeMatch[2].toUpperCase()}`;

    const exactCourses = courses.filter((c) => {
      const code = c.code.replace(/\s+/g, " ");
      return code === searchCode || code === altCode || code.replace(/\s/g, "") === altCode;
    });

    if (exactCourses.length > 0) {
      return JSON.stringify({
        type: "course",
        results: exactCourses.map((c) => ({
          code: c.code,
          title: c.title,
          units: c.units,
          description: c.description || "Not available — check catalog.cpp.edu for full description",
          prerequisites: c.prerequisites || "Not available — check catalog.cpp.edu for prerequisites",
          department: c.department,
          sourceUrl: c.sourceUrl,
          confidence: "high",
          note: (!c.description && !c.prerequisites) ? "This course listing has limited data. For full details, visit https://catalog.cpp.edu and search for " + c.code : undefined,
        })),
      });
    }
  }

  // Search programs/majors
  const scoredPrograms = programs
    .map((p) => {
      const nameScore = matchScore(query, p.name) * 2;
      const degreeScore = matchScore(query, p.degree);
      const collegeScore = matchScore(query, p.college);
      const descScore = matchScore(query, p.description) * 0.5;
      // Boost entries with actual course lists
      const courseBoost = p.requiredCourses.length > 0 ? 0.3 : 0;
      const unitBoost = p.totalUnits > 0 ? 0.2 : 0;

      return { entry: p, score: nameScore + degreeScore + collegeScore + descScore + courseBoost + unitBoost };
    })
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Also search courses by title/description
  const scoredCourses = courses
    .map((c) => {
      const codeScore = matchScore(query, c.code);
      const titleScore = matchScore(query, c.title) * 2;
      const descScore = matchScore(query, c.description) * 0.5;
      const deptScore = matchScore(query, c.department);

      return { entry: c, score: codeScore + titleScore + descScore + deptScore };
    })
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const result: Record<string, unknown> = {};

  if (scoredPrograms.length > 0) {
    result.type = "program";
    result.programs = scoredPrograms.map((s) => ({
      name: s.entry.name,
      degree: s.entry.degree || "Not specified",
      college: s.entry.college,
      totalUnits: s.entry.totalUnits || "See source page",
      requiredCourses: s.entry.requiredCourses.slice(0, 20),
      description: s.entry.description.slice(0, 300) || "See source page for details",
      sourceUrl: s.entry.sourceUrl,
      confidence: s.score >= 1.5 ? "high" : s.score >= 0.7 ? "medium" : "low",
    }));
  }

  if (scoredCourses.length > 0) {
    result.type = result.type ? "both" : "course";
    result.courses = scoredCourses.map((s) => ({
      code: s.entry.code,
      title: s.entry.title,
      units: s.entry.units,
      description: s.entry.description || "Not available — check catalog.cpp.edu",
      prerequisites: s.entry.prerequisites || "Not available — check catalog.cpp.edu",
      department: s.entry.department,
      sourceUrl: s.entry.sourceUrl,
      confidence: s.score >= 1.5 ? "high" : s.score >= 0.7 ? "medium" : "low",
    }));
  }

  if (!result.type) {
    return JSON.stringify({ results: [], message: `No courses or programs found matching "${query}". Try a specific course code (e.g., CS 2400) or major name (e.g., Computer Science). For detailed course prerequisites and descriptions, visit the official CPP Course Catalog at https://catalog.cpp.edu.` });
  }

  return JSON.stringify(result);
}

// ============================================================
// TOOL: get_source_documents
// ============================================================

export function getSourceDocuments(query: string, limit: number = 5): string {
  const pages = getSourcePages();
  const q = normalize(query);

  const scored = pages
    .map((p) => {
      const titleScore = matchScore(query, p.title) * 2;
      const sectionScore = matchScore(query, p.section);
      const descScore = matchScore(query, p.description) * 0.5;
      // Boost by URL path relevance
      const urlScore = matchScore(query, p.url.replace(/https?:\/\/[^/]+\//, "").replace(/[/-]/g, " "));

      return { entry: p, score: titleScore + sectionScore + descScore + urlScore };
    })
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return JSON.stringify({ results: [], message: `No official CPP pages found matching "${query}". Try broader keywords.` });
  }

  return JSON.stringify({
    results: scored.map((s) => ({
      title: s.entry.title,
      section: s.entry.section,
      url: s.entry.url,
      description: s.entry.description,
      confidence: s.score >= 1.5 ? "high" : s.score >= 0.7 ? "medium" : "low",
    })),
  });
}

// ============================================================
// TOOL DEFINITIONS (for Claude API)
// ============================================================

export const TOOL_DEFINITIONS = [
  {
    name: "search_corpus",
    description:
      "Search the Cal Poly Pomona website corpus for general information. Use this for broad questions about admissions, campus services, dining, housing, student life, policies, and anything not covered by the more specific tools. Returns relevant text chunks with source URLs.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Search query. Use specific keywords related to the question.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_faculty",
    description:
      "Look up Cal Poly Pomona faculty and staff contact information. Returns name, email, phone number, office location, office hours, department, and title. Use this when someone asks about a specific professor, instructor, or staff member, or wants to find faculty in a department.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Faculty/staff name, department name, or partial name to search for.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_source_documents",
    description:
      "Find official Cal Poly Pomona web pages on a topic. Returns page titles, URLs, and descriptions. Use this when someone wants direct links to official CPP resources, forms, or pages, or when you want to provide authoritative source links.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Topic to find official CPP pages for (e.g., 'financial aid application', 'housing', 'graduation').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "financial_aid_guide",
    description:
      "Search Cal Poly Pomona scholarships, grants, fellowships, and financial aid programs. Returns scholarship names, amounts, eligibility, deadlines, and source links. Use this when someone asks about scholarships, financial aid, grants, or funding opportunities.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Scholarship name, department, field of study, or type of aid to search for.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "academic_program_guide",
    description:
      "Look up Cal Poly Pomona academic programs, majors, degrees, and course listings. NOTE: This tool has course codes and titles but often lacks detailed prerequisites and descriptions — that data lives in catalog.cpp.edu which is not in this corpus. If results are missing prerequisites or descriptions, direct the user to https://catalog.cpp.edu to look up the specific course code.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Course code (e.g., 'CS 2400'), major name (e.g., 'Computer Science'), or program description to search for.",
        },
      },
      required: ["query"],
    },
  },
];
