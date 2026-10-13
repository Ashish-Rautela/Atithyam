-- Step 4: aspect-based sentiment, benchmarking, trends and destination view.

-- One row per analysed review: language, overall sentiment and how it was analysed.
CREATE TABLE review_analysis (
  hotel_id       text NOT NULL,
  platform       text NOT NULL,
  review_id      text NOT NULL,
  content_hash   text NOT NULL,                 -- re-analysed when the review text changes
  method         text NOT NULL CHECK (method IN ('gemini', 'lexicon')),
  model          text,
  language       text,                          -- en | hi | hinglish | other
  overall        smallint,                      -- -1 negative, 0 neutral/mixed, 1 positive
  analyzed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, platform, review_id),
  FOREIGN KEY (hotel_id, platform, review_id) REFERENCES reviews (hotel_id, platform, review_id) ON DELETE CASCADE
);
CREATE INDEX review_analysis_method_idx ON review_analysis (hotel_id, method);

-- One row per (review, aspect): Food, Room, Housekeeping, Staff, Location, Value, Cleanliness, Booking.
CREATE TABLE review_aspects (
  hotel_id      text NOT NULL,
  platform      text NOT NULL,
  review_id     text NOT NULL,
  aspect        text NOT NULL,
  sentiment     smallint NOT NULL CHECK (sentiment IN (-1, 0, 1)),
  evidence      text,                           -- short quote in the original language
  published_at  timestamptz,                    -- copied from the review for fast trend queries
  PRIMARY KEY (hotel_id, platform, review_id, aspect),
  FOREIGN KEY (hotel_id, platform, review_id) REFERENCES review_analysis (hotel_id, platform, review_id) ON DELETE CASCADE
);
CREATE INDEX review_aspects_hotel_idx ON review_aspects (hotel_id, aspect);
CREATE INDEX review_aspects_date_idx ON review_aspects (hotel_id, published_at);

-- What exactly guests mention inside an aspect (hot_water, breakfast, parking …), each with its own polarity.
CREATE TABLE review_issues (
  hotel_id      text NOT NULL,
  platform      text NOT NULL,
  review_id     text NOT NULL,
  issue         text NOT NULL,
  aspect        text NOT NULL,
  sentiment     smallint NOT NULL CHECK (sentiment IN (-1, 0, 1)),
  scope         text NOT NULL DEFAULT 'property' CHECK (scope IN ('property', 'destination')),
  evidence      text,
  published_at  timestamptz,
  PRIMARY KEY (hotel_id, platform, review_id, issue),
  FOREIGN KEY (hotel_id, platform, review_id) REFERENCES review_analysis (hotel_id, platform, review_id) ON DELETE CASCADE
);
CREATE INDEX review_issues_hotel_idx ON review_issues (hotel_id, issue);
CREATE INDEX review_issues_issue_idx ON review_issues (issue, sentiment);

-- Things that happened at a hotel ("chef left", "new geyser installed") — shown on trend charts;
-- kind 'intervention' gets a before/after comparison.
CREATE TABLE hotel_events (
  id          serial PRIMARY KEY,
  hotel_id    text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  event_date  date NOT NULL,
  label       text NOT NULL,
  kind        text NOT NULL DEFAULT 'event' CHECK (kind IN ('event', 'intervention')),
  aspect      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hotel_events_hotel_idx ON hotel_events (hotel_id, event_date);

-- Emerging issues the system flagged: when the evidence started vs when it was detected.
CREATE TABLE issue_alerts (
  hotel_id           text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  aspect             text NOT NULL,
  issue              text NOT NULL,
  first_evidence_at  timestamptz,
  detected_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  recent_count       integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  PRIMARY KEY (hotel_id, aspect, issue)
);

-- Cached AI summaries (operator / destination), regenerated when the underlying numbers change.
CREATE TABLE analysis_summaries (
  scope        text NOT NULL CHECK (scope IN ('hotel', 'city')),
  scope_id     text NOT NULL,
  fingerprint  text NOT NULL,
  content      jsonb NOT NULL,
  method       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id)
);

ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('profile', 'discover_area', 'seed_city', 'analyze_reviews'));
