import { supabase } from './supabase'
import { applyForJobWithSnapshot } from './applicationService'

// Get all open jobs
export const getJobs = async () => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'open')
  return { data, error }
}

// Get single job by ID
export const getJobById = async (id) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()
  return { data, error }
}

/**
 * Fetch current weekly job posting usage for the authenticated employer.
 * Asia/Manila Monday 00:00:00 to Monday 00:00:00 window.
 */
export const getEmployerWeeklyUsage = async () => {
  try {
    const { data, error } = await supabase.rpc('get_employer_weekly_job_usage')
    return { data, error }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Server-authoritative atomic employer job creation with weekly posting limit enforcement.
 * Enforces max 5 new job posts per week per employer.
 */
export const createEmployerJob = async (jobData) => {
  try {
    const { data, error } = await supabase.rpc('create_employer_job', {
      p_job_data: jobData
    })

    if (error) {
      const isLimitReached =
        error.details === 'WEEKLY_JOB_POST_LIMIT_REACHED' ||
        error.message?.includes('WEEKLY_JOB_POST_LIMIT_REACHED') ||
        error.details?.includes('WEEKLY_JOB_POST_LIMIT_REACHED') ||
        error.hint?.includes('WEEKLY_JOB_POST_LIMIT_REACHED');

      if (isLimitReached) {
        return {
          data: null,
          error: {
            code: 'WEEKLY_JOB_POST_LIMIT_REACHED',
            message: "You've reached your weekly limit of 5 new job posts. You can create another job when your weekly posting window resets on Monday."
          }
        }
      }
      return { data: null, error }
    }

    return { data: data?.job, usage: data?.usage, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Legacy create a job wrapper (routes to authoritative createEmployerJob)
export const createJob = async (jobData) => {
  const res = await createEmployerJob(jobData)
  if (res.data) {
    return { data: [res.data], error: null }
  }
  return { data: null, error: res.error }
}

// Apply for a job (job seeker) - routed through canonical guarded application service
export const applyForJob = async (jobId, applicantId) => {
  return applyForJobWithSnapshot(jobId, applicantId)
}

// Get applications by applicant
export const getMyApplications = async (applicantId) => {
  const { data, error } = await supabase
    .from('applications')
    .select('*, jobs(*)')
    .eq('applicant_id', applicantId)
  return { data, error }
}