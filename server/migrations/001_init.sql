-- Review Intelligence Platform: Postgres + PostGIS schema.
-- Every hotel is stored once (keyed by its Google place id). Cities/towns, nearby-hotel links,
-- micro-market clusters, reviews, snapshots and the scrape job queue all hang off it.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------------ cities / towns
CREATE TABLE cities (
  id              serial PRIMARY KEY,
  name            text NOT NULL,                      -- as typed by the operator ("Mussoorie")
  kind            text NOT NULL DEFAULT 'town' CHECK (kind IN ('city', 'town')),
  display_name    text,                               -- as Google names it
  region          text,                               -- state / region line from Google
  center          geography(Point, 4326),
  radius_km       numeric(5, 2),                      -- area covered by seeding
  radius_source   text,                               -- 'google_viewport' | 'operator'
  google_url      text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'seeding', 'ready', 'failed', 'paused')),
  settings        jsonb NOT NULL DEFAULT '{}',        -- maxReviews, platforms, queries, tileRadiusKm
  last_error      text,
  last_seeded_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cities_name_uq ON cities (lower(name));
CREATE INDEX cities_center_gix ON cities USING gist (center);

-- ------------------------------------------------------------------ hotels
CREATE TABLE hotels (
  id                   text PRIMARY KEY,               -- short id used in URLs (was bizId)
  google_place_id      text UNIQUE,
  name                 text NOT NULL,
  name_norm            text NOT NULL DEFAULT '',
  address              text,
  location_text        text,                           -- free text the user typed, if any
  city_id              integer REFERENCES cities (id) ON DELETE SET NULL,
  geo                  geography(Point, 4326),
  google_url           text,
  star_class           smallint,
  lodging_type         text,
  google_rating        numeric(2, 1),
  google_review_count  integer,
  price_inr            integer,                        -- Google result-list price (same dates for all hotels in one list)
  price_seen_at        timestamptz,
  sponsored            boolean NOT NULL DEFAULT false,
  is_target            boolean NOT NULL DEFAULT false, -- claimed by a user ("my hotel")
  claimed_at           timestamptz,
  source               text NOT NULL DEFAULT 'discovery' CHECK (source IN ('discovery', 'user', 'seed')),
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  onboard_status       text CHECK (onboard_status IN ('pending', 'discovering', 'collecting', 'done', 'failed')),
  profile_status       text NOT NULL DEFAULT 'none' CHECK (profile_status IN ('none', 'complete', 'partial', 'failed')),
  last_profiled_at     timestamptz,
  next_refresh_at      timestamptz,                    -- last profile + interval ± random jitter
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(), -- last time a discovery search returned it
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hotels_geo_gix ON hotels USING gist (geo);
CREATE INDEX hotels_name_trgm ON hotels USING gin (name_norm gin_trgm_ops);
CREATE INDEX hotels_city_idx ON hotels (city_id);
CREATE INDEX hotels_refresh_idx ON hotels (next_refresh_at) WHERE status = 'active';
CREATE INDEX hotels_target_idx ON hotels (claimed_at DESC) WHERE is_target;

-- ------------------------------------------------------------------ nearby-hotel graph
-- One row per direction for every pair of hotels within NEIGHBOR_RADIUS_KM.
CREATE TABLE hotel_neighbors (
  hotel_id     text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  neighbor_id  text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  distance_m   integer NOT NULL,
  PRIMARY KEY (hotel_id, neighbor_id),
  CHECK (hotel_id <> neighbor_id)
);
CREATE INDEX hotel_neighbors_neighbor_idx ON hotel_neighbors (neighbor_id);

-- ------------------------------------------------------------------ micro-market clusters
CREATE TABLE clusters (
  id           serial PRIMARY KEY,
  city_id      integer NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  cluster_no   integer NOT NULL,
  label        text NOT NULL,
  method       text NOT NULL,
  params       jsonb NOT NULL DEFAULT '{}',
  centroid     geography(Point, 4326),
  radius_m     integer,
  hotel_count  integer NOT NULL DEFAULT 0,
  median_price_inr integer,
  built_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, cluster_no)
);
CREATE TABLE cluster_members (
  cluster_id  integer NOT NULL REFERENCES clusters (id) ON DELETE CASCADE,
  hotel_id    text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  core        boolean NOT NULL DEFAULT true,          -- false = attached to the nearest cluster after DBSCAN marked it as noise
  PRIMARY KEY (hotel_id),
  UNIQUE (cluster_id, hotel_id)
);

