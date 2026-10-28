# Reviewed exact CLI content profiles

The immutable reusable gate checks out BeanFit v0.4.0, commit
`a2f0b16d93d2b3db6316c3e10812686cd33a10f7`. The later locally qualified
caller is `f988d4f3ce9e94fb7fdf1beb30d5c3af36589e85` (version 0.7.0).
The October 22 model-catalog caller is `6d6637861f2565dd3f4da1ceb745f896bd8f2534` (version 0.8.0).
Its legacy desktop engine and stack generator are unchanged; its fixed expected
content differs only in the independently pinned engine version. Each profile
has its own full source SHA256 manifest and fixed expected
hardware, sanitized eight-row snapshot, engine version, and complete stack.
The original f988 fixtures remain byte-identical. These profiles describe
synthetic detector execution only; they do not qualify physical detection,
models, providers, hosted services, or unmodified caller behavior.

The v0.4.0 expectation was reviewed against that exact source, not captured
from executed payload, ranking, sanitization, or stack-generator output.
Its eight catalog rows, model memory inputs, coding quality values, stable
catalog order, and ranking arithmetic match the f988 profile. For the fixed
6 GiB model budget, only Qwen3 8B fits: 5.2 + 0.9 / 2 = 5.65 GiB,
reported as 5.7; 120 / 5.65 * 0.85 = 18.1 tokens/s to one decimal;
7 * 12 + 18.1 * 0.15 + 10 = 96.7 to one decimal. The fallback uncertainty
is 50%. Each other row exceeds the budget; qualities 9, 8, and 7 yield
scores 68, 56, and 44 (quality * 12 - 40), with stable catalog order
within ties. The sanitizer's absent numeric fields are explicitly null.
The legacy version is independently fixed at 0.4.0, rather than accepting
the caller's submitted version. The selected two surfaces and Qwen tag
are fixed inputs. The remaining 0.8 GiB KV budget affords 29,127 tokens,
so the prescribed context step is 16,384. Every stack title, detail,
command string, file name, and config byte is fixed in each expected JSON;
commands are compared as strings and are never executed.

Selection compares the entire package source inventory and every digest
before importing BeanFit or contacting the local app. Added, missing,
changed, mixed-profile, and symlinked source files refuse. Python-generated
`__pycache__` is excluded from source inventory; the CLI receives a fresh
empty bytecode-cache prefix so existing bytecode cannot override reviewed
source. Unknown versions require an explicitly reviewed new profile.
No workflow, reusable gate, manifest, or caller revision pin is changed.

## October 23 catalog release source

`cli-content-caller-v0.8.1.json` binds the reviewed 30-file package for the focused
catalog release. Compared with the released v0.8.0 package, only canonical catalog
JSON and `__init__.py` source identity change. Hardware estimates, ranking,
launch/stack templates and pairing payload generation remain byte-identical.

`cli-content-expected-v0.8.1.json` copies the independently authored v0.8.0 content
expectation and changes only `engine_version` from 0.8.0 to 0.8.1. All ranking,
stack, hardware and payload values are preserved. Expected content is never
produced from the product under test. Older released caller/expected fixtures
remain byte-identical. The interim unshipped local catalog profile is superseded
by this explicit release package rather than accepted as another fallback.

## October 28 published Mac choices

The v0.9.0 caller pins commit `09213c5f0c829b717de7e76b1e2b211e36349fe9` with the complete 30-file
package manifest. Changes are source identity, catalog metadata, Mac suggestion
dispatch, and explanatory comments. The legacy fit engine, quality scores,
hardware detector, pairing generator and stack templates are unchanged. The
independently authored expectation changes only `engine_version` from 0.8.1 to
0.9.0. Existing profiles remain unchanged. New Mac route checks compare its
metadata and holds with this canonical catalog; no model inference is run.
