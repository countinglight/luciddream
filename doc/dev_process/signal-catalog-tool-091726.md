# Signal catalog maintenance — 2026-09-17

Date: 2026-09-17

Implemented `scripts/sync-signals.js`, exposed as `npm run sync:signals`, on
`vlads-dev` in the clone whose origin is `github.com/countinglight/luciddream`.
The tool uses FFprobe to inspect audio, offers opt-in FFmpeg conversion, preserves
original audio, reconciles the signal catalog, and checks published script signal
references. Existing edited names are retained, including a unique replacement
with the same filename stem and a different extension. New names include the
filename extension. Ambiguous replacements are not guessed. External URLs are
retained with an explicit unverified message.

Usage, options, conversion behavior, and the corrected standalone FFmpeg command
are documented in `BUILD.md`. `scripts/README.md` indexes every utility in that
directory, including the focused test runner. The command error reported in chat
was caused by a second bare `ffmpeg` token after the executable, which FFmpeg
interpreted as an output filename.

Ran the utility without transcoding against the working catalog. It removed the
missing `galchirp` entry, redirected `sleepbreath` from the removed MP3 to the new
M4A, and added the ten new M4A files. The MP3 removals and new audio were existing
owner changes; this task did not modify those audio files. FFprobe reports the
converted breathing file as AAC-LC, mono, 24 kHz, approximately 74 kbps. The ten
other M4As are AAC-LC, mono, 48 kHz, approximately 128 kbps.

The audit originally reported malformed mappings at line 18 in both
`site/content/scripts/pre_sleep_clusters.yaml` and
`site/content/scripts/rem_sleep_clusters.yaml`. Both now use the valid detailed
form `{ signal: chime, wait: true }`.

The mandatory `npm check` path has no FFmpeg dependency. `check:content` checks
manifest/file correspondence, file-size limits, and references without decoding
audio. A Jest integrity test parses every published script with the production
parser and verifies its signal references against bundled and catalog signals.
`check:audio` is the optional FFprobe-backed encoding audit. The catalog tool's
lightweight reference scan is not a replacement for the parser test and does not
synchronize the manifest's script entries.

Validation includes ten focused tool tests: nine pass without FFmpeg and the real
conversion test is skipped when its two executable environment variables are
absent. A separate run with those variables set passed real FFmpeg conversion,
source preservation, overwrite protection, replacement alias retention,
read-only audit behavior, URL encoding, malformed/cyclic YAML, nested orphan
references, idempotence, and preventing manifest writes after invalid audio.
The conversion test uses a generated temporary WAV, not catalog audio.

The complete dependency-free `npm run check` passed: formatting, line endings,
lint, typechecking, catalog integrity, focused tool tests, and all 43 Jest suites
(352 tests). The optional FFprobe-backed `check:audio` also passed for all eleven
catalog signals. The work was committed locally on `vlads-dev` in separate
content and tooling commits. No push, deployment, or device playback was
performed.

The mandatory-check integration also exposed that `check-line-endings.js`
attempted to read tracked files pending deletion. It now skips missing paths, so
replacing catalog audio does not crash `npm check` before content validation.
