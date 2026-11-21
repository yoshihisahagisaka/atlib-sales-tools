#!/usr/bin/env bash
# Read-only inventory of the already-built candidate runtime.
# Does not build, scan, deploy, install, remove, access a DB or expose credentials.
set -Eeuo pipefail
IMAGE='asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging@sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e'

echo '=== Pinned image inventory (no modifications) ==='
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet >/dev/null 2>&1
  docker pull "$IMAGE" >/dev/null
fi

docker run --rm --network none --read-only \
  --entrypoint /bin/sh "$IMAGE" -eu -c '
echo "=== Runtime identity ==="
id
echo "=== Relevant installed Debian packages ==="
for p in xvfb xserver-common libxfont2 libfontenc1 cups cups-daemon libcups2t64 krb5-kdc krb5-admin-server libkrb5-3 perl perl-base libexpat1 libssl3t64 libacl1 acl libattr1 attr; do
  state="$(dpkg-query -W -f="\${Status}" "$p" 2>/dev/null || true)"
  if [ "$state" = "install ok installed" ]; then
    dpkg-query -W -f="\${binary:Package} \${Version} \${Status}\n" "$p"
  else
    printf "%s: not installed\n" "$p"
  fi
done
echo "=== Relevant executable presence (not evidence of a running service) ==="
for bin in /usr/bin/Xvfb /usr/sbin/cupsd /usr/sbin/kadmind /usr/sbin/krb5kdc /usr/bin/perl /usr/bin/getfattr /usr/bin/setfattr /usr/bin/getfacl /usr/bin/setfacl; do
  if test -x "$bin"; then
    printf "PRESENT %s\n" "$bin"
  else
    printf "ABSENT  %s\n" "$bin"
  fi
done
echo "=== Headless shell installed ==="
find /ms-playwright -maxdepth 7 -type f \( -name headless_shell -o -name chrome-headless-shell \) -print
'
echo '=== READ-ONLY INVENTORY COMPLETE ==='
