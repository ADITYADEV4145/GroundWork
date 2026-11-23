# MCP schema size

Measured the 17 tool definitions in the actual MCP `tools/list` response on default configuration. This counts the compact JSON tools array (including names, descriptions, and input schemas; excluding the protocol envelope) with tiktoken 0.14.0, `cl100k_base`. It is not a provider billing estimate.

| Revision | Schema tokens |
| --- | ---: |
| Main (`0dbb82e`) | 2,986 |
| Compact descriptions | 2,444 |
| Difference | −542 (−18.2%) |

To reproduce, install the measurement-only dependency with `python3 -m pip install tiktoken==0.14.0`. On the baseline revision, place `scripts/measure-mcp-schemas.mjs` in the same path and run `node --import tsx scripts/measure-mcp-schemas.mjs --json > /path/to/baseline.json`. Then run `node --import tsx scripts/measure-mcp-schemas.mjs --compare /path/to/baseline.json` on the changed revision. The comparison also checks that the exported validation contracts are identical after excluding descriptions. No runtime dependency or tool arguments changed.
