# Project Structure

## Directory Organization

### Root Level
```
/var/home/gabrielferreira/UNiDoc/
├── backend/          # Python FastAPI backend
├── frontend/         # Next.js React frontend
└── .amazonq/         # Amazon Q configuration and rules
```

### Backend Structure (`/backend/`)
```
backend/
├── config/           # Environment configuration
├── middleware/       # Query counter and request middleware
├── uploads/          # Uploaded receipt files (images, PDFs)
├── utils/            # Utility modules (cache, dataloader, transaction safety)
├── main.py           # FastAPI application entry point
├── database.py       # SQLAlchemy database configuration
├── models.py         # Database models (User, Transaction)
├── schemas.py        # Pydantic schemas for validation
├── auth.py           # Firebase authentication integration
├── ai_processor.py   # AI-powered data extraction
├── ai_agent.py       # AI agent orchestration
├── ocr_processor.py  # OCR processing (EasyOCR, Tesseract)
├── export_routes.py  # Export/import API endpoints
├── health.py         # Health check endpoints
├── requirements.txt  # Python dependencies
└── Dockerfile        # Container configuration
```

### Frontend Structure (`/frontend/`)
```
frontend/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── api/          # API route handlers (tRPC, REST)
│   │   ├── scanner/      # Receipt upload page
│   │   ├── timeline/     # Transaction history page
│   │   ├── reports/      # Analytics and reporting page
│   │   ├── settings/     # User preferences page
│   │   ├── link/         # Link management page
│   │   └── page.tsx      # Home page
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility libraries (currency, etc.)
│   ├── server/           # Server-side utilities
│   ├── store/            # Zustand state management
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Frontend utilities
│   ├── worker/           # Service worker for PWA
│   └── middleware.ts     # Next.js middleware (i18n)
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Database migrations
├── messages/             # i18n translation files (en, es, pt-BR)
├── public/               # Static assets (icons, images, manifest)
├── scripts/              # Build and maintenance scripts
├── package.json          # Node.js dependencies
├── next.config.ts        # Next.js configuration
├── tailwind.config.js    # Tailwind CSS configuration
└── tsconfig.json         # TypeScript configuration
```

## Core Components

### Backend Components

**API Layer**
- `main.py`: FastAPI application with CORS, routes, and middleware
- `export_routes.py`: Data export/import endpoints
- `health.py`: Health check and monitoring

**Data Processing**
- `ocr_processor.py`: Image and PDF text extraction
- `ai_processor.py`: AI-powered field extraction from OCR text
- `ai_agent.py`: Orchestrates OCR and AI processing pipeline

**Data Layer**
- `database.py`: SQLAlchemy engine and session management
- `models.py`: User and Transaction ORM models
- `schemas.py`: Request/response validation schemas

**Authentication**
- `auth.py`: Firebase Admin SDK integration for token verification

### Frontend Components

**Pages (App Router)**
- `/scanner`: Receipt upload with camera/file input
- `/timeline`: Transaction list with edit/delete
- `/reports`: Analytics dashboard with time filters
- `/settings`: User preferences (language, currency)
- `/link`: Link management interface

**API Routes**
- `/api/transactions/[id]`: CRUD operations for transactions
- `/api/reports`: Aggregated analytics data
- `/api/export`: JSON export of user data
- `/api/import`: Bulk import of transactions
- `/api/user/preferences`: User settings persistence

**State Management**
- `store/useTransactionStore.ts`: Zustand store for transaction state
- Local state in components for UI interactions

**Utilities**
- `lib/currency.ts`: Currency formatting with Intl API
- `utils/`: Helper functions for data transformation

## Architectural Patterns

### Frontend Architecture
- **App Router**: Next.js 15 with React Server Components
- **API Layer**: Hybrid tRPC + REST API routes
- **State Management**: Zustand for global state, React hooks for local state
- **Styling**: Tailwind CSS with custom design system classes
- **Internationalization**: next-intl with cookie-based locale persistence
- **PWA**: Service worker with offline capabilities and background sync

### Backend Architecture
- **REST API**: FastAPI with async/await patterns
- **ORM**: SQLAlchemy for database operations
- **Authentication**: Firebase Admin SDK for token verification
- **Processing Pipeline**: OCR → AI Extraction → Database Storage
- **File Storage**: Local filesystem with hash-based naming

### Database Schema
- **User**: id, email, locale, currency, created_at
- **Transaction**: id, user_id, merchant_name, amount_cents, currency, date, description, deleted_at

### Communication Flow
1. Frontend uploads receipt to backend `/upload` endpoint
2. Backend processes with OCR (EasyOCR/Tesseract)
3. AI extracts structured data (merchant, amount, date)
4. Backend stores transaction in database
5. Frontend fetches updated transactions via API
6. PWA syncs offline changes when connection restored

## Design System
- **Glassmorphic UI**: Backdrop blur with semi-transparent backgrounds
- **Color Palette**: Purple/pink gradients for primary actions
- **Typography**: System fonts with consistent sizing
- **Spacing**: Tailwind spacing scale (4px base unit)
- **Dark Mode**: Theme support via next-themes
