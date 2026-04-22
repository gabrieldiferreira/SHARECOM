# Technology Stack

## Programming Languages

### Frontend
- **TypeScript 5.x**: Primary language for type-safe development
- **JavaScript**: Configuration files and scripts
- **CSS**: Tailwind CSS utility classes

### Backend
- **Python 3.x**: Primary language for API and processing

## Frontend Technologies

### Core Framework
- **Next.js 15.1.9**: React framework with App Router
- **React 19.0.0**: UI library
- **React DOM 19.0.0**: React rendering

### API & Data Fetching
- **tRPC 11.16.0**: Type-safe API layer (@trpc/client, @trpc/server, @trpc/next, @trpc/react-query)
- **TanStack Query 5.99.2**: Data fetching and caching (@tanstack/react-query)
- **SuperJSON 2.2.6**: JSON serialization with type preservation

### State Management
- **Zustand 5.0.1**: Lightweight state management
- **React Query**: Server state management

### Database (Frontend)
- **Prisma 5.22.0**: ORM and database toolkit
- **@prisma/client 5.22.0**: Prisma client for database access
- **IndexedDB (idb 8.0.3)**: Client-side storage for offline support

### Authentication
- **Firebase 12.12.0**: Client-side authentication
- **Firebase Admin 13.8.0**: Server-side authentication
- **NextAuth 4.24.14**: Authentication for Next.js

### UI & Styling
- **Tailwind CSS 3.4.1**: Utility-first CSS framework
- **Framer Motion 12.38.0**: Animation library
- **Lucide React 1.8.0**: Icon library
- **next-themes 0.4.6**: Dark mode support
- **Recharts 2.13.0**: Charting library

### Internationalization
- **next-intl 4.9.1**: i18n for Next.js

### PWA
- **next-pwa 5.6.0**: Progressive Web App support
- **@khmyznikov/pwa-install 0.6.3**: PWA installation prompt

### Background Jobs
- **BullMQ 5.75.2**: Job queue for background processing
- **IORedis 5.10.1**: Redis client for BullMQ
- **@upstash/redis 1.37.0**: Serverless Redis

### Utilities
- **Zod 4.3.6**: Schema validation
- **date-fns 4.1.0**: Date manipulation

### Development Tools
- **TypeScript 5.x**: Type checking
- **ESLint 9.x**: Code linting
- **PostCSS 8.4.38**: CSS processing
- **Autoprefixer 10.4.19**: CSS vendor prefixes
- **tsx 4.19.0**: TypeScript execution for scripts

## Backend Technologies

### Core Framework
- **FastAPI**: Modern Python web framework
- **Uvicorn**: ASGI server with standard support
- **python-multipart**: File upload handling
- **python-dotenv**: Environment variable management

### Database
- **SQLAlchemy**: ORM for database operations
- **psycopg2-binary**: PostgreSQL adapter

### Authentication & Security
- **firebase-admin**: Firebase Admin SDK for token verification
- **PyJWT**: JSON Web Token handling
- **cryptography**: Cryptographic operations

### OCR & AI Processing
- **EasyOCR**: OCR library for text extraction
- **torch**: PyTorch for deep learning
- **torchvision**: Computer vision utilities
- **PyMuPDF**: PDF processing
- **Pillow**: Image processing
- **pytesseract**: Tesseract OCR wrapper
- **python-bidi 0.4.2**: Bidirectional text support

### Data Validation
- **pydantic**: Data validation using Python type hints
- **typing-extensions**: Extended type hints

### Utilities
- **requests**: HTTP library
- **httpx**: Async HTTP client
- **reportlab**: PDF generation
- **openpyxl**: Excel file handling
- **numpy**: Numerical computing

## Build Systems & Package Managers

### Frontend
- **npm**: Package manager (via package-lock.json)
- **Next.js Build**: Production build system
- **Webpack**: Module bundler (via Next.js)

### Backend
- **pip**: Python package manager
- **requirements.txt**: Dependency specification

## Development Commands

### Frontend Development
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Check i18n translations
npm run i18n:check

# Clear mock data
npm run clear:mock
```

### Backend Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload

# Run with Docker
docker build -t unidoc-backend .
docker run -p 8000:8000 unidoc-backend
```

### Database Management
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Open Prisma Studio
npx prisma studio
```

## Configuration Files

### Frontend
- `next.config.ts`: Next.js configuration (PWA, i18n, webpack)
- `tailwind.config.js`: Tailwind CSS customization
- `tsconfig.json`: TypeScript compiler options
- `eslint.config.mjs`: ESLint rules
- `postcss.config.mjs`: PostCSS plugins
- `prisma.config.ts`: Prisma configuration
- `.env.local`: Environment variables

### Backend
- `.env`: Environment variables
- `Dockerfile`: Container configuration
- `requirements.txt`: Python dependencies

## Environment Variables

### Frontend
- `NEXT_PUBLIC_FIREBASE_*`: Firebase configuration
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: NextAuth secret key
- `NEXTAUTH_URL`: Application URL

### Backend
- `DATABASE_URL`: PostgreSQL connection string
- `FIREBASE_CREDENTIALS`: Firebase Admin SDK credentials path
- `ALLOWED_ORIGINS`: CORS allowed origins

## Deployment

### Frontend
- **Vercel**: Primary deployment platform (vercel.json)
- **Render**: Alternative deployment (render.yaml)

### Backend
- **Docker**: Containerized deployment
- **Render**: Cloud deployment option

## Version Control
- **Git**: Version control system
- `.gitignore`: Excludes node_modules, .next, .env, uploads, etc.
