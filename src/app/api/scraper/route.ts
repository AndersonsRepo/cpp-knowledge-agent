import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { chunkText } from "@/lib/chunker";
import { ingestChunks } from "@/lib/ingest";

const MOCK_CATALOG_PAGES = [
  {
    url: "https://catalog.cpp.edu/cs-2400",
    title: "CS 2400 — Data Structures and Advanced Programming",
    content: `# CS 2400 — Data Structures and Advanced Programming (4 units)

**Prerequisites:** CS 1400 with a grade of C or better; CS 1300 with a grade of C or better.

**Description:** Design, implementation, and analysis of abstract data types, data structures, and their algorithms. Topics include stacks, queues, linked lists, trees, graphs, hash tables, sorting, searching, and algorithm complexity analysis. Programming assignments using an object-oriented language.

**Components:** Lecture 3 hours, Activity 2 hours.

**Department:** Computer Science — College of Science

*Source: CPP 2024-2025 University Catalog*`,
  },
  {
    url: "https://catalog.cpp.edu/cs-1400",
    title: "CS 1400 — Introduction to Programming and Problem Solving",
    content: `# CS 1400 — Introduction to Programming and Problem Solving (4 units)

**Prerequisites:** MAT 1050 with a grade of C or better, or math placement equivalent.

**Description:** Introduction to programming concepts using an object-oriented language. Topics include data types, control structures, functions, arrays, classes, objects, and basic file I/O. Emphasis on problem solving, algorithm design, and structured programming techniques.

**Components:** Lecture 3 hours, Activity 2 hours.

**Department:** Computer Science — College of Science

*Source: CPP 2024-2025 University Catalog*`,
  },
  {
    url: "https://catalog.cpp.edu/cs-3310",
    title: "CS 3310 — Design and Analysis of Algorithms",
    content: `# CS 3310 — Design and Analysis of Algorithms (3 units)

**Prerequisites:** CS 2400 with a grade of C or better; CS 1300 with a grade of C or better; MAT 2250 with a grade of C or better.

**Description:** Algorithm design techniques including divide-and-conquer, greedy method, dynamic programming, backtracking, and branch-and-bound. Analysis of time and space complexity. Introduction to NP-completeness, approximation algorithms, and graph algorithms.

**Components:** Lecture 3 hours.

**Department:** Computer Science — College of Science

*Source: CPP 2024-2025 University Catalog*`,
  },
  {
    url: "https://catalog.cpp.edu/cs-2640",
    title: "CS 2640 — Computer Organization and Assembly Programming",
    content: `# CS 2640 — Computer Organization and Assembly Programming (3 units)

**Prerequisites:** CS 1400 with a grade of C or better.

**Description:** Introduction to computer organization, machine language, and assembly language programming. Topics include data representation, CPU architecture, instruction sets, addressing modes, subroutines, interrupts, and I/O operations.

**Components:** Lecture 2 hours, Activity 2 hours.

**Department:** Computer Science — College of Science

*Source: CPP 2024-2025 University Catalog*`,
  },
  {
    url: "https://catalog.cpp.edu/cs-3560",
    title: "CS 3560 — Object-Oriented Design and Programming",
    content: `# CS 3560 — Object-Oriented Design and Programming (3 units)

**Prerequisites:** CS 2400 with a grade of C or better.

**Description:** Object-oriented design principles and patterns. UML modeling. Design patterns including creational, structural, and behavioral patterns. Software development methodologies and team-based projects.

**Components:** Lecture 2 hours, Activity 2 hours.

**Department:** Computer Science — College of Science

*Source: CPP 2024-2025 University Catalog*`,
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
