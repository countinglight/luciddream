# Repository workflow

- The canonical repository is `github.com/countinglight/luciddream`, cloned locally at
  `~/ws/git/countinglight/luciddream` (on Windows, `C:\ws\git\countinglight\luciddream`).
  Always confirm the remote from the working clone rather than assuming; other stale clones exist.
- Never perform development work, file edits, or commits on the `deploy` branch.
- Use `vlads-dev` or an appropriate release/development branch for all work.
- Treat `deploy` as a deployment-only branch. Update it only through the repository's release/deployment process, not as a working branch.

# Validation during UI iteration

- During rapid UI/design iteration, do not run lint, Prettier, typechecking, or the full test suite after each change.
- Run those validation steps together immediately before committing, unless the user explicitly asks for an earlier check.
- The user performs the final full test immediately before pushing; do not duplicate that full pre-push test unless requested.
