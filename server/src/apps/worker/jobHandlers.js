import { runProfileJob } from '../../services/review-ingestion/jobs/profileJob.js';
import { runDiscoverArea } from '../../services/seeding/discoverJob.js';
import { runSeedCity } from '../../services/seeding/seedCityJob.js';
import { runAnalyzeReviews } from '../../services/analysis/analyzeJob.js';

/** Job kind -> handler. Each handler receives the claimed job and records its own outcome. */
export const JOB_HANDLERS = Object.freeze({
  profile: runProfileJob,
  discover_area: runDiscoverArea,
  seed_city: runSeedCity,
  analyze_reviews: runAnalyzeReviews,
});
