import { supabase } from "./supabase.js";

/**
 * SkillSync — Notification & Reminders Service
 * Manages candidate and employer notifications across recruitment & interview lifecycles.
 * Includes database-backed notification deduplication for reminders.
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

/**
 * Create a new notification.
 * Performs a clean INSERT without attaching .select() so that sending notifications
 * to transaction partners (e.g. employer to candidate) does not trigger RLS 403 Forbidden
 * on the recipient's SELECT policy.
 */
export async function addNotification(userId, title, message, type = "announcement") {
  if (!userId) return { data: null, error: new Error("User ID is required") };

  try {
    const { error } = await supabase
      .from("notifications")
      .insert([
        {
          user_id: userId,
          title,
          message,
          type,
          is_read: false
        }
      ]);

    if (error) {
      console.warn("[NotificationService] addNotification warning:", error.message);
    }
    return { data: { success: !error }, error };
  } catch (err) {
    console.warn("[NotificationService] addNotification exception:", err.message);
    return { data: null, error: err };
  }
}

/**
 * Checks upcoming interviews for tomorrow/today and dispatches reminder notifications.
 * Features DB-backed deduplication to prevent repeated duplicate reminders.
 */
export async function checkAndSendInterviewReminders(userId) {
  if (!userId) return;

  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Query upcoming confirmed interviews for user (as candidate or employer)
    const { data: upcoming } = await supabase
      .from("interviews")
      .select("*, jobs(title)")
      .in("status", ["CONFIRMED", "PENDING_CONFIRMATION"])
      .or(`candidate_id.eq.${userId},employer_id.eq.${userId}`)
      .in("scheduled_date", [todayStr, tomorrowStr]);

    if (!upcoming || upcoming.length === 0) return;

    // Fetch existing recent notifications (past 24h) for user to deduplicate
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNotifs } = await supabase
      .from("notifications")
      .select("title, message")
      .eq("user_id", userId)
      .gte("created_at", yesterday);

    const recentNotifTitles = new Set((recentNotifs || []).map(n => n.title));

    for (const inv of upcoming) {
      const isToday = inv.scheduled_date === todayStr;
      const timeLabel = isToday ? "today" : "tomorrow";
      const jobTitle = inv.jobs?.title || "Job Placement";

      if (userId === inv.candidate_id) {
        const title = "🔔 Upcoming Interview Reminder";
        const message = `Your interview for "${jobTitle}" is scheduled for ${timeLabel} at ${inv.scheduled_time}.`;

        if (!recentNotifTitles.has(title)) {
          await addNotification(userId, title, message, "interview");
          recentNotifTitles.add(title);
        }
      } else if (userId === inv.employer_id) {
        const title = "🔔 Interview Approaching";
        const message = `Interview scheduled for ${timeLabel} at ${inv.scheduled_time} for "${jobTitle}".`;

        if (!recentNotifTitles.has(title)) {
          await addNotification(userId, title, message, "interview");
          recentNotifTitles.add(title);
        }
      }
    }
  } catch (err) {
    console.warn("Check interview reminders error:", err);
  }
}

/**
 * Helper to generate smart simulated notifications based on user events
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
        message = `An interview has been scheduled for "${meta.jobTitle || "Product Designer"}" on ${meta.date || "tomorrow"}.`;
        type = "interview";
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
