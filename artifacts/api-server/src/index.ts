import app from "./app";
import { logger } from "./lib/logger";
import { seedChallenges } from "./lib/seedChallenges";
import { seedPartners } from "./lib/seedPartners";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err: Error | undefined) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  seedChallenges().catch((e) => logger.warn({ err: e }, "Challenge seed failed"));
  seedPartners().catch((e) => logger.warn({ err: e }, "Partner seed failed"));
});
