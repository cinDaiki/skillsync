import { supabase } from "./supabase";

/**
 * Service to manage candidate and platform notifications.
 */

// Fetch all notifications for the current authenticated user
export async function getNotifications(userId) {
  if (!userId) return { data: [], error: new Error("User ID is required") };
  
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { data: data || [], error };
}

// Mark a single notification as read
export async function markAsRead(notificationId) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .select();

  return { data, error };
}

// Mark all notifications as read for a user
export async function markAllAsRead(userId) {
  if (!userId) return { error: new Error("User ID is required") };

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId);

  return { data, error };
}

// Delete a notification record
export async function deleteNotification(notificationId) {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId);

  return { error };
}

// Clear all notifications
export async function clearAllNotifications(userId) {
  if (!userId) return { error: new Error("User ID is required") };

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId);

  return { error };
}

// Create a new notification
export async function addNotification(userId, title, message, type = "announcement") {
  if (!userId) return { data: null, error: new Error("User ID is required") };

  const { data, error } = await supabase
    .from("notifications")
    .insert([
      {
        user_id: userId,
        title,
        message,
        type,
        is_read: false
      }
    ])
    .select()
    .single();

  return { data, error };
}

/**
 * Helper to generate smart simulated notifications based on user events
 * (Provides instantaneous mock updates to demo platform AI).
 */
export async function triggerSimulationNotification(userId, actionType, meta = {}) {
  try {
    let title = "";
    let message = "";
    let type = "announcement";

    switch (actionType) {
      case "resume_uploaded":
        title = "Resume Uploaded Successfully";
        message = `Your resume "${meta.fileName || "Resume.pdf"}" has been analyzed. Score: ${meta.score || 70}%, ${meta.skillsCount || 0} skills detected automatically.`;
        type = "message";
        break;
      case "job_applied":
        title = "Application Submitted";
        message = `You successfully applied for "${meta.jobTitle || "Software Engineer"}". Track its status in the Applications page.`;
        type = "application_update";
        break;
      case "new_match":
        title = "New Perfect Job Match!";
        message = `"${meta.jobTitle || "React Developer"}" matches ${meta.matchPercent || 90}% of your resume skills. Check it out now!`;
        type = "job_match";
        break;
      case "interview_scheduled":
        title = "Interview Invitation";
        message = `An interview has been scheduled for "${meta.jobTitle || "Product Designer"}" on ${meta.date || "tomorrow"} via Google Meet.`;
        type = "interview";
        break;
      case "application_feedback":
        title = "New Recruiter Feedback";
        message = `Recruiter left feedback for your "${meta.jobTitle}" application: "${meta.feedbackText}".`;
        type = "feedback";
        break;
      case "application_status_change":
        title = "Application Status Updated";
        message = `Your application for "${meta.jobTitle}" has moved to the "${meta.status}" stage.`;
        type = "application_update";
        break;
      default:
        return { data: null };
    }

    return await addNotification(userId, title, message, type);
  } catch (err) {
    console.error("Simulation notification failed:", err);
    return { data: null };
  }
}
