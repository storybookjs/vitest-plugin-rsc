# The modules of Node.js, covered

What the server layers have of each module of Node.js, `vitest-plugin-rsc/node/<name>`: of the exports of Node's own module, how many are there, which throw when called, and which are not there. Written by `pnpm node-coverage` in packages/vitest-plugin-rsc, after `pnpm build`, on Node.js v24.18.0: a newer Node.js has more exports.

This is an inventory of the exports, read from their code: what is there may do less than Node's, as `dgram`'s socket sends nothing. The tests tell what works, as `node-web-apis.test.ts` does for `zlib` and `crypto`. Brotli and Zstandard in `zlib` are there where the browser's compression streams have them, and throw where not.

An export that throws is there so that code which imports it loads. It throws with what it is: `vitest-plugin-rsc: zlib.brotliCompressSync of Node.js is not there in the browser`, or unenv's `[unenv] crypto.createSign is not implemented yet!`.

Of 1358 exports: 1078 are there (79%), 172 throw (13%), 108 are not there (8%).

| Module                | Exports | There | Throw | Not there |
| --------------------- | ------: | ----: | ----: | --------: |
| `assert`              |      22 |    19 |     2 |         1 |
| `assert/strict`       |      22 |    19 |     2 |         1 |
| `buffer`              |      14 |    13 |     1 |         0 |
| `child_process`       |       8 |     0 |     8 |         0 |
| `cluster`             |      13 |     9 |     4 |         0 |
| `console`             |      25 |    24 |     1 |         0 |
| `constants`           |     230 |   228 |     0 |         2 |
| `crypto`              |      74 |    32 |    37 |         5 |
| `dgram`               |       2 |     2 |     0 |         0 |
| `diagnostics_channel` |       6 |     6 |     0 |         0 |
| `dns`                 |      50 |    32 |    17 |         1 |
| `dns/promises`        |      46 |    28 |    17 |         1 |
| `domain`              |       4 |     3 |     1 |         0 |
| `events`              |      17 |    15 |     0 |         2 |
| `fs`                  |     107 |   105 |     0 |         2 |
| `fs/promises`         |      33 |    32 |     0 |         1 |
| `http`                |      20 |    10 |     9 |         1 |
| `http2`               |      11 |     5 |     6 |         0 |
| `https`               |       6 |     2 |     4 |         0 |
| `inspector`           |       9 |     6 |     1 |         2 |
| `inspector/promises`  |       9 |     1 |     6 |         2 |
| `module`              |      21 |    12 |     8 |         1 |
| `net`                 |      15 |     7 |     8 |         0 |
| `os`                  |      23 |    22 |     1 |         0 |
| `path`                |      16 |    15 |     0 |         1 |
| `path/posix`          |      16 |    15 |     1 |         0 |
| `path/win32`          |      16 |    15 |     1 |         0 |
| `perf_hooks`          |      13 |    11 |     0 |         2 |
| `process`             |      65 |    64 |     0 |         1 |
| `punycode`            |       6 |     6 |     0 |         0 |
| `querystring`         |       7 |     7 |     0 |         0 |
| `readline`            |       8 |     8 |     0 |         0 |
| `readline/promises`   |       3 |     3 |     0 |         0 |
| `repl`                |       8 |     3 |     4 |         1 |
| `sqlite`              |       5 |     1 |     2 |         2 |
| `stream`              |      20 |    20 |     0 |         0 |
| `stream/consumers`    |       6 |     6 |     0 |         0 |
| `stream/promises`     |       2 |     2 |     0 |         0 |
| `stream/web`          |      17 |    17 |     0 |         0 |
| `string_decoder`      |       1 |     1 |     0 |         0 |
| `sys`                 |      31 |    20 |     8 |         3 |
| `timers`              |       7 |     7 |     0 |         0 |
| `timers/promises`     |       4 |     4 |     0 |         0 |
| `tls`                 |      18 |    11 |     5 |         2 |
| `trace_events`        |       2 |     2 |     0 |         0 |
| `tty`                 |       3 |     3 |     0 |         0 |
| `url`                 |      14 |    13 |     0 |         1 |
| `util`                |      31 |    20 |     8 |         3 |
| `util/types`          |      43 |    43 |     0 |         0 |
| `v8`                  |      23 |    20 |     0 |         3 |
| `vm`                  |      10 |     6 |     4 |         0 |
| `wasi`                |       1 |     0 |     1 |         0 |
| `worker_threads`      |      21 |    16 |     1 |         4 |
| `zlib`                |     154 |    87 |     4 |        63 |

