import { Octokit } from "@octokit/core";
import fs from "fs";

export default async function createIssues() {
  const ISSUE_AUTOMATION = process.env.ISSUE_AUTOMATION;
  const OWNER = process.env.OWNER;
  const REPO = process.env.REPO;

  const octokit = new Octokit({
    auth: ISSUE_AUTOMATION,
  });

  const issuesJson = fs.readFileSync("./issue.json", "utf-8");
  const issues = JSON.parse(issuesJson);

  let count = 0;

  for (const issue of issues) {
    const { title, body, labels } = issue;

    try {
      // Check rate limits
      const rateLimit = await octokit.request("GET /rate_limit");
      const remaining = rateLimit.data.rate.remaining;
      const resetTime = rateLimit.data.rate.reset;

      if (remaining === 0) {
        const delay = (resetTime - Math.floor(Date.now() / 1000)) * 1000;
        console.log(`Rate limit exceeded. Waiting for ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await octokit.request(`POST /repos/${OWNER}/${REPO}/issues`, {
        owner: OWNER,
        repo: REPO,
        title,
        body,
        labels,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      count++;
      console.log(`Issue #${count} created: ${title}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to create issue: ${title}`, error.message);
      } else {
        console.error(`Failed to create issue: ${title}`, error);
      }
    }

    // Delay to avoid bursting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`Created ${count} issues`);
}
