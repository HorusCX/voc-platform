Push changes to GitHub for version control. Amplify auto-deploys the frontend on every push. Follow these steps:

1. Run `git status` to see what has changed. Identify whether frontend (`frontend/`), backend (`backend/`, `requirements.txt`), or both changed.

2. **E2E coverage check** — if any frontend files changed:
   - For every new page in `frontend/app/` or new component in `frontend/components/`, verify:
     - All interactive elements (buttons, inputs, modals, cards) have `data-testid="descriptive-name"` attributes
     - A corresponding test case exists (or is added) in the relevant `frontend/e2e/tests/*.spec.ts` file
     - If a new API endpoint was added, a mock method exists in `frontend/e2e/fixtures/api-mocks.fixture.ts`
     - If an API response shape changed, mock data in `frontend/e2e/data/` is updated
   - If any of the above are missing, fix them before proceeding. The E2E framework must always be in sync with the codebase.
   - Reference: `frontend/e2e/E2E_FRAMEWORK.md` for the full framework guide.

3. **Lint** — if any frontend files changed:
   ```
   cd frontend && npm run lint
   ```
   Fix all lint errors before proceeding.

4. **Build check** — if any frontend files changed:
   ```
   cd frontend && npm run build
   ```
   Fix any build errors before proceeding. This catches issues before Amplify attempts the build.

5. Stage only relevant source files. Never use `git add .` or `git add -A`. Stage specific files/directories. Skip temp files, `.env` files, and build artifacts.

6. Review the diff with `git diff --staged` to understand the changes.

7. Write a concise commit message describing what changed and why. Format: `type: short description` (e.g. `feat: add Arabic name field`, `fix: correct login redirect`, `refactor: simplify embeddings service`).

8. Commit using:
   ```
   git commit -m "$(cat <<'EOF'
   <your message here>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```

9. Push to GitHub:
   ```
   git push origin main
   ```
   The pre-push hook runs lint and smoke E2E tests automatically for frontend changes. If tests fail, fix them and retry. Use `git push --no-verify` only in emergencies.

10. Confirm the push succeeded, report which files were committed, and note that Amplify will auto-build if frontend files were pushed.
