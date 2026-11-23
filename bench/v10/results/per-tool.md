# v10 per-tool breakdown

Raw captured actions; MCP split by tool name. First/later refers to position within each task, not a conversation turn. The rejected official LH action remains its own invalid-wrapper:outline bucket, counted once with its bytes/time; it is not an executed shell or product MCP call. All arms have16 sessions. First+later counts/bytes/durations reconcile to all.

## nav — baseline

| Tool | Position | Calls | Calls/session | Mean ms | Median ms | Tool ms/session | Bytes total | Bytes/session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| read | all | 418 | 26.12 | 0.42 | 0.31 | 11.05 | 278254 | 17,390.88 |
| read | first | 166 | 10.38 | 0.50 | 0.30 | 5.15 | 53259 | 3,328.69 |
| read | later | 252 | 15.75 | 0.37 | 0.31 | 5.90 | 224995 | 14,062.19 |
| shell | all | 496 | 31.00 | 42.08 | 8.02 | 1,304.63 | 240172 | 15,010.75 |
| shell | first | 314 | 19.62 | 17.11 | 7.58 | 335.70 | 168709 | 10,544.31 |
| shell | later | 182 | 11.38 | 85.18 | 10.26 | 968.93 | 71463 | 4,466.44 |

## nav — official GW

| Tool | Position | Calls | Calls/session | Mean ms | Median ms | Tool ms/session | Bytes total | Bytes/session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcp:callees | all | 1 | 0.06 | 68.04 | 68.04 | 4.25 | 178 | 11.12 |
| mcp:callees | later | 1 | 0.06 | 68.04 | 68.04 | 4.25 | 178 | 11.12 |
| mcp:callers | all | 22 | 1.38 | 209.26 | 99.98 | 287.73 | 3190 | 199.38 |
| mcp:callers | later | 22 | 1.38 | 209.26 | 99.98 | 287.73 | 3190 | 199.38 |
| mcp:find_code | all | 255 | 15.94 | 282.63 | 184.79 | 4,504.46 | 330787 | 20,674.19 |
| mcp:find_code | first | 232 | 14.50 | 294.67 | 188.55 | 4,272.78 | 298978 | 18,686.12 |
| mcp:find_code | later | 23 | 1.44 | 161.17 | 151.93 | 231.68 | 31809 | 1,988.06 |
| mcp:outline | all | 32 | 2.00 | 81.80 | 78.41 | 163.60 | 26844 | 1,677.75 |
| mcp:outline | first | 7 | 0.44 | 75.99 | 73.81 | 33.25 | 4156 | 259.75 |
| mcp:outline | later | 25 | 1.56 | 83.43 | 80.04 | 130.36 | 22688 | 1,418.00 |
| mcp:read_symbol | all | 38 | 2.38 | 93.90 | 90.18 | 223.02 | 16047 | 1,002.94 |
| mcp:read_symbol | first | 21 | 1.31 | 97.66 | 90.97 | 128.18 | 9266 | 579.12 |
| mcp:read_symbol | later | 17 | 1.06 | 89.26 | 88.11 | 94.84 | 6781 | 423.81 |
| mcp:repo_map | all | 3 | 0.19 | 100.36 | 97.35 | 18.82 | 168 | 10.50 |
| mcp:repo_map | first | 3 | 0.19 | 100.36 | 97.35 | 18.82 | 168 | 10.50 |
| read | all | 161 | 10.06 | 116.74 | 102.08 | 1,174.73 | 63446 | 3,965.38 |
| read | first | 103 | 6.44 | 119.47 | 106.50 | 769.07 | 40051 | 2,503.19 |
| read | later | 58 | 3.62 | 111.91 | 99.38 | 405.66 | 23395 | 1,462.19 |
| shell | all | 293 | 18.31 | 58.38 | 9.71 | 1,069.16 | 87791 | 5,486.94 |
| shell | first | 114 | 7.12 | 10.20 | 7.60 | 72.67 | 25652 | 1,603.25 |
| shell | later | 179 | 11.19 | 89.07 | 107.69 | 996.50 | 62139 | 3,883.69 |

## nav — disclosed deviation GW

