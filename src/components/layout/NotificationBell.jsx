import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { getNotifications, markAsRead, markAllAsRead } from "../../services/notificationService";
import { useToast } from "../../contexts/ToastContext";
import "./NotificationBell.css";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const dropdownRef = useRef(null);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let channel;
    let isMounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted || !session?.user) return;
      
      const userId = session.user.id;
      setCurrentUser(session.user);
      loadNotifications(userId);

      const channelName = `notifications-${userId}`;
      
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const newNotif = payload.new;
            setNotifications((prev) => {
              if (prev.some(n => n.id === newNotif.id)) return prev;
              return [newNotif, ...prev];
            });
            
            if (newNotif.type === 'error') toast.error(newNotif.title);
            else if (newNotif.type === 'success') toast.success(newNotif.title);
            else toast.info(newNotif.title);
          }
        );
      
      channel.subscribe();
    }
    
    init();

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      isMounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  async function loadNotifications(userId) {
    const { data } = await getNotifications(userId);
    setNotifications(data || []);
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  async function handleNotificationClick(notif) {
    if (!notif.is_read) {
      await markAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    setIsOpen(false);

    // Deep link navigation based on notification type & user role
    const userRole = currentUser?.user_metadata?.role;
    if (notif.type === 'interview' || notif.type === 'application_update') {
      if (userRole === 'employer') {
        navigate('/employer/applicants');
      } else {
        navigate('/candidate/applications');
      }
    }
  }

  async function handleMarkAllRead() {
    if (currentUser) {
      await markAllAsRead(currentUser.id);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  }

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button className="notification-bell-btn" onClick={() => setIsOpen(!isOpen)}>
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="mark-all-btn">Mark all read</button>
            )}
          </div>
          <div className="notification-dropdown-body">
            {notifications.length === 0 ? (
              <div className="notification-empty">No new notifications</div>
            ) : (
              notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notification-icon">
                    {notif.type === 'application_update' ? '📝' : notif.type === 'feedback' ? '💬' : notif.type === 'interview' ? '📅' : notif.type === 'job_match' ? '✨' : '🔔'}
                  </div>
                  <div className="notification-content">
                    <h4>{notif.title}</h4>
                    <p>{notif.message}</p>
                    <small>{new Date(notif.created_at).toLocaleString()}</small>
                  </div>
                  {!notif.is_read && <div className="notification-unread-dot"></div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
