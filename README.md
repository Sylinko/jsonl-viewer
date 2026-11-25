# JSONL Viewer

A high-performance JSONL file viewer built with Vite and React, optimized for log analysis.

## Features

- **PWA Support** — Install on supported browsers and use offline after the first visit
- **Drag & Drop** — Simply drag `.jsonl` files onto the page to open
- **Multi-Tab** — Open multiple files in tabs, switch between them freely
- **Virtual Scrolling** — Handle large files with thousands of lines efficiently via react-window
- **Three View Modes**
  - **Pretty** — JSON syntax highlighting with color-coded keys, strings, numbers, booleans, and nulls
  - **Raw** — Original unformatted JSON line
  - **Tree** — Interactive tree explorer with expand/collapse, path selection, and value panel
- **Keyboard Navigation** — Arrow Up/Down to navigate objects, Ctrl+A to select content
- **Line Size Display** — Toggleable per-line byte size indicator (persisted via localStorage)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Preview the production build
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) to use the viewer.

Before deploying, run `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Validate the build locally with `pnpm exec cf deploy --prebuilt --dry-run`. When ready to publish, run `pnpm exec cf deploy --prebuilt`.

## Usage

1. Drag and drop a `.jsonl` file onto the drop zone (or click **Browse Files**)
2. Use the filter bar to search objects by text content
3. Click any object in the left list to view its details
4. Switch between **Pretty**, **Raw**, and **Tree** tabs
5. In Tree view, click nodes to expand/collapse and inspect values in the right panel
6. Use ↑/↓ arrow keys to navigate between objects
7. Use the sort button to toggle ascending/descending order

## Tech Stack

- **Vite 8** — Development server and production build tool
- **React 19** — UI library
- **react-window 2** — Virtualized list for high-performance rendering
- **vite-plugin-pwa** — Progressive Web App support
- **TypeScript 6** — Type safety
- **pnpm** — Package manager

## License

MIT
