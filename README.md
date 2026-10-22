<div align="center">

# 🏔️ Atithyam (आतिथ्यम्)
### AI-Powered Hotel Review Intelligence & Competitive Benchmarking Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-atithyam.ashishrautela.in-047857?style=for-the-badge&logo=googlechrome&logoColor=white)](https://atithyam.ashishrautela.in)
[![API Status](https://img.shields.io/badge/API-apiatithyam.ashishrautela.in-0284c7?style=for-the-badge&logo=fastapi&logoColor=white)](https://apiatithyam.ashishrautela.in/api/health)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Ashish--Rautela%2FAtithyam-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Ashish-Rautela/Atithyam)

<br/>

[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js_22+-43853D?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-316192?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![PostGIS](https://img.shields.io/badge/PostGIS-Spatial_Clustering-336791?style=flat-square&logo=gis&logoColor=white)](https://postgis.net/)
[![Playwright](https://img.shields.io/badge/Playwright-1.64-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-AI_Analysis-8E75C2?style=flat-square&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![AWS](https://img.shields.io/badge/AWS-EC2_%7C_RDS_%7C_CloudFront-232F3E?style=flat-square&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)

<p align="center">
  <b>Atithyam (आतिथ्यम्)</b> is an enterprise-grade hotel review intelligence and market benchmarking platform. It aggregates hotel listings and guest feedback across <b>Google Maps, Booking.com, Agoda, MakeMyTrip</b> (and Tripadvisor), parses multilingual sentiment (English, Hindi, and Hinglish), groups micro-markets using spatial GIS clustering (PostGIS + DBSCAN), and delivers actionable competitive insights to hotel owners and tourism boards.
</p>

🔗 **[Explore the Live Application](https://atithyam.ashishrautela.in)** · 📡 **[Live Backend API](https://apiatithyam.ashishrautela.in/api/health)** · 💬 **[Report Issues](https://github.com/Ashish-Rautela/Atithyam/issues)**

---
</div>

## 🌐 Live Deployment

| Resource | URL | Description |
|---|---|---|
| **Live Web App** | **[https://atithyam.ashishrautela.in](https://atithyam.ashishrautela.in)** | Full interactive frontend client (React 19 + Vite + Tailwind CSS v4) |
| **Production API** | **[https://apiatithyam.ashishrautela.in](https://apiatithyam.ashishrautela.in)** | Express 5 API running on AWS EC2 behind CloudFront |
| **API Health Check** | **[https://apiatithyam.ashishrautela.in/api/health](https://apiatithyam.ashishrautela.in/api/health)** | Live service and database health monitor |

---

## ✨ Key Capabilities

### 1. 🗺️ Automated Spatial Seeding & Micro-Markets
- **Tile-by-Tile Map Crawling:** Seed entire towns or valleys (e.g., *Mussoorie, Nainital, Rishikesh*). The crawler automatically searches geographic bounding boxes tile-by-tile on Google Maps for hotels, resorts, homestays, and boutique lodges.
- **PostGIS Spatial Graphs & DBSCAN:** Automatically builds a 5 km neighbour connectivity graph and groups properties into true walking-distance micro-markets (~600 m radius clusters via DBSCAN).
- **Auto-Refresh with Jitter:** Periodic background re-collection every **15 days** with a ±3 day random salt, avoiding thundering herd queries while keeping pricing, ratings, and fresh reviews up-to-date.

### 2. 🤖 Multilingual Aspect Sentiment (Gemini AI + Rule Fallback)
- **8 Core Hospitality Dimensions:** Classifies every guest review into sentiment scores across:
  - 🍽️ **Food & Dining**
  - 🛏️ **Room Comfort**
  - 🧹 **Housekeeping**
  - 🤝 **Staff & Service**
  - 📍 **Location & Accessibility**
  - 💰 **Value for Money**
  - ✨ **Cleanliness**
  - 📲 **Booking & Check-in Experience**
- **Trilingual Comprehension:** Full support for **English**, **Hindi (हिंदी)**, and colloquial **Hinglish** (e.g., *“Room ka view mast tha but hot water ki problem aayi”*).
- **Dual-Engine AI Pipeline:** Powered by Google Gemini with automatic fallback to high-speed offline deterministic keyword rules if an API key is not configured.
- **Ask Front Desk (AI Chatbot):** Integrated conversational interface powered by streaming Gemini LLM to chat directly with your review repository (e.g., *“What do guests complain most about on weekends?”*).

### 3. 📊 Competitive Benchmarking for Hotel Owners
- **Instant Claim & Auto-Discovery:** Search your hotel name to find it in the spatial database. If unmapped, Atithyam seeds the property and automatically maps its immediate 3 km neighbourhood.
- **Dynamic Comp-Sets:** Filters competitors by distance, star class, lodging tier, and real-time Google price ratios (`Much Cheaper`, `Similar 0.8–1.25×`, `Pricier`).
- **Lead / Lag / Market Weakness:** Highlights whether negative feedback is unique to your hotel (e.g., poor room service) or a town-wide structural bottleneck (e.g., seasonal water shortages or traffic jams).
- **Trend & Event Correlation:** Tracks monthly sentiment trajectory alongside operational milestones logged by management (e.g., *“New Head Chef hired in October”*).

### 4. 🏛️ Destination View for Tourism Boards
- Aggregated intelligence for district administrations and tourism departments.
- Identifies destination-level civic grievances that individual properties cannot solve: road connectivity, parking shortages, municipal electricity/water fluctuations, and taxi overcharging.
- One-click **CSV evidence export** for official planning and infrastructure reviews.

### 5. 💳 Accounts, Paywall & Razorpay Integration
- Tiered subscription tiers (Free Explorer vs. Premium Property Owner / Multi-Property).
- Fully integrated Razorpay checkout modal with webhook verification and payment history ledger.

---

## 🏛️ System Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │             React 19 + Vite UI               │
                                  │      (atithyam.ashishrautela.in)             │
                                  └──────────────────────┬───────────────────────┘
                                                         │ HTTPS / REST
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │              Express 5 API Gateway           │
                                  │     (apiatithyam.ashishrautela.in)           │
                                  └───────────┬──────────────────────┬───────────┘
                                              │                      │
                       Reads / Enqueue Jobs   ▼                      ▼  Background Claims
                      ┌───────────────────────────────┐     ┌────────────────────────────┐
                      │    PostgreSQL 16 + PostGIS    │◄────│     Worker Process(es)     │
                      │  - cities & discovery_areas   │     │  (FOR UPDATE SKIP LOCKED)  │
                      │  - hotels & hotel_neighbors   │     ├────────────────────────────┤
                      │  - DBSCAN clusters            │     │ • seed_city                │
                      │  - platform_listings & snaps  │     │ • discover_area            │
                      │  - reviews & aspect tags      │     │ • profile / scrape         │
                      │  - compsets & jobs queue      │     │ • 15-day refresh scheduler │
                      └───────────────────────────────┘     └──────────────┬─────────────┘
                                                                           │
                                    ┌──────────────────────────────────────┴──────────────────────────────────────┐
                                    │                                                                             │
                                    ▼                                                                             ▼
                     ┌─────────────────────────────┐                                               ┌─────────────────────────────┐
                     │    Playwright (Chromium)    │                                               │       Google Gemini AI      │
                     │  • Google Maps Places API   │                                               │  • 8-Aspect Sentiment       │
                     │  • Agoda Review API         │                                               │  • Hinglish / Hindi NLP     │
                     │  • Booking.com JSON-LD      │                                               │  • Front Desk Chatbot       │
                     │  • MakeMyTrip Ingestion     │                                               │  • Executive Summaries      │
                     └─────────────────────────────┘                                               └─────────────────────────────┘
```

---

## 🔌 Multi-Platform Ingestion Engine

| Platform | Profile Data Extracted | Review Data Extracted | Mechanism & Notes |
|---|---|---|---|
| **Google Maps** | Place details, star class, rating, coordinates, phone, website, **Prices tab** | Reviews tab sample | Direct Chromium navigation. Google Price tab links provide cross-platform OTA IDs (`hid`, `topHtlId`). |
| **Agoda** | Hotel profile, facilities, sub-scores | Direct review API (`ReviewComments`) | Authenticated via session cookies extracted within browser sandbox. |
| **Booking.com** | JSON-LD schema, facilities, sub-scores | Agoda provider endpoint (provider 3038) | Bypasses deprecation of Booking's legacy endpoints via cross-network data feeds. |
| **MakeMyTrip** | Category scores, MMT AI summary, star class | Paginated guest review cards | Content fingerprinting used for de-duplication in the absence of explicit review IDs. |
| **Tripadvisor** | JSON-LD metadata, amenities, price tier | Review cards & pagination | Public HTML extraction with rate-limiting backoff. |

> **Audit Outcomes:** Every platform run produces an explicit status (`SUCCESS`, `SUCCESS_NO_REVIEWS`, `NEEDS_CONFIRMATION`, `NOT_FOUND`, `BLOCKED`, `LAYOUT_CHANGED`, `TIMEOUT`, `DISABLED`). Failed runs archive raw DOM snapshots in `server/data/raw/<platform>/` for inspection.

---

## 🛠️ Technology Stack

### Frontend Client
- **Framework:** [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) with custom Himalayan/Aipan cultural design tokens (`#1D5746` Pine, `#B85D19` Geru, `#F7F4EE` Rice)
- **Animations & Smooth Scroll:** [Framer Motion](https://www.framer.com/motion/), [GSAP](https://greensock.com/), [Lenis Smooth Scroll](https://lenis.darkroom.engineering/)
- **Typography:** Fraunces (Editorial serif), Manrope (Modern grotesque), Tiro Devanagari Hindi
- **State & Data Fetching:** [@tanstack/react-query](https://tanstack.com/query)

### Backend & Ingestion
- **Runtime & Server:** [Node.js 22+](https://nodejs.org/) (ES Modules) & [Express 5](https://expressjs.com/)
- **Database & Spatial Engine:** [PostgreSQL 16](https://www.postgresql.org/) with [PostGIS extension](https://postgis.net/) (DBSCAN, ST_DWithin, ST_DistanceSphere)
- **Scraping Engine:** [Playwright 1.64](https://playwright.dev/) with Chromium
- **Validation & Logging:** [Ajv](https://ajv.js.org/) (JSON Schema validation), [Pino](https://github.com/pinojs/pino) + `pino-pretty`

### AI & Language Understanding
- **LLM Engine:** [Google Gemini API](https://ai.google.dev/) (`@google/genai`) for multilingual extraction, topic classification, and streaming conversational chat
- **Deterministic Engine:** Built-in offline regex and vocabulary matcher for zero-dependency execution

### Cloud & Infrastructure
- **Hosting:** AWS EC2 (`t3.medium`, Amazon Linux 2023 with Docker Compose)
- **CDN & Edge:** AWS CloudFront (HTTPS termination, static asset caching)
- **Managed DB:** AWS RDS PostgreSQL 16 with PostGIS
- **CI/CD:** AWS CodePipeline + CodeBuild + CloudFormation (`infra/pipeline.yaml`)
- **Payments:** Razorpay Payments Gateway integration

---

## 🚀 Quick Start Guide

### Prerequisites
1. **Node.js 22.9 or newer** (`node -v`)
2. **Docker Desktop** (for running PostgreSQL 16 + PostGIS)
3. *(Optional)* **Google Gemini API Key** for AI analysis (`GEMINI_API_KEY`)

### 1. Clone the Repository
```bash
git clone https://github.com/Ashish-Rautela/Atithyam.git
cd Atithyam
```

### 2. Install Dependencies & Playwright Browsers
```bash
# Install workspace dependencies (root, server, and client)
npm install

# Download Chromium binary for Playwright scraper
npm run browsers:install
```

### 3. Environment Configuration
Copy the sample environment file to the server folder:
```bash
# On Windows PowerShell:
copy .env.example server\.env

# On macOS / Linux:
cp .env.example server/.env
```

Key environment variables in `server/.env`:
```ini
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rip
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rip_test
GEMINI_API_KEY=your_gemini_api_key_here     # Optional: enables AI sentiment & chat
HEADLESS=true                               # Set to false to see browser scraping
WORKER_MODE=embedded                        # embedded | standalone
```

### 4. Start Database & Run Migrations
```bash
# Start PostgreSQL 16 + PostGIS container in Docker
npm run db:up

# Run schema migrations (creates cities, hotels, reviews, compsets, etc.)
npm run db:migrate
```

### 5. Launch the Development Environment
```bash
npm run dev
```
- **Web UI:** [http://localhost:5173](http://localhost:5173)
- **Express API:** [http://localhost:4000](http://localhost:4000)

---

## 🧪 Testing & Verification

### Unit & Database Integration Tests
The repository features an automated test suite with Vitest:
```bash
# Run unit tests, database queries, and parser fixtures
npm test
```
- `tests/unit`: Markup parsers with fixture HTML from live platforms, normalisers, and matching logic.
- `tests/db`: Real PostgreSQL/PostGIS queries, upserts, spatial clustering, queue prioritization, deduplication, and scheduler logic.
- `tests/browser`: In-page extractor tests against Chromium.

### Live Smoke Tests (No UI Required)
Verify the scraper and GIS ingestion pipelines against real live endpoints directly from your CLI:
```bash
# 1. Seed a sample town (finds bounds, pulls 2 tiles, builds spatial graph & clusters)
npm run smoke:seed -- "Mussoorie"

# 2. Collect one hotel and its OTA listings immediately
npm run smoke -- "JW Marriott Walnut Grove" "Mussoorie" --max 20

# 3. Verify Gemini AI connectivity and classification
npm run ai:check
```

---

## 📡 API Reference

### Hotel & Competitor Management
| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/hotels/lookup?name=&location=` | Instant fuzzy autocomplete search across the spatial database |
| `POST` | `/api/businesses` | Claim a property (`{hotelId}` or `{name, googleUrl}`) and trigger onboarding |
| `GET` | `/api/businesses/:id` | Fetch property profile, platform statuses, and freshness timestamps |
| `GET` | `/api/businesses/:id/competitors` | List candidate comp-set, selection status, and price ratios |
| `POST` | `/api/businesses/:id/competitors/discover` | Trigger local radius scan on Google Maps (`{radiusKm, force}`) |
| `PUT` | `/api/businesses/:id/competitors/selection` | Save chosen competitor place IDs (`{placeIds}`) |
| `POST` | `/api/businesses/:id/competitors/collect` | Queue background scraping for chosen competitors |
| `POST` | `/api/businesses/:id/reseed` | Re-scan the 3 km radius around the property |

### Analytics & Intelligence
| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/businesses/:id/pipeline` | Track 4-step progress: Property → Competitors Found → Collected → Analysed |
| `GET` | `/api/businesses/:id/benchmark` | 8-aspect comparison, lead/lag indicators, and quote evidence |
| `GET` | `/api/businesses/:id/trends` | Monthly rating & aspect trends with change-point detection |
| `GET` / `POST` | `/api/businesses/:id/summary` | Generate executive written summary (Gemini AI or rule-based) |
| `POST` | `/api/businesses/:id/analyse` | Trigger on-demand review analysis (`{upgrade: true}` to re-analyse with AI) |
| `POST` | `/api/businesses/:id/chat` | **Ask Front Desk:** Interactive conversational streaming AI on review corpus |
| `GET` / `POST` | `/api/businesses/:id/events` | Log operational interventions (e.g. renovation, new chef) |

### Destination & Tourism Board
| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/cities` | List all seeded towns, micro-market counts, and coverage statistics |
| `POST` | `/api/cities` | Seed new destinations (`{names: ["Nainital"], radiusKm, enrich}`) |
| `GET` | `/api/cities/:id/destination` | Overview of town-wide civic bottlenecks (water, parking, power, roads) |
| `GET` | `/api/cities/:id/destination/evidence.csv` | Export structured civic grievances to CSV |
| `POST` | `/api/cities/:id/reseed` | Re-seed city (`{mode: "refresh" | "full" | "resume"}`) |

---

## 🔒 Ethical Data Guardrails

Atithyam is engineered with respect for platform terms and user privacy:
1. **Public Information Only:** Collects strictly public, unauthenticated web listings. Does not bypass paywalls, solve CAPTCHAs, or impersonate logged-in users.
2. **Zero Storage of Reviewer Identities:** Reviewer names and profile links are never stored in the database. De-duplication uses a salted cryptographic hash (`reviewId`).
3. **Respectful Request Cadence:** Background workers enforce randomised 1.5–4.0 s delays between browser interactions and process one task per worker at a time.
4. **Selective Toggle:** Any data source can be deactivated on demand via `ENABLE_<PLATFORM>=false` in `server/.env`.

---

## 📂 Repository Structure

```
Atithyam/
├── client/                     # Frontend Application (React 19 + Vite 8 + Tailwind CSS v4)
│   ├── src/
│   │   ├── features/           # Feature slices: home, search, business, competitors, report, auth, etc.
│   │   ├── services/           # HTTP API client, authentication & Razorpay handlers
│   │   ├── ui/                 # Reusable UI kit, icons, and cultural Aipan art components
│   │   └── main.jsx            # React root & routing configuration
│   └── index.html              # HTML shell & web metadata
├── server/                     # Backend Application (Node.js 22 + Express 5)
│   ├── migrations/             # Idempotent SQL schema migrations
│   ├── src/
│   │   ├── apps/api/           # Express REST API routes and controllers
│   │   ├── apps/worker/        # Background queue worker (`FOR UPDATE SKIP LOCKED`)
│   │   ├── data/               # PostGIS queries (hotels, clusters, reviews, compsets)
│   │   ├── services/           # Ingestion adapters, competitor discovery, seeding & AI pipelines
│   │   └── shared/             # Database pool, config, logger, and validation schemas
│   ├── scripts/                # Database migrations and live smoke testing CLI tools
│   └── tests/                  # Unit, DB integration, and browser tests
├── docs/                       # In-depth architectural guides (AWS deployment, billing, scraping)
├── infra/                      # AWS CloudFormation templates, EC2 scripts & pipeline definitions
├── docker-compose.yml          # PostgreSQL 16 + PostGIS local container setup
└── README.md                   # Project documentation
```

---

## 👥 Authors & License

- **Developers:**
  - Ashish Rautela ([@Ashish-Rautela](https://github.com/Ashish-Rautela))
  - Sahil Negi ([@snmcodes99](https://github.com/snmcodes99))
- **Live Platform:** [https://atithyam.ashishrautela.in](https://atithyam.ashishrautela.in)
- **Repository:** [https://github.com/Ashish-Rautela/Atithyam](https://github.com/Ashish-Rautela/Atithyam)

*Crafted with pride for Himalayan & Uttarakhand Hospitality.* 🏔️
