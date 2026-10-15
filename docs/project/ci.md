<title>CI</title>

# CI

## Every push and pull request

`.github/workflows/ci.yml` runs on every pull request and every push to `main` or a `v*` branch.

| Job | What |
|---|---|
| **check** | `npm ci`, `node .devcontainer/check.mjs` (the dev container's Playwright matches the lock file), `npm run lint`, `npm test`, `npm run build`. MongoDB and Valkey run beside it, so the store and live-class tests also run against the real thing. |
| **image** | Builds the container image (`Dockerfile`), checks it refuses to start without its settings, and scans it with Trivy: a high or critical vulnerability that has a fix fails the job. |
| **chart** | `helm lint --strict deploy/blockout`, and renders the chart with each cluster's values. |
| **docs** | Builds this site with `mkdocs build --strict`, so a broken link or a page missing from the nav fails it. |

`.github/workflows/devcontainer.yml` builds the dev container when its files change, and weekly.

## Releases

Pushing a tag like `v0.4.0` runs `.github/workflows/release.yml`:

1. builds and pushes the image `ghcr.io/<owner>/blockout:0.4.0` (and `:sha-…`), with an SBOM and build provenance, and a signed attestation (`gh attestation verify oci://ghcr.io/<owner>/blockout:0.4.0 --owner <owner>`)
2. packages the Helm chart and pushes it to `oci://ghcr.io/<owner>/charts/blockout`
3. makes a GitHub release with that version's section of `CHANGELOG.md`

Before tagging, move the `[Unreleased]` changes in `CHANGELOG.md` under the new version, and set the version in the `package.json` files and `deploy/blockout/Chart.yaml` (SemVer).

## How it's locked down

- **Minimal permissions:** workflows get `contents: read`; only the release job can write packages, releases and attestations. Checkout doesn't keep the token (`persist-credentials: false`).
- **No script injection:** values from the event (tag names, the actor) reach shell steps as environment variables, never pasted into the script, and a release tag must look like a version.
- **Pinned actions:** actions are pinned to full commit SHAs, with the version in a comment. Dependabot (`.github/dependabot.yml`) updates them weekly, along with the npm packages, the dev container, the images in `Dockerfile` and `deploy/`, and the chart.
- **One run per branch:** a newer push cancels the older run.
