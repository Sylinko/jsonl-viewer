'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import styles from './page.module.css';

interface JsonLine {
  id: number;
  raw: string;
  parsed: unknown | null;
  error?: string;
}

interface FileData {
  id: string;
  name: string;
  lines: JsonLine[];
  filter: string; // Per-file filter
  sortOrder: 'asc' | 'desc'; // Per-file sort order
}

type ViewTab = 'raw' | 'pretty' | 'tree';

// Unescape string - convert escape sequences to actual characters
function unescapeString(str: string): string {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// Get simplified value preview
function getValuePreview(value: unknown, maxLen: number = 50): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const preview = value.length > maxLen ? value.substring(0, maxLen) + '...' : value;
    return `"${preview}"`;
  }
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `{${keys.length} keys}`;
  }
  return String(value);
}

// Get value type for styling
function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
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

function TreeNode({ keyName, value, depth, path, selectedPath, onSelect, expandedPaths, onToggleExpand }: TreeNodeProps) {
  const isExpandable = value !== null && typeof value === 'object';
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
    <div className={styles.treeNode}>
      <div
        className={`${styles.treeNodeRow} ${isSelected ? styles.treeNodeSelected : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
      >
        {isExpandable ? (
          <button className={styles.treeToggle} onClick={handleToggle}>
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className={styles.treeTogglePlaceholder} />
        )}
        <span className={`${styles.treeKey} mono`}>{keyName}</span>
        <span className={styles.treeSeparator}>:</span>
        <span className={`${styles.treeValue} ${styles[`treeValue_${valueType}`]} mono`}>
          {getValuePreview(value)}
        </span>
      </div>
      {isExpandable && isExpanded && (
        <div className={styles.treeChildren}>
          {Array.isArray(value) ? (
            value.map((item, index) => (
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
          ) : (
            Object.entries(value as Record<string, unknown>).map(([k, v]) => (
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
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Tree View Component
function TreeView({ data }: { data: unknown }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<unknown>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));
  const [copied, setCopied] = useState(false);

  const handleSelect = useCallback((path: string, value: unknown) => {
    setSelectedPath(path);
    setSelectedValue(value);
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Format selected value with escape conversion
  const formattedValue = useMemo(() => {
    if (selectedValue === null) return 'null';
    if (selectedValue === undefined) return 'undefined';
    if (typeof selectedValue === 'string') {
      return unescapeString(selectedValue);
    }
    if (typeof selectedValue === 'object') {
      try {
        const jsonStr = JSON.stringify(selectedValue, null, 2);
        return unescapeString(jsonStr);
      } catch {
        return String(selectedValue);
      }
    }
    return String(selectedValue);
  }, [selectedValue]);

  if (data === null || typeof data !== 'object') {
    return <div className={styles.treeEmpty}>Not an object or array</div>;
  }

  return (
    <div className={styles.treeViewContainer}>
      <div className={styles.treePanel}>
        <div className={styles.treePanelHeader}>Structure</div>
        <div className={styles.treePanelContent}>
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
      <div className={styles.treeValuePanel}>
        <div className={styles.treePanelHeader}>
          <span>Value {selectedPath && <span className={`${styles.treePathLabel} mono`}>{selectedPath}</span>}</span>
          {selectedValue !== null && (
            <button 
              className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
              onClick={() => handleCopy(formattedValue)}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                {copied ? (
                  <path d="M20 6L9 17l-5-5"/>
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </>
                )}
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        <div className={styles.treeValueContent}>
          {selectedValue !== null ? (
            <pre className={`${styles.treeValuePre} mono`}>{formattedValue}</pre>
          ) : (
            <div className={styles.treeValueEmpty}>Click a node to view its value</div>
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
      const char = text[i];
      
      // Whitespace
      if (/\s/.test(char)) {
        let ws = '';
        while (i < text.length && /\s/.test(text[i])) {
          ws += text[i++];
        }
        tokens.push({ type: 'whitespace', value: ws });
        continue;
      }
      
      // String
      if (char === '"') {
        let str = '"';
        i++;
        while (i < text.length && text[i] !== '"') {
          if (text[i] === '\\' && i + 1 < text.length) {
            str += text[i++];
          }
          str += text[i++];
        }
        if (i < text.length) str += text[i++];
        
        // Check if it's a key (followed by :)
        let j = i;
        while (j < text.length && /\s/.test(text[j])) j++;
        const isKey = text[j] === ':';
        tokens.push({ type: isKey ? 'key' : 'string', value: str });
        continue;
      }
      
      // Number
      if (/[-\d]/.test(char)) {
        let num = '';
        while (i < text.length && /[-\d.eE+]/.test(text[i])) {
          num += text[i++];
        }
        tokens.push({ type: 'number', value: num });
        continue;
      }
      
      // Boolean or null
      if (text.slice(i, i + 4) === 'true') {
        tokens.push({ type: 'boolean', value: 'true' });
        i += 4;
        continue;
      }
      if (text.slice(i, i + 5) === 'false') {
        tokens.push({ type: 'boolean', value: 'false' });
        i += 5;
        continue;
      }
      if (text.slice(i, i + 4) === 'null') {
        tokens.push({ type: 'null', value: 'null' });
        i += 4;
        continue;
      }
      
      // Brackets and punctuation
      if ('{}[],:'.includes(char)) {
        tokens.push({ type: 'punctuation', value: char });
        i++;
        continue;
      }
      
      // Other
      tokens.push({ type: 'other', value: char });
      i++;
    }
    
    return tokens;
  };
  
  const tokens = highlightJson(json);
  
  return (
    <pre className={`${styles.prettyContent} mono`}>
      {tokens.map((token, idx) => (
        <span key={idx} className={styles[`token${token.type.charAt(0).toUpperCase() + token.type.slice(1)}`]}>
          {token.value}
        </span>
      ))}
    </pre>
  );
}

export default function Home() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('pretty');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  // Copy to clipboard
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Get active file
  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || null;
  }, [files, activeFileId]);

  const lines = activeFile?.lines || [];
  const filter = activeFile?.filter || '';
  const sortOrder = activeFile?.sortOrder || 'asc';

  // Update filter for active file
  const setFilter = useCallback((newFilter: string) => {
    setFiles(prev => prev.map(f => 
      f.id === activeFileId ? { ...f, filter: newFilter } : f
    ));
  }, [activeFileId]);

  // Update sort order for active file
  const setSortOrder = useCallback((newOrder: 'asc' | 'desc') => {
    setFiles(prev => prev.map(f => 
      f.id === activeFileId ? { ...f, sortOrder: newOrder } : f
    ));
  }, [activeFileId]);

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
    
    window.addEventListener('resize', updateHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
      resizeObserver.disconnect();
    };
  }, [activeFileId]);

  // Parse JSONL content
  const parseJsonl = useCallback((content: string): JsonLine[] => {
    const rawLines = content.split('\n').filter(line => line.trim());
    return rawLines.map((raw, index) => {
      try {
        const parsed = JSON.parse(raw);
        return { id: index + 1, raw, parsed };
      } catch {
        return { id: index + 1, raw, parsed: null, error: 'Invalid JSON' };
      }
    });
  }, []);

  // Generate unique file ID
  const generateFileId = useCallback(() => {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add file to tabs
  const addFile = useCallback((name: string, content: string) => {
    const parsed = parseJsonl(content);
    const newFile: FileData = {
      id: generateFileId(),
      name,
      lines: parsed,
      filter: '',
      sortOrder: 'asc',
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setSelectedId(null);
  }, [parseJsonl, generateFileId]);

  // Handle file drop - always enabled
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        addFile(file.name, content);
      };
      reader.readAsText(file);
    });
  }, [addFile]);

  // Handle file input change
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(e.target.files || []);
    inputFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        addFile(file.name, content);
      };
      reader.readAsText(file);
    });
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  }, [addFile]);

  // Close a file tab
  const closeFile = useCallback((fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles(prev => {
      const newFiles = prev.filter(f => f.id !== fileId);
      if (activeFileId === fileId) {
        // Switch to another tab or clear
        const idx = prev.findIndex(f => f.id === fileId);
        if (newFiles.length > 0) {
          const newActiveIdx = Math.min(idx, newFiles.length - 1);
          setActiveFileId(newFiles[newActiveIdx].id);
        } else {
          setActiveFileId(null);
        }
        setSelectedId(null);
      }
      return newFiles;
    });
  }, [activeFileId]);

  // Filter and sort lines
  const displayLines = useMemo(() => {
    let result = lines;
    
    if (filter.trim()) {
      const lowerFilter = filter.toLowerCase();
      result = lines.filter(line => 
        line.raw.toLowerCase().includes(lowerFilter)
      );
    }
    
    if (sortOrder === 'desc') {
      result = [...result].reverse();
    }
    
    return result;
  }, [lines, filter, sortOrder]);

  // Get selected line
  const selectedLine = useMemo(() => {
    if (selectedId === null) return null;
    return lines.find(line => line.id === selectedId) || null;
  }, [lines, selectedId]);

  // Format JSON for pretty display
  const formatJson = useCallback((obj: unknown): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return 'Unable to format';
    }
  }, []);

  // Row renderer for virtualized list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const line = displayLines[index];
    const isSelected = selectedId === line.id;
    
    return (
      <div
        style={style}
        className={`${styles.listItem} ${isSelected ? styles.listItemSelected : ''} ${line.error ? styles.listItemError : ''}`}
        onClick={() => setSelectedId(line.id)}
      >
        <span className={styles.listItemId}>{line.id}</span>
        <span className={`${styles.listItemContent} mono`}>
          {line.raw.length > 200 ? line.raw.substring(0, 200) + '...' : line.raw}
        </span>
      </div>
    );
  }, [displayLines, selectedId]);

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
      className={styles.main}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragOverlayContent}>
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="12" y2="12"/>
              <line x1="15" y1="15" x2="12" y2="12"/>
            </svg>
            <p>Drop file to add new tab</p>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>
            <span className={styles.logoIcon}>{'{}'}</span>
            <span>JSONL Viewer</span>
          </h1>
        </div>
        
        <label className={styles.addFileBtn}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add File
          <input
            type="file"
            accept=".jsonl,.json,.log,.txt"
            onChange={handleFileInput}
            multiple
            style={{ display: 'none' }}
          />
        </label>
      </header>

      {/* File Tabs */}
      {files.length > 0 && (
        <div className={styles.tabBar}>
          {files.map(file => (
            <div
              key={file.id}
              className={`${styles.fileTab} ${file.id === activeFileId ? styles.fileTabActive : ''}`}
              onClick={() => {
                setActiveFileId(file.id);
                setSelectedId(null);
              }}
            >
              <span className={styles.fileTabName}>{file.name}</span>
              <span className={styles.fileTabCount}>{file.lines.length}</span>
              <button
                className={styles.fileTabClose}
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
      <div className={styles.content}>
        {files.length === 0 ? (
          /* Drop Zone */
          <div
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
          >
            <div className={styles.dropContent}>
              <div className={styles.dropIcon}>
                <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="12" y2="12"/>
                  <line x1="15" y1="15" x2="12" y2="12"/>
                </svg>
              </div>
              <p className={styles.dropText}>
                Drag & drop a <strong>.jsonl</strong> file here
              </p>
              <p className={styles.dropSubtext}>or</p>
              <label className={styles.browseBtn}>
                Browse Files
                <input
                  type="file"
                  accept=".jsonl,.json,.log,.txt"
                  onChange={handleFileInput}
                  multiple
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        ) : (
          /* Split View */
          <div className={styles.splitView}>
            {/* Left Panel - List */}
            <div className={styles.leftPanel}>
              <div className={styles.panelHeader}>
                <span>Objects</span>
                <div className={styles.leftPanelControls}>
                  <div className={styles.filterBarInline}>
                    <svg className={styles.searchIcon} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                      type="text"
                      className={styles.filterInputInline}
                      placeholder="Filter..."
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                    {filter && (
                      <button className={styles.clearFilterInline} onClick={() => setFilter('')}>
                        ✕
                      </button>
                    )}
                  </div>
                  <span className={styles.filterCountInline}>
                    {displayLines.length}/{lines.length}
                  </span>
                  <button
                    className={styles.sortBtn}
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
              <div className={styles.listContainer} ref={containerRef}>
                <List
                  height={listHeight}
                  itemCount={displayLines.length}
                  itemSize={36}
                  width="100%"
                  overscanCount={10}
                >
                  {Row}
                </List>
              </div>
            </div>

            {/* Right Panel - Detail */}
            <div className={styles.rightPanel}>
              {selectedLine ? (
                <>
                  <div className={styles.panelHeader}>
                    <div className={styles.tabs}>
                      <button
                        className={`${styles.tab} ${viewTab === 'pretty' ? styles.tabActive : ''}`}
                        onClick={() => setViewTab('pretty')}
                      >
                        Pretty
                      </button>
                      <button
                        className={`${styles.tab} ${viewTab === 'raw' ? styles.tabActive : ''}`}
                        onClick={() => setViewTab('raw')}
                      >
                        Raw
                      </button>
                      <button
                        className={`${styles.tab} ${viewTab === 'tree' ? styles.tabActive : ''}`}
                        onClick={() => setViewTab('tree')}
                      >
                        Tree
                      </button>
                    </div>
                    <div className={styles.headerRight}>
                      {viewTab !== 'tree' && (
                        <button 
                          className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                          onClick={() => handleCopy(viewTab === 'raw' ? selectedLine.raw : formatJson(selectedLine.parsed))}
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                            {copied ? (
                              <path d="M20 6L9 17l-5-5"/>
                            ) : (
                              <>
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </>
                            )}
                          </svg>
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                      <span className={styles.detailId}>ID: {selectedLine.id}</span>
                    </div>
                  </div>
                  <div className={styles.detailContent}>
                    {selectedLine.error ? (
                      <div className={styles.errorMessage}>
                        <span className={styles.errorIcon}>⚠</span>
                        <span>{selectedLine.error}</span>
                        <pre className={`${styles.rawContent} mono`}>{selectedLine.raw}</pre>
                      </div>
                    ) : viewTab === 'raw' ? (
                      <pre className={`${styles.rawContent} mono`}>{selectedLine.raw}</pre>
                    ) : viewTab === 'tree' ? (
                      <TreeView data={selectedLine.parsed} />
                    ) : (
                      <JsonSyntaxHighlight json={formatJson(selectedLine.parsed)} />
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.emptyDetail}>
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M9 9h6M9 12h6M9 15h4"/>
                  </svg>
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
