# AgriConnect — Next-Generation Agricultural Ecosystem Platform

## Release 1.0

- Farmers can book and cancel soil pickups, download lab reports, order farm supplies, hire workers, reserve machinery, and list produce.
- Vendors can review paid marketplace orders, manage equipment calendars, and approve reservations. Workers can maintain a profile, search jobs, and respond to invitations.
- Buyers can purchase at the asking price or negotiate. Each confirmed deal creates a purchase agreement with an append-only offer history.
- Public roles are approved at registration. Administrators manage user access and accredit testing centers. Notifications are available in the app and through configured SMTP.
- Razorpay runs in test mode for marketplace orders. Participants arrange rental fees, deposits, wages, soil-test fees, and produce payments directly.

See [DEPLOYMENT.md](DEPLOYMENT.md) for environment variables, first administrator setup, and release verification. For local development, configure `backend/.env` and `frontend/.env` from the provided examples and run `npm run build` in `backend` to prepare the database before starting the servers.

[![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20Prisma%20%7C%20PostgreSQL-brightgreen.svg)](#technology-stack)
[![Deployment](https://img.shields.io/badge/Deploy-Neon%20%7C%20Render%20%7C%20Vercel-blue.svg)](#cloud-deployment-architecture)
[![Status](https://img.shields.io/badge/Status-In%20Active%20Development-orange.svg)](#current-implementation-status-till-last-push-request)

---

## 📖 Project Description

**AgriConnect** is an integrated, end-to-end digital agriculture platform engineered to streamline commerce, resource-sharing, and technical agricultural services for rural farming communities. By unifying farmers, agricultural labourers, equipment owners, agricultural vendors, certified testing laboratories, and crop buyers into a collaborative multi-role ecosystem, AgriConnect eliminates predatory middlemen, accelerates access to critical soil insights, and optimizes rural farm productivity.

### Core Ecosystem Roles
- 🌾 **Farmer**: Books soil diagnostic tests, rents heavy machinery, purchases quality seeds/fertilizers, hires skilled farm labourers, and sells harvested produce directly to verified buyers.
- 🧪 **Test Center (Agent)**: Diagnostic soil labs that manage sample collection queues, analyze chemical/pH compositions, and deliver actionable soil health cards to farmers.
- 🏪 **Vendor**: Agricultural suppliers who list fertilizers, bio-organic nutrients, seeds, pesticides, and safety-annotated agro-inputs with real-time inventory management.
- 🚜 **Equipment Owner**: Machinery proprietors who rent out tractors, harvesters, power tillers, and sprayers with customizable daily rates, security deposits, and operational status tracking.
- 👷 **Labourer**: Agricultural workforce browsing seasonal farming jobs, daily-wage opportunities, and task assignments.
- 🏢 **Buyer**: Commercial produce buyers negotiating harvest batch purchases directly from farm producers.
- 🛡️ **Admin**: Platform administrators maintaining user integrity, test center certifications, and system audit logs.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18 (Vite), Tailwind CSS, React Router v6, Axios, Lucide React |
| **Backend** | Node.js, Express.js (REST API, dual-mount `/api` and root routes) |
| **Database & ORM** | PostgreSQL (Neon serverless cloud database), Prisma ORM (v5) |
| **Security & Auth** | JSON Web Tokens (JWT), Bcrypt password hashing, Role-Based Access Control (RBAC) |
| **Hosting & CI/CD** | Vercel (Frontend SPA), Render (Backend Web Service), Neon (Cloud DB) |

---

## 🚀 Current Implementation Status (Till Last Push Request: `c674b3e`)

The repository has been updated with all commits pushed to `origin/main` up to commit `c674b3e`. Below is the comprehensive progress breakdown of what has been implemented and tested:

### 1. Authentication & Multi-Role Dashboard (Module 6)
- **Role-Based Authentication**: Secure JWT-based registration and login supporting multiple simultaneous roles per user (`FARMER`, `VENDOR`, `TEST_CENTER`, `LABOURER`, `BUYER`, `ADMIN`).
- **Dynamic Role-Switching Dashboard**: Instant view switching in the frontend dashboard allowing multi-role users to toggle their workspace without re-logging in.
- **RBAC Middleware**: Backend route protection enforcing granular role requirements (`requireRole(['VENDOR'])`, etc.).

### 2. Soil Testing Module (Module 1)
- **Farmer Portal (`/soil-testing`)**:
  - Browse verified soil test centers and their physical locations.
  - Submit soil test sample requests with custom field notes.
  - Real-time status tracking (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
- **Test Center Agent Portal (`/test-center`)**:
  - First-time center registration enforcing a strict 1-to-1 center-to-agent mapping.
  - Dedicated incoming test queue with sample inspection and status updates.
- **Admin Diagnostics & Reset (`/api/admin/reset-my-test-center`)**:
  - Endpoint to clear orphaned centers during development and testing.

### 3. Vendor Shop & Machinery Management (Module 2 & Module 4 - Vendor Side)
- **Comprehensive Vendor Portal (`/vendor/shop` & `/vendor/equipment`)**:
  - **Category-Based Product Catalog**: Manage inventory for Fertilizers, Bio-Organic Nutrients, Seeds, Pesticides, Tools & Implements.
  - **Safety Warning Annotations**: Explicit support for handling hazardous chemicals/pesticides with statutory safety guidelines (BR-MK-02, REQ-MK-10).
  - **Machinery Rental Listings**: Add and manage agricultural equipment (Tractors, Harvesters, Power Tillers, Boom Sprayers, Seed Drills).
  - **Rental Economics**: Configure daily rental rates, required security deposits, operational status (`AVAILABLE`, `RENTED`, `UNDER_MAINTENANCE`), and instant approval flags.
  - **Live Inventory Analytics**: Summary cards for total products, out-of-stock items, listed machinery, and active available units.
  - **Database Auto-Healing**: Express startup auto-initialization ensuring `Product` and `Machinery` tables auto-create seamlessly across cloud environments.

### 4. Cloud Infrastructure & Production Deployment
- **Dual-Mount Route Architecture**: Backend routes mount simultaneously on `/api/*` and `/*` ensuring total resilience regardless of frontend environment variable configuration.
- **Render Production Build Optimization**: Automated database schema synchronization using `npx prisma db push --accept-data-loss`.
- **Vercel Single-Page-App Routing**: Custom `vercel.json` rewrites preventing 404 errors on browser page reloads.

---

## 📜 Git Commit History (Chronological till `c674b3e`)

```
* c674b3e fix(deploy): update build command with --accept-data-loss and add exact error URL diagnostics
* 68366c3 fix(backend): add build script and dual-mount routes with and without /api prefix
* e221467 fix(vendor): ensure DB tables auto-create on startup, normalize roles RBAC, and improve error feedback
* fe01548 feat(vendor): add My Shop module with fertilizer products and rental machinery
* ffcfd5c feat: add admin reset endpoint + enforce 1-to-1 test centre per account
* 2a4c288 fix(backend): Remove non-existent name field from User select in Prisma
* 2115880 feat(frontend): Add Soil Testing module screens
* a50deac fix: Add inverse relations to User model for prisma schema
* b9c0d69 feat(module1): Add Soil Testing Module backend implementation
* e27a93a chore: add vercel.json to fix SPA routing on Vercel
* f78c3a1 Add collaborator deployment guide
* fc4c529 Update package-lock for Prisma
* 69b7459 Fix Prisma build error on Render
* da9c82c Configure for cloud deployment (Postgres + Render + Vercel)
* b80e10a Initial commit with Module 6 (Dashboard & Auth)
* 9b1e91e Initial commit: AgriConnect frontend and backend setup
```

---

## 🗄️ Database Schema Overview (Prisma ORM)

The PostgreSQL database contains the following models located in `backend/prisma/schema.prisma`:

- **`User`**: Account identity, hashed passwords, multi-role array, timestamps, and inverse relations.
- **`SoilTestCenter`**: Laboratory name, location, and 1-to-1 unique mapping to an agent account.
- **`SoilTestRequest`**: Sample testing requests linking a farmer to a test center with status tracking and notes.
- **`Product`**: Vendor agro-inputs, categories, pricing, stock count, unit definitions, and chemical safety alerts.
- **`Machinery`**: Heavy equipment listings, machine specifications, daily rental fees, security deposits, and operational status.
- **`Notification`**: Message alerts dispatched across channels.
- **`AuditLog`**: Security and operational event timestamps.

---

## 📂 Project Directory Structure

```text
AgriConnect/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma           # Prisma PostgreSQL data models
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js     # Register, login, user profile
│   │   │   ├── soilTestController.js # Test center registration & sample requests
│   │   │   └── vendorController.js   # Products, machinery, inventory stats
│   │   ├── middleware/
│   │   │   └── authMiddleware.js     # JWT verification & multi-role RBAC
│   │   ├── routes/
│   │   │   ├── adminRoutes.js        # Diagnostic & maintenance endpoints
│   │   │   ├── authRoutes.js         # /api/auth routes
│   │   │   ├── soilTestRoutes.js     # /api/soil-test routes
│   │   │   └── vendorRoutes.js       # /api/vendor routes
│   │   └── index.js                  # Express app entry & auto-table initializers
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx             # User authentication
│   │   │   ├── Register.jsx          # Multi-role user registration
│   │   │   ├── Dashboard.jsx         # Central dashboard with role switching
│   │   │   ├── FarmerSoilTest.jsx    # Farmer soil test booking & tracking
│   │   │   ├── AgentSoilTest.jsx     # Lab agent queue & status management
│   │   │   └── VendorShop.jsx        # Vendor products & machinery rental hub
│   │   ├── services/
│   │   │   └── api.js                # Axios instance with auth interceptor
│   │   ├── App.jsx                   # React Router routes & session provider
│   │   └── main.jsx
│   ├── vercel.json                   # Vercel SPA rewrite configuration
│   └── package.json
├── DEPLOYMENT.md                     # Step-by-step collaborator deployment guide
└── README.md                         # Project documentation and handover guide
```

---

## 💻 Local Setup & Development Instructions

### 1. Prerequisites
- **Node.js** (v18.x or v20.x recommended)
- **npm** (v9+)
- Free PostgreSQL database (local or [Neon.tech](https://neon.tech))

### 2. Backend Setup
```bash
cd backend

# 1. Install dependencies
npm install

# 2. Configure environment variables in backend/.env
# DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
# JWT_SECRET="your_secure_random_jwt_secret"
# PORT=5000

# 3. Synchronize database schema
npx prisma generate
npx prisma db push

# 4. Start backend server
npm run dev
# Backend runs on http://localhost:5000
```

### 3. Frontend Setup
```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment variables in frontend/.env
# VITE_API_URL="http://localhost:5000/api"

# 3. Start development server
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 🎯 Handover Guide and Roadmap at `c674b3e`

This section records the roadmap from the last push before the Release 1.0 implementation above:

### 1. Module 2 (Part B): Farmer Marketplace Experience
- Build public/farmer-facing Marketplace browse view where farmers can search, filter by category/brand, and view safety warnings.
- Cart system, checkout process, and order placement linked to vendor inventories.

### 2. Module 3: Labour Hiring & Job Board
- Farmer job post creation (number of workers required, crop type, daily wage, duration, farm address).
- Worker job board (`/labourer/jobs`) where labourers can view openings and accept job assignments.
- Task status workflow (`POSTED` → `ACCEPTED` → `IN_PROGRESS` → `COMPLETED` → `PAID`).

### 3. Module 4 (Part B): Farmer Machinery Rental Booking
- Public machinery catalog for farmers to search available equipment by location, machine type, and daily rate.
- Booking flow with date-range selection, security deposit calculation, and instant vs. owner approval requests.

### 4. Module 5: Produce Sales & Negotiation Hub
- Farmers list harvested crop batches (crop variety, quantity in quintals, minimum expected price, harvest date).
- Buyers browse available batches and place bids / negotiate purchase prices.

### 5. Shared Infrastructure & Media Support
- Integration with Cloudinary or AWS S3 for uploading product, machinery, and crop images.
- Payment gateway integration (Razorpay / Stripe) for handling machinery security deposits and marketplace orders.
- In-app notification center powered by the existing `Notification` Prisma model.
