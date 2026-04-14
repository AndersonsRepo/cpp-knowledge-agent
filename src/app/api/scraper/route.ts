import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { chunkText } from "@/lib/chunker";
import { ingestChunks } from "@/lib/ingest";

const MOCK_CATALOG_PAGES = [
  {
    url: "https://catalog.cpp.edu/cs-2400",
    title: "CS 2400 — Data Structures and Advanced Programming",
    content: `# CS 2400 — Data Structures and Advanced Programming (3 units)

**Prerequisites:** CS 1400 with a grade of C or better; CS 1300 with a grade of C or better.

**Description:** Design, implementation, and analysis of abstract data types, data structures, and their algorithms. Topics include stacks, queues, linked lists, trees, graphs, hash tables, sorting, searching, and algorithm complexity analysis. Programming assignments in Java or C++.

**Components:** Lecture 2 hours, Activity 2 hours.

**Grading Basis:** Graded

**Department:** Computer Science — College of Science`,
  },
  {
    url: "https://catalog.cpp.edu/cs-1400",
    title: "CS 1400 — Introduction to Programming and Problem Solving",
    content: `# CS 1400 — Introduction to Programming and Problem Solving (3 units)

**Prerequisites:** MAT 1050 or equivalent.

**Description:** Introduction to programming concepts using an object-oriented language. Topics include data types, control structures, functions, arrays, classes, objects, and basic file I/O. Emphasis on problem solving, algorithm design, and structured programming.

**Components:** Lecture 2 hours, Activity 2 hours.

**Grading Basis:** Graded

**Department:** Computer Science — College of Science`,
  },
  {
    url: "https://catalog.cpp.edu/cs-3310",
    title: "CS 3310 — Design and Analysis of Algorithms",
    content: `# CS 3310 — Design and Analysis of Algorithms (3 units)

**Prerequisites:** CS 2400 with a grade of C or better; CS 1300 with a grade of C or better; MAT 2250 with a grade of C or better.

**Description:** Algorithm design techniques including divide-and-conquer, greedy, dynamic programming, backtracking, and branch-and-bound. Analysis of algorithm complexity. NP-completeness and approximation algorithms. Graph algorithms and network flow.

**Components:** Lecture 3 hours.

**Grading Basis:** Graded

**Department:** Computer Science — College of Science`,
  },
  {
    url: "https://catalog.cpp.edu/cs-2640",
    title: "CS 2640 — Computer Organization and Assembly Language",
    content: `# CS 2640 — Computer Organization and Assembly Language (3 units)

**Prerequisites:** CS 1400 with a grade of C or better.

**Description:** Introduction to computer organization, machine language, and assembly language programming. Topics include data representation, CPU architecture, instruction sets, addressing modes, subroutines, interrupts, and I/O programming. Assembly language programming using MIPS or ARM architecture.

**Components:** Lecture 2 hours, Activity 2 hours.

**Grading Basis:** Graded

**Department:** Computer Science — College of Science`,
  },
  {
    url: "https://catalog.cpp.edu/cs-3560",
    title: "CS 3560 — Object-Oriented Design and Programming",
    content: `# CS 3560 — Object-Oriented Design and Programming (3 units)

**Prerequisites:** CS 2400 with a grade of C or better.

**Description:** Object-oriented design principles and patterns. UML modeling. Design patterns including creational, structural, and behavioral patterns. Software development methodologies. Team-based projects using version control and agile practices.

**Components:** Lecture 2 hours, Activity 2 hours.

**Grading Basis:** Graded

**Department:** Computer Science — College of Science`,
  },
];

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

// POST: run a mock scrape
export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const { scheduleId } = (await req.json()) as { scheduleId?: string };

  // Chunk and ingest the mock catalog pages
  const allChunks = MOCK_CATALOG_PAGES.flatMap((page) =>
    chunkText(page.content, page.url, page.title)
  );

  const result = await ingestChunks(allChunks, "scraper");

  // Update schedule stats if an ID was provided
  if (scheduleId) {
    const supabase = createAdminClient();
    await supabase
      .from("scraper_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        chunks_added: result.chunksUpserted,
        pages_crawled: MOCK_CATALOG_PAGES.length,
      })
      .eq("id", scheduleId);
  }

  return NextResponse.json({
    pagesCrawled: MOCK_CATALOG_PAGES.length,
    chunksCreated: result.chunksUpserted,
    chunksEmbedded: result.chunksEmbedded,
    errors: result.errors,
    pages: MOCK_CATALOG_PAGES.map((p) => ({ url: p.url, title: p.title })),
  });
}
