# Model suggestions release review — October 23

The owner authorized review, merge and deployment while physical phone
qualification continues. The companion source advances to 0.6.2, paired with
the focused BeanFit 0.8.1 catalog package rather than the full native pilot branch.
Qwen3.5 2B is first for short English text comparison; failed LFM1.2B text remains
held. Every candidate is unqualified, memory fit unknown and selection empty.
A larger allowance or synthetic receipt cannot bypass the known-failure gate.

The canonical update merged in BeanFit PR #6 at
`c47952b81e6b6013be78b7406510d74b0eebaddd`. The generated catalog must match
canonical JSON byte-for-byte after formatting.
The exact 30-file CLI profile and independent content fixture are
`cli-content-caller-v0.8.1.json` and `cli-content-expected-v0.8.1.json`. Compared
with the released v0.8.0 caller, only catalog JSON and source identity change.
The new content expectation changes only declared engine_version to 0.8.1;
all hardware, ranking, stack and payload arithmetic remain unchanged. Historical
released fixtures are retained. No product-generated expectation is used.

Regression coverage includes held-configuration precedence, first comparison
candidate, no automatic qualification, invalid inputs and readable labels.
Full exact-source local Worker/D1/CLI HTTP acceptance and canonical QA are
required before merge. No auth/identity, retention, scheduler, migration,
production database catalog, or rate-limit change is included. On-device catalog
data is embedded in the Worker; routine deployment needs no database sync.

Historical phone failure/resource evidence accompanies the canonical catalog
release. The summary identifies reply drafting as an unreleased native pilot.
Final native quality, memory and sustained heat acceptance remains open, and
voice/search stay deferred. No native generation code or app binary is deployed
by this change. Dirty primary work and the full native branch are preserved.

Implementer structural/corroborative/adversarial review, not independent sign-off.
No blocking source finding remains. Readability: 3/4; public suggestions retain
the trial status and held reason without promising a best model for all devices.
Final release and deployment identities belong in their published notes/receipt.
