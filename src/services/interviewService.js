import { supabase } from "./supabase.js";
import { addNotification } from "./notificationService.js";
import { logAdminAction } from "./adminService.js";

/**
 * SkillSync — Interview Invitation, Candidate Confirmation & Hiring Workflow Service Layer
 * Enforces strict interview lifecycle state machine:
 * PENDING_CONFIRMATION → CONFIRMED / DECLINED / RESCHEDULE_REQUESTED → COMPLETED → HIRING DECISION
 */

// Helper to validate date string is not in the past
function isPastDate(dateString) {
  if (!dateString) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduled = new Date(dateString);
  return scheduled < today;
}

/**
 * 1. Employer sends an interview proposal (ONLINE or WALK_IN)
 * Status starts strictly at PENDING_CONFIRMATION.
 */
export async function sendInterviewInvitation({
  applicationId,
  employerId,
  candidateId,
  jobId,
  interviewType = "ONLINE",
  scheduledDate,
  scheduledTime,
  platform = "Google Meet",
  meetingUrl = "",
  address = "",
  contactPerson = "",
  instructions = "",
}) {
  if (!applicationId || !employerId || !candidateId || !jobId) {
    return { data: null, error: new Error("Missing required application, employer, candidate, or job ID.") };
  }

  if (!scheduledDate || !scheduledTime) {
    return { data: null, error: new Error("Interview date and time are required.") };
  }

  if (isPastDate(scheduledDate)) {
    return { data: null, error: new Error("Interview date cannot be in the past.") };
  }

  if (interviewType === "ONLINE") {
    if (!platform || !platform.trim()) {
      return { data: null, error: new Error("Platform (e.g. Google Meet, Zoom, MS Teams) is required for Online interviews.") };
    }
    if (!meetingUrl || !meetingUrl.trim()) {
      return { data: null, error: new Error("Meeting link URL is required for Online interviews.") };
    }
  } else if (interviewType === "WALK_IN") {
    if (!address || !address.trim()) {
      return { data: null, error: new Error("Office address is required for Walk-in interviews.") };
    }
    if (!contactPerson || !contactPerson.trim()) {
      return { data: null, error: new Error("Contact person is required for Walk-in interviews.") };
    }
  } else {
    return { data: null, error: new Error("Invalid interview type. Must be ONLINE or WALK_IN.") };
  }

  const { data: appData, error: appErr } = await supabase
    .from("applications")
    .select("id, status, jobs(id, title, employer_id)")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !appData) {
    return { data: null, error: new Error("Application not found.") };
  }

  if (appData.jobs?.employer_id !== employerId) {
    return { data: null, error: new Error("Forbidden: You do not own the job listing for this application.") };
  }

  const jobTitle = appData.jobs?.title || "Job Placement";

  const payload = {
    application_id: applicationId,
    employer_id: employerId,
    candidate_id: candidateId,
    job_id: jobId,
    status: "PENDING_CONFIRMATION",
    interview_type: interviewType,
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    platform: interviewType === "ONLINE" ? platform : null,
    meeting_url: interviewType === "ONLINE" ? meetingUrl : null,
    address: interviewType === "WALK_IN" ? address : null,
    contact_person: interviewType === "WALK_IN" ? contactPerson : null,
    instructions: instructions || "",
    proposed_by: employerId,
    proposed_at: new Date().toISOString(),
  };

  const { data: interviewData, error: interviewErr } = await supabase
    .from("interviews")
    .insert([payload])
    .select()
    .maybeSingle();

  if (interviewErr) {
    console.error("Failed to insert interview record:", interviewErr);
    return { data: null, error: interviewErr };
  }

  const legacySchedule = {
    date: scheduledDate,
    time: scheduledTime,
    link: meetingUrl || address,
    notes: instructions,
    type: interviewType,
    status: "PENDING_CONFIRMATION"
  };

  await supabase
    .from("applications")
    .update({
      status: "interview_scheduled",
      interview_schedule: legacySchedule,
      interview_date: scheduledDate,
      interview_location: address || platform,
      interview_link: meetingUrl
    })
    .eq("id", applicationId);

  const detailsMsg = interviewType === "ONLINE"
    ? `on ${scheduledDate} at ${scheduledTime} via ${platform}`
    : `on ${scheduledDate} at ${scheduledTime} at ${address}`;

  await addNotification(
    candidateId,
    "🗓️ Interview Invitation Received",
    `An employer has invited you to an interview for "${jobTitle}" ${detailsMsg}. Please confirm your availability.`,
    "interview"
  );

  await logAdminAction({
    action: "INTERVIEW_PROPOSED",
    targetType: "application",
    targetId: applicationId,
    reason: `Employer proposed ${interviewType} interview for candidate on ${scheduledDate} ${scheduledTime}`,
    metadata: { interviewId: interviewData.id, interviewType }
  });

  return { data: interviewData, error: null };
}

