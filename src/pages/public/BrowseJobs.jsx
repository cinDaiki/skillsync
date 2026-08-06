import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import "./BrowseJobs.css";

export default function BrowseJobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Inputs mapped to URL params or local state
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "");
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [type, setType] = useState(searchParams.get("type") || "");

  // Sidebar interactive filters
  const [setup, setSetup] = useState("Any");
  const [skills, setSkills] = useState("");

  // States
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const signInRedirect = `/sign-in?redirect=${encodeURIComponent(
    `/browse-jobs${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
  )}`;

  // Sync inputs with URL changes (e.g. from landing page search)
  useEffect(() => {
    setKeyword(searchParams.get("keyword") || "");
    setLocation(searchParams.get("location") || "");
    setType(searchParams.get("type") || "");
  }, [searchParams]);

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        localStorage.removeItem("skillsync_user");
        localStorage.removeItem("skillsync_candidate_profile");
        setCurrentUser(null);
        return;
      }

      const userJson = localStorage.getItem("skillsync_user");
      if (userJson) {
        try {
          setCurrentUser(JSON.parse(userJson));
        } catch (e) {
          console.error("Failed to parse user session", e);
        }
      }
    }
    checkSession();
  }, []);

  // Open jobs are visible to everyone (guests included)
  useEffect(() => {
    async function fetchJobs() {
      setLoading(true);
      setFetchError("");

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching jobs:", error.message);
        setFetchError(
          "Could not load job listings. Run supabase/public_jobs_access.sql in the Supabase SQL Editor, then refresh."
        );
        setJobs([]);
      } else {
        setJobs(data || []);
      }

      setLoading(false);
    }

    fetchJobs();
  }, []);

  // Apply search inputs and sidebar filters dynamically
  useEffect(() => {
    let result = [...jobs];

    // 1. Keyword search (matches title, description, skills)
    if (keyword.trim()) {
      const query = keyword.toLowerCase();
      result = result.filter(
        (job) =>
          job.title?.toLowerCase().includes(query) ||
          job.description?.toLowerCase().includes(query) ||
          job.required_skills?.toLowerCase().includes(query)
      );
    }

    // 2. Location search
    if (location.trim()) {
      const query = location.toLowerCase();
      result = result.filter((job) =>
        job.location?.toLowerCase().includes(query)
      );
    }

    // 3. Employment Type filter (normalize "Full-time" vs "full-time" vs "Full Time")
    if (type) {
      const normalizeType = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/[\s_-]+/g, "");
      const queryType = normalizeType(type);
      result = result.filter(
        (job) => normalizeType(job.employment_type) === queryType
      );
    }

    // 4. Setup filter (Remote vs On-site)
    if (setup !== "Any") {
      const isRemoteQuery = setup === "Remote";
      result = result.filter((job) => {
        const loc = job.location?.toLowerCase() || "";
        const isRemote = loc.includes("remote") || job.employment_type?.toLowerCase() === "remote";
        return isRemoteQuery ? isRemote : !isRemote;
      });
    }

    // 5. Skill Search filter
    if (skills.trim()) {
      const query = skills.toLowerCase();
      result = result.filter((job) =>
        job.required_skills?.toLowerCase().includes(query)
      );
    }

    setFilteredJobs(result);
  }, [jobs, keyword, location, type, setup, skills]);

  // Search button handler
  function handleSearchSubmit() {
    const params = {};
    if (keyword) params.keyword = keyword;
    if (location) params.location = location;
    if (type) params.type = type;
    setSearchParams(params);
  }

  // Clear all filters
  function handleClearFilters() {
    setKeyword("");
    setLocation("");
    setType("");
    setSetup("Any");
    setSkills("");
    setSearchParams({});
  }

  // Determine user workspace path based on role
  function getDashboardPath() {
    if (!currentUser) return "/sign-in";
    const role = currentUser.role;
    if (role === "candidate" || role === "job_seeker") return "/candidate/dashboard";
    if (role === "employer") return "/employer/dashboard";
    if (role === "admin") return "/admin/dashboard";
    return "/candidate/dashboard";
  }

  return (
    <main className="browse-page">
      <header className="browse-navbar">
        <Link to="/" className="browse-brand">
          <span className="browse-brand-icon">✓</span>
          <span className="browse-brand-text">
            <strong>SkillSync</strong>
            <small>Find the right match</small>
          </span>
        </Link>

        <nav className="browse-nav-links">
          <Link to="/">Home</Link>
          <Link className="active" to="/browse-jobs">
            Browse Jobs
          </Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/about">About us</Link>
        </nav>

        <div className="browse-nav-actions">
          {currentUser ? (
            <Link className="browse-btn browse-btn-pink" to={getDashboardPath()}>
              Go to Workspace
            </Link>
          ) : (
            <>
              <Link className="browse-btn browse-btn-outline" to="/sign-in">
                Sign In
              </Link>
              <Link className="browse-btn browse-btn-pink" to="/sign-up">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="browse-hero">
        <div className="browse-hero-inner">
          <div className="browse-hero-copy">
            <span className="browse-badge">Browse Opportunities</span>
            <h1>Browse jobs with a cleaner matching experience.</h1>
            <p>
              Explore open opportunities without an account. Sign in when you are ready to apply.
            </p>
          </div>
        </div>
      </section>

      <section className="browse-search-section">
        <div className="browse-search-card">
          <div className="browse-search-title">
            <h2>Find your next opportunity</h2>
            <p>Search and filter jobs based on your preferred role and setup.</p>
          </div>

          <div className="browse-search-grid">
            <div className="browse-input">
              <span>⌕</span>
              <input
                type="text"
                placeholder="Job title, keyword, or company"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="browse-input">
              <span>⌖</span>
              <input
                type="text"
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <select
              className="browse-select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All Job Types</option>
              <option value="full-time">Full Time</option>
              <option value="part-time">Part Time</option>
              <option value="remote">Remote</option>
              <option value="internship">Internship</option>
            </select>

            <button className="browse-search-btn" onClick={handleSearchSubmit}>
              Search Jobs
            </button>
          </div>
        </div>
      </section>

      <section className="browse-content-section">
        <div className="browse-layout">
          <aside className="browse-sidebar">
            <div className="browse-sidebar-card">
              <h3>Filters</h3>

              <div className="browse-filter-group">
                <label>Work Setup</label>
                <select value={setup} onChange={(e) => setSetup(e.target.value)}>
                  <option value="Any">Any Setup</option>
                  <option value="On-site">On-site</option>
                  <option value="Remote">Remote</option>
                </select>
              </div>

              <div className="browse-filter-group">
                <label>Required Skills</label>
                <input
                  type="text"
                  placeholder="e.g. React, Node, CSS"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  style={{
                    height: "44px",
                    padding: "0 12px",
                    border: "1px solid #d8dee9",
                    borderRadius: "14px",
                    fontSize: "14px",
                    color: "#344054",
                    outline: "none",
                  }}
                />
              </div>

              <button className="browse-clear-btn" onClick={handleClearFilters}>
                Clear Filters
              </button>
            </div>
          </aside>

          <div className="browse-results">
            <div className="browse-results-top">
              <div>
                <h3>Available Jobs</h3>
                <p>
                  {loading
                    ? "Loading job opportunities..."
                    : `Showing ${filteredJobs.length} open position${
                        filteredJobs.length === 1 ? "" : "s"
                      } matching your criteria.`}
                </p>
              </div>

              <div className="browse-results-meta">
                <span className="results-badge">
                  {loading ? "..." : `${filteredJobs.length} Jobs`}
                </span>
              </div>
            </div>

            {fetchError && (
              <div className="browse-fetch-error" role="alert">
                {fetchError}
              </div>
            )}

            {loading ? (
              <div className="browse-placeholder-grid">
                <div className="browse-placeholder-card"></div>
                <div className="browse-placeholder-card"></div>
                <div className="browse-placeholder-card"></div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="browse-empty-state">
                <div className="browse-empty-icon">▣</div>
                <h4>No job listings found</h4>
                <p>
                  {jobs.length > 0
                    ? "Try refining your search queries or clearing your filters to see more results."
                    : fetchError
                    ? "Fix the database policy above, then refresh this page."
                    : "No open job posts are published yet. Check back soon or post a job as an employer."}
                </p>
                <button
                  onClick={handleClearFilters}
                  className="browse-outline-btn"
                  style={{ marginTop: "16px", cursor: "pointer" }}
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="browse-placeholder-grid" style={{ display: "grid", gap: "18px", marginTop: "20px" }}>
                {filteredJobs.map((job) => (
                  <article
                    className="job-match-card"
                    key={job.id}
                    style={{
                      padding: "24px",
                      border: "1px solid #eadff7",
                      borderRadius: "22px",
                      background: "#fbf9ff",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      boxShadow: "0 10px 24px rgba(16, 24, 40, 0.02)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                      <div>
                        <h3 style={{ margin: "0 0 6px", color: "#101828", fontSize: "18px", fontWeight: "900" }}>
                          {job.title}
                        </h3>
                        <p style={{ margin: 0, color: "#667085", fontSize: "14px", lineHeight: "1.6" }}>
                          {job.description || "No description provided."}
                        </p>
                      </div>
                      <span
                        className="job-status-badge open"
                        style={{
                          padding: "8px 14px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "900",
                          background: "#e9fbef",
                          color: "#15803d",
                          lineHeight: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {job.status || "open"}
                      </span>
                    </div>

                    <div className="job-meta" style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: 0 }}>
                      <span style={{ padding: "8px 12px", borderRadius: "999px", background: "#f3ebff", color: "#6f1dce", fontSize: "13px", fontWeight: "900", lineHeight: 1 }}>
                        {job.employment_type || "Not specified"}
                      </span>
                      <span style={{ padding: "8px 12px", borderRadius: "999px", background: "#f3ebff", color: "#6f1dce", fontSize: "13px", fontWeight: "900", lineHeight: 1 }}>
                        {job.location || "No location"}
                      </span>
                      <span style={{ padding: "8px 12px", borderRadius: "999px", background: "#f3ebff", color: "#6f1dce", fontSize: "13px", fontWeight: "900", lineHeight: 1 }}>
                        Skills: {job.required_skills || "None listed"}
                      </span>
                    </div>

                    <div style={{ marginTop: "4px" }}>
                      <button
                        onClick={() =>
                          navigate(currentUser ? "/candidate/jobs" : signInRedirect)
                        }
                        className="browse-primary-btn"
                        style={{
                          minWidth: "130px",
                          height: "40px",
                          fontSize: "13px",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {currentUser ? "Apply Now" : "Sign in to Apply"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}