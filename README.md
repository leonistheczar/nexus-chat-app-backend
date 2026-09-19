# Nexus

Modern real-time chat interface built with **Next.js**, **React**, and **TypeScript**.

Nexus provides a responsive messaging experience with authentication screens, contact and conversation views, profile setup, themes, and animated UI interactions. The frontend is structured to connect to a dedicated backend API as development continues.

## Features

- Responsive chat workspace
- Contact and conversation management
- Authentication-ready UI with Clerk
- Profile setup flow
- Dark, light, and system themes
- Smooth animations and mobile-friendly layouts
- TanStack Query for server state
- Zustand for client-side state

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- TanStack Query
- Zustand
- Axios
- Clerk
- Framer Motion

## Getting started

### Requirements

- Node.js 18+
- pnpm, npm, yarn, or Bun

### Installation

```bash
git clone https://github.com/leonistheczar/nexus-chat-app-frontend.git
cd nexus-chat-app-frontend
pnpm install
```

Create a `.env.local` file for the environment variables required by Clerk and the backend integration.

### Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Build the production application |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |

## Project structure

```text
app/          Routes, layouts, and global styles
components/   Feature and shared UI components
hooks/        Reusable React hooks
lib/api/      Backend integration layer
lib/providers Application providers
public/       Static assets
```

## Status

The frontend UI is actively developed. Backend integration, persistent data, and real-time messaging capabilities are being added incrementally.

## License

License information will be added when the project reaches its public release.