## What throws and what is not there

- **`assert`** throws: `CallTracker`, `partialDeepStrictEqual`. Not there: `Assert`.
- **`assert/strict`** throws: `CallTracker`, `partialDeepStrictEqual`. Not there: `Assert`.
- **`buffer`** throws: `resolveObjectURL`.
- **`child_process`** throws: `ChildProcess`, `exec`, `execFile`, `execFileSync`, `execSync`, `fork`, `spawn`, `spawnSync`.
- **`cluster`** throws: `setupPrimary`, `setupMaster`, `fork`, `disconnect`.
- **`console`** throws: `assert`.
- **`constants`** Not there: `SIGINFO`, `O_SYMLINK`.
- **`crypto`** throws: `checkPrime`, `checkPrimeSync`, `createDiffieHellman`, `createDiffieHellmanGroup`, `createECDH`, `createPrivateKey`, `createPublicKey`, `createSign`, `createVerify`, `diffieHellman`, `generatePrime`, `generatePrimeSync`, `getCipherInfo`, `getCurves`, `getDiffieHellman`, `generateKeyPair`, `generateKeyPairSync`, `generateKey`, `generateKeySync`, `privateDecrypt`, `privateEncrypt`, `publicDecrypt`, `publicEncrypt`, `sign`, `setEngine`, `getFips`, `setFips`, `verify`, `Certificate`, `DiffieHellman`, `DiffieHellmanGroup`, `ECDH`, `Sign`, `Verify`, `X509Certificate`, `secureHeapUsed`, `pseudoRandomBytes`. Not there: `argon2`, `argon2Sync`, `randomUUIDv7`, `encapsulate`, `decapsulate`.
- **`dns`** throws: `lookup`, `lookupService`, `Resolver`, `resolve`, `resolve4`, `resolve6`, `resolveAny`, `resolveCaa`, `resolveCname`, `resolveMx`, `resolveNaptr`, `resolveNs`, `resolvePtr`, `resolveSoa`, `resolveSrv`, `resolveTxt`, `reverse`. Not there: `resolveTlsa`.
- **`dns/promises`** throws: `lookup`, `lookupService`, `Resolver`, `resolve`, `resolve4`, `resolve6`, `resolveAny`, `resolveCaa`, `resolveCname`, `resolveMx`, `resolveNaptr`, `resolveNs`, `resolvePtr`, `resolveSoa`, `resolveSrv`, `resolveTxt`, `reverse`. Not there: `resolveTlsa`.
- **`domain`** throws: `Domain`.
- **`events`** Not there: `kMaxEventTargetListeners`, `kMaxEventTargetListenersWarned`.
- **`fs`** Not there: `mkdtempDisposableSync`, `Utf8Stream`.
- **`fs/promises`** Not there: `mkdtempDisposable`.
- **`http`** throws: `ClientRequest`, `OutgoingMessage`, `Server`, `createServer`, `validateHeaderName`, `validateHeaderValue`, `get`, `request`, `setMaxIdleHTTPParsers`. Not there: `setGlobalProxyFromEnv`.
- **`http2`** throws: `connect`, `createServer`, `createSecureServer`, `performServerHandshake`, `Http2ServerRequest`, `Http2ServerResponse`.
- **`https`** throws: `Server`, `createServer`, `get`, `request`.
- **`inspector`** throws: `Session`. Not there: `NetworkResources`, `DOMStorage`.
- **`inspector/promises`** throws: `open`, `close`, `url`, `waitForDebugger`, `Session`, `Network`. Not there: `NetworkResources`, `DOMStorage`.
- **`module`** throws: `runMain`, `register`, `enableCompileCache`, `findPackageJSON`, `stripTypeScriptTypes`, `SourceMap`, `getSourceMapsSupport`, `setSourceMapsSupport`. Not there: `registerHooks`.
- **`net`** throws: `BlockList`, `connect`, `createConnection`, `createServer`, `getDefaultAutoSelectFamily`, `setDefaultAutoSelectFamily`, `getDefaultAutoSelectFamilyAttemptTimeout`, `setDefaultAutoSelectFamilyAttemptTimeout`.
- **`os`** throws: `setPriority`.
- **`path`** Not there: `matchesGlob`.
- **`path/posix`** throws: `matchesGlob`.
- **`path/win32`** throws: `matchesGlob`.
- **`perf_hooks`** Not there: `eventLoopUtilization`, `timerify`.
- **`process`** Not there: `domain`.
- **`repl`** throws: `start`, `writer`, `REPLServer`, `Recoverable`. Not there: `isValidSyntax`.
- **`sqlite`** throws: `DatabaseSync`, `StatementSync`. Not there: `Session`, `backup`.
- **`sys`** throws: `getCallSites`, `getSystemErrorMap`, `getSystemErrorName`, `getSystemErrorMessage`, `transferableAbortSignal`, `transferableAbortController`, `parseEnv`, `parseArgs`. Not there: `convertProcessSignalToExitCode`, `diff`, `setTraceSigInt`.
- **`tls`** throws: `getCiphers`, `convertALPNProtocols`, `checkServerIdentity`, `createSecureContext`, `Server`. Not there: `getCACertificates`, `setDefaultCACertificates`.
- **`url`** Not there: `fileURLToPathBuffer`.
- **`util`** throws: `getCallSites`, `getSystemErrorMap`, `getSystemErrorName`, `getSystemErrorMessage`, `transferableAbortSignal`, `transferableAbortController`, `parseEnv`, `parseArgs`. Not there: `convertProcessSignalToExitCode`, `diff`, `setTraceSigInt`.
- **`v8`** Not there: `getCppHeapStatistics`, `isStringOneByteRepresentation`, `startCpuProfile`.
- **`vm`** throws: `runInContext`, `runInNewContext`, `runInThisContext`, `compileFunction`.
- **`wasi`** throws: `WASI`.
- **`worker_threads`** throws: `postMessageToThread`. Not there: `threadName`, `parentPort`, `workerData`, `locks`.
- **`zlib`** throws: `brotliCompressSync`, `brotliDecompressSync`, `zstdCompressSync`, `zstdDecompressSync`. Not there: `ZSTD_DECOMPRESS`, `ZSTD_COMPRESS`, `ZSTD_e_continue`, `ZSTD_e_flush`, `ZSTD_e_end`, `ZSTD_fast`, `ZSTD_dfast`, `ZSTD_greedy`, `ZSTD_lazy`, `ZSTD_lazy2`, `ZSTD_btlazy2`, `ZSTD_btopt`, `ZSTD_btultra`, `ZSTD_btultra2`, `ZSTD_c_compressionLevel`, `ZSTD_c_windowLog`, `ZSTD_c_hashLog`, `ZSTD_c_chainLog`, `ZSTD_c_searchLog`, `ZSTD_c_minMatch`, `ZSTD_c_targetLength`, `ZSTD_c_strategy`, `ZSTD_c_enableLongDistanceMatching`, `ZSTD_c_ldmHashLog`, `ZSTD_c_ldmMinMatch`, `ZSTD_c_ldmBucketSizeLog`, `ZSTD_c_ldmHashRateLog`, `ZSTD_c_contentSizeFlag`, `ZSTD_c_checksumFlag`, `ZSTD_c_dictIDFlag`, `ZSTD_c_nbWorkers`, `ZSTD_c_jobSize`, `ZSTD_c_overlapLog`, `ZSTD_d_windowLogMax`, `ZSTD_CLEVEL_DEFAULT`, `ZSTD_error_no_error`, `ZSTD_error_GENERIC`, `ZSTD_error_prefix_unknown`, `ZSTD_error_version_unsupported`, `ZSTD_error_frameParameter_unsupported`, `ZSTD_error_frameParameter_windowTooLarge`, `ZSTD_error_corruption_detected`, `ZSTD_error_checksum_wrong`, `ZSTD_error_literals_headerWrong`, `ZSTD_error_dictionary_corrupted`, `ZSTD_error_dictionary_wrong`, `ZSTD_error_dictionaryCreation_failed`, `ZSTD_error_parameter_unsupported`, `ZSTD_error_parameter_combination_unsupported`, `ZSTD_error_parameter_outOfBound`, `ZSTD_error_tableLog_tooLarge`, `ZSTD_error_maxSymbolValue_tooLarge`, `ZSTD_error_maxSymbolValue_tooSmall`, `ZSTD_error_stabilityCondition_notRespected`, `ZSTD_error_stage_wrong`, `ZSTD_error_init_missing`, `ZSTD_error_memory_allocation`, `ZSTD_error_workSpace_tooSmall`, `ZSTD_error_dstSize_tooSmall`, `ZSTD_error_srcSize_wrong`, `ZSTD_error_dstBuffer_null`, `ZSTD_error_noForwardProgress_destFull`, `ZSTD_error_noForwardProgress_inputEmpty`.
