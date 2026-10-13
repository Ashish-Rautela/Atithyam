import { getJob } from '../../services/review-ingestion/repository.js';
import { runProfileJob } from '../../services/review-ingestion/jobs/profileJob.js';
import { runDiscoveryJob } from '../../services/competitor-discovery/competitorService.js';

/** Single entry point for the job runner: routes a job to its handler by kind (`type` is reserved for the storage item type). */
export async function dispatchJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return;
  if (job.kind === 'discover') return runDiscoveryJob(jobId);
  return runProfileJob(jobId);
}
