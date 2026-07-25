import type { Profile, Session } from '@/lib/supabase/database.types';

/**
 * The user's data as a portable JSON document (PRODUCT_SPEC.md §4.6 "Export
 * my data").
 *
 * Everything the app stores about the user is two tables; the export is
 * simply both, verbatim, plus enough envelope to make the file
 * self-describing years later. Nothing is renamed or summarized — an export
 * that editorializes is a summary, not an export.
 *
 * Pure builder, separated from the share mechanics so the shape is testable
 * and the screen's only job is transport.
 */
export interface DataExport {
  format: 'ocular-export';
  version: 1;
  exportedAt: string;
  profile: Profile | null;
  sessionCount: number;
  sessions: Session[];
}

export function buildDataExport(
  profile: Profile | null,
  sessions: readonly Session[],
  exportedAt: Date = new Date()
): DataExport {
  return {
    format: 'ocular-export',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    profile,
    sessionCount: sessions.length,
    sessions: [...sessions],
  };
}

/** The export as shareable text — pretty-printed so it is legible anywhere. */
export function serializeDataExport(dataExport: DataExport): string {
  return JSON.stringify(dataExport, null, 2);
}
