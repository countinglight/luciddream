# Field evidence

Facts about the app that code, tests and CI cannot establish, and that only the owner knows: what
happened on real devices, with real users, over real nights. Specs in [`../plans/`](../plans/) state
what should be true; this folder records what was observed to be true.

Typical entries: an 8-hour night run completed, a TestFlight or APK install confirmed, battery drain
over a night, a feature tried on a device and whether it worked, a store review outcome, customer
feedback that changes a plan.

## Files

| File               | Contents                                                                      |
| ------------------ | ----------------------------------------------------------------------------- |
| `README.md`        | This process.                                                                 |
| `v<N>-evidence.md` | One log per major version: the **Evidence** table and the **Requests** table. |

Start a new file when work on the next major version begins; do not move old entries.

## Two tables

**Evidence**: what was observed. Append-only; correct a wrong entry by adding a new one that
supersedes it (`Supersedes E-003` in Details), never by editing history.

| Column           | Meaning                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Id               | `E-001`, `E-002`, ... never reused.                                                                     |
| Observed         | Date the thing happened (or `~2026-09` when approximate).                                               |
| Recorded         | Date written here.                                                                                      |
| What             | One line: the fact.                                                                                     |
| Criterion        | The spec or plan item it bears on, as a link or section reference (`v1 spec §2.4`, `v2 F2.7`).          |
| Result           | `pass`, `fail`, `partial`, or `info` (feedback that is not a pass/fail check).                          |
| Platform / build | `Android 0.5.1`, `iOS TestFlight 0.5.1`, `unknown`.                                                     |
| Source           | `owner`, `tester 1` (anonymised; never real names or contact details), `issue #6`.                      |
| Details          | Anything that qualifies the result. Write `not recorded` for missing detail rather than leaving it out. |

**Requests**: what an agent needs to know and cannot measure. Agents add rows; the owner answers.

| Column     | Meaning                                                   |
| ---------- | --------------------------------------------------------- |
| Id         | `R-001`, ...                                              |
| Asked      | Date.                                                     |
| Question   | Answerable in a sentence or a number.                     |
| Needed for | The criterion or decision it unblocks.                    |
| Status     | `open`, `answered → E-00x`, or `dropped` (with a reason). |

## How the owner uses it

- Answer a request by adding an Evidence row and setting the request's status to `answered → E-00x`.
  Or just tell an agent in chat; the agent writes the rows (see below).
- Add evidence nobody asked for whenever something notable happens on a device or with a tester.
- Precision is optional; honesty is not. "Two testers, platforms unknown" is a valid entry.

## How agents use it

- **Read before judging.** Before reporting a spec criterion that code cannot verify as missing (an
  overnight run, an install, battery, device behaviour, store review), read the current
  `v<N>-evidence.md`.
- **Ask through Requests.** When such a fact is needed, add a Requests row and mention it in chat.
  Do not keep the question only in chat or in agent memory.
- **Use diagnostics when they exist.** Once beta diagnostics are switched on
  ([luciddream-beta-telemetry.md](../plans/luciddream-beta-telemetry.md)), `npm run telemetry:nights`
  answers who ran which build on which phone, when, for how long and how it ended. Record such
  results as Evidence with source `telemetry` and the run id in Details, and prefer them over asking.
- **Transcribe, never infer.** When the owner states a fact in chat, record it as Evidence with
  source `owner` and the chat date. Never write evidence the owner did not state, never upgrade
  `reported` to `verified`, and never fill a missing detail with a guess.
- **Evidence informs, specs decide.** An accepted deviation from a spec (for example "manual releases
  are acceptable for v1") belongs in the spec or plan, citing the evidence ids that justify it.
- Evidence files follow the normal commit flow: they ship with the change that relies on them.
