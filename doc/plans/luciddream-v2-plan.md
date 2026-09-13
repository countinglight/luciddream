# LucidDream v2 - Plan

Status: **planning draft, 2026-09-13.** Supersedes the previous version of this file. The native
runtime architecture that was chapter 1 now lives in [luciddream-v3-plan.md](luciddream-v3-plan.md);
v2 runs on the existing React Native / TypeScript stack, hardened.

Sources: the v1 specification ([luciddream-v1-spec.md](luciddream-v1-spec.md)), the research and
product vision ([luciddream-research-and-product-vision.md](luciddream-research-and-product-vision.md)),
the competitive review ([luciddream-competitive-research.md](luciddream-competitive-research.md)),
the v1 redesign note ([luciddream-v1-redesign.md](luciddream-v1-redesign.md)), GitHub issues
[#3](https://github.com/countinglight/luciddream/issues/3),
[#4](https://github.com/countinglight/luciddream/issues/4),
[#5](https://github.com/countinglight/luciddream/issues/5) and
[#6](https://github.com/countinglight/luciddream/issues/6), customer feedback relayed by the owner,
and the planning session of 2026-09-13.

---

## 1. Vision

### 1.1 In one sentence

**v1 played and recorded. v2 listens and learns.**

v1 proved that an exactly specified stimulus can be delivered through the night and faithfully
logged. v2 adds the other half of the experiment: what the sleeper did, said and felt, captured
without effort, understood on a large screen, and turned into a better next night.

### 1.2 Scenario vision

A person who wants to explore lucid dreaming sets up a night in under a minute on the phone. The
sounds are soft by default; nothing the app plays will jolt them awake. A spare phone on the
nightstand records the room. The LucidDream phone plays its cues, writes down everything it did and
everything it could sense, and keeps going until morning even if the OS gets in the way.

On waking, they speak whatever they remember into the room, then answer three questions on the phone.
Later, on a laptop, they open the night: the cues, the sleep data from their watch, the movement and
sound the phone sensed, and the recording, all on one timeline. Their spoken report is transcribed
and kept next to the original audio. The tool points at moments: *this cue was followed by movement;
this one by nothing; here you spoke for forty seconds.*

After a few weeks the tool has something to say: *your reports are longer on nights with the bowl
cue than the hum; the third cue of the night usually wakes you.* It proposes one change, explains its
evidence, and asks. If they agree, the adjusted script is on the phone for tonight. Nothing was
decided for them, and nothing they recorded left their own machines unless they chose to send an
excerpt to an AI provider for transcription.

### 1.3 Architectural vision

Three components, one contract between them.

```
+-------------------+      night bundle       +------------------------------+
|  LucidDream phone | ----------------------> |  Host service                |
|  night session    |   (log, observations,   |  local now, hosted later     |
|  device           |    wearable history,    |  aligns, analyses, proposes  |
|                   | <---------------------- |                              |
+-------------------+   script proposals      +------------------------------+
                                                       ^
+-------------------+      audio recording              |
|  Any recorder     | ---------------------------------+
|  (spare phone,    |
|   laptop, ...)    |
+-------------------+
```

- **The phone is the night session device.** It prepares, plays, senses, logs and exports. It does
  not record the room and it does not analyse. It runs the existing TypeScript engine, hardened.
- **The recorder is any device the user already owns.** LucidDream ships no recorder in v2.
- **The host is a service that happens to run on the user's own machine.** Local server, browser
  UI, no accounts. It is built so that moving to a hosted service later is a deployment decision,
  not a rewrite. Whether that move happens is deferred to user feedback.
- **The night bundle is the contract.** What the phone exports and what the host imports is a
  versioned, self-describing format. It outlives both the desktop tool and any later service.
- **AI is a capability behind an interface, used where it produces traceable value.** Transcription,
  extraction with stated uncertainty, retrieval across the archive, drafting scripts that the engine
  validates, and investigation of evidence. The user always sees what came from their own record and
  what a model suggested. See §1.5.

### 1.4 Non-scenario goals

These apply to every feature and are the difference between a proof of concept and a release.

| Goal | What it means in v2 |
| --- | --- |
| **Reliability** | An eight-hour screen-off run on both platforms, validated on physical devices, with honest reporting when the OS interrupts it. No run silently dies. |
| **Privacy and security** | Nothing leaves the user's devices without an explicit action. Bedroom audio stays on the user's machines; only chosen excerpts go to an AI provider, under a visible setting. Every stored thing can be deleted. |
| **Power** | Battery draw with screen off stays dominated by the audio session; on-device sensing is sampled at rates that keep the night under the v1 target of 8 % per night. Measured, not assumed. |
| **Honesty and interpretability** | The record distinguishes what was scheduled, what played, what was sensed, what the user said, and what a model inferred. Low sample sizes and missing data are shown, not hidden. |
| **Maintainability** | Each module remains workable with only its own folder in context (v1 spec §4.1). The engine stays free of React, Expo and I/O. The host's analysis core is a library with fixtures, like the engine. |
| **Release readiness** | Store distribution on both platforms, release automation, docs and help consistent with the shipped UI. |

### 1.5 How AI is used, and how it is not

AI appears in v2 wherever a model does something a person would otherwise do by hand at 7 AM:
transcribe a mumbled report, find the same place described in different words across twelve nights,
draft a script from a sentence, or read forty nights of evidence and say what it does and does not
support. Each such use is a feature in §4 with a scenario it serves; none exists to say "AI" on a
store page. The marketing benefit follows from the features being real.

Rules that every AI feature follows:

- **Provenance.** Model output is stored separately from the user's record and labelled as suggested.
  The original audio and the user's own words are never overwritten.
- **Uncertainty is a first-class output.** "Lucid: unclear" is a valid answer. Silence must not become
  a dream. An investigation may conclude that the evidence is insufficient.
- **The user confirms.** Tags, titles, patterns and proposals become part of the record only when
  accepted.
- **Numbers come from code, narrative from the model.** Statistics are computed by the analysis core;
  the model explains and investigates, it does not calculate.
- **No symbolic authority.** The tool asks what a place reminds the user of and shows their own
  evidence; it does not assign meanings.
- **Provider behind an adapter, cost visible.** The user chooses the provider (or a local model where
  available) and sees what is sent.

The owner's stated secondary goal, learning modern AI platforms by building, is served by the same
features in the order the research paper recommends: transcription and structured extraction first,
retrieval second, tool-assisted script drafting third, an investigating agent fourth, bounded
adaptation last. That order is also the order of increasing user value per night stored, so the two
goals do not conflict.

### 1.6 What v2 is not

Live wearable sensing, native watch apps, a native session runtime, live DSP, keyword recognition,
a hosted multi-user service and accounts are v3 candidates ([luciddream-v3-plan.md](luciddream-v3-plan.md)).
Script conditionals are **kept** in the language and the engine; they simply have no live wearable
source in v2.

---

## 2. Key user scenarios

Every feature in §4 names at least one of these.

| Id | Scenario | The user's question |
| --- | --- | --- |
| **S1** | **Set up tonight in a minute.** Open the app, see the three phases, adjust, press Begin. | "Is it ready, and will it be gentle?" |
| **S2** | **Sleep undisturbed by the app.** Cues are soft, the room stays quiet, the phone keeps working all night without attention. | "Will it wake me, and will it still be running at 5 AM?" |
| **S3** | **Record the night on a second device.** Press record on the spare phone, Begin on the main one; in the morning both are still going. | "How do I capture what happens without the app spying on me?" |
| **S4** | **Speak on waking, then answer three questions.** Talk into the room while the memory is fresh; a short morning review on the phone. | "How do I keep the dream before it fades?" |
| **S5** | **Bring the night to the host.** Export from the phone, drop the recording next to it, see one aligned timeline. | "What actually happened last night?" |
| **S6** | **Read the night.** Transcript beside audio, cue-by-cue reactions, wearable stages, the phone's sensing, all navigable. | "Did the cue do anything? What did I say?" |
| **S7** | **Learn across nights.** Recurring places and themes, outcomes by cue and by timing, sleep-data baselines, uncertainty shown. | "What is working for me, if anything?" |
| **S8** | **Adjust the practice with consent.** The host proposes one change with its evidence; the user accepts; the phone has the new script for tonight. | "What should I try next, and why?" |
| **S9** | **Author and share.** Build a simple script on the phone, describe a script in a sentence on the host, use a personal cue, share via a library extension. | "Can I make this mine?" |
| **S10** | **Install, update and trust.** Get the app from a store or beta channel, understand what is stored where, delete anything. | "Can I rely on this, and who sees my data?" |

---

## 3. Goals that features attach to

| Id | Goal | Why it is a v2 goal |
| --- | --- | --- |
| **G1** | **Sleep-friendly by default** | The first customer feedback on v1: sounds must be very soft; beeps and chirps are unacceptable. |
| **G2** | **A faithful record of the night** | The loop needs the sleeper's side of the story: the room, the body, the words, alongside what played. |
| **G3** | **Understanding on a large screen** | Phones are for the night; analysis needs space, time and compute. |
| **G4** | **Self-improvement across nights** | The differentiator no competitor has: preparation, execution, report and adaptation connected. |
| **G5** | **Reliability, privacy and power** | The non-scenario goals of §1.4; v2 is a release, not a proof of concept. |
| **G6** | **Release readiness** | Stores, docs, usability fixes, and the redesign landing on the trunk. |

---

## 4. Features

Grouped by component. Each row names the goals and scenarios it serves. Ids are stable for later
specifications and issues.

### 4.1 Phone: sleep-friendly audio (issue #6)

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F1.1 | **Fade-in and fade-out on every play.** Volume ramp on the player over about one second at start and end; no DSP dependency. | G1 | S2 |
| F1.2 | **Softening presets `gentle` and `strong`**, pre-rendered on the phone at import or preflight: low-pass, pitch down, light reverb tail, peak normalisation with a cap. Deterministic and unit-tested. Cached by (signal hash, preset, renderer version). | G1 | S2 |
| F1.3 | **Global "Soft sounds" setting** (Off / Gentle / Strong, default Gentle) applied to every play; scripts may ask for more via `soften:` on `play` or `with`, never less. | G1 | S1, S2 |
| F1.4 | **Purpose-made soft bundled signals** generated by the build script: singing bowl, breath swell, warm two-note hum. Retire `alert`; Wake Up default no longer a beep. | G1 | S1, S2 |
| F1.5 | **WAV-only user signals.** Import filters and URL import reject other formats with a clear message; bundled `chirp.mp3` converted at build time; one-time notice for previously imported MP3s. | G1, G5 | S9 |
| F1.6 | **Library warning on import**: measure brightness and attack; flag "may wake you, soften recommended". | G1 | S9 |
| F1.7 | **Test plays the softened version.** What the user hears when testing is what plays at night. | G1 | S1 |
| F1.8 | **Softening recorded in the log** on every `play` event, so the host knows which variant sounded. | G2, G4 | S6 |
| F1.9 | **Personal cue from the user's own words.** The user types or speaks an intention phrase; a calm synthetic voice renders it as a signal at import time, softened like any other. Grounded in targeted lucidity reactivation, where the trained cue matters more than the sound itself. Text-to-speech is the first AI capability on the phone, and it is optional. | G1, G4 | S9 |

### 4.2 Phone: night session reliability (the hardening package)

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F2.1 | **Checkpoint and resume.** Interpreter state written to disk at statement boundaries; on relaunch the run resumes from the checkpoint with an `interrupted` event and no burst of missed cues. | G5 | S2 |
| F2.2 | **Append-only run log.** The JSONL port appends instead of rewriting the file per event. | G5 | S2, S6 |
| F2.3 | **Android alarm module.** A small Expo native module using exact alarms that survive doze to relaunch the foreground service at the next cue time and resume from checkpoint. Android only; on iOS the audio session is the mechanism. | G5 | S2 |
| F2.4 | **Night ambience.** The keep-alive track becomes a real, very quiet, band-limited brown/pink noise: user-adjustable, can be turned off, default barely audible. Keeps the audio session honest for store review, keeps Bluetooth routes awake, and gives the host a constant alignment reference in the recording. | G1, G5, G6 | S2, S3 |
| F2.5 | **Cue-time local notifications** scheduled at run start; if the app has died, the user still sees when it stopped, and the morning report says so. | G5 | S2, S4 |
| F2.6 | **Audio route handling.** Earbuds disconnected or Bluetooth speaker gone: log it, keep playing on the new route, never stall. | G5 | S2 |
| F2.7 | **Eight-hour physical-device validation gate** on Android and iOS: locked screen, silent gaps, Sleep Focus / Do Not Disturb, low battery, audio interruptions. Recorded per release. | G5 | S2 |
| F2.8 | **Battery measurement per night** written into the bundle (start/end level), so power cost is observed, not assumed. | G5 | S6 |
| F2.9 | **Honest morning report of interruptions**: process loss, resume, missed cues, route changes, shown on Good morning and in Nights. | G2, G5 | S4 |

### 4.3 Phone: context and conditions

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F3.1 | **True/false/unknown condition semantics.** Negating unknown stays unknown; a cue gate requires true; an explicit unavailable policy governs branching. Recorded as an intentional change from v1 with migration fixtures. Lands before any real context source. | G5, G4 | S2 |
| F3.2 | **On-device context sources**, sampled at low rate all night: movement (accelerometer) and sound level (existing metering). Available to scripts as conditions (`movement`, `soundLevel`) and written to the log as observations. | G2, G4 | S2, S6 |
| F3.3 | **Further phone sources as cheap additions**: ambient light, audio route, charger state, sunrise for the location. Candidates, not committed. | G2 | S6 |
| F3.4 | **Conditionals and the simulated-context panel are retained** as the v3 on-ramp; they are no longer advertised as a wearable feature. | G4 | S9 |
| F3.5 | **Observation schema** shared with the bundle: source, time, value, availability, provenance. Same shape the v3 live sources will use. | G2 | S6 |

### 4.4 Phone: morning and export

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F4.1 | **Morning review** on Good morning: lucid? (built in the redesign), noticed the cue inside the dream / on waking / not at all, woke more than wanted, rested. Three taps, skippable. | G2 | S4 |
| F4.2 | **Report marker.** One large button on the Sleeping screen writes a `report` event so the host finds the speech that follows it in the recording. | G2 | S4 |
| F4.3 | **Night bundle export**: versioned, self-describing archive of the run log, observations, settings and script versions used, morning review, lucid answer, battery figures. Shared via the OS share sheet, a folder, or a local URL the host can fetch on the same network. | G2, G3 | S5 |
| F4.4 | **Historical wearable import into the bundle**: HealthKit on iOS, Health Connect on Android, read at morning-review time for last night, with a note that the watch's app may need to sync first. The v2 platform-parity path for wearables. | G2, G4 | S5, S7 |
| F4.5 | **Nights sheet shows bundle status** (exported, imported by host, proposal pending) so the phone side of the loop is visible. | G4 | S8 |

### 4.5 Phone: authoring, library and usability

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F5.1 | **Linear script editor** on the phone: a sequence of play / wait / repeat-N steps with soften and gain, saved as YAML the text editor can still open. No nesting. | G6 | S9 |
| F5.2 | **Import a proposed script** from the host by URL, file or QR, landing in the Library with its provenance (which night's evidence, which proposal). | G4 | S8 |
| F5.3 | **Import fixes**: URL import works with a name alone (#3), last-used URL remembered, clearer errors. | G6 | S9 |
| F5.4 | **Library extension improvements**: refresh in place, show what changed, WAV rule enforced in manifests. | G6 | S9 |
| F5.5 | **Script view explains itself.** The read-only viewer shows a plain-language timeline of what a script will do tonight ("wait 90 min, then six quiet cycles"). Generated by the engine, not a model. | G6 | S1, S9 |

### 4.6 Phone: interface and documentation

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F6.1 | **Redesign to the trunk** (#4): the v1-redesign branch after review, hardening of its console and sheets. | G6 | S1 |
| F6.2 | **Docs and help consistent with the shipped UI**: README, spec §2, website pages and screenshots, in-app help. Part of every push. | G6 | S10 |
| F6.3 | **Privacy screen in the app**: what is stored, where, what leaves the device and when; delete everything. | G5 | S10 |

### 4.7 Recorder

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F7.1 | **Second-device recording guidance**: which apps work (any that produce a common audio file), placement, charging, the one-minute nightly ritual. Documentation and a help page, not code. | G2 | S3 |
| F7.2 | **Sync tone at run start** (a short, soft, distinctive signal) so alignment is trivial even if the recorder starts late. | G2, G3 | S3, S5 |
| F7.3 | **Optional LucidDream recorder app**: deferred to v3 unless third-party recorders prove unworkable. | - | S3 |

### 4.8 Host service

Detailed in §5. Summary rows for the feature map:

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F8.1 | Import night bundles and recordings; align them by cue matching. | G3 | S5 |
| F8.2 | Night view: one timeline with cues, observations, wearable stages, audio waveform, speech segments. | G3 | S6 |
| F8.3 | Transcription of speech segments; original audio kept; editable transcript. | G3 | S6 |
| F8.4 | Structured extraction with uncertainty: title, places, people, emotions, lucidity unclear/reported. | G3, G4 | S6, S7 |
| F8.5 | Cue-reaction detection: movement, sound, speech within a window after each cue. | G3, G4 | S6, S7 |
| F8.6 | Archive and retrieval: search across nights by meaning, not only words. | G3 | S7 |
| F8.7 | Patterns and baselines with sample sizes shown. | G4 | S7 |
| F8.8 | Experiments: compare two conditions across nights, honest about what the data can support. | G4 | S7 |
| F8.9 | Proposals: one change at a time, with evidence, producing a validated script for the phone. | G4 | S8 |
| F8.10 | Script author: a sentence becomes a draft script, validated by the engine's own parser. | G4 | S9 |
| F8.11 | Profiles, privacy controls, deletion, export. | G5 | S10 |

### 4.9 Distribution and release

| Id | Feature | Goals | Scenarios |
| --- | --- | --- | --- |
| F9.1 | **Store distribution, both platforms, at a v2.x** after the night-audio story has been through beta: Play and App Store listings, privacy and health-data declarations, review readiness for background audio (see F2.4). | G6 | S10 |
| F9.2 | **Release automation**: tag-driven Android and iOS builds (the iOS plan's remaining steps), OTA updates via `expo-updates` for JS-only fixes. | G6 | S10 |
| F9.3 | **Beta channels stay**: APK on GitHub Releases and TestFlight for v2.0 and v2.1. | G6 | S10 |
| F9.4 | **Host distribution**: one command to run locally (`npx`-style or a single download), no installer. See §5.7. | G6 | S5, S10 |
| F9.5 | **Marketing surface**: the website gains a v2 page once v2.0 ships, showing the loop with real screenshots of the night view; claims limited to what ships. | G6 | S10 |

---

## 5. The host service

### 5.1 Purpose and positioning

The host is where a night becomes understanding. It runs on the user's own computer as a small
server with a browser interface, holds the user's nights, aligns recordings to logs, transcribes and
extracts, finds patterns, and proposes changes that the phone can import.

It is deliberately built as a **service that happens to run locally**, so that if user feedback
justifies a hosted version, the move is a deployment with authentication and storage adapters
added, not a rewrite. Whether that move happens is an open decision (§9). Until then, the host has
the minimum possible desktop dependency: a runtime and a browser.

### 5.2 User scenarios on the host

**S5, bringing the night in.** The user opens the host in a browser. A night appears as soon as its
bundle arrives (dropped into a watched folder, uploaded through the page, or fetched from the phone's
local URL). They drop the recording file next to it. The host finds LucidDream's cues in the
recording by matching the known signal waveforms and the sync tone, reports the alignment confidence,
and shows one timeline.

**S6, reading the night.** The timeline shows phases, cues, the phone's movement and sound-level
traces, wearable sleep stages if they were imported, and the recording's waveform with detected
speech segments. Clicking a cue shows what followed it within a chosen window. Clicking a speech
segment plays the audio and shows the transcript beside it. The user corrects the transcript; the
original stays. A structured summary is offered, with "lucid: unclear" when the words do not settle
it, and becomes part of the record only when accepted.

**S7, learning across nights.** The archive lists nights with outcomes side by side: recall, reported
lucidity, cue incorporation, awakenings, rest. A question box answers "have I dreamed of that station
before?" by retrieving the user's own reports, with citations to the nights. Pattern pages show
outcomes by cue, by phase timing and by sleep-stage context, always with the number of nights behind
each figure.

**S8, adjusting with consent.** When there is enough evidence, the host proposes one change: a later
first cue, a softer signal, fewer repetitions. The proposal shows the nights it rests on, the
alternative explanations it considered, and the script diff. Accepting it produces a validated script
and a link or QR code for the phone. Declining records why.

**S9, authoring.** "A gentle session using my own cue, nothing after 6 AM" becomes a draft script,
validated by the same parser the phone uses, with errors fed back to the drafting step until it
passes. The user reads the plain-language timeline (F5.5 logic reused) before sending it to the phone.

**S10, trust.** A privacy page lists what the host stores, which excerpts were sent to which AI
provider and when, and offers deletion per night and in full.

### 5.3 Functionality

| Area | Functions |
| --- | --- |
| **Ingest** | Watch folder, page upload, fetch from phone URL; bundle version validation; recording formats decoded on the host (the WAV-only rule applies to phone signals, not recordings). |
| **Alignment** | Cross-correlate known signal files and the sync tone against the recording; report offset and confidence; fall back to clock offsets with a warning; manual nudge. |
| **Segmentation** | Speech segments, movement/noise events, silence spans in the recording; the phone's own cues and ambience excluded from "room" events. |
| **Transcription** | Per speech segment, through the provider adapter; original audio kept; transcript editable; uncertainty markers preserved. |
| **Extraction** | Title, places, people, emotions, lucidity (reported / unclear / not indicated), cue mention, with the source words quoted; user confirms. |
| **Night view** | Timeline, cue windows, reaction summary, wearable stages, morning review answers, interruptions. |
| **Archive** | Nights list, outcomes table, full-text and semantic search with citations. |
| **Patterns** | Outcomes by cue, timing, phase, sleep-stage context, day of week; baselines; sample sizes and missing-report counts always shown. |
| **Experiments** | Define two conditions, assign nights (alternating by default), compare with a plain-language summary of what the data can and cannot support. |
| **Proposals** | One change per proposal, evidence, alternatives considered, script diff, accept/decline with reason; produces a validated script. |
| **Script author** | Natural-language draft to YAML, validated by the engine parser in a loop; plain-language preview. |
| **Profiles and privacy** | One profile per person even on a single machine; per-night and full deletion; provider log; export of everything as files. |

### 5.4 Architecture

```
browser UI (React, same design language as the phone)
        |
   HTTP / WebSocket, localhost
        |
+------------------------------------------------------------------+
|  host server (Node / TypeScript)                                 |
|                                                                  |
|  API layer        ingest, nights, search, proposals, settings    |
|  analysis core    alignment, segmentation, correlation, stats,   |
|                   proposal generation  (library + fixtures)      |
|  engine package   the phone's engine: parser, validator,         |
|                   plain-language timeline  (shared code)         |
|  AI adapter       transcribe, extract, embed, draft, investigate |
|                   -> provider X | provider Y | local model       |
|  storage          profile -> nights -> bundle, recordings,       |
|                   alignment, segments, transcripts, annotations, |
|                   proposals   (filesystem now, DB later)         |
+------------------------------------------------------------------+
```

Decisions that keep the migration to a hosted service cheap:

- **Server plus browser UI, not a desktop application.** No Electron, no native windows. The UI is a
  web app served by the local server; the same UI works against a hosted server later.
- **Node / TypeScript**, so the phone's engine package is imported, not reimplemented: one parser,
  one validator, one plain-language timeline for both surfaces.
- **The analysis core is a library** with fixture-based tests (recorded bundles, synthetic
  recordings), following the engine's discipline.
- **Storage behind an interface, per-profile from day one.** Filesystem layout now; a database and
  object store later, same code above it.
- **The AI adapter is the only place provider APIs are called.** It records what was sent, to whom,
  when, and the cost. Swapping providers or adding a local model is an adapter change.
- **The bundle and proposal formats are versioned public contracts.** They are the API between the
  phone and any host, local or hosted.
- **Authentication is absent, not disabled.** The local host binds to localhost; the hosted version
  adds accounts in front of the same API. Consent and retention exist from the first version because
  retrofitting them onto a service holding other people's bedroom audio would be painful.

### 5.5 AI inside the host, and the learning path through it

Each capability below is a feature from §4.8 with a user in front of it; the order is also the
owner's learning progression from the research paper (§12.8), because value per stored night rises in
the same order.

1. **The archivist (F8.3, F8.4).** Recording to transcript to structured entry. Learns audio APIs,
   asynchronous jobs, schema-constrained output, prompting for ambiguity, retries, cost tracking,
   provenance, and evaluating invented detail against a small fixture set: silence must not become a
   dream; an uncertain fragment must stay uncertain.
2. **Archive retrieval (F8.6).** Embeddings and grounded answers with citations to the user's nights.
   The agent's memory is the inspectable archive, not a conversation history.
3. **The script author (F8.10).** Structured generation with a tool-assisted correction loop against
   the engine parser; the clearest separation of "proposed" from "executed", with concrete pass/fail
   criteria.
4. **The investigator (F8.8, F8.9).** "Did the bowl cue help this month?" The agent retrieves nights,
   checks preparation and reports, asks the analysis core for the numbers, weighs missing data and
   alternative explanations, and drafts a proposal. Tool design, durable state, stopping conditions,
   tracing, permissions. Numbers from code; narrative from the model.
5. **Bounded adaptation (F8.9 accepted proposals).** Decision policies and longitudinal evaluation,
   with one change at a time so results stay interpretable.

Two capabilities that touch the phone rather than the host: the personal spoken cue (F1.9, text to
speech at import) and, later, a morning follow-up question after the initial report has been saved
uninterrupted. The second is not in v2; it adds interaction complexity before the archivist has
proven its value.

### 5.6 Data model

| Entity | Contents | Notes |
| --- | --- | --- |
| Profile | id, display name, settings, provider policy | One per person; no auth locally |
| Night | id, date key (evening-based, as in the phone), bundle reference, recordings, status | The unit of everything |
| Bundle | version, run log, observations, script versions, settings snapshot, morning review, lucid answer, battery, interruptions | Immutable once imported |
| Recording | file reference, format, duration, device label, alignment (offset, confidence, method) | Any number per night |
| Segment | type (speech, movement, noise, silence), start, end, source | Derived; regenerable |
| Transcript | segment reference, text, provider, model, cost, user edits kept separately | Original audio never modified |
| Annotation | user-confirmed or model-suggested tag with provenance and confidence | Suggested and confirmed are distinct states |
| Pattern / experiment | definition, nights included, computed results, generated summary | Results regenerable from nights |
| Proposal | evidence nights, change, alternatives, script before/after, decision and reason | Feeds the phone |
| Provider log | what was sent, to whom, when, cost | The privacy ledger |

### 5.7 Distribution and desktop dependency

- Runs with one command on Windows, macOS or Linux; a Node runtime and a browser are the only
  requirements. A packaged single binary is a later convenience, not a v2.1 dependency.
- Audio decoding of recorder formats needs a decoder on the host; prefer a pure-JavaScript or
  WebAssembly decoder to avoid a system dependency, with a documented fallback to `ffmpeg` for
  exotic formats.
- Local models are optional: a local transcription model where the machine can run it, otherwise a
  provider through the adapter. The setting is visible and per-profile.
- Data lives in one directory per profile that the user can back up, move or delete.

### 5.8 Path to a hosted service (deferred decision)

If feedback justifies it: deploy the same server behind authentication; swap the storage adapter for
a database and object store; add upload from the phone directly; keep the provider log per user.
Bedroom audio custody becomes the project's responsibility at that point, which is why the decision
waits for evidence that users want it. The website and prototype patterns already used for v1 apply
to the UI half; the compute half needs a real backend.

---

## 6. Recorder guidance

v2 ships no recorder. The documentation describes the second-device setup as the lab kit:

- Any device that can record a common audio format for eight hours while charging: a spare or old
  phone with its built-in recorder, a tablet, a laptop.
- Placement on the nightstand, within a couple of metres of the bed and of the LucidDream phone.
- The nightly ritual: press record on the recorder, then Begin the night on the phone; in the morning
  stop both and move the recording to the host (cable, shared folder, or whatever the recorder offers).
- The sync tone (F7.2) and the ambience (F2.4) make alignment independent of when the recorder started.

Beginners are not the v2 audience; a single-device path waits for v3 evidence that it is wanted.

---

## 7. Delivery shape

### 7.1 Increments

| Increment | Theme | Contents | Channel |
| --- | --- | --- | --- |
| **v2.0 Observe** | The phone records a faithful night | §4.1 audio, §4.2 hardening, §4.3 context, §4.4 morning and export, F6.1 redesign to trunk, F6.2 docs, F7.1-F7.2 recorder guidance | APK + TestFlight |
| **v2.1 Understand** | The host reads the night | §5 through F8.7 (ingest, alignment, night view, archivist, retrieval, patterns), F9.4 host distribution | APK + TestFlight; host by command |
| **v2.2 Adapt** | The loop closes across nights | F8.8-F8.10 experiments, proposals, script author; F5.1 linear editor; F5.2 proposal import; F4.5 | Stores (F9.1) after review readiness is confirmed |

Store submission is planned for v2.2 because that is when the night-audio story, the ambience track
and the privacy screen have all been through beta.

### 7.2 Acceptance gates

- **v2.0:** eight-hour physical-device runs pass on both platforms (F2.7); softening presets have
  unit fixtures and a listening sign-off from the customer who raised #6; a bundle exported from the
  phone validates against its schema; battery per night measured and within target.
- **v2.1:** a real night (bundle + recording) aligns automatically with stated confidence; the
  archivist passes the fixture set (silence stays silent, unclear stays unclear); a night is
  navigable end to end in the browser.
- **v2.2:** a proposal round-trips: evidence, accepted change, validated script on the phone, night
  run with it, next bundle shows the change; store review passed on both platforms.

### 7.3 Work packages for the v1-to-v2 transition

Before v2.0 feature work: the redesign review and merge to trunk (#4), the doc sync
([luciddream-v1-redesign.md](luciddream-v1-redesign.md) lists what is stale), and the remaining iOS
release automation from [luciddream-ios-support-plan.md](luciddream-ios-support-plan.md).

### 7.4 What would pull v3 work forward

Only field evidence: runs dying on beta users' devices for a cause the hardening package cannot
address in TypeScript. The v3 plan lists the triggers (§1.1 there).

---

## 8. Decisions recorded on 2026-09-13

| # | Decision |
| --- | --- |
| D1 | v2 thesis is "listen and learn": the loop across nights, on the current stack. |
| D2 | The native session runtime, live DSP and sample-accurate timing are not needed for sleeping scenarios; the native architecture moves to the v3 plan and is entered only on field evidence. |
| D3 | Session ownership problems (checkpoint/resume, append-only log) are fixed in TypeScript; an Android exact-alarm native module is the one small native addition; iOS relies on the audio session. |
| D4 | The keep-alive track becomes a real, very quiet night ambience: a feature, optional, and the store-review defence. |
| D5 | Full-night recording happens on a separate device; LucidDream itself does not record in v2. |
| D6 | The host is source-agnostic: a run bundle plus any recordings from any source, aligned by cue matching. |
| D7 | The host is a local service with a browser UI, designed to become a hosted service; the bundle format, per-profile storage and the analysis core are the stable contracts. Whether to host it is deferred to user feedback. |
| D8 | Wearables enter v2 as historical import into the bundle (HealthKit, Health Connect, Oura); live wearable observations are v3. |
| D9 | Script conditionals stay in the language and engine, with pluggable context sources; on-device sources (movement, sound level) are the v2 live sources. |
| D10 | User-provided signals are WAV only; bundled MP3 is converted at build time. |
| D11 | Store distribution on both platforms remains in v2 scope, targeted at v2.2. |
| D12 | The v2 audience is enthusiasts and self-experimenters; beginners are addressed in v3. |
| D13 | AI is used only where it produces traceable user value (§1.5); the owner's platform learning follows the same features in the same order. |

---

## 9. Open questions

Strategic first.

1. **Hosted service.** Deferred until user feedback; what evidence would trigger it (number of users,
   requests for cross-device access, unwillingness to run a local tool)?
2. **Overnight-reliability evidence.** Collect from beta users now: have runs died, and how often?
   This decides how much of §4.2 is urgent and whether anything in the v3 plan pulls forward.
3. **AI provider policy.** Default provider, local-model option, and the exact wording of what leaves
   the machine. Also the cost model for a user running the host themselves.
4. **Store review of background audio.** Confirm current App Store and Play guidance on audible
   background content before committing the v2.2 submission date.
5. **Health module choice.** Which community HealthKit / Health Connect modules to adopt for F4.4;
   both add native dependencies and a dev-client rebuild.

Audio softening (#6):

6. Speaker versus earbuds for the customer who reported the problem.
7. Listening test before building: render `gentle`/`strong` variants and the new soft signals as
   files and let her listen first.
8. Whether to accept `.flac`/`.aiff` in addition to WAV; the maximum signal length the phone
   pre-renders before falling back to fades only.
9. Migration notice for MP3 signals already imported by beta users.

Feature-level:

10. Linear editor: which statements it exposes; how it treats a script it cannot represent.
11. Night recording: retention on the host, silence-compression parameters, whether recordings are
    stored compressed.
12. On-device sensing: sampling rates and their measured battery cost; which of F3.3's sources are
    worth their power.
13. Morning review: the final question set, and whether "noticed the cue" should be asked before or
    after the free-form report is saved (the research paper argues for preserving the report first).
14. Bundle transport: whether the host fetching from the phone over the local network is worth its
    complexity in v2.1, or file sharing is enough.

---

## 10. Appendix: source mapping

| Source | Where it landed |
| --- | --- |
| Customer: "sounds must be very soft; beeps, alerts, chirps are no go" | G1, §4.1 |
| Issue #6 and its 2026-09-13 comment | §4.1, D10, open questions 6-9 |
| Issue #5 (full-night recording, host analysis, privacy) | §5, F7.x, D5-D7 |
| Issue #4 (new aesthetic to trunk) | F6.1 |
| Issue #3 (URL import confusion) | F5.3 |
| Owner list (former §4.4): visual editor | F5.1 |
| Owner list: host analysis tool, "uber smart journal" | §5, F8.x |
| Owner list: closed loop modifying scripts per user | F8.9, F5.2, S8 |
| Owner list: usability (last used URL etc.) | F5.3 |
| Research paper §8.4 speak-on-waking, §12 AI sequence | S4, F4.2, §5.5, §1.5 |
| Competitive paper: v2 = phone-based loop, v3 = sensing | §1, D1, D8 |
| v1 spec deferred items (DSP, wearables, keyword spotting, Play Store) | v3 plan §3; F9.1 |
| Former chapter 1 (native architecture) | v3 plan §2 |
| Former §4.1-4.3 (drivers, stores, parity) | D2, D11, F4.4 |
