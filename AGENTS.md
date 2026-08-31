# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This is a **Padel Tournament Management System** built with Next.js 15, React 19, TypeScript, and Supabase. The application allows clubs, coaches, and players to manage padel tournaments with features like registration, bracket generation, match tracking, and ranking systems.

## Development Commands

### Core Commands
- `npm run dev` - Start development server
- `npm run build` - Build production version
- `npm start` - Start production server
- `npm run lint` - Run linting

### Database Management
- `npx supabase start` - Start local Supabase instance
- `npx supabase db reset` - Reset database with migrations
- `npx supabase gen types typescript --local > database.types.ts` - Generate TypeScript types

## Architecture & Key Patterns

### Next.js App Router Structure
- Uses Next.js 15 App Router with parallel routes and intercepting routes
- Route groups: `(login)`, `(main)` for different layout contexts
- Parallel routes using `@club`, `@coach`, `@player` for role-based views
- Server Actions for form handling and data mutations

### Authentication & User Management
- **Supabase Auth** with custom middleware for session management
- **Role-based access control** with three main roles: `club`, `coach`, `player`
- User context provider (`contexts/user-context.tsx`) for client-side state
- Detailed user profiles with role-specific data

### Tournament System Architecture
- ✅ **ALGORITMO HYBRID-SERPENTINO IMPLEMENTADO** - Sistema de brackets completamente funcional
- ✅ **Garantiza que 1A y 1B solo se encuentren en la final**
- ✅ **Distribución equilibrada: Seed 1 posición 1, Seed n posición final**
- ✅ **Base de datos completa: tournament_couple_seeds + match_hierarchy pobladas**
- ✅ **Sistema de avance automático funcional para BYEs y ganadores**

#### Algoritmo Hybrid-Serpentino:
- **Ubicación:** Sistema V2 → ClubView → Sección "Llaves" → Botón "Generar Bracket Hybrid-Serpentino"
- **Implementación:** `components/tournament/bracket-v2/BracketVisualizationV2.tsx`
- **Documentación completa:** Ver `ALGORITMO-HYBRID-SERPENTINO.md`
- **Endpoints:** `generate-seeding` (strategy: "by-zones") + `generate-bracket-from-seeding`

#### Zonas y Matrices:
- **Drag and drop** implementado en sistema V2 para reorganizar parejas en brackets
- **tournament-zones-matrix.tsx** funcional con datos reales de Supabase
- **Generación de zonas serpentino** completada y estable

### Database Layer
- **Supabase PostgreSQL** with generated TypeScript types (`database.types.ts`)
- Server-side database clients (`utils/supabase/server.ts`)
- Client-side database clients (`utils/supabase/client.ts`)
- Database migrations in `supabase/migrations/`

### State Management
- **Context providers** for tournament state (`TournamentProvider.tsx`)
- **Custom hooks** for data fetching (`use-tournament.ts`, `use-tournament-matches.ts`)
- **SWR** for client-side data caching and revalidation
- Server-side data fetching with Next.js Server Components

### UI/UX Framework
- **Tailwind CSS** for styling with custom color palette
- **Radix UI** components with custom shadcn/ui wrappers
- **Responsive design** with mobile-first approach
- **Dark mode support** with next-themes

## Key Components & Features

### Tournament Management
- Multi-stage tournament flow: Registration → Zone Assignment → Matches → Brackets
- Advanced couple registration system with player search
- Automated seeding algorithms for fair play distribution
- Real-time match result tracking with point calculations

### User Roles & Permissions
- **Clubs**: Create tournaments, manage registrations, upload images
- **Coaches**: View tournaments, register players, track performance
- **Players**: Register for tournaments, view matches and rankings
- Dynamic permission system in `components/tournament/permissions/`

### File Upload & Media
- Supabase Storage integration for tournament and winner images
- Pre-tournament and post-tournament image management
- Gallery system for club profiles

## Code Style Guidelines (from .cursorrules)
- Use **early returns** for better readability
- **Tailwind classes only** - avoid CSS files or inline styles
- **Descriptive naming** with "handle" prefix for event handlers
- **Accessibility features** - proper ARIA labels, tabindex, keyboard support
- Use **const functions** instead of function declarations
- **TypeScript types** for all functions and components

## Important Files & Directories
- `app/api/tournaments/[id]/actions.ts` - Tournament server actions and zone logic
- `components/tournament/` - All tournament-related UI components
- `hooks/` - Custom React hooks for data fetching and state
- `utils/bracket-generator.ts` - Tournament bracket generation algorithms
- `utils/zone-utils.ts` - Zone assignment and balancing logic
- `database.types.ts` - Auto-generated Supabase types
- `middleware.ts` - Authentication and session management

## Development Notes
- Tournament system supports zones-based play before elimination brackets
- Uses snake algorithm for balanced team distribution across zones
- Implements comprehensive match validation and result tracking
- Real-time updates through Supabase subscriptions for live tournament data
- Mobile-responsive design optimized for tournament organizers and players

## Remote Supabase selection (mandatory)

This repository is the shared codebase for two separate organizers and two separate remote Supabase projects. Never use an MCP named only `supabase` or `supabase-develop`, and never use the historical Padel Para Todos project (`vulusxqgknaejdxnhiex`) for remote database work.

- `supabase-fv` is Padel FV (`bfmaqrythlwbfjuqumom`) and is the default remote destination for work in this `padel-fv` workspace or requests about `padelfv.com`/FV.
- `supabase-elite` is TPE Padel / Padel Elite (`lzowflvgnspjdbvdxliy`) and is the destination for requests explicitly about TPE, Elite, or `tpepadel.com`.
- For a request that does not name a tenant, infer it from the route, domain, current workspace and affected configuration. In this workspace default to FV. Before any remote mutation, state the selected tenant and project ref in the commentary update.
