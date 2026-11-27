export interface JsonLine {
  id: number;
  raw: string;
  parsed: unknown | null;
  size: number;
  error?: string;
}

export interface FileData {
  id: string;
  name: string;
  lines: JsonLine[];
  filter: string; // Per-file filter
  sortOrder: "asc" | "desc"; // Per-file sort order
}

export type ViewTab = "raw" | "pretty" | "tree";
