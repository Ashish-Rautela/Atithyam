# Running on AWS

Everything is defined in CloudFormation and deployed by a CodePipeline. You create one stack by hand
(`infra/pipeline.yaml`). From then on, every `git push` to your branch tests, builds and deploys the app.

```
GitHub ──push──► CodePipeline
                  1 Source           your repository (CodeConnections)
                  2 Build            CodeBuild: server tests on Postgres 16 + PostGIS + Chromium,
                                     then docker build → Amazon ECR (tagged with the commit)
                  3 Infrastructure   CloudFormation: infra/template.yaml  (stack "rip-prod")
                  4 Deploy           CodeBuild → SSM Run Command → EC2 runs infra/ec2/deploy.sh,
                                     health check (+ automatic rollback), then smoke test via CloudFront

Visitors ──HTTPS──► CloudFront ──► EC2 (Amazon Linux 2023, Docker) ──► RDS PostgreSQL 16 + PostGIS
                                   ├─ rip-api     API + UI on port 80 (only CloudFront can reach it)
                                   └─ rip-worker  scraping + review analysis (Chromium in a virtual display)
```

**Why EC2 and not Lambda:** a scraping job keeps Chromium open for minutes, and a city seed takes
hours. The worker is also a long-running process that polls the job queue. Lambda stops every run
after 15 minutes, so the worker needs a server.

## What you get

| Piece | Service | Notes |
|---|---|---|
| Website + API | EC2 `t3.medium` (Docker) | One image runs both containers. No SSH; use Session Manager. |
| HTTPS address | CloudFront | `https://xxxx.cloudfront.net`, or your own domain (optional). |
| Database | RDS PostgreSQL 16 (`db.t4g.micro`) | Private subnets, encrypted, 7-day backups, snapshot on delete. |
| Secrets | Secrets Manager | `DbSecret-…` (generated) and `AppSecret-…` (Gemini key, hash salt). Both are listed in the `rip-prod` stack Outputs. |
| Logs | CloudWatch Logs | `/rip/prod/app` (streams `api`, `worker`) and `/rip/prod/pipeline`. |
| Images | ECR `rip-prod` | Keeps the last 15 images. |

## One-time setup (about 30 minutes, mostly waiting)

1. **Push the project to GitHub**, including `package-lock.json`, `.gitattributes` and the `infra/` folder.
   If you committed from Windows before `.gitattributes` existed, run
   `git add --renormalize . && git commit -m "LF line endings"` once. Bash scripts with CRLF line
   endings fail on Linux.
2. **Pick a region.** The steps assume `ap-south-1` (Mumbai). Any region works.
3. **Create the pipeline stack.** In the console, go to CloudFormation → *Create stack* → *Upload a
   template file*, choose `infra/pipeline.yaml`, name it `rip-pipeline`, and set **RepositoryId**
   (`your-github-user/review-intelligence-platform`) and **BranchName**. Leave the rest as is, tick
   the IAM acknowledgement and create the stack. With the AWS CLI instead:
   ```bash
   aws cloudformation deploy --region ap-south-1 --stack-name rip-pipeline \
     --template-file infra/pipeline.yaml --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides RepositoryId=your-github-user/review-intelligence-platform BranchName=main
   ```
4. **Approve the GitHub connection.** Go to Developer Tools → Settings → *Connections*, open
   `rip-prod-src` → *Update pending connection* → install or authorise the AWS Connector app for the
   repository.
5. **Run the pipeline.** Open CodePipeline → `rip-prod` → *Release change*. The first run fails at
   Source if the connection wasn't approved yet; just release again. The first run takes about
   25–30 minutes, because RDS and CloudFront are being created.
6. **Open the site.** The URL is in the Deploy stage log (`Live: https://…`) and in CloudFormation →
   stack `rip-prod` → *Outputs* → `SiteUrl`.
7. **Add the Gemini key** (optional: without it, analysis uses the offline keyword rules). Go to
   Secrets Manager → the secret named `AppSecret-…` (its ARN is the `AppSecretArn` output) → *Retrieve secret value* → *Edit*, set `GEMINI_API_KEY`, and
   **leave `AUTHOR_HASH_SALT` unchanged**. Then CodePipeline → *Deploy* stage → *Retry*, or push a commit.

## Day to day

- **Deploy a change:** `git push`. A failed test stops the pipeline before anything is deployed. A
  version that fails its health check on the server is rolled back automatically.
- **App settings** (review limits, enabled platforms, Gemini model, …): edit `infra/ec2/app.env` and push.
- **Instance size, database size, background scraping, headed browser, custom domain:** update the
  `rip-pipeline` stack's parameters (CloudFormation → *Update* → *Use current template*). The next
  pipeline run applies them.
  - `BackgroundScraping=false` (default): the browser runs only for what someone asks for on the site.
    `true` adds automatic 15-day refreshes and neighbourhood collection.
  - `HeadedBrowser=true` (default): the worker runs a normal Chromium inside a virtual display (Xvfb),
    like on your laptop. Sites challenge headless browsers more often.
