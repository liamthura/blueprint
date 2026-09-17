"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

/**
 * Inline rather than from an icon package. A capability that imports one pins the
 * project to it: `blueprint --preset` swaps the icon dependency, and `shadcn add`
 * does not rewrite these imports, so a pinned import either breaks the build or
 * drags the old library back in alongside the new one.
 */
function Caret({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0 fill-current">
      <path d={direction === "asc" ? "M8 5l4 6H4z" : "M8 11L4 5h8z"} />
    </svg>
  );
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

export type DataTableColumns<TData extends object> = Array<ColumnDef<typeof features, TData>>;

export function DataTable<TData extends object>({
  columns,
  data,
  className,
}: {
  columns: DataTableColumns<TData>;
  data: TData[];
  className?: string;
}) {
  const table = useTable({ features, columns, data });

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-3 py-2 text-left font-medium">
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 disabled:cursor-default"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                      {header.column.getIsSorted() === "asc" ? <Caret direction="asc" /> : null}
                      {header.column.getIsSorted() === "desc" ? <Caret direction="desc" /> : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
