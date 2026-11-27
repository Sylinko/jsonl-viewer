import { useState, useCallback, useMemo, useRef, useEffect, useEffectEvent } from "react";
import { flushSync } from "react-dom";
import { List, type ListImperativeAPI } from "react-window";
import type { JsonLine, FileData, ViewTab } from "./viewer-types";
import { getModelContext, registerViewerTools, type ViewerState } from "./webmcp";
import styles from "./App.module.css";
import {
  ArrowDownAz,
  ArrowUpAz,
  Check,
  Copy,
  FileUp,
  ListChevronsDownUp,
  ListChevronsUpDown,
  Search,
  File,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// Format byte size
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Unescape string - convert escape sequences to actual characters
function unescapeString(str: string): string {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

// Get simplified value preview
function getValuePreview(value: unknown, maxLen: number = 50): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const preview =
      value.length > maxLen ? value.substring(0, maxLen) + "..." : value;
    return `"${preview}"`;
  }
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return `{${keys.length} keys}`;
  }
  return String(value);
}

// Get value type for styling
function getValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// Tree Node Component
interface TreeNodeProps {
  keyName: string;
  value: unknown;
  depth: number;
  path: string;
  selectedPath: string | null;
  onSelect: (path: string, value: unknown) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}

function TreeNode({
  keyName,
  value,
  depth,
  path,
  selectedPath,
  onSelect,
  expandedPaths,
  onToggleExpand,
}: TreeNodeProps) {
  const isExpandable = value !== null && typeof value === "object";
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;
  const valueType = getValueType(value);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(path, value);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpandable) {
      onToggleExpand(path);
    }
  };

  return (
    <div className={styles["treeNode"]}>
      <div
        className={`${styles["treeNodeRow"]} ${isSelected ? styles["treeNodeSelected"] : ""}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
      >
        {isExpandable ? (
          <button className={styles["treeToggle"]} onClick={handleToggle}>
            {isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <span className={styles["treeTogglePlaceholder"]} />
        )}
        <span className={`${styles["treeKey"]} mono`}>{keyName}</span>
        <span className={styles["treeSeparator"]}>:</span>
        <span
          className={`${styles["treeValue"]} ${styles[`treeValue_${valueType}`]} mono`}
        >
          {getValuePreview(value)}
        </span>
      </div>
      {isExpandable && isExpanded && (
        <div>
          {Array.isArray(value)
            ? value.map((item, index) => (
                <TreeNode
                  key={index}
                  keyName={`[${index}]`}
                  value={item}
                  depth={depth + 1}
                  path={`${path}[${index}]`}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
                />
              ))
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <TreeNode
                  key={k}
                  keyName={k}
                  value={v}
                  depth={depth + 1}
                  path={`${path}.${k}`}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
                />
              ))}
        </div>
      )}
    </div>
  );
}

// Collect all paths in an object recursively
function collectAllPaths(value: unknown, path: string = "root"): string[] {
  const paths: string[] = [path];
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        paths.push(...collectAllPaths(item, `${path}[${index}]`));
      });
    } else {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        paths.push(...collectAllPaths(v, `${path}.${k}`));
      });
    }
  }
  return paths;
}

// Get value at a given path
function getValueAtPath(data: unknown, path: string): unknown | undefined {
  if (path === "root") return data;

  const parts: string[] = [];
  let current = path.replace(/^root\.?/, "");

  while (current.length > 0) {
    // Match array index [n] or property name
    const arrayMatch = current.match(/^\[(\d+)\]/);
    const propMatch = current.match(/^\.?([^.[]+)/);

    if (arrayMatch?.[1]) {
      parts.push(arrayMatch[1]);
      current = current.slice(arrayMatch[0].length);
    } else if (propMatch?.[1]) {
      parts.push(propMatch[1]);
      current = current.slice(propMatch[0].length);
    } else {
      break;
    }
  }

  let result: unknown = data;
  for (const part of parts) {
    if (result === null || typeof result !== "object") {
      return undefined;
    }
    if (Array.isArray(result)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= result.length) {
        return undefined;
      }
      result = result[index];
    } else {
      if (!(part in (result as Record<string, unknown>))) {
        return undefined;
      }
      result = (result as Record<string, unknown>)[part];
    }
  }
  return result;
}

// Tree View Component
interface TreeViewProps {
  data: unknown;
  externalSelectedPath?: string | null;
  onPathChange?: (path: string | null) => void;
}

function TreeView({ data, externalSelectedPath, onPathChange }: TreeViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<unknown>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["root"]),
  );
  const [copied, setCopied] = useState(false);
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  // Sync with external path when data changes
  useEffect(() => {
    if (externalSelectedPath) {
      const value = getValueAtPath(data, externalSelectedPath);
      if (value !== undefined) {
        setSelectedPath(externalSelectedPath);
        setSelectedValue(value);
        // Expand parent paths
        const pathParts: string[] = [];
        let current = externalSelectedPath;
        while (current && current !== "root") {
          pathParts.unshift(current);
          // Remove last segment
          const lastDot = current.lastIndexOf(".");
          const lastBracket = current.lastIndexOf("[");
          const lastSep = Math.max(lastDot, lastBracket);
          if (lastSep > 0) {
            current = current.substring(0, lastSep);
          } else {
            current = "root";
          }
        }
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add("root");
          pathParts.forEach((p) => {
            // Add parent paths
            let parent = p;
            while (parent && parent !== "root") {
              const lastDot = parent.lastIndexOf(".");
              const lastBracket = parent.lastIndexOf("[");
              const lastSep = Math.max(lastDot, lastBracket);
              if (lastSep > 0) {
                parent = parent.substring(0, lastSep);
                next.add(parent);
              } else {
                break;
              }
            }
          });
          return next;
        });
      } else {
        // Path doesn't exist in new data, clear selection
        setSelectedPath(null);
        setSelectedValue(null);
        onPathChange?.(null);
      }
    }
  }, [data, externalSelectedPath, onPathChange]);

  const handleSelect = useCallback(
    (path: string, value: unknown) => {
      setSelectedPath(path);
      setSelectedValue(value);
      onPathChange?.(path);
    },
    [onPathChange],
  );

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Expand all / Collapse all
  const handleExpandCollapseAll = useCallback(() => {
    if (isAllExpanded) {
      // Collapse all except root
      setExpandedPaths(new Set(["root"]));
      setIsAllExpanded(false);
    } else {
      // Expand all
      const allPaths = collectAllPaths(data);
      setExpandedPaths(new Set(allPaths));
      setIsAllExpanded(true);
    }
  }, [data, isAllExpanded]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Format selected value with escape conversion
  const formattedValue = useMemo(() => {
    if (selectedValue === null) return "null";
    if (selectedValue === undefined) return "undefined";
    if (typeof selectedValue === "string") {
      return unescapeString(selectedValue);
    }
    if (typeof selectedValue === "object") {
      try {
        const jsonStr = JSON.stringify(selectedValue, null, 2);
        return unescapeString(jsonStr);
      } catch {
        return String(selectedValue);
      }
    }
    return String(selectedValue);
  }, [selectedValue]);

  if (data === null || typeof data !== "object") {
    return <div className={styles["treeEmpty"]}>Not an object or array</div>;
  }

  return (
    <div className={styles["treeViewContainer"]}>
      <div className={styles["treePanel"]}>
        <div className={styles["treePanelHeader"]}>
          <span>Structure</span>
          <button
            className={styles["expandCollapseBtn"]}
            onClick={handleExpandCollapseAll}
            title={isAllExpanded ? "Collapse All" : "Expand All"}
          >
            {isAllExpanded ? (
              <ListChevronsUpDown size={14} />
            ) : (
              <ListChevronsDownUp size={14} />
            )}
          </button>
        </div>
        <div className={styles["treePanelContent"]}>
          <TreeNode
            keyName="root"
            value={data}
            depth={0}
            path="root"
            selectedPath={selectedPath}
            onSelect={handleSelect}
            expandedPaths={expandedPaths}
            onToggleExpand={handleToggleExpand}
          />
        </div>
      </div>
      <div className={styles["treeValuePanel"]}>
        <div className={styles["treePanelHeader"]}>
          <span>
            Value{" "}
            {selectedPath && (
              <span className={`${styles["treePathLabel"]} mono`}>
                {selectedPath}
              </span>
            )}
          </span>
          {selectedValue !== null && (
            <button
              className={`${styles["copyBtn"]} ${copied ? styles["copied"] : ""}`}
              onClick={() => handleCopy(formattedValue)}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
        <div className={styles["treeValueContent"]}>
          {selectedValue !== null ? (
            <pre className={`${styles["treeValuePre"]} mono`}>
              {formattedValue}
            </pre>
          ) : (
            <div className={styles["treeValueEmpty"]}>
              Click a node to view its value
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// JSON Syntax Highlighter Component
function JsonSyntaxHighlight({ json }: { json: string }) {
  const highlightJson = (text: string) => {
    const tokens: { type: string; value: string }[] = [];
    let i = 0;

    while (i < text.length) {
      const char = text.charAt(i);

      // Whitespace
      if (/\s/.test(char)) {
        let ws = "";
        while (i < text.length && /\s/.test(text.charAt(i))) {
          ws += text.charAt(i++);
        }
        tokens.push({ type: "whitespace", value: ws });
        continue;
      }

      // String
      if (char === '"') {
        let str = '"';
        i++;
        while (i < text.length && text.charAt(i) !== '"') {
          if (text.charAt(i) === "\\" && i + 1 < text.length) {
            str += text.charAt(i++);
          }
          str += text.charAt(i++);
        }
        if (i < text.length) str += text.charAt(i++);

        // Check if it's a key (followed by :)
        let j = i;
        while (j < text.length && /\s/.test(text.charAt(j))) j++;
        const isKey = text.charAt(j) === ":";
        tokens.push({ type: isKey ? "key" : "string", value: str });
        continue;
      }

      // Number
      if (/[-\d]/.test(char)) {
        let num = "";
        while (i < text.length && /[-\d.eE+]/.test(text.charAt(i))) {
          num += text.charAt(i++);
        }
        tokens.push({ type: "number", value: num });
        continue;
      }

      // Boolean or null
      if (text.slice(i, i + 4) === "true") {
        tokens.push({ type: "boolean", value: "true" });
        i += 4;
        continue;
      }
      if (text.slice(i, i + 5) === "false") {
        tokens.push({ type: "boolean", value: "false" });
        i += 5;
        continue;
      }
      if (text.slice(i, i + 4) === "null") {
        tokens.push({ type: "null", value: "null" });
        i += 4;
        continue;
      }

      // Brackets and punctuation
      if ("{}[],:".includes(char)) {
        tokens.push({ type: "punctuation", value: char });
        i++;
        continue;
      }

      // Other
      tokens.push({ type: "other", value: char });
      i++;
    }

    return tokens;
  };

  const tokens = highlightJson(json);

  return (
    <pre className={`${styles["prettyContent"]} mono`}>
      {tokens.map((token, idx) => (
        <span
          key={idx}
          className={
            styles[
              `token${token.type.charAt(0).toUpperCase() + token.type.slice(1)}`
            ]
          }
        >
          {token.value}
        </span>
      ))}
    </pre>
  );
}

const LINE_SIZE_KEY = "jsonlViewer.showLineSize";

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("pretty");
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);
  const [treePath, setTreePath] = useState<string | null>(null);
  const listRef = useRef<ListImperativeAPI>(null);
  const detailContentRef = useRef<HTMLDivElement>(null);

  // Left panel resizable width (px)
  const [leftPanelWidth, setLeftPanelWidth] = useState<number | null>(null);
  const isResizing = useRef(false);
  const splitViewRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing.current || !splitViewRef.current) return;
      const rect = splitViewRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const minW = 250;
      const maxW = rect.width * 0.5;
      setLeftPanelWidth(Math.max(minW, Math.min(maxW, newWidth)));
    };

    const handleResizeEnd = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeEnd);
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, []);

  // Line-size visibility toggle (persisted to localStorage)
  const [showLineSize, setShowLineSize] = useState(() => {
    try {
      const saved = localStorage.getItem(LINE_SIZE_KEY);
      return saved === null || saved === "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LINE_SIZE_KEY, String(showLineSize));
    } catch {
      // Keep the preference in memory if the browser blocks storage.
    }
  }, [showLineSize]);

  // Copy to clipboard
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Get active file
  const activeFile = useMemo(() => {
    return files.find((f) => f.id === activeFileId) || null;
  }, [files, activeFileId]);

  const lines = activeFile?.lines || [];
  const filter = activeFile?.filter || "";
  const sortOrder = activeFile?.sortOrder || "asc";

  // Update filter for active file
  const setFilter = useCallback(
    (newFilter: string) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === activeFileId ? { ...f, filter: newFilter } : f,
        ),
      );
    },
    [activeFileId],
  );

  // Update sort order for active file
  const setSortOrder = useCallback(
    (newOrder: "asc" | "desc") => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === activeFileId ? { ...f, sortOrder: newOrder } : f,
        ),
      );
    },
    [activeFileId],
  );

  // Calculate list height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setListHeight(rect.height > 0 ? rect.height : 400);
      }
    };

    // Use ResizeObserver for more reliable height detection
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Initial calculation with a small delay to ensure DOM is ready
    const timer = setTimeout(updateHeight, 50);

    window.addEventListener("resize", updateHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateHeight);
      resizeObserver.disconnect();
    };
  }, [activeFileId]);

  // Parse JSONL content
  const parseJsonl = useCallback((content: string): JsonLine[] => {
    const encoder = new TextEncoder();
    const rawLines = content.split("\n").filter((line) => line.trim());
    return rawLines.map((raw, index) => {
      const size = encoder.encode(raw).length;
      try {
        const parsed = JSON.parse(raw);
        return { id: index + 1, raw, parsed, size };
      } catch {
        return {
          id: index + 1,
          raw,
          parsed: null,
          error: "Invalid JSON",
          size,
        };
      }
    });
  }, []);

  // Generate unique file ID
  const generateFileId = useCallback(() => {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add file to tabs
  const addFile = useCallback(
    (name: string, content: string) => {
      const parsed = parseJsonl(content);
      const newFile: FileData = {
        id: generateFileId(),
        name,
        lines: parsed,
        filter: "",
        sortOrder: "asc",
      };
      setFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
      setSelectedId(null);
    },
    [parseJsonl, generateFileId],
  );

  // Handle file drop - always enabled
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      droppedFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          addFile(file.name, content);
        };
        reader.readAsText(file);
      });
    },
    [addFile],
  );

  // Handle file input change
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputFiles = Array.from(e.target.files || []);
      inputFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          addFile(file.name, content);
        };
        reader.readAsText(file);
      });
      // Reset input value to allow selecting the same file again
      e.target.value = "";
    },
    [addFile],
  );

  // Close a file tab
  const closeFile = useCallback(
    (fileId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setFiles((prev) => {
        const newFiles = prev.filter((f) => f.id !== fileId);
        if (activeFileId === fileId) {
          // Switch to another tab or clear
          const idx = prev.findIndex((f) => f.id === fileId);
          const newActiveIdx = Math.min(idx, newFiles.length - 1);
          setActiveFileId(newFiles[newActiveIdx]?.id ?? null);
          setSelectedId(null);
        }
        return newFiles;
      });
    },
    [activeFileId],
  );

  // Filter and sort lines
  const displayLines = useMemo(() => {
    let result = lines;

    if (filter.trim()) {
      const lowerFilter = filter.toLowerCase();
      result = lines.filter((line) =>
        line.raw.toLowerCase().includes(lowerFilter),
      );
    }

    if (sortOrder === "desc") {
      result = [...result].reverse();
    }

    return result;
  }, [lines, filter, sortOrder]);

  // Current index in displayLines (for disabling nav buttons at boundaries)
  const currentIndex = useMemo(() => {
    if (selectedId === null) return -1;
    return displayLines.findIndex((line) => line.id === selectedId);
  }, [displayLines, selectedId]);

  const isAtFirst = currentIndex <= 0;
  const isAtLast = currentIndex === -1 || currentIndex >= displayLines.length - 1;

  // Get selected line
  const selectedLine = useMemo(() => {
    if (selectedId === null) return null;
    return lines.find((line) => line.id === selectedId) || null;
  }, [lines, selectedId]);

  const navigateSelection = useCallback(
    (direction: "up" | "down") => {
      if (displayLines.length === 0) return;

      const currentIndex = selectedId
        ? displayLines.findIndex((line) => line.id === selectedId)
        : -1;

      let newIndex: number;
      if (direction === "down") {
        newIndex =
          currentIndex < displayLines.length - 1
            ? currentIndex + 1
            : currentIndex;
        if (currentIndex === -1) newIndex = 0;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        if (currentIndex === -1) newIndex = 0;
      }

      const nextLine = displayLines[newIndex];
      if (nextLine && newIndex !== currentIndex) {
        setSelectedId(nextLine.id);
        if (listRef.current) {
          listRef.current.scrollToRow({ index: newIndex });
        }
      }
    },
    [displayLines, selectedId],
  );

  // Keep registrations stable while callbacks read the latest committed UI state.
  const getViewer = useEffectEvent((): ViewerState => ({
    files,
    activeFileId,
    selectedId,
    viewTab,
    displayLines,
    selectFile: (fileId) => {
      flushSync(() => {
        setActiveFileId(fileId);
        setSelectedId(null);
      });
    },
    setFilter: (query) => flushSync(() => setFilter(query)),
    selectEntry: (id, view) => {
      flushSync(() => {
        setSelectedId(id);
        setViewTab(view);
      });
      listRef.current?.scrollToRow({
        index: displayLines.findIndex((line) => line.id === id),
      });
    },
  }));

  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;
    const controller = registerViewerTools(modelContext, getViewer);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }

        const preElement = detailContentRef.current?.querySelector("pre");
        if (preElement) {
          e.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(preElement);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else if (viewTab === "tree") {
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        if (document.activeElement instanceof HTMLInputElement) return;
        e.preventDefault();
        navigateSelection("down");
      } else if (e.key === "ArrowUp") {
        if (document.activeElement instanceof HTMLInputElement) return;
        e.preventDefault();
        navigateSelection("up");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateSelection, viewTab]);

  // Format JSON for pretty display
  const formatJson = useCallback((obj: unknown): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return "Unable to format";
    }
  }, []);

  // Row component for virtualized list (react-window v2 API)
  const Row = useCallback(
    ({
      index,
      style,
    }: {
      index: number;
      style: React.CSSProperties;
      ariaAttributes: {
        "aria-posinset": number;
        "aria-setsize": number;
        role: "listitem";
      };
    }) => {
      const line = displayLines[index];
      if (!line) return null;
      const isSelected = selectedId === line.id;

      return (
        <div
          style={style}
          className={`${styles["listItem"]} ${isSelected ? styles["listItemSelected"] : ""} ${line.error ? styles["listItemError"] : ""}`}
          onClick={() => setSelectedId(line.id)}
        >
          <span className={styles["listItemId"]}>{line.id}</span>
          <span className={`${styles["listItemContent"]} mono`}>
            {line.raw.length > 200
              ? line.raw.substring(0, 200) + "..."
              : line.raw}
          </span>
          {showLineSize && (
            <span className={styles["listItemSize"]}>
              {formatBytes(line.size)}
            </span>
          )}
        </div>
      );
    },
    [displayLines, selectedId, showLineSize],
  );

  // Global drag/drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set dragging to false if leaving the main container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  return (
    <main
      className={styles["main"]}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className={styles["dragOverlay"]}>
          <div className={styles["dragOverlayContent"]}>
            <FileUp size={48} />
            <p>Drop file to add new tab</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={styles["header"]}>
        <div className={styles["headerLeft"]}>
          <h1 className={styles["logo"]}>
            <span className={styles["logoIcon"]}>{"{}"}</span>
            <span>JSONL Viewer</span>
          </h1>
        </div>

        <div className={styles["headerRight"]}>
          {files.length > 0 && (
            <>
              <label className={styles["addFileBtn"]}>
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add File
                <input
                  type="file"
                  accept=".jsonl,.json,.log,.txt"
                  onChange={handleFileInput}
                  multiple
                  style={{ display: "none" }}
                />
              </label>
              {/* Global toggle: Show line size */}
              <button
                className={styles["lineSizeToggle"]}
                onClick={() => setShowLineSize((prev) => !prev)}
                title={showLineSize ? "Hide Line Sizes" : "Show Line Sizes"}
                aria-pressed={showLineSize}
              >
                <span className={styles["lineSizeToggleLabel"]}>Show Line Size</span>
                <span
                  className={`${styles["lineSizeToggleTrack"]} ${showLineSize ? styles["lineSizeToggleTrackOn"] : ""}`}
                >
                  <span className={styles["lineSizeToggleThumb"]} />
                </span>
              </button>
            </>
          )}

          <a
            href="https://github.com/Sylinko/jsonl-viewer"
            target="_blank"
            rel="noopener noreferrer"
            className={styles["githubLink"]}
            title="View on GitHub"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </header>

      {/* File Tabs */}
      {files.length > 0 && (
        <div className={styles["tabBar"]}>
          {files.map((file) => (
            <div
              key={file.id}
              className={`${styles["fileTab"]} ${file.id === activeFileId ? styles["fileTabActive"] : ""}`}
              onClick={() => {
                setActiveFileId(file.id);
                setSelectedId(null);
              }}
            >
              <span className={styles["fileTabName"]}>{file.name}</span>
              <span className={styles["fileTabCount"]}>{file.lines.length}</span>
              <button
                className={styles["fileTabClose"]}
                onClick={(e) => closeFile(file.id, e)}
                title="Close tab"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div className={styles["content"]}>
        {files.length === 0 ? (
          /* Drop Zone */
          <div
            className={`${styles["dropZone"]} ${isDragging ? styles["dropZoneActive"] : ""}`}
          >
            <div className={styles["dropContent"]}>
              <div className={styles["dropIcon"]}>
                <FileUp size={56} />
              </div>
              <p className={styles["dropText"]}>
                Drag & drop a <strong>.jsonl</strong> file here
              </p>
              <p className={styles["dropSubtext"]}>or</p>
              <label className={styles["browseBtn"]}>
                Browse Files
                <input
                  type="file"
                  accept=".jsonl,.json,.log,.txt"
                  onChange={handleFileInput}
                  multiple
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        ) : (
          /* Split View */
          <div className={styles["splitView"]} ref={splitViewRef}>
            {/* Left Panel - List */}
            <div
              className={styles["leftPanel"]}
              style={leftPanelWidth !== null ? { width: leftPanelWidth } : undefined}
            >
              <div className={styles["panelHeader"]}>
                <span>Objects</span>
                <div className={styles["leftPanelControls"]}>
                  <div className={styles["filterBarInline"]}>
                    <Search size={14} />
                    <input
                      type="text"
                      className={styles["filterInputInline"]}
                      placeholder="Filter..."
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                    {filter && (
                      <button
                        className={styles["clearFilterInline"]}
                        onClick={() => setFilter("")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className={styles["filterCountInline"]}>
                    {displayLines.length}/{lines.length}
                  </span>
                  <button
                    className={styles["sortBtn"]}
                    onClick={() =>
                      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                    }
                    title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
                  >
                    {sortOrder === "asc" ? (
                      <ArrowDownAz size={16} />
                    ) : (
                      <ArrowUpAz size={16} />
                    )}
                  </button>
                </div>
              </div>
              <div className={styles["listContainer"]} ref={containerRef}>
                <List
                  listRef={listRef}
                  style={{ height: listHeight }}
                  rowCount={displayLines.length}
                  rowHeight={36}
                  rowComponent={Row}
                  rowProps={{}}
                  overscanCount={10}
                />
              </div>
            </div>

            {/* Resizer handle */}
            <div
              className={styles["resizer"]}
              onMouseDown={handleResizeStart}
            />

            {/* Right Panel - Detail */}
            <div className={styles["rightPanel"]}>
              {selectedLine ? (
                <>
                  <div className={styles["panelHeader"]}>
                    <div className={styles["tabs"]}>
                      <button
                        className={`${styles["tab"]} ${viewTab === "pretty" ? styles["tabActive"] : ""}`}
                        onClick={() => setViewTab("pretty")}
                      >
                        Pretty
                      </button>
                      <button
                        className={`${styles["tab"]} ${viewTab === "raw" ? styles["tabActive"] : ""}`}
                        onClick={() => setViewTab("raw")}
                      >
                        Raw
                      </button>
                      <button
                        className={`${styles["tab"]} ${viewTab === "tree" ? styles["tabActive"] : ""}`}
                        onClick={() => setViewTab("tree")}
                      >
                        Tree
                      </button>
                    </div>
                    <div className={styles["headerRight"]}>
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          marginRight: "8px",
                        }}
                      >
                        <button
                          className={`${styles["copyBtn"]} ${isAtFirst ? styles["disabledBtn"] : ""}`}
                          style={{ padding: "6px" }}
                          onClick={() => navigateSelection("up")}
                          disabled={isAtFirst}
                          title="Previous (Up Arrow)"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className={`${styles["copyBtn"]} ${isAtLast ? styles["disabledBtn"] : ""}`}
                          style={{ padding: "6px" }}
                          onClick={() => navigateSelection("down")}
                          disabled={isAtLast}
                          title="Next (Down Arrow)"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                      {viewTab !== "tree" && (
                        <button
                          className={`${styles["copyBtn"]} ${copied ? styles["copied"] : ""}`}
                          onClick={() =>
                            handleCopy(
                              viewTab === "raw"
                                ? selectedLine.raw
                                : formatJson(selectedLine.parsed),
                            )
                          }
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      )}
                      <span className={styles["detailId"]}>
                        ID: {selectedLine.id}
                      </span>
                    </div>
                  </div>
                  <div className={styles["detailContent"]} ref={detailContentRef}>
                    {selectedLine.error ? (
                      <div className={styles["errorMessage"]}>
                        <span className={styles["errorIcon"]}>⚠</span>
                        <span>{selectedLine.error}</span>
                        <pre className={`${styles["rawContent"]} mono`}>
                          {selectedLine.raw}
                        </pre>
                      </div>
                    ) : viewTab === "raw" ? (
                      <pre className={`${styles["rawContent"]} mono`}>
                        {selectedLine.raw}
                      </pre>
                    ) : viewTab === "tree" ? (
                      <TreeView
                        data={selectedLine.parsed}
                        externalSelectedPath={treePath}
                        onPathChange={setTreePath}
                      />
                    ) : (
                      <JsonSyntaxHighlight
                        json={formatJson(selectedLine.parsed)}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className={styles["emptyDetail"]}>
                  <File size={64} />
                  <p>Select an object to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
