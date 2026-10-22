#!/usr/bin/env python3
"""Apply SkillSync Guided Resume UX to the checked-out feature branch.
This modifies only candidate ResumeUpload JSX/CSS and the ResumeQualityCard UI.
It does not connect to Supabase, GitHub, or production.
"""
from pathlib import Path
import sys

ROOT = Path.cwd()
UPLOAD = ROOT / 'src/pages/candidate/ResumeUpload.jsx'
QUALITY = ROOT / 'src/components/resume/ResumeQualityCard.jsx'
STYLES = ROOT / 'src/pages/candidate/ResumeUpload.css'
STYLE_SOURCE = Path(__file__).resolve().with_name('skillsync_guided_styles.css')


def one(text, needle, replacement, label):
    if text.count(needle) != 1:
        raise RuntimeError(f'{label}: expected one source anchor, found {text.count(needle)}. No files changed.')
    return text.replace(needle, replacement, 1)


def section(text, a, b, replacement, label):
    if text.count(a) != 1 or text.count(b) != 1 or text.index(a) > text.index(b):
        raise RuntimeError(f'{label}: unexpected original source. No files changed.')
    return text[:text.index(a)] + replacement + text[text.index(b):]


def apply():
    for p in (UPLOAD, QUALITY, STYLES, STYLE_SOURCE):
        if not p.is_file():
            raise RuntimeError(f'Missing {p}. Run from SkillSync repository root and keep both patch files together.')

    upload, quality, css = (p.read_text(encoding='utf-8') for p in (UPLOAD, QUALITY, STYLES))
    marker = '/* SKILLSYNC_GUIDED_RESUME_EXPERIENCE_2026 */'
    if marker in css:
        print('Already applied. No changes made.')
        return

    upload = one(upload, '  const [isSwitchingSource, setIsSwitchingSource] = useState(false);', '''  const [isSwitchingSource, setIsSwitchingSource] = useState(false);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showSkillsEditor, setShowSkillsEditor] = useState(false);
  const [showResources, setShowResources] = useState(false);''', 'State insertion')

    upload = one(upload, '''    if (candProfErr) {
      console.error("[ResumeUpload] Error upserting candidate_profiles:", candProfErr);
    }''', '''    if (candProfErr) {
      console.error("[ResumeUpload] Error upserting candidate_profiles:", candProfErr);
    } else {
      // A successful new upload is the active source according to the saved DB projection.
      setActiveSource('upload');
    }''', 'Show current source after successful upload')

    upload = one(upload, '  return (\n    <DashboardLayout', '''  const extractionQuality = resumeFile?.parsed_details?.qualityAssessment?.extractionQuality;
  const unreadableUpload = Boolean(extractionQuality?.isUnreadable ||
    (extractionQuality?.score === 0 && extractionQuality?.wordCount === 0));
  const canViewRecommended = activeSource === 'builder'
    ? hasBuiltResume
    : Boolean(resumeFile?.file_url && !unreadableUpload);
  const hasAnyResume = Boolean(resumeFile?.file_url || hasBuiltResume);

  return (
    <DashboardLayout''', 'Status insertion')

    new_ui = '''  return (
    <DashboardLayout
      role="candidate"
      title="My Resume"
      subtitle="Choose a resume, review your details, then find jobs that fit."
    >
      <section className="dashboard-panel resume-guided-panel">
        <div className="resume-guided-intro">
          <div>
            <p className="resume-guided-eyebrow">YOUR NEXT CAREER STEP</p>
            <p className="resume-guided-intro-text">A simple path from your resume to matching jobs.</p>
          </div>
          <div className="resume-guided-header-actions">
            <button type="button" className="resume-guided-help-btn"
              aria-controls="resume-guided-help-content" aria-expanded={showQuickGuide}
              onClick={() => setShowQuickGuide(value => !value)}>
              ? How it works
            </button>
            <button type="button" className="panel-action" onClick={handleAddResume} disabled={loading}>
              {loading ? 'Reading file…' : resumeFile ? 'Replace Resume' : 'Upload Resume'}
            </button>
          </div>
        </div>

        <ol className="resume-guided-progress" aria-label="Resume setup steps">
          <li className={hasAnyResume ? 'done' : 'current'}><span className="resume-step-count">{hasAnyResume ? '✓' : '1'}</span> Add resume</li>
          <li className={canViewRecommended ? 'done' : hasAnyResume ? 'current' : 'upcoming'}><span className="resume-step-count">{canViewRecommended ? '✓' : '2'}</span> Check details</li>
          <li className={canViewRecommended ? 'current' : 'upcoming'}><span className="resume-step-count">3</span> Find jobs</li>
        </ol>
        {showQuickGuide && (
          <div id="resume-guided-help-content" className="resume-guided-guide">
            <h3>How SkillSync works</h3>
            <ol>
              <li><strong>Add a resume.</strong> Upload a PDF/Word file or create one in Resume Builder.</li>
              <li><strong>Check your details.</strong> Review what SkillSync read, and fix missing information.</li>
              <li><strong>Find jobs.</strong> Recommended Jobs uses your active resume; you can switch sources later.</li>
            </ol>
          </div>
        )}

        {hasBuiltResume && (
          <div className="resume-guided-source" role="region" aria-label="Active resume for matching">
            <div>
              <h3>Resume used for job matching</h3>
              <p>{activeSource === 'builder' ? 'Built Resume' : 'Uploaded Resume'} is currently active.</p>
            </div>
            <div className="source-selector-options" role="radiogroup" aria-label="Choose active resume source">
              <label className={`source-radio-pill ${activeSource === 'upload' ? 'selected' : ''}`}>
                <input type="radio" name="upload_active_source" value="upload" checked={activeSource === 'upload'}
                  onChange={() => handleSwitchSource('upload')} disabled={isSwitchingSource || !resumeFile?.file_url} />
                <span>📄 Uploaded</span>
              </label>
              <label className={`source-radio-pill ${activeSource === 'builder' ? 'selected' : ''}`}>
                <input type="radio" name="upload_active_source" value="builder" checked={activeSource === 'builder'}
                  onChange={() => handleSwitchSource('builder')} disabled={isSwitchingSource} />
                <span>📝 Built</span>
              </label>
            </div>
            {isSwitchingSource && <span className="source-switching-spinner" role="status">Switching resume…</span>}
          </div>
        )}
        {message && <div className="profile-message" role="status">{message}</div>}
        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx"
          onChange={handleFileChange} hidden aria-label="Choose a resume file" />

        {!resumeFile ? (
          <div className="resume-guided-empty">
            <div className="resume-guided-empty-icon" aria-hidden="true">▤</div>
            <div>
              <h2>{hasBuiltResume ? 'Your Built Resume is ready' : 'Choose how to get started'}</h2>
              <p>{hasBuiltResume
                ? 'You can find jobs with your Built Resume, or upload an additional document.'
                : 'Upload a file you already have, or create a resume step by step.'}</p>
              <div className="resume-guided-action-row">
                <button type="button" className="panel-action" onClick={handleAddResume} disabled={loading}>
                  {loading ? 'Processing…' : 'Upload a resume'}
                </button>
                <Link className="resume-guided-outline-link" to="/candidate/resume-builder">
                  {hasBuiltResume ? 'Edit Built Resume →' : 'Build a resume →'}
                </Link>
              </div>
              <p className="resume-guided-small">PDF, DOC or DOCX · You can change the active resume later.</p>
            </div>
          </div>
        ) : (
          <div className="resume-guided-uploaded">
            <div className="resume-guided-file">
              <div className="resume-guided-file-icon" aria-hidden="true">📄</div>
              <div className="resume-guided-file-info">
                <h2>{resumeFile.file_name || 'Uploaded resume'}</h2>
                <p>{formatFileSize(resumeFile.file_size)} · {formatUploadDate(resumeFile.created_at)}</p>
                <span className="resume-guided-file-status">Saved · {activeSource === 'upload' ? 'Active' : 'Not active for matching'}</span>
              </div>
              <div className="resume-guided-file-actions">
                {resumeFile.file_url && (
                  <>
                    <button type="button" className="resume-guided-outline-btn" onClick={openPreview}>Preview</button>
                    <button type="button" className="resume-guided-outline-btn" onClick={handleDownloadResume}>Download</button>
                  </>
                )}
                <button type="button" className="resume-guided-outline-btn" onClick={handleAddResume} disabled={loading}>Replace</button>
                <details className="resume-guided-more">
                  <summary>More</summary>
                  <button type="button" className="resume-guided-delete" onClick={handleDeleteResume}>Delete File</button>
                </details>
              </div>
            </div>

            <ResumeQualityCard assessment={resumeFile.parsed_details?.qualityAssessment || null} onReupload={handleAddResume} />

            <div className="resume-extracted-skills-card resume-guided-skills">
              <div className="resume-guided-skills-head">
                <div>
                  <h3>Review uploaded skills</h3>
                  <p>{extractedSkills.length} saved skill{extractedSkills.length === 1 ? '' : 's'} · Edit only if needed.</p>
                </div>
                <button type="button" className="resume-guided-text-button"
                  onClick={() => setShowSkillsEditor(value => !value)}
                  aria-expanded={showSkillsEditor} aria-controls="resume-guided-skills-editor">
                  {showSkillsEditor ? 'Done ↑' : 'Edit skills ↓'}
                </button>
              </div>
              {showSkillsEditor && (
                <div id="resume-guided-skills-editor" className="resume-guided-skills-body">
                  {unreadableUpload && (
                    <p className="resume-guided-source-note">This file could not be read. Saved skills are not verified extraction results.</p>
                  )}
                  <SkillTagInput skills={extractedSkills} onChange={handleSkillsChange}
                    placeholder="Add a skill and press Enter or comma" />
                  {savingSkills && <p className="resume-guided-small" role="status">Saving skills…</p>}
                  {activeSource === 'builder' && (
                    <p className="resume-guided-source-note">Your Built Resume is active. Edits to these uploaded skills will not change your active matching qualifications.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="resume-guided-next">
          <div>
            <p className="resume-guided-eyebrow">NEXT STEP</p>
            <h3>{canViewRecommended ? 'Ready to find matching jobs?' : 'Get your resume ready'}</h3>
            <p>{canViewRecommended
              ? `Recommendations will use your active ${activeSource === 'builder' ? 'Built' : 'Uploaded'} Resume.`
              : hasBuiltResume
              ? 'Activate your Built Resume to get personalized recommendations.'
              : unreadableUpload
              ? 'Replace this unreadable file, or use Resume Builder.'
              : 'Upload a readable resume or create one to receive recommendations.'}</p>
          </div>
          <div className="resume-guided-next-actions">
            {canViewRecommended ? (
              <Link className="resume-guided-primary" to="/candidate/jobs?view=recommended">View My Job Matches →</Link>
            ) : unreadableUpload ? (
              <button type="button" className="resume-guided-primary" onClick={handleAddResume}>Replace Resume →</button>
            ) : hasBuiltResume ? (
              <Link className="resume-guided-primary" to="/candidate/resume-builder">Open Resume Builder →</Link>
            ) : (
              <button type="button" className="resume-guided-primary" onClick={handleAddResume}>Upload Resume →</button>
            )}
            {!canViewRecommended && <Link className="resume-guided-secondary" to="/candidate/jobs?view=all">Browse All Jobs</Link>}
          </div>
        </div>

        <div className="resume-guided-resources">
          <button type="button" className="resume-guided-resources-trigger"
            aria-expanded={showResources} aria-controls="resume-guided-resources-body"
            onClick={() => setShowResources(value => !value)}>
            <span><strong>Need help with your resume?</strong><small>Free template, sample and writing guide</small></span>
            <span aria-hidden="true">{showResources ? 'Hide ↑' : 'Show resources ↓'}</span>
          </button>
          {showResources && <div id="resume-guided-resources-body" className="resume-guided-resources-body"><ResumeTemplateSection variant="compact" /></div>}
        </div>
      </section>

'''
    upload = section(upload, '  return (\n    <DashboardLayout', '      {/* PDF Quick Preview Modal Overlay */}', new_ui, 'Resume visual layout')

    quality_header = '''      <div className="resume-check-overview">
        <div className="resume-check-main">
          <span className={`resume-check-symbol ${isUnreadable ? 'is-error' : extractionRating === 'GOOD' || extractionRating === 'EXCELLENT' ? 'is-success' : 'is-warning'}`} aria-hidden="true">
            {isUnreadable ? '!' : extractionRating === 'GOOD' || extractionRating === 'EXCELLENT' ? '✓' : 'i'}
          </span>
          <div>
            <h3>{isUnreadable ? "We couldn't read this file" : extractionRating === 'GOOD' || extractionRating === 'EXCELLENT' ? 'Your resume was read' : 'Your resume needs a quick review'}</h3>
            <p>{isUnreadable
              ? 'Try replacing it with a text-based PDF or Word file.'
              : 'Check the information SkillSync found before using this upload for matching.'}</p>
          </div>
        </div>
        <button type="button" className="resume-guided-text-button"
          onClick={() => setShowAllDetails(value => !value)} aria-expanded={showAllDetails}
          aria-controls="resume-guided-quality-details">
          {showAllDetails ? 'Hide details ↑' : 'View details ↓'}
        </button>
      </div>
      {isUnreadable && (
        <div className="resume-check-advice" role="status">
          <p><strong>What this means:</strong> No readable text was found. Previously saved profile details may still support job matches, but they were not verified from this file.</p>
          <button type="button" className="resume-guided-text-button" onClick={onReupload}>Replace file →</button>
        </div>
      )}
      {showAllDetails && (
        <div id="resume-guided-quality-details" className="resume-guided-quality-details">
          <div className="resume-check-technical">
            <span className={`extraction-rating-badge ${isUnreadable ? 'poor' : extractionRating.toLowerCase()}`}>
              {isUnreadable ? '❌ Text Extraction Failed (0%)' : `Extraction Quality: ${extractionRating} (${extractionScore}%)`}
            </span>
            <span className="quality-meta-pill">{extractionQuality.wordCount || 0} words found</span>
          </div>
          <h4>Resume Quality &amp; Extraction Assessment</h4>
          <p className="resume-check-technical-copy">These details describe document readability, not hiring probability.</p>

'''
    quality = section(quality, '      <div className="quality-card-header">',
                      '      {/* Template Suggestion Alert when extraction is degraded */}',
                      quality_header, 'Quality compact presentation')
    quality = one(quality, '      {/* Interactive Guide Modal */}',
                  '        </div>\n      )}\n\n      {/* Interactive Guide Modal */}', 'Quality detail close')

    if not (upload.count('resume-guided-progress') >= 1 and
            'View My Job Matches' in upload and 'handleSwitchSource' in upload and
            '<SkillTagInput' in upload and '<ResumeQualityCard' in upload and
            'ResumeTemplateSection variant="compact"' in upload and
            'quality-sections-grid' in quality and 'ResumeTemplateModal' in quality and
            'Text Extraction Failed (0%)' in quality):
        raise RuntimeError('Post-patch verification failed. No files changed.')

    css = css.rstrip() + '\n\n' + STYLE_SOURCE.read_text(encoding='utf-8')
    UPLOAD.write_text(upload, encoding='utf-8')
    QUALITY.write_text(quality, encoding='utf-8')
    STYLES.write_text(css, encoding='utf-8')
    print('Guided Resume Experience applied. Files updated:')
    print(' - src/pages/candidate/ResumeUpload.jsx')
    print(' - src/components/resume/ResumeQualityCard.jsx')
    print(' - src/pages/candidate/ResumeUpload.css')
    print('Run: npm run build && git diff --check && npm test (if defined).')
    print('Do not merge/deploy to production without review.')


if __name__ == '__main__':
    try:
        apply()
    except Exception as exc:
        print(f'PATCH ABORTED: {exc}', file=sys.stderr)
        sys.exit(1)
