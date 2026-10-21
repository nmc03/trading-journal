// Hash routing helpers: #/historial?q=NVDA&estado=abiertas  (pure, unit-tested).
export const VIEW_SLUG = { dashboard: "resumen", form: "nueva", history: "historial", stats: "estadisticas" };
const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([k, v]) => [v, k]));
const STATUS_SLUG = { all: "todas", open: "abiertas", closed: "cerradas" };
const SLUG_STATUS = Object.fromEntries(Object.entries(STATUS_SLUG).map(([k, v]) => [v, k]));

export function parseRoute(hash) {
  const [path, qs = ""] = String(hash || "").replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(qs);
  return {
    view: SLUG_VIEW[path] || "dashboard",
    query: (params.get("q") || "").slice(0, 20),
    statusFilter: SLUG_STATUS[params.get("estado")] || "all",
  };
}

export function routeHref(route) {
  const params = new URLSearchParams();
  if (route.view === "history") {
    if (route.query) params.set("q", route.query);
    if (route.statusFilter !== "all") params.set("estado", STATUS_SLUG[route.statusFilter]);
  }
  const qs = params.toString();
  return `#/${VIEW_SLUG[route.view]}${qs ? `?${qs}` : ""}`;
}
