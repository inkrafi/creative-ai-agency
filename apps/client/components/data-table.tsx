"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, FilterIcon, SearchIcon } from "./icons";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  getValue: (row: T) => string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchValue?: (row: T) => string;
  filters?: DataTableFilter<T>[];
  getRowHref?: (row: T) => string;
  pageSize?: number;
  emptyMessage?: string;
}

/**
 * Client-side table: GET /briefs returns every row in one response (no
 * page/limit params exist), so search, filtering, and pagination all
 * happen here against the already-fetched array rather than round-tripping
 * to the server. Ported from apps/web/components/data-table.tsx -- the two
 * apps don't share a package, so this is a deliberate copy, not a symlink.
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchPlaceholder = "Cari…",
  searchValue,
  filters = [],
  getRowHref,
  pageSize = 10,
  emptyMessage = "Tidak ada data.",
}: DataTableProps<T>) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let rows = data;
    if (search.trim() && searchValue) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((row) => searchValue(row).toLowerCase().includes(q));
    }
    for (const f of filters) {
      const selected = activeFilters[f.key];
      if (selected) rows = rows.filter((row) => f.getValue(row) === selected);
    }
    return rows;
  }, [data, search, searchValue, filters, activeFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateFilter(key: string, value: string) {
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-3">
      {(searchValue || filters.length > 0) && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 shadow-sm">
          {searchValue && (
            <div className="relative w-full max-w-xs">
              <SearchIcon
                width={16}
                height={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border bg-page py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand-light"
              />
            </div>
          )}
          {filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 sm:border-l sm:border-border sm:pl-2.5">
              <FilterIcon width={14} height={14} className="hidden shrink-0 text-ink-muted sm:block" />
              {filters.map((f) => (
                <div key={f.key} className="relative">
                  <select
                    value={activeFilters[f.key] ?? ""}
                    onChange={(e) => updateFilter(f.key, e.target.value)}
                    className="appearance-none rounded-lg border border-border bg-page py-2 pl-3 pr-8 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-light"
                  >
                    <option value="">{f.label}: Semua</option>
                    {f.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    width={14}
                    height={14}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-ink-muted">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-2.5 font-medium ${col.align === "right" ? "text-right" : ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-ink-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const href = getRowHref?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    tabIndex={href ? 0 : undefined}
                    onClick={href ? () => router.push(href) : undefined}
                    onKeyDown={
                      href
                        ? (e) => {
                            if (e.key === "Enter") router.push(href);
                          }
                        : undefined
                    }
                    className={href ? "cursor-pointer hover:bg-surface-2 focus:bg-surface-2 focus:outline-none" : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 ${col.align === "right" ? "text-right" : ""}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <span>
            Menampilkan {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} dari{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <span>
              Halaman {safePage} dari {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