/**
 * 2. Candidate responds to an interview proposal (Accept, Decline, Reschedule Request)
 * Uses secure RPC candidate_respond_interview with state machine validation.
 */
export async function respondToInterview({
  interviewId,
  userId,
  response,
  message = "",
  preferredDate = "",
  preferredTimeRange = "",
}) {
  if (!interviewId || !userId || !response) {
    return { data: null, error: new Error("Missing required parameters.") };
  }

  const validResponses = ["ACCEPTED", "DECLINED", "RESCHEDULE_REQUESTED"];
  if (!validResponses.includes(response)) {
    return { data: null, error: new Error("Invalid response type. Must be ACCEPTED, DECLINED, or RESCHEDULE_REQUESTED.") };
  }

  let { data: interview, error: fetchErr } = await supabase
    .from("interviews")
    .select("*, jobs(title)")
    .eq("id", interviewId)
    .maybeSingle();

  if (fetchErr) {
    const fallback = await supabase
      .from("interviews")
      .select("*")
      .eq("id", interviewId)
      .maybeSingle();
    if (fallback.data) {
      interview = fallback.data;
      fetchErr = null;
    }
  }

  if (fetchErr || !interview) {
    return { data: null, error: new Error("Interview invitation record not found.") };
  }

  if (interview.candidate_id !== userId) {
    return { data: null, error: new Error("Forbidden: You can only respond to your own interview invitations.") };
  }

  // Validate state transitions (Includes DECLINED to prevent invalid accept on declined session)
  const currentStatus = interview.status;
  if (currentStatus === "CANCELLED" || currentStatus === "COMPLETED" || currentStatus === "DECLINED") {
    return { data: null, error: new Error(`Cannot respond to an interview with status: ${currentStatus}`) };
  }

  const { error: rpcErr } = await supabase.rpc("candidate_respond_interview", {
    p_interview_id: interviewId,
    p_response: response,
    p_message: message || null,
    p_preferred_date: preferredDate || null,
    p_preferred_time_range: preferredTimeRange || null,
  });

  if (rpcErr) {
    console.error("RPC candidate_respond_interview error:", rpcErr);
    const newStatus = response === "ACCEPTED" ? "CONFIRMED" : response === "DECLINED" ? "DECLINED" : "RESCHEDULE_REQUESTED";
    await supabase.from("interviews").update({
      status: newStatus,
      candidate_response: response,
      candidate_response_at: new Date().toISOString(),
      candidate_message: message,
      preferred_date: preferredDate,
      preferred_time_range: preferredTimeRange,
      confirmed_at: response === "ACCEPTED" ? new Date().toISOString() : interview.confirmed_at
    }).eq("id", interviewId);
  }

  const jobTitle = interview.jobs?.title || "Job Position";

  if (response === "ACCEPTED") {
    await addNotification(
      interview.employer_id,
      "🟢 Interview Confirmed!",
      `Candidate has confirmed the interview for "${jobTitle}" on ${interview.scheduled_date} at ${interview.scheduled_time}.`,
      "interview"
    );
    await logAdminAction({
      action: "INTERVIEW_CONFIRMED",
      targetType: "interview",
      targetId: interviewId,
      reason: "Candidate confirmed interview schedule."
    });
  } else if (response === "DECLINED") {
    await addNotification(
      interview.employer_id,
      "🔴 Candidate Declined Interview",
      `Candidate declined the interview invitation for "${jobTitle}". Reason: ${message || "No reason provided."}`,
      "interview"
    );
    await logAdminAction({
      action: "INTERVIEW_DECLINED",
      targetType: "interview",
      targetId: interviewId,
      reason: `Candidate declined interview. Reason: ${message}`
    });
  } else if (response === "RESCHEDULE_REQUESTED") {
    await addNotification(
      interview.employer_id,
      "🔄 Candidate Requested Reschedule",
      `Candidate requested another time for "${jobTitle}". Preferred: ${preferredDate || "Flexible"} (${preferredTimeRange || "Anytime"}). Note: ${message || "None"}`,
      "interview"
    );
    await logAdminAction({
      action: "RESCHEDULE_REQUESTED",
      targetType: "interview",
      targetId: interviewId,
      reason: `Candidate requested reschedule to ${preferredDate} ${preferredTimeRange}`
    });
  }

  const { data: updated } = await supabase.from("interviews").select("*").eq("id", interviewId).maybeSingle();
  return { data: updated, error: null };
}

