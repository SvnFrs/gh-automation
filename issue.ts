import { Octokit } from "@octokit/core";
import fs from "fs";

export async function createIssues() {
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


export async function deleteClosedIssues() {
  const ISSUE_AUTOMATION = process.env.ISSUE_AUTOMATION;
  const OWNER = process.env.OWNER;
  const REPO = process.env.REPO;

  const octokit = new Octokit({
    auth: ISSUE_AUTOMATION,
  });

  try {
    let pageInfo = { hasNextPage: true, endCursor: null };
    let deletedCount = 0;

    while (pageInfo.hasNextPage) {
      // Fetch closed issues with GraphQL
      const query = `
        query($owner: String!, $repo: String!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            issues(states: CLOSED, first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                number
                title
              }
            }
          }
        }
      `;

      const response = await octokit.graphql<any>(query, {
        owner: OWNER,
        repo: REPO,
        cursor: pageInfo.endCursor,
      });

      const issues = (response as any).repository.issues.nodes;
      pageInfo = (response as any).repository.issues.pageInfo;

      for (const issue of issues) {
        try {
          const mutation = `
            mutation($issueId: ID!) {
              deleteIssue(input: { issueId: $issueId }) {
                clientMutationId
              }
            }
          `;

          await octokit.graphql(mutation, { issueId: issue.id });
          console.log(`Deleted issue #${issue.number}: ${issue.title}`);
          deletedCount++;

          // Delay to avoid hitting rate limits
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          if (error instanceof Error) {
            console.error(`Failed to delete issue #${issue.number}: ${issue.title}`, error.message);
          }
        }
      }
    }

    console.log(`Deleted ${deletedCount} closed issues.`);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to delete closed issues", error.message);
    }
  }
}
