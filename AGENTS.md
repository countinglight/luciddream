# Repository workflow

- The canonical repository is `github.com/countinglight/luciddream`, cloned locally at
  `~/ws/git/countinglight/luciddream` (on Windows, `C:\ws\git\countinglight\luciddream`).
  Always confirm the remote from the working clone rather than assuming; other stale clones exist.
- Never perform development work, file edits, or commits on the `deploy` branch.
- Use `vlads-dev` or an appropriate release/development branch for all work.
- Treat `deploy` as a deployment-only branch. Update it only through the repository's release/deployment process, not as a working branch.

# No progress reporting in master documents

- `README.md` and `BUILD.md` describe the product and how to build and run it as it is. They carry no
  progress reporting: no session narratives, no "done on" or "as of" dates, no "not yet created" or
  "never executed" status, no history of how a rule was learned.
- Progress, status and session records belong in `doc/dev_process/`.
- `README.md` is the user's concise manual. Building, installing on devices, releasing, deployment
  and operations belong in `BUILD.md`, which `README.md` links to.

# Session records

- Summaries, TODO lists, session records and review write-ups live in `doc/dev_process/`, never as
  artifacts or chat-only output.
- Their file names carry the date as `MMDDYY`, matching the existing files there — for example
  `telemetry_session_091326.md`, `review-architectural-091426.md`, `v1-hardening-091526.md`.
- The date belongs in the document's title and header as well, in full (`2026-09-15`), so a reader
  who has only the file open knows when it was written.

# Documentation coherence before master

- Before work is pushed into `master`, the documents in `doc/plans/` and `doc/dev_process/` are
  brought into a coherent state: no document contradicts the code or another current document.
- A dated session or review record may describe the past; when it has been overtaken, it gets a short
  dated pointer to the current source rather than a rewrite.
- `doc/archive/` is excluded: it is not read for context and not checked for coherence.

# Field evidence

- Facts code cannot establish (device runs, installs, battery, tester feedback, store review) live in
  `doc/evidence/`, as described in `doc/evidence/README.md`.
- Read the current `doc/evidence/v<N>-evidence.md` before reporting such a criterion as unmet.
- When you need such a fact, add a row to its Requests table instead of asking only in chat. When the
  owner states such a fact in chat, record it as Evidence. Never infer or embellish evidence.

# Validation during UI iteration

- During rapid UI/design iteration, do not run lint, Prettier, typechecking, or the full test suite after each change.
- Run those validation steps together immediately before committing, unless the user explicitly asks for an earlier check.
- The user performs the final full test immediately before pushing; do not duplicate that full pre-push test unless requested.