/**
 * 3. Employer proposes a revised schedule after reschedule request or change
 * Resets status back to PENDING_CONFIRMATION requiring candidate acceptance.
 */
export async function rescheduleInterviewByEmployer({
  interviewId,
  employerId,
  newDate,
  newTime,
  platform,
  meetingUrl,
  address,
  contactPerson,
  instructions,
}) {
  if (!interviewId || !employerId || !newDate || !newTime) {
    return { data: null, error: new Error("Missing interview ID, employer ID, new date, or new time.") };
  }

  if (isPastDate(newDate)) {
    return { data: null, error: new Error("New interview date cannot be in the past.") };
  }

  let { data: interview, error: fetchErr } = await supabase
    .from("interviews")
    .select("*, jobs(title)")
    .eq("id", interviewId)
    .maybeSingle();

  if (fetchErr) {
    const fallback = await supabase
      .from("interviews")
      .select("*")
      .eq("id", interviewId)
      .maybeSingle();
    if (fallback.data) {
      interview = fallback.data;
      fetchErr = null;
    }
  }

  if (fetchErr || !interview) {
    return { data: null, error: new Error("Interview record not found.") };
  }

  if (interview.employer_id !== employerId) {
    return { data: null, error: new Error("Forbidden: You do not own this interview record.") };
  }

  if (interview.status === "COMPLETED" || interview.status === "CANCELLED") {
    return { data: null, error: new Error(`Cannot reschedule an interview with status: ${interview.status}`) };
  }

  const updatedPayload = {
    status: "PENDING_CONFIRMATION",
    scheduled_date: newDate,
    scheduled_time: newTime,
    platform: platform !== undefined ? platform : interview.platform,
    meeting_url: meetingUrl !== undefined ? meetingUrl : interview.meeting_url,
    address: address !== undefined ? address : interview.address,
    contact_person: contactPerson !== undefined ? contactPerson : interview.contact_person,
    instructions: instructions !== undefined ? instructions : interview.instructions,
    proposed_by: employerId,
    proposed_at: new Date().toISOString(),
    candidate_response: null,
    candidate_response_at: null,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from("interviews")
    .update(updatedPayload)
    .eq("id", interviewId)
    .select()
    .maybeSingle();

  if (updateErr) {
    return { data: null, error: updateErr };
  }

  await supabase.from("applications").update({
    status: "interview",
    interview_date: newDate,
    interview_schedule: {
      date: newDate,
      time: newTime,
      link: meetingUrl || address || interview.meeting_url,
      notes: instructions || interview.instructions,
      type: interview.interview_type,
      status: "PENDING_CONFIRMATION"
    }
  }).eq("id", interview.application_id);

  const jobTitle = interview.jobs?.title || "Job Position";
  await addNotification(
    interview.candidate_id,
    "📅 New Interview Schedule Proposed",
    `The employer proposed a new interview time for "${jobTitle}" on ${newDate} at ${newTime}. Please review and confirm.`,
    "interview"
  );

  await logAdminAction({
    action: "INTERVIEW_RESCHEDULED",
    targetType: "interview",
    targetId: interviewId,
    reason: `Employer rescheduled interview to ${newDate} ${newTime}`
  });

  return { data: updated, error: null };
}

/**
 * 4. Employer or Authorized User cancels interview
 */
export async function cancelInterview({ interviewId, userId, reason = "" }) {
  if (!interviewId || !userId) {
    return { data: null, error: new Error("Interview ID and User ID are required.") };
  }

  let { data: interview, error: fetchErr } = await supabase
    .from("interviews")
    .select("*, jobs(title)")
    .eq("id", interviewId)
    .maybeSingle();

  if (fetchErr) {
    const fallback = await supabase
      .from("interviews")
      .select("*")
      .eq("id", interviewId)
      .maybeSingle();
    if (fallback.data) {
      interview = fallback.data;
      fetchErr = null;
    }
  }

  if (fetchErr || !interview) {
    return { data: null, error: new Error("Interview record not found.") };
  }

  if (interview.employer_id !== userId && interview.candidate_id !== userId) {
    return { data: null, error: new Error("Forbidden: You are not authorized to cancel this interview.") };
  }

  if (interview.status === "COMPLETED" || interview.status === "CANCELLED") {
    return { data: null, error: new Error(`Interview is already ${interview.status.toLowerCase()}`) };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("interviews")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .select()
    .maybeSingle();

  if (updateErr) {
    return { data: null, error: updateErr };
  }

  const jobTitle = interview.jobs?.title || "Job Position";
  const recipientId = userId === interview.employer_id ? interview.candidate_id : interview.employer_id;
  const cancellerType = userId === interview.employer_id ? "The employer" : "The candidate";

  await addNotification(
    recipientId,
    "🚫 Interview Cancelled",
    `${cancellerType} cancelled the interview for "${jobTitle}". ${reason ? `Reason: ${reason}` : ""}`,
    "interview"
  );

  await logAdminAction({
    action: "INTERVIEW_CANCELLED",
    targetType: "interview",
    targetId: interviewId,
    reason: `Interview cancelled by ${cancellerType}. ${reason}`
  });

  return { data: updated, error: null };
}

/**
 * 5. Employer marks interview as COMPLETED after the session occurs
 */
export async function completeInterview({ interviewId, employerId }) {
  if (!interviewId || !employerId) {
    return { data: null, error: new Error("Interview ID and Employer ID are required.") };
  }

  let { data: interview, error: fetchErr } = await supabase
    .from("interviews")
    .select("*, jobs(title)")
    .eq("id", interviewId)
    .maybeSingle();

  if (fetchErr) {
    const fallback = await supabase
      .from("interviews")
      .select("*")
      .eq("id", interviewId)
      .maybeSingle();
    if (fallback.data) {
      interview = fallback.data;
      fetchErr = null;
    }
  }

  if (fetchErr || !interview) {
    return { data: null, error: new Error("Interview record not found.") };
  }

  if (interview.employer_id !== employerId) {
    return { data: null, error: new Error("Forbidden: You do not own this interview record.") };
  }

  if (interview.status === "CANCELLED" || interview.status === "DECLINED") {
    return { data: null, error: new Error(`Cannot complete an interview with status: ${interview.status}`) };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("interviews")
    .update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .select()
    .maybeSingle();

  if (updateErr) {
    return { data: null, error: updateErr };
  }

  // Update application status to interview_completed so candidate moves to Hiring Decisions workspace
  if (interview.application_id) {
    await supabase
      .from("applications")
      .update({
        status: "interview_completed",
        updated_at: new Date().toISOString()
      })
      .eq("id", interview.application_id);
  }

  const jobTitle = interview.jobs?.title || "Job Position";

  await addNotification(
    interview.candidate_id,
    "✓ Interview Session Completed",
    `Your interview for "${jobTitle}" has been marked as completed. The employer is reviewing your application.`,
    "interview"
  );

  await logAdminAction({
    action: "INTERVIEW_COMPLETED",
    targetType: "interview",
    targetId: interviewId,
    reason: "Interview session marked as completed by employer."
  });

  return { data: updated, error: null };
}

/**
 * 6. Save Private Recruiter Evaluation (Technical/Comm Ratings & Private Notes)
 * Uses RPC save_interview_evaluation to guarantee candidate cannot view evaluation.
 */
export async function saveInterviewEvaluation({
  interviewId,
  employerId,
  notes = "",
  techRating = null,
  commRating = null,
  recommendation = "",
}) {
  if (!interviewId || !employerId) {
    return { data: null, error: new Error("Interview ID and Employer ID are required.") };
  }

  if (techRating !== null && (techRating < 1 || techRating > 5)) {
    return { data: null, error: new Error("Technical rating must be between 1 and 5.") };
  }

  if (commRating !== null && (commRating < 1 || commRating > 5)) {
    return { data: null, error: new Error("Communication rating must be between 1 and 5.") };
  }

  const { error: rpcErr } = await supabase.rpc("save_interview_evaluation", {
    p_interview_id: interviewId,
    p_notes: notes || null,
    p_tech_rating: techRating,
    p_comm_rating: commRating,
    p_recommendation: recommendation || null,
  });

  if (rpcErr) {
    console.error("RPC save_interview_evaluation error:", rpcErr);
    return { data: null, error: rpcErr };
  }

  const { data: evalRecord } = await supabase
    .from("interview_evaluations")
    .select("*")
    .eq("interview_id", interviewId)
    .maybeSingle();

  return { data: evalRecord, error: null };
}

/**
 * 7. Employer executes Final Hiring Decision (HIRED or REJECTED)
 * Candidate receives professional notice without private recruiter notes.
 */
export async function makeHiringDecision({
  applicationId,
  employerId,
  candidateId,
  decision,
  rejectionReason = "",
}) {
  if (!applicationId || !employerId || !candidateId || !decision) {
    return { data: null, error: new Error("Missing required parameters for hiring decision.") };
  }

  const upperDecision = decision.toUpperCase();
  if (upperDecision !== "HIRED" && upperDecision !== "REJECTED") {
    return { data: null, error: new Error("Decision must be HIRED or REJECTED.") };
  }

  let { data: appData, error: appErr } = await supabase
    .from("applications")
    .select("id, jobs(title, employer_id)")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr) {
    const fallback = await supabase.from("applications").select("*").eq("id", applicationId).maybeSingle();
    if (fallback.data) {
      appData = fallback.data;
      appErr = null;
    }
  }

  if (appErr || !appData) {
    return { data: null, error: new Error("Application not found.") };
  }

  if (appData.jobs?.employer_id && appData.jobs.employer_id !== employerId) {
    return { data: null, error: new Error("Forbidden: You do not own the job listing for this application.") };
  }

  const jobTitle = appData.jobs?.title || "Position";
  const newStatus = upperDecision === "HIRED" ? "hired" : "rejected";

  const appUpdatePayload = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };
  if (upperDecision === "REJECTED" && rejectionReason) {
    appUpdatePayload.reject_reason = rejectionReason;
  }

  let { data: updatedApp, error: updateErr } = await supabase
    .from("applications")
    .update(appUpdatePayload)
    .eq("id", applicationId)
    .select()
    .maybeSingle();

  if (updateErr && (updateErr.code === "PGRST204" || updateErr.code === "42703")) {
    delete appUpdatePayload.reject_reason;
    ({ data: updatedApp, error: updateErr } = await supabase
      .from("applications")
      .update(appUpdatePayload)
      .eq("id", applicationId)
      .select()
      .maybeSingle());
  }

  if (updateErr) {
    return { data: null, error: updateErr };
  }

  // Cleanly resolve any active/upcoming interview sessions for this application
  const resolvedInterviewStatus = upperDecision === "HIRED" ? "COMPLETED" : "CANCELLED";
  const nowIso = new Date().toISOString();

  await supabase
    .from("interviews")
    .update({
      status: resolvedInterviewStatus,
      completed_at: upperDecision === "HIRED" ? nowIso : null,
      cancelled_at: upperDecision === "REJECTED" ? nowIso : null,
      updated_at: nowIso
    })
    .eq("application_id", applicationId)
    .in("status", ["PENDING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED"]);

  if (upperDecision === "HIRED") {
    await addNotification(
      candidateId,
      "🎉 Congratulations! You Have Been Selected!",
      `We are pleased to inform you that you have been hired for "${jobTitle}"! Check your application tracker for next steps.`,
      "application_update"
    );
    await logAdminAction({
      action: "CANDIDATE_HIRED",
      targetType: "application",
      targetId: applicationId,
      reason: `Employer selected candidate for ${jobTitle}`
    });
  } else {
    await addNotification(
      candidateId,
      "Application Update",
      `Thank you for interviewing for "${jobTitle}". After careful consideration, the employer has decided not to proceed with your application at this time.`,
      "application_update"
    );
    await logAdminAction({
      action: "CANDIDATE_REJECTED",
      targetType: "application",
      targetId: applicationId,
      reason: `Candidate rejected for ${jobTitle}. Reason: ${rejectionReason || "None"}`
    });
  }

  return { data: updatedApp, error: null };
}

/**
 * 8. Fetch Interview by Application ID
 */
export async function fetchInterviewByApplication(applicationId) {
  if (!applicationId) return { data: null, error: null };

  let { data, error } = await supabase
    .from("interviews")
    .select("*, jobs(title, employment_type, location)")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (error) {
    const fallbackRes = await supabase
      .from("interviews")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    
    if (fallbackRes.data) {
      data = fallbackRes.data;
      error = null;
    }
  }

  if (data) return { data, error: null };

  const { data: appData } = await supabase
    .from("applications")
    .select("id, interview_schedule, interview_date, interview_location, interview_link")
    .eq("id", applicationId)
    .maybeSingle();

  if (appData && (appData.interview_schedule?.date || appData.interview_date)) {
    const isched = appData.interview_schedule || {};
    return {
      data: {
        id: `legacy-${appData.id}`,
        application_id: appData.id,
        status: isched.status || "CONFIRMED",
        interview_type: isched.type || (appData.interview_link ? "ONLINE" : "WALK_IN"),
        scheduled_date: isched.date || appData.interview_date,
        scheduled_time: isched.time || "TBD",
        platform: isched.platform || "Google Meet",
        meeting_url: isched.link || appData.interview_link,
        address: appData.interview_location || isched.link,
        contact_person: isched.contact_person || "Hiring Team",
        instructions: isched.notes || "",
        is_legacy: true
      },
      error: null
    };
  }

  return { data: null, error: null };
}

/**
 * 9. Fetch all interviews for candidate
 */
export async function fetchInterviewsForCandidate(candidateId) {
  if (!candidateId) return { data: [], error: null };

  let { data, error } = await supabase
    .from("interviews")
    .select("*, jobs(title, employment_type, location)")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });

  if (error) {
    const fallback = await supabase
      .from("interviews")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    return { data: fallback.data || [], error: null };
  }

  return { data: data || [], error: null };
}

