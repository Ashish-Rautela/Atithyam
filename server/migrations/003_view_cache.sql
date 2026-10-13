-- Pre-computed benchmark / trend views per hotel. Filled when a hotel's reviews are analysed
-- (during seeding and onboarding) and reused until the underlying data changes (`version`).
CREATE TABLE computed_views (
  hotel_id     text NOT NULL REFERENCES hotels (id) ON DELETE CASCADE,
  view         text NOT NULL,             -- 'benchmark' | 'trends'
  params       text NOT NULL,             -- peer mode, radius, measure
  version      text NOT NULL,             -- hash of peer ids + data change markers
  payload      jsonb NOT NULL,
  compute_ms   integer,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, view, params)
);

CREATE INDEX review_analysis_analyzed_idx ON review_analysis (hotel_id, analyzed_at DESC);
