import { createWebsiteHandler } from "./_lib/website-handler.js";
// Confirmation runs after submission. This legacy endpoint is recruiter-only.
export default createWebsiteHandler(undefined, "confirmation");
