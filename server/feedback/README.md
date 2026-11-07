# Feedback endpoint

Deployment notes for the endpoint behind the feedback form. It is self-hosted, runs on your own server behind your reverse proxy, and is set up once.

## What it does

Page form -> this container -> issue in a private GitHub repository.

The GitHub token stays off the page: it exists only in this container's environment, so visitors and their browsers never see it. Each issue carries the message, details like the app version and browser, and an email address to reply to when the visitor gave one. Visitor text is wrapped in fenced code blocks, so it cannot ping anyone or load images on GitHub. The container publishes no ports; only the reverse proxy reaches it.

## Setup

1. On GitHub, create the private repository that will receive the feedback.
2. Create a fine-grained personal access token. Give it access to that repository only, with the permission "Issues: read and write". Note the expiry date, because the form stops working when the token expires.
3. Create a `.env` file beside `compose.yml` and never commit it. It needs three lines: `GITHUB_TOKEN=<the token from step 2>`, `FEEDBACK_REPO=owner/name` and `PROXY_NETWORK=<the existing Docker network your reverse proxy can reach>`.
4. In `compose.yml`, set `ALLOWED_ORIGIN` to the site the form lives on, and `CLIENT_IP_HEADER` to the request header your reverse proxy sets to the visitor's address, for example `x-real-ip`.
5. Run `docker compose up -d --build`.
6. Expose it through your reverse proxy: container `feedback`, port `8080`, publicly and with no login required, because visitors are anonymous. The page posts to the address set in `ENDPOINT` in `src/ui/feedback.ts`.
7. Test from the live page and confirm the message arrives as an issue in the private repository.

Note: a plain request to the public address answers `{"ok":false}`, which is expected, since only the allowed site may post.

**Important:** have this endpoint running and reachable before you publish the page, otherwise the form shows an error to everyone.

## Limits

The caps live in `compose.yml`: `PER_IP_PER_HOUR` is how many messages one visitor may send per hour, and `PER_DAY` is how many messages everyone together may send per day, the hard stop that keeps a flood out of the inbox. Raise a cap there if real feedback hits it.

Counts are kept in memory, so a restart resets them. A caller reaching the server without the reverse proxy can fake the visitor header, so `PER_DAY` is the real limit. While `PER_DAY` is reached, nobody can send until the day resets.

## Working with feedback

Issues arrive in the private repository. GitHub cannot transfer an issue from a private repository to a public one, so track a fix in the private repository, or copy the issue by hand to a public one, leaving out any email address it contains. The email the visitor gave, if any, is on the "Reply to" line of the issue.

## Troubleshooting

Read the logs with `docker compose logs`. They carry status codes only and never the messages visitors sent.

- `feedback: GitHub answered 401`: the token is wrong or expired. Put a fresh token in the `.env` file and run `docker compose up -d` again. Until then, the form shows an error on the page.
- `feedback: rate limit reached`: one of the caps was hit. If it blocks real feedback, raise the cap in `compose.yml`.