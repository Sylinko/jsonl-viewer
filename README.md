# JSONL Viewer

A high-performance JSONL file viewer built with Next.js, optimized for log analysis.

## Features

- **PWA Support** - Install as a native app on any device
- **Drag & Drop** - Simply drag a `.jsonl` file to open
- **Fast Filtering** - Text-based search across all JSON objects
- **Virtual Scrolling** - Handle large files with thousands of lines efficiently
- **Dual View Modes** - Switch between raw and pretty-formatted JSON
- **Sort Controls** - Toggle between ascending/descending order
- **Dark Theme** - Easy on the eyes for extended log analysis

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm run start
```

Open [http://localhost:3000](http://localhost:3000) to use the viewer.

## Usage

1. Drag and drop a `.jsonl` file onto the drop zone (or click "Browse Files")
2. Use the search bar to filter objects by text content
3. Click any object in the left list to view details
4. Switch between "Pretty" and "Raw" tabs to see formatted or original JSON
5. Use the sort button to toggle ascending/descending order

## Tech Stack

- **Next.js 14** - React framework with App Router
- **react-window** - Virtualized list for performance
- **next-pwa** - Progressive Web App support
- **TypeScript** - Type safety

## License

MIT
