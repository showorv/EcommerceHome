import { config } from "dotenv";

// Same files Next.js reads, so the worker and the web app share one configuration.
config({ path: [".env.local", ".env"], quiet: true });
