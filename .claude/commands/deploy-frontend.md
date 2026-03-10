Deploy the frontend to AWS Amplify. Follow these steps in order:

1. Run frontend linting:
   ```
   cd frontend && npm run lint
   ```

2. If there are linting errors, fix them before proceeding.

3. Run a production build to verify no build errors:
   ```
   cd frontend && npm run build
   ```

4. Stage, commit, and push changes to trigger Amplify deployment.
   Use a descriptive commit message based on the recent changes.
   Push to the main branch.

5. Report that the Amplify build has been triggered. The user should check the Amplify Console for build progress.