-- ------------------------------------------------------------------ discovery coverage
-- Each Google Maps area search. Used to decide whether a point is already covered.
CREATE TABLE discovery_areas (
  id             bigserial PRIMARY KEY,
  city_id        integer REFERENCES cities (id) ON DELETE SET NULL,
  center         geography(Point, 4326) NOT NULL,
  radius_m       integer NOT NULL,
  queries        text[] NOT NULL,
  places_found   integer NOT NULL DEFAULT 0,
  discovered_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discovery_areas_center_gix ON discovery_areas USING gist (center);

-- ------------------------------------------------------------------ per-platform listings
CREATE TABLE platform_listings (
  hotel_id           text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  platform           text NOT NULL,
  status             text NOT NULL,                 -- ScrapeOutcome
  external_id        text,
  url                text,
  listing            jsonb,                         -- last successful profile
  match              jsonb,
  alternatives       jsonb NOT NULL DEFAULT '[]',
  notes              jsonb NOT NULL DEFAULT '[]',
  error              text,
  snapshot_path      text,
  review_sort        text,
  reviews_collected  integer,
  reviews_stored     integer,
  last_job_id        uuid,
  last_success_at    timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, platform)
);

-- Append-only history: rating / count / price over time (trends come for free).
CREATE TABLE listing_snapshots (
  id            bigserial PRIMARY KEY,
  hotel_id      text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  platform      text NOT NULL,
  rating        numeric(4, 2),
  rating_scale  numeric(4, 1),
  review_count  integer,
  price_inr     integer,
  subscores     jsonb,
  distribution  jsonb,
  captured_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_snapshots_hotel_idx ON listing_snapshots (hotel_id, platform, captured_at DESC);

-- ------------------------------------------------------------------ reviews
CREATE TABLE reviews (
  hotel_id       text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  platform       text NOT NULL,
  review_id      text NOT NULL,                    -- deterministic hash (see canonicalReview.js)
  data           jsonb NOT NULL,                   -- canonical review
  content_hash   text NOT NULL,
  revision       integer NOT NULL DEFAULT 1,
  rating5        numeric(3, 2),
  published_at   timestamptz,
  search_text    text NOT NULL DEFAULT '',
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, platform, review_id)
);
CREATE INDEX reviews_hotel_date_idx ON reviews (hotel_id, published_at DESC NULLS LAST);

-- ------------------------------------------------------------------ competitor sets
CREATE TABLE compsets (
  hotel_id            text PRIMARY KEY REFERENCES hotels (id) ON DELETE CASCADE,
  rules               jsonb NOT NULL,
  selected_place_ids  jsonb,                       -- null = use the default selection
  selection_source    text,
  target              jsonb,
  members             jsonb NOT NULL DEFAULT '[]',
  collection          jsonb,
  discovery_job_id    uuid,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ job queue
-- Workers claim with SELECT … FOR UPDATE SKIP LOCKED; several workers can share one database.
CREATE TABLE jobs (
  id            uuid PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('profile', 'discover_area', 'seed_city')),
  hotel_id      text REFERENCES hotels (id) ON DELETE CASCADE,
  city_id       integer REFERENCES cities (id) ON DELETE CASCADE,
  parent_id     uuid,
  reason        text,                               -- user | onboard | seed | refresh | reseed | manual
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  priority      integer NOT NULL DEFAULT 0,         -- higher runs first
  payload       jsonb NOT NULL DEFAULT '{}',
  progress      jsonb NOT NULL DEFAULT '{}',
  message       text,
  outcome       text,
  error         text,
  dedupe_key    text,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 2,
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_by     text,
  heartbeat_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
CREATE INDEX jobs_claim_idx ON jobs (priority DESC, created_at) WHERE status = 'queued';
CREATE INDEX jobs_hotel_idx ON jobs (hotel_id, created_at DESC);
CREATE INDEX jobs_city_idx ON jobs (city_id, status);
-- At most one queued/running job per dedupe key (e.g. "profile:<hotelId>").
CREATE UNIQUE INDEX jobs_dedupe_active_uq ON jobs (dedupe_key) WHERE status IN ('queued', 'running');
