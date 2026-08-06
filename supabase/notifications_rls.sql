-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
ON notifications
FOR SELECT
USING (auth.uid() = user_id);

-- 2. Authenticated users can insert notifications
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
CREATE POLICY "Users can insert notifications"
ON notifications
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Users can update their own notifications
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
ON notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- 4. Users can delete their own notifications
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
ON notifications
FOR DELETE
USING (auth.uid() = user_id);
