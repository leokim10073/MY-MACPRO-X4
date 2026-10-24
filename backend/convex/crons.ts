import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("burn expired rooms", { minutes: 10 }, internal.rooms.burnExpired, {});

export default crons;
