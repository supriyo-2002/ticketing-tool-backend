
const { supabaseAdmin } = require("../config/supabase");

// --------------------------------------------------
// GET ALL NOTIFICATIONS FOR THE LOGGED-IN USER
// --------------------------------------------------
const getNotifications = async (req, res) => {
    try {
        const { user_id, organization_id } = req.user;

        // Read pagination values from query parameters.
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(
            Math.max(parseInt(req.query.limit, 10) || 20, 1),
            50
        );

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Retrieve only this user's notifications.
        const { data, error, count } = await supabaseAdmin
            .from("notifications")
            .select("*", { count: "exact" })
            .eq("organization_id", organization_id)
            .eq("recipient_id", user_id)
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw error;

        return res.status(200).json({
            success: true,
            message: "Notifications retrieved successfully.",
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            },
            data
        });

    } catch (error) {
        console.error("Get notifications error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve notifications."
        });
    }
};


// --------------------------------------------------
// GET UNREAD NOTIFICATION COUNT
// --------------------------------------------------
const getUnreadNotificationCount = async (req, res) => {
    try {
        const { user_id, organization_id } = req.user;

        const { count, error } = await supabaseAdmin
            .from("notifications")
            .select("notification_id", {
                count: "exact",
                head: true
            })
            .eq("organization_id", organization_id)
            .eq("recipient_id", user_id)
            .eq("is_read", false);

        if (error) throw error;

        return res.status(200).json({
            success: true,
            unread_count: count || 0
        });

    } catch (error) {
        console.error("Unread notification count error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve unread notification count."
        });
    }
};


// --------------------------------------------------
// MARK ONE NOTIFICATION AS READ
// --------------------------------------------------
const markNotificationAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const { user_id, organization_id } = req.user;

        const { data, error } = await supabaseAdmin
            .from("notifications")
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq("notification_id", notificationId)
            .eq("organization_id", organization_id)
            .eq("recipient_id", user_id)
            .select()
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Notification not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read.",
            data
        });

    } catch (error) {
        console.error("Mark notification as read error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to mark notification as read."
        });
    }
};


// --------------------------------------------------
// MARK ALL NOTIFICATIONS AS READ
// --------------------------------------------------
const markAllNotificationsAsRead = async (req, res) => {
    try {
        const { user_id, organization_id } = req.user;

        const { data, error } = await supabaseAdmin
            .from("notifications")
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq("organization_id", organization_id)
            .eq("recipient_id", user_id)
            .eq("is_read", false)
            .select("notification_id");

        if (error) throw error;

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read.",
            updated_count: data.length
        });

    } catch (error) {
        console.error("Mark all notifications as read error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to mark all notifications as read."
        });
    }
};


// --------------------------------------------------
// DELETE ONE NOTIFICATION
// --------------------------------------------------
const deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const { user_id, organization_id } = req.user;

        const { data, error } = await supabaseAdmin
            .from("notifications")
            .delete()
            .eq("notification_id", notificationId)
            .eq("organization_id", organization_id)
            .eq("recipient_id", user_id)
            .select("notification_id")
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Notification not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully."
        });

    } catch (error) {
        console.error("Delete notification error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to delete notification."
        });
    }
};


module.exports = {
    getNotifications,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
};