| Tool | Position | Calls | Calls/session | Mean ms | Median ms | Tool ms/session | Bytes total | Bytes/session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcp:callers | all | 12 | 0.75 | 85.86 | 82.19 | 64.40 | 1904 | 119.00 |
| mcp:callers | later | 12 | 0.75 | 85.86 | 82.19 | 64.40 | 1904 | 119.00 |
| mcp:find_code | all | 267 | 16.69 | 268.12 | 177.23 | 4,474.27 | 315047 | 19,690.44 |
| mcp:find_code | first | 251 | 15.69 | 274.13 | 178.19 | 4,300.38 | 304415 | 19,025.94 |
| mcp:find_code | later | 16 | 1.00 | 173.89 | 158.25 | 173.89 | 10632 | 664.50 |
| mcp:outline | all | 55 | 3.44 | 89.55 | 87.05 | 307.83 | 40963 | 2,560.19 |
| mcp:outline | first | 14 | 0.88 | 96.77 | 88.09 | 84.67 | 9070 | 566.88 |
| mcp:outline | later | 41 | 2.56 | 87.09 | 86.60 | 223.16 | 31893 | 1,993.31 |
| mcp:read_symbol | all | 114 | 7.12 | 89.91 | 85.48 | 640.58 | 88922 | 5,557.62 |
| mcp:read_symbol | first | 39 | 2.44 | 89.46 | 83.76 | 218.06 | 14693 | 918.31 |
| mcp:read_symbol | later | 75 | 4.69 | 90.14 | 87.32 | 422.52 | 74229 | 4,639.31 |
| mcp:read_symbols | all | 3 | 0.19 | 0.18 | 0.16 | 0.03 | 300 | 18.75 |
| mcp:read_symbols | first | 2 | 0.12 | 0.19 | 0.19 | 0.02 | 200 | 12.50 |
| mcp:read_symbols | later | 1 | 0.06 | 0.16 | 0.16 | 0.01 | 100 | 6.25 |
| mcp:repo_map | all | 7 | 0.44 | 107.10 | 106.63 | 46.86 | 399 | 24.94 |
| mcp:repo_map | first | 7 | 0.44 | 107.10 | 106.63 | 46.86 | 399 | 24.94 |
| read | all | 104 | 6.50 | 114.23 | 111.80 | 742.48 | 42941 | 2,683.81 |
| read | first | 66 | 4.12 | 115.05 | 112.49 | 474.58 | 26517 | 1,657.31 |
| read | later | 38 | 2.38 | 112.80 | 104.67 | 267.89 | 16424 | 1,026.50 |
| shell | all | 280 | 17.50 | 60.09 | 8.56 | 1,051.63 | 84686 | 5,292.88 |
| shell | first | 101 | 6.31 | 20.07 | 7.16 | 126.71 | 23393 | 1,462.06 |
| shell | later | 179 | 11.19 | 82.67 | 20.68 | 924.91 | 61293 | 3,830.81 |

## long-horizon — baseline

| Tool | Position | Calls | Calls/session | Mean ms | Median ms | Tool ms/session | Bytes total | Bytes/session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| read | all | 63 | 3.94 | 0.31 | 0.28 | 1.23 | 21887 | 1,367.94 |
| read | first | 4 | 0.25 | 0.37 | 0.31 | 0.09 | 1632 | 102.00 |
| read | later | 59 | 3.69 | 0.31 | 0.28 | 1.14 | 20255 | 1,265.94 |
| shell | all | 216 | 13.50 | 37.40 | 31.51 | 504.94 | 60512 | 3,782.00 |
| shell | first | 156 | 9.75 | 31.89 | 30.81 | 310.96 | 39997 | 2,499.81 |
| shell | later | 60 | 3.75 | 51.73 | 34.71 | 193.98 | 20515 | 1,282.19 |

## long-horizon — EXPLORATORY official GW

