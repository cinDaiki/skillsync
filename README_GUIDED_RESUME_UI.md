# SkillSync — Guided Resume Upload UI patch

## What this changes

UI-only redesign of the existing candidate Resume Upload screen:

- One clear **My Resume** page heading (no duplicate header wording)
- Three-step **Add resume → Check details → Find jobs** guide
- Optional **How it works** instructions
- Clear **Uploaded / Built Resume** active-source selector
- Compact uploaded-file card with **Preview**, **Download**, **Replace**, and a **More → Delete File** control
- Brief, actionable extraction message; full diagnostics only when **View details** is opened
- Collapsible **Review uploaded skills** editor; preserves existing save and source isolation logic
- Collapsible resume templates/resources
- Primary **View My Job Matches →** action for a usable active resume
- Mobile layout and keyboard focus styling

The script also synchronizes the visible active-source label with a successful new upload.

## Files that will be updated

- `src/pages/candidate/ResumeUpload.jsx`
- `src/components/resume/ResumeQualityCard.jsx`
- `src/pages/candidate/ResumeUpload.css`

No employer/admin files, Supabase schema, migrations or matching-weight services are edited.

## Apply

1. Check out `feature/candidate-resume-builder`, not `main`.
2. Extract both `apply_skillsync_guided_ui.py` and `skillsync_guided_styles.css` into the repository root.
3. In the SkillSync repository root, run:

   ```bash
   python apply_skillsync_guided_ui.py
   npm run build
   git diff --check
   node tests/resumeBuilderWorkflow.test.mjs
   ```

4. Run the other repository test suites and inspect the diff.
5. Manually test the UI on desktop and mobile, including these states:

   - First-time candidate, neither resume exists
   - Builder exists but no uploaded file
   - Readable uploaded resume / upload active
   - Unreadable historical uploaded resume / Builder active
   - Switch between Uploaded and Built resumes
   - Expand/collapse extraction details and edit uploaded skills
   - Preview, download, replace and delete the uploaded file
   - Open Job Marketplace and verify Recommended is selected

6. Only after validation, commit/push to the feature branch and confirm the **branch preview URL**, not an immutable commit-specific deployment URL.

## Safety and compatibility

- The patch script performs no network calls and never touches any Supabase project.
- The three source files are modified in-place only after required anchors are verified.
- The script aborts without writing when a source anchor is missing, except where the files are already patched.
- The script is idempotent.
- **Important:** The actual Vite build and full test suite were **not run here**. JSX syntax was checked against a representative source fixture. Execute the checks above in your real checkout.
- The connected GitHub integration returned 403 on write, so this patch **has not been pushed**. Production was not accessed.
