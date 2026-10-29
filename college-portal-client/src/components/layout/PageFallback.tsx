/**
 * Suspense fallback for lazily loaded route chunks. Keeps the app shell (and
 * the sidebar) on screen while the next page's JavaScript is being parsed.
 */
export function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      <span className="sr-only">Загрузка страницы</span>
    </div>
  );
}
