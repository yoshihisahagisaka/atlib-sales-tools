# Controlled Pilot deployment provenance contract v1

This contract is limited to deploy identity. It does not deploy, migrate, change Cloud resources, or assert Pilot GO.

## Required chain

`reviewed Git SHA -> Cloud Build ID -> runtime/migration OCI digest -> migration execution -> Cloud Run revision`

1. An operator runs `reviewed-source` from a clean checkout. It rejects local modifications and untracked files, requires `HEAD == _GIT_SHA`, then creates a `git archive` containing tracked content of that exact 40-character SHA.
2. `gcloud builds submit` receives that archive and the same `_GIT_SHA`. `cloudbuild.provenance.yaml` builds and publishes runtime and migration images to the existing `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy` repository. No trigger is required.
3. Both images carry `org.opencontainers.image.revision=<Git SHA>`. Artifact Registry resolves each image to an immutable `@sha256:` digest; image tags are human-readable aliases only.
4. The migration Job must use `<migration-image>@sha256:...`, with `sales_tools_staging_f4` and the externally configured `sales_tools_migration` identity. Credentials and role authority are never embedded in this repository.
5. A migration execution record must validate the matching SHA and record only the allowlisted execution metadata. A `FAIL` record blocks runtime deployment.
6. Only after migration `PASS`, the runtime deploy command may use `<runtime-image>@sha256:...`, the externally configured `sales_tools_runtime` identity, and the same Git SHA as a Cloud Run revision label. `record` validates the runtime chain before traffic changes.

The local archive creation result plus Cloud Build ID are required Evidence for source provenance. A submitted directory, a dirty checkout, or a tag-only deploy does not meet this contract.

## Local validation

```text
node scripts/deploy/provenance.cjs reviewed-source --git-sha=<40-char-sha> --output=<tracked-source.tar.gz>
gcloud builds submit <tracked-source.tar.gz> --config=cloudbuild.provenance.yaml --substitutions=_GIT_SHA=<same-sha>
node scripts/deploy/provenance.cjs record --repository=yoshihisahagisaka/atlib-sales-tools --git-sha=<sha> --cloud-build-id=<build-id> --oci-revision-label=<sha> --image-digest=<runtime-image@sha256:...> --cloud-run-revision=<revision> --cloud-run-revision-label=<sha> --timestamp=<ISO-8601> --deploy-actor=<actor>
```

The runtime record contains only repository, Git SHA, Cloud Build ID, OCI revision label, image digest, Cloud Run revision, timestamp, and deploy actor. The migration record contains only repository, Git SHA, Cloud Build ID, migration OCI revision, migration image digest, Job name, execution name, started/completed timestamps, actor, and result. Both reject Secret, password, customer, token, OAuth, and environment fields.

## External verification still required

After a future staging deploy, an authorized operator must verify the local archive result, Cloud Build ID, both OCI labels, both Artifact Registry digests, migration execution result, Cloud Run revision label, and sanitized records agree. This repository change does not establish any current deployment identity.