- **Logs:** CloudWatch → Log groups → `/rip/prod/app`.
- **Shell on the server:** EC2 → instance `rip-prod-app` → *Connect* → *Session Manager*. Then use
  `sudo docker ps` and `sudo docker logs -f rip-worker`.
- **Query the database from your laptop** (needs the Session Manager plugin for the AWS CLI):
  ```bash
  aws ssm start-session --target <InstanceId> --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters host=<DatabaseEndpoint>,portNumber=5432,localPortNumber=5433
  # password: Secrets Manager → DbSecret-…; then psql -h localhost -p 5433 -U rip rip
  ```
  With the tunnel open you can also **seed from your laptop**. Set `DATABASE_URL` in `server/.env`
  to `postgres://rip:<password>@localhost:5433/rip` with `DATABASE_SSL=require` and run
  `npm run worker`. Your home connection and visible browser are blocked far less than a datacenter IP.

## Things that behave differently in the cloud

- **Blocking.** Requests come from an AWS IP address. Expect more `BLOCKED` outcomes, first from
  Google Maps and MakeMyTrip. City searches retry later and resume at the same tile. Watch the
  per-platform results on the Seeding page. Seeding big towns from your laptop, as above, avoids most
  of this.
- **No login on the site.** Anyone who has the URL can search hotels and start scraping. Share the
  link carefully, or put authentication in front of it before announcing it publicly.
- **CloudFront waits up to 60 s for an API answer.** Heavy views are cached in the database after
  the first computation, so this only matters right after a large seed.
- **A new Amazon Linux image replaces the server.** The pipeline always uses the latest Amazon Linux
  2023. When AWS publishes a new one, the next pipeline run replaces the instance, with about
  5 minutes of downtime. The new instance starts the last deployed version on its own. Data lives in
  RDS and is not affected. Only the browser profile (cookies) starts fresh.

## Rough monthly cost (ap-south-1, light use)

These are estimates; check the AWS pricing pages for exact figures. EC2 `t3.medium` is about $33,
RDS `db.t4g.micro` with 20 GB is about $18, and the public IPv4 address about $4. Secrets Manager,
SSM, CloudWatch and ECR are a few dollars together. CloudFront is close to free at demo traffic.
CodeBuild costs about $0.10–0.20 per pipeline run. **Total: roughly $60/month.** To pause the costs,
delete the stacks (below); the database is kept as a snapshot.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Infrastructure stage: stack `rip-prod` is in `ROLLBACK_COMPLETE` | The first creation failed (see the stack's *Events*). Delete the `rip-prod` stack, then *Release change*. |
| RDS error "Cannot find version 16.x" | AWS retired that minor version. Change `DbEngineVersion` in `infra/template.yaml` to a current 16.x and push. |
| Deploy: "No online instance found" | The instance is still booting, or it has no internet access. Check EC2 → instance → *Status checks*, then retry Deploy. |
| Deploy: health check failed | The stage log shows the last API log lines. The previous version keeps running. |
| Build: tests fail | Same tests as `npm test` locally. Fix them, then push. |
| Site shows 502/504 | Check the containers with `sudo docker ps` in Session Manager and the logs in `/rip/prod/app`. |

## Remove everything

1. CloudFormation → delete `rip-prod`. RDS leaves a final snapshot; delete it under RDS → Snapshots
   if you don't need it.
2. Delete `rip-pipeline`.
3. Empty and delete the retained artifact bucket (`rip-pipeline-artifactbucket-…`) in S3.
Secrets Manager keeps deleted secrets for 30 days before removing them; they cost nothing in that time.

## Hosting the website on Amplify (optional)

Amplify Hosting can serve the **website only**. The API, the scraping worker and the database still
need the EC2 + RDS stack above, because Amplify can't run a long-lived server, Chromium or Postgres.
The CloudFront address from the stack already serves the website too, so Amplify is optional.
Use it if you want Amplify's preview branches or its domain handling.

1. The repo's `amplify.yml` builds `client/` and publishes `client/dist`.
2. In the Amplify console → your app → **Hosting → Rewrites and redirects → Manage → JSON**, paste
   this, with `<SiteUrl host>` replaced by the `SiteUrl` host from the `rip-prod` stack Outputs
   (for example `d1234abcd.cloudfront.net`):
   ```json
   [
     { "source": "/api/<*>", "target": "https://<SiteUrl host>/api/<*>", "status": "200", "condition": null },
     { "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|webmanifest)$)([^.]+$)/>", "target": "/index.html", "status": "200", "condition": null }
   ]
   ```
   The first rule forwards API calls to the backend. The second sends page URLs such as
   `/seeding/1` to the app, so reloading a page doesn't show a 404.
3. Redeploy the Amplify branch.
