# Tokens per lookup: GroundWork vs grep-and-read

Retrieval token cost only. This does not measure whether the returned symbols answer the query, task success, or speed. See README.md for the method and limits.

GroundWork commit `6d2c8dd5c55c8a53f40664e1643855e000fc803a`; v24.22.2; linux x64; tokenizer `cl100k_base`; embeddings not installed.

| | Value |
| --- | ---: |
| Lookups | 15 |
| Lookups that returned 3 symbols | 15 |
| **Mean reduction per lookup vs grep-top-3** | **97.2%** |
| Reduction vs grep-top-3, pooled totals | 98.5% |
| Reduction vs read-all, pooled totals | 99.8% |
| Mean reduction vs grep if only the first read_symbol page is counted | 97.2% |
| GroundWork tokens, total | 10,186 |
| Grep-top-3 tokens, total | 669,637 |
| Mean GroundWork tool calls per lookup | 4.0 |
| Symbols fetched | 45 |
| Fetched symbols in test, example, docs, benchmark or script paths | 19 |
| Fetched symbols of three lines or fewer | 10 |
| Fetched symbols whose source could not be read in full | 0 |

## expressjs/express

Commit `1faf228935aa0a13111f92c28ee795be64ce3f0f`; 152 files indexed (javascript 152), 0 skipped; 328 symbols; read-all 147,433 tokens; index built in 473 ms.

| Query | Grep-top-3 tokens | GroundWork tokens | Search | Fetch | Symbols | Tool calls | Reduction vs grep |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `router route handler` | 9,887 | 1,061 | 164 | 897 | 3 | 4 | 89.3% |
| `middleware` | 11,777 | 360 | 157 | 203 | 3 | 4 | 96.9% |
| `error exception` | 18,890 | 384 | 161 | 223 | 3 | 4 | 98.0% |
| `request response` | 21,599 | 751 | 158 | 593 | 3 | 4 | 96.5% |
| `param bind` | 12,954 | 646 | 152 | 494 | 3 | 4 | 95.0% |

<details><summary>Symbols fetched per query</summary>

- `router route handler`: `router (function)` lib/router/index.js (3 lines); `next (function)` lib/router/index.js (115 lines); `next (function)` lib/router/route.js (33 lines)
- `middleware`: `removedMiddlewares (variable)` lib/express.js (19 lines); `n (variable)` benchmarks/middleware.js (1 lines); `app (variable)` benchmarks/middleware.js (1 lines)
- `error exception`: `error (function)` examples/error/index.js (8 lines); `error (function)` examples/web-service/index.js (5 lines); `parseError (function)` test/express.json.js (7 lines)
- `request response`: `createApplication (function)` lib/express.js (21 lines); `init (function)` lib/middleware/init.js (15 lines); `testRequestedRedirect (function)` test/res.location.js (30 lines)
- `param bind`: `param (function)` lib/router/index.js (38 lines); `paramCallback (function)` lib/router/index.js (21 lines); `decode_param (function)` lib/router/layer.js (16 lines)

</details>

## fastapi/fastapi

Commit `a64dfbbd21a445288ff583d58e1f646fe6baf3af`; 1,131 files indexed (javascript 4, python 1127), 0 skipped; 6,776 symbols; read-all 722,999 tokens; index built in 2,364 ms.

| Query | Grep-top-3 tokens | GroundWork tokens | Search | Fetch | Symbols | Tool calls | Reduction vs grep |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `router route handler` | 97,475 | 551 | 242 | 309 | 3 | 4 | 99.4% |
| `middleware` | 36,563 | 695 | 187 | 508 | 3 | 4 | 98.1% |
| `error exception` | 100,927 | 339 | 178 | 161 | 3 | 4 | 99.7% |
| `request response` | 130,283 | 1,291 | 196 | 1,095 | 3 | 4 | 99.0% |
| `param bind` | 68,030 | 1,271 | 177 | 1,094 | 3 | 4 | 98.1% |

<details><summary>Symbols fetched per query</summary>

- `router route handler`: `GzipRoute.get_route_handler.custom_route_handler (function)` docs_src/custom_request_and_route/tutorial001_an_py310.py (3 lines); `GzipRoute.get_route_handler (method)` docs_src/custom_request_and_route/tutorial001_py310.py (8 lines); `ValidationErrorLoggingRoute.get_route_handler.custom_route_handler (function)` docs_src/custom_request_and_route/tutorial002_an_py310.py (7 lines)
- `middleware`: `FastAPI.middleware (method)` fastapi/applications.py (45 lines); `middleware (function)` tests/test_dependency_contextmanager.py (5 lines); `websocket_middleware.middleware_constructor (function)` tests/test_ws_router.py (13 lines)
- `error exception`: `ValidationException.errors (method)` fastapi/exceptions.py (2 lines); `Error (class)` tests/test_additional_responses_response_class.py (3 lines); `Error (class)` tests/test_response_class_no_mediatype.py (3 lines)
- `request response`: `request_response (function)` fastapi/routing.py (40 lines); `_FrontendStaticFiles.get_response (method)` fastapi/routing.py (27 lines); `get_graphql_response (function)` scripts/notify_translations.py (39 lines)
- `param bind`: `Param (class)` fastapi/params.py (109 lines); `ParamTypes (class)` fastapi/params.py (5 lines); `FilterParams (class)` docs_src/query_param_models/tutorial002_py310.py (7 lines)

</details>

## gin-gonic/gin

Commit `75ccf94d605a05fe24817fc2f166f6f2959d5cea`; 92 files indexed (go 92), 1 skipped; 1,313 symbols; read-all 153,060 tokens; index built in 588 ms.

| Query | Grep-top-3 tokens | GroundWork tokens | Search | Fetch | Symbols | Tool calls | Reduction vs grep |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `router route handler` | 18,789 | 588 | 238 | 350 | 3 | 4 | 96.9% |
| `middleware` | 13,190 | 789 | 160 | 629 | 3 | 4 | 94.0% |
| `error exception` | 44,023 | 406 | 212 | 194 | 3 | 4 | 99.1% |
| `request response` | 39,916 | 635 | 213 | 422 | 3 | 4 | 98.4% |
| `param bind` | 45,334 | 419 | 228 | 191 | 3 | 4 | 99.1% |

<details><summary>Symbols fetched per query</summary>

- `router route handler`: `IRoutes (interface)` routergroup.go (19 lines); `RouterGroup.PATCH (method)` routergroup.go (3 lines); `RouterGroup.PUT (method)` routergroup.go (3 lines)
- `middleware`: `TestMiddlewareAbort (function)` middleware_test.go (25 lines); `TestMiddlewareWrite (function)` middleware_test.go (25 lines); `TestBindMiddleware (function)` utils_test.go (21 lines)
- `error exception`: `Error.Error (method)` errors.go (3 lines); `Error (class)` errors.go (5 lines); `errorMsgs.Errors (method)` errors.go (10 lines)
- `request response`: `ResponseWriter (interface)` response_writer.go (25 lines); `Redirect.Render (method)` render/redirect.go (7 lines); `TestResponseWriterFlush (function)` response_writer_test.go (15 lines)
- `param bind`: `BindUnmarshaler (interface)` binding/form_mapping.go (4 lines); `BindingUri (interface)` binding/binding.go (4 lines); `BindingUri (interface)` binding/binding_nomsgpack.go (4 lines)

</details>
