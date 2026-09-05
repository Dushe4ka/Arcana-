/** Single source of truth for the chapter preview route's URL shape - used by every entry
 * point (chapter header, list view, graph view) so the query-param name/shape lives in one
 * place. */
export function previewHref(storyId: string, chapterId: string, nodeId?: string): string {
  const base = `/stories/${storyId}/chapters/${chapterId}/preview`;
  return nodeId ? `${base}?nodeId=${nodeId}` : base;
}
