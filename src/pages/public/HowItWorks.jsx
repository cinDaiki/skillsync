import { Link, NavLink } from "react-router-dom";
import AuthTransitionLink from "../../components/common/AuthTransitionLink";
import "./HowItWorks.css";

export default function HowItWorks() {
  return (
    <main className="how-page">
      <nav className="how-navbar">
        <Link to="/" className="how-brand">
          <span className="how-brand-icon">✓</span>
          <span>
            <strong>SkillSync</strong>
            <small>Find the right match</small>
          </span>
        </Link>

        <div className="how-nav-links">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/browse-jobs">Browse Jobs</NavLink>
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/about">About us</NavLink>
        </div>

        <div className="how-nav-actions">
          <AuthTransitionLink to="/sign-in" type="signin" className="how-btn how-btn-outline">
            Sign In
          </AuthTransitionLink>

          <AuthTransitionLink to="/sign-up" type="signup" className="how-btn how-btn-primary">
            Sign Up
          </AuthTransitionLink>
        </div>
      </nav>

      <section className="how-hero">
        <div className="how-hero-inner">
          <div className="how-hero-copy">
            <span className="how-badge">How SkillSync Works</span>

            <h1>Simple steps to connect job seekers and employers.</h1>

            <p>
              SkillSync helps job seekers create profiles, apply to jobs, and
              track their application status while employers manage job posts
              and review applicants recommended by the admin.
            </p>

            <div className="how-hero-actions">
              <AuthTransitionLink to="/sign-up" type="signup" className="how-primary-btn">
                Get Started
              </AuthTransitionLink>

              <Link to="/browse-jobs" className="how-outline-btn">
                Browse Jobs
              </Link>
            </div>
          </div>

          <div className="how-hero-panel">
            <div className="how-panel-card">
              <span>1</span>
              <div>
                <h3>Create an account</h3>
                <p>Choose whether you are a job seeker or an employer.</p>
              </div>
            </div>

            <div className="how-panel-card">
              <span>2</span>
              <div>
                <h3>Complete your profile</h3>
                <p>Add your details, resume, or company information.</p>
              </div>
            </div>

            <div className="how-panel-card">
              <span>3</span>
              <div>
                <h3>Start matching</h3>
                <p>Apply to jobs or review applicants from your workspace.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="how-container">
          <div className="how-section-heading">
            <span>For Job Seekers</span>
            <h2>Build your career profile and apply to jobs.</h2>
            <p>
              Job seekers can upload their resume, update their profile, browse
              available jobs, submit applications, and see whether an employer
              accepted or rejected their application.
            </p>
          </div>

          <div className="how-steps-grid">
            <article className="how-step-card">
              <div className="how-step-icon">▤</div>
              <h3>Upload Resume</h3>
              <p>
                Add your resume so your skills and experience are ready for job
                matching.
              </p>
            </article>

            <article className="how-step-card">
              <div className="how-step-icon">👤</div>
              <h3>Complete Profile</h3>
              <p>
                Save your full name, address, contact number, skills, and other
                important details.
              </p>
            </article>

            <article className="how-step-card">
              <div className="how-step-icon">◎</div>
              <h3>Find Matched Jobs</h3>
              <p>
                View open job posts created by employers and apply to the jobs
                that fit your profile.
              </p>
            </article>

            <article className="how-step-card">
              <div className="how-step-icon">▣</div>
              <h3>Track Applications</h3>
              <p>
                See your submitted applications and check if you were accepted
                or rejected by the employer.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="how-section how-section-soft">
        <div className="how-container">
          <div className="how-section-heading">
            <span>For Employers</span>
            <h2>Post jobs and manage applicants clearly.</h2>
            <p>
              Employers can create job posts, manage company information, and
              review applicants assigned by the admin after the interview
              process.
            </p>
          </div>

          <div className="how-steps-grid">
            <article className="how-step-card">
              <div className="how-step-icon">＋</div>
              <h3>Post Job</h3>
              <p>
                Add job title, job type, location, salary range, and description
                for job seekers to view.
              </p>
            </article>

            <article className="how-step-card">
              <div className="how-step-icon">▣</div>
              <h3>Manage Jobs</h3>
              <p>
                Edit, close, reopen, or delete only the job posts created by
                your employer account.
              </p>
            </article>

            <article className="how-step-card">
              <div className="how-step-icon">👥</div>
              <h3>Review Applicants</h3>
              <p>
                View applicants recommended by the admin and decide whether to
                accept or reject them.
              </p>
            </article>

            <article className="how-step-card">
              <div className="how-step-icon">▤</div>
              <h3>Update Company</h3>
              <p>
                Manage your company name, industry, location, website, contact
                details, and company overview.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}