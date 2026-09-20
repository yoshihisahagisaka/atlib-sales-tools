# Controlled Pilot deployment provenance contract v1

This contract is limited to deploy identity. It does not deploy, migrate, change Cloud resources, or assert Pilot GO.

## Required chain

`Git SHA → Cloud Build ID → OCI image digest → Cloud Run revision`

1. A Cloud Build trigger resolves a Git commit and supplies its 40-character `COMMIT_SHA`.
2. `cloudbuild.provenance.yaml` rejects an absent/invalid predefined `COMMIT_SHA` and supplies it as `SOURCE_REVISION` to the Docker build. Cloud Build source archives do not necessarily contain `.git`; therefore the deploy gate must compare Cloud Build `sourceProvenance.resolvedRepoSource.commitSha` to this same SHA before deployment.
3. The runtime image carries `org.opencontainers.image.revision=<Git SHA>`.
4. Artifact Registry resolves the image to an immutable `@sha256:` digest.
5. The deploy command must use that digest, not an image tag, and set the same SHA as the Cloud Run revision label.
6. Before traffic changes, `scripts/deploy/provenance.cjs record` validates all three SHA values and emits the sanitized deployment record.

The Cloud Build trigger must use Git-connected source and its resolved source provenance must equal `COMMIT_SHA`. A source archive without resolved repository/commit evidence does not meet this contract.

## Local validation

```text
node scripts/deploy/provenance.cjs build-contract --repository=yoshihisahagisaka/atlib-sales-tools --git-sha=<40-char-sha> --source-commit=<same-sha>
node scripts/deploy/provenance.cjs record --repository=yoshihisahagisaka/atlib-sales-tools --git-sha=<sha> --cloud-build-id=<build-id> --oci-revision-label=<sha> --image-digest=<image@sha256:...> --cloud-run-revision=<revision> --cloud-run-revision-label=<sha> --timestamp=<ISO-8601> --deploy-actor=<actor>
```

The record contains only repository, Git SHA, Cloud Build ID, OCI revision label, image digest, Cloud Run revision, timestamp, and deploy actor. It rejects Secret, password, customer, token, OAuth, and environment fields.

## External verification still required

After a future staging deploy, an authorized operator must verify the Cloud Build source provenance, OCI label, Artifact Registry digest, Cloud Run revision label, and the sanitized record agree. This repository change does not establish any current deployment identity.
