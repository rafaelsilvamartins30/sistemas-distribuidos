# Gitleaks baseline

`gitleaks-baseline.json` records three reviewed false positives already present in
the inherited `origin/develop` history:

- The deliberately malformed bearer token in `scripts/k8s-verify.sh` is used to
  verify that the RAG endpoint rejects invalid credentials.
- The service URL in `infra/k8s/05-keycloak.yaml` and the internal URL in
  `web-bff/test/server.test.mjs` are misclassified by the generic API-key rule.

The CI still scans the complete Git history. Only these exact fingerprints are
baselined; newly introduced findings continue to fail the scan. Remove entries
when their source false positives are removed, and review any baseline change.