/**
 * 10. Fetch all interviews for employer
 */
export async function fetchInterviewsForEmployer(employerId) {
  if (!employerId) return { data: [], error: null };

  let { data, error } = await supabase
    .from("interviews")
    .select("*, jobs(id, title, employment_type, location), applications(id, status, applicant_id, profiles(full_name, email))")
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    const fallback = await supabase
      .from("interviews")
      .select("*, jobs(id, title, employment_type, location)")
      .eq("employer_id", employerId)
      .order("created_at", { ascending: false });
    data = fallback.data || [];
  }

  const enriched = await Promise.all(
    (data || []).map(async (inv) => {
      let candidateName = inv.applications?.profiles?.full_name || inv.profiles?.full_name || inv.candidate_name;
      let candidateEmail = inv.applications?.profiles?.email || inv.profiles?.email || inv.candidate_email;

      if (!candidateName && inv.candidate_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", inv.candidate_id)
          .maybeSingle();
        if (prof) {
          candidateName = prof.full_name;
          candidateEmail = prof.email;
        }
      }

      const jobTitle = inv.jobs?.title || inv.job_title || "Position";

      return {
        ...inv,
        interviewId: inv.id,
        applicationId: inv.application_id,
        applicantId: inv.candidate_id || inv.applications?.applicant_id,
        candidate_name: candidateName || "Candidate",
        candidate_email: candidateEmail || "",
        job_title: jobTitle,
        jobId: inv.job_id || inv.jobs?.id,
        interviewStatus: inv.status,
        applicationStatus: inv.applications?.status || "interview_scheduled",
        scheduledDate: inv.scheduled_date,
        scheduledTime: inv.scheduled_time,
        interviewType: inv.interview_type,
        address: inv.address,
        meetingLink: inv.meeting_url,
        instructions: inv.instructions,
        completedAt: inv.completed_at
      };
    })
  );

  return { data: enriched, error: null };
}

/**
 * 11. Fetch Upcoming Confirmed / Pending Interviews for Employer Reminder Cards
 */
export async function fetchUpcomingInterviews(employerId) {
  if (!employerId) return { data: [], error: null };

  let { data, error } = await supabase
    .from("interviews")
    .select("*, jobs(title, employment_type, location), applications(status)")
    .eq("employer_id", employerId)
    .in("status", ["PENDING_CONFIRMATION", "CONFIRMED"])
    .order("scheduled_date", { ascending: true });

  if (error) {
    const fallback = await supabase
      .from("interviews")
      .select("*")
      .eq("employer_id", employerId)
      .in("status", ["PENDING_CONFIRMATION", "CONFIRMED"])
      .order("scheduled_date", { ascending: true });
    data = fallback.data;
  }

  // Exclude interviews belonging to terminal application outcomes (hired or rejected)
  const activeUpcoming = (data || []).filter(inv => {
    const appStatus = (inv.applications?.status || "").toLowerCase();
    return appStatus !== "hired" && appStatus !== "rejected" && appStatus !== "accepted" && appStatus !== "withdrawn";
  });

  return { data: activeUpcoming, error: null };
}