| Tool | Position | Calls | Calls/session | Mean ms | Median ms | Tool ms/session | Bytes total | Bytes/session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| invalid-wrapper:outline | all | 1 | 0.06 | 0.08 | 0.08 | 0.00 | 30 | 1.88 |
| invalid-wrapper:outline | first | 1 | 0.06 | 0.08 | 0.08 | 0.00 | 30 | 1.88 |
| mcp:find_similar | all | 10 | 0.62 | 161.98 | 131.57 | 101.24 | 120 | 7.50 |
| mcp:find_similar | first | 7 | 0.44 | 136.97 | 119.99 | 59.92 | 84 | 5.25 |
| mcp:find_similar | later | 3 | 0.19 | 220.33 | 163.74 | 41.31 | 36 | 2.25 |
| mcp:outline | all | 21 | 1.31 | 232.58 | 249.47 | 305.26 | 11643 | 727.69 |
| mcp:outline | first | 3 | 0.19 | 163.86 | 111.06 | 30.72 | 1551 | 96.94 |
| mcp:outline | later | 18 | 1.12 | 244.04 | 277.70 | 274.54 | 10092 | 630.75 |
| mcp:read_symbol | all | 22 | 1.38 | 164.17 | 91.52 | 225.74 | 35168 | 2,198.00 |
| mcp:read_symbol | first | 6 | 0.38 | 101.64 | 101.03 | 38.11 | 1608 | 100.50 |
| mcp:read_symbol | later | 16 | 1.00 | 187.62 | 86.17 | 187.62 | 33560 | 2,097.50 |
| mcp:repo_map | all | 8 | 0.50 | 304.09 | 284.99 | 152.05 | 768 | 48.00 |
| mcp:repo_map | first | 8 | 0.50 | 304.09 | 284.99 | 152.05 | 768 | 48.00 |
| mcp:verify_calls | all | 1 | 0.06 | 131.45 | 131.45 | 8.22 | 3 | 0.19 |
| mcp:verify_calls | later | 1 | 0.06 | 131.45 | 131.45 | 8.22 | 3 | 0.19 |
| read | all | 3 | 0.19 | 131.66 | 114.82 | 24.69 | 360 | 22.50 |
| read | later | 3 | 0.19 | 131.66 | 114.82 | 24.69 | 360 | 22.50 |
| shell | all | 213 | 13.31 | 36.60 | 32.78 | 487.27 | 52677 | 3,292.31 |
| shell | first | 135 | 8.44 | 33.45 | 32.78 | 282.26 | 29985 | 1,874.06 |
| shell | later | 78 | 4.88 | 42.05 | 33.64 | 205.01 | 22692 | 1,418.25 |

## long-horizon — disclosed deviation GW

| Tool | Position | Calls | Calls/session | Mean ms | Median ms | Tool ms/session | Bytes total | Bytes/session |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mcp:find_similar | all | 8 | 0.50 | 98.62 | 97.23 | 49.31 | 96 | 6.00 |
| mcp:find_similar | first | 2 | 0.12 | 112.59 | 112.59 | 14.07 | 24 | 1.50 |
| mcp:find_similar | later | 6 | 0.38 | 93.97 | 91.45 | 35.24 | 72 | 4.50 |
| mcp:outline | all | 22 | 1.38 | 172.10 | 87.01 | 236.64 | 14028 | 876.75 |
| mcp:outline | first | 6 | 0.38 | 82.35 | 82.89 | 30.88 | 2728 | 170.50 |
| mcp:outline | later | 16 | 1.00 | 205.76 | 165.11 | 205.76 | 11300 | 706.25 |
| mcp:read_symbol | all | 24 | 1.50 | 165.74 | 86.45 | 248.61 | 34527 | 2,157.94 |
| mcp:read_symbol | first | 8 | 0.50 | 109.56 | 86.45 | 54.78 | 2592 | 162.00 |
| mcp:read_symbol | later | 16 | 1.00 | 193.82 | 85.85 | 193.82 | 31935 | 1,995.94 |
| mcp:repo_map | all | 9 | 0.56 | 349.66 | 324.13 | 196.68 | 864 | 54.00 |
| mcp:repo_map | first | 8 | 0.50 | 363.25 | 325.84 | 181.63 | 768 | 48.00 |
| mcp:repo_map | later | 1 | 0.06 | 240.89 | 240.89 | 15.06 | 96 | 6.00 |
| read | all | 6 | 0.38 | 127.54 | 128.30 | 47.83 | 876 | 54.75 |
| read | first | 1 | 0.06 | 95.37 | 95.37 | 5.96 | 170 | 10.62 |
| read | later | 5 | 0.31 | 133.98 | 128.67 | 41.87 | 706 | 44.12 |
| shell | all | 208 | 13.00 | 35.63 | 32.97 | 463.17 | 50941 | 3,183.81 |
| shell | first | 135 | 8.44 | 33.16 | 33.30 | 279.80 | 27853 | 1,740.81 |
| shell | later | 73 | 4.56 | 40.19 | 32.45 | 183.37 | 23088 | 1,443.00 |

