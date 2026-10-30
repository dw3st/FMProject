/**
 * The changelog data lives in `@/Domain/changelog/changelogData` (served by `GET /api/changelog`, so the ~150 KB of
 * text stays out of the page bundles, perf audit 4.41.29). Re-exported here for the tests and the rules' path; screens
 * must not import it (the modal fetches it).
 */
export * from "@/Domain/changelog/changelogData";
