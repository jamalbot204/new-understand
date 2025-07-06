// services/githubService.ts
import { Attachment } from '../types.ts';

/**
 * Simulates fetching all files from a GitHub repository and formatting them for the AI model.
 * In a real application, this would be a call to a backend service.
 */
export async function fetchGitHubRepoContent(attachment: Attachment): Promise<string> {
  if (attachment.type !== 'github_repo' || !attachment.dataUrl) {
    throw new Error('Invalid GitHub repository attachment.');
  }

  // Simulate a network delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate the fetched content
  const repoUrl = attachment.dataUrl;
  const formattedContent = `
## GitHub Repository: ${repoUrl}

### file: /package.json
\`\`\`json
{
  "name": "my-cool-project",
  "version": "1.0.0",
  "description": "A simulated project from ${repoUrl}",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
\`\`\`

### file: /index.js
\`\`\`javascript
console.log("Hello from the simulated project!");
\`\`\`
  `;

  return formattedContent;
}