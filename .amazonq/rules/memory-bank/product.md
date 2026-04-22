# Product Overview

## Project Purpose
UNiDoc is a Progressive Web Application (PWA) for intelligent expense tracking and receipt management. It combines OCR technology with AI-powered data extraction to automatically process receipts and invoices, creating structured transaction records with minimal user input.

## Value Proposition
- **Automated Receipt Processing**: Upload receipts via camera or file, and AI extracts merchant name, amount, date, and items automatically
- **Multi-Currency Support**: Track expenses in BRL, USD, and EUR with proper formatting
- **Offline-First Architecture**: PWA capabilities enable offline data entry with background sync
- **Comprehensive Reporting**: Time-based analytics with quarterly, semi-annual, and annual views
- **Data Portability**: Full export/import functionality for backup and device migration
- **Internationalization**: Multi-language support (English, Spanish, Portuguese)

## Key Features

### Receipt Processing
- Camera capture and file upload for receipts/invoices
- OCR processing using EasyOCR and Tesseract
- AI-powered data extraction (merchant, amount, date, line items)
- PDF and image format support

### Transaction Management
- Create, read, update, and delete transactions
- Soft delete with recovery capability
- Timeline view with income/expense categorization
- Edit modal with pre-filled data

### Analytics & Reporting
- Aggregated spending reports by time period
- Visual charts using Recharts
- Filtering by quarterly, semi-annual, and annual timeframes
- Category-based expense breakdown

### User Preferences
- Language selection (persisted to database and cookies)
- Currency preference with proper formatting
- Firebase authentication integration
- Settings synchronization across devices

### Data Management
- JSON export of all user transactions
- Bulk import with validation
- Backup and restore functionality
- Cross-device data migration

## Target Users
- Individuals tracking personal expenses
- Small business owners managing receipts
- Freelancers organizing business expenses
- Anyone needing automated receipt digitization

## Use Cases
1. **Personal Finance**: Track daily expenses by photographing receipts
2. **Business Expense Reports**: Collect and organize business receipts for reimbursement
3. **Tax Preparation**: Maintain organized records of deductible expenses
4. **Budget Monitoring**: Analyze spending patterns over time
5. **Multi-Currency Travel**: Track expenses in different currencies during international travel
