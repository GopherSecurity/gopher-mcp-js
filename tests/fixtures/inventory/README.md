# Inventory conformance fixture

This is a vendored copy of
`gopher-orch/tests/fixtures/inventory/conformance.json` from native commit
`77f1c801fa905b73c1066de8d0e67b067a6abcdd` (`v0.1.44`).

SHA-256: `b2eef21407a47309cac30eef74813c2fa62c8e81c5e06a363b0fa9955ac4e1a5`.

JS unit tests use this local copy so clean checkouts and pull requests do not
need credentials for the private native repository. When intentionally updating
the inventory contract, compare the pinned native fixture, copy it here, update
this provenance, and review the JS-specific security tests separately. Do not
silently replace the fixture from a moving branch during CI.
