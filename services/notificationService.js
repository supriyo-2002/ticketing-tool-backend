
const { supabaseAdmin } = require("../config/supabase");

// -------------------------------------------------------------
// CREATE NOTIFICATIONS
//
// Reusable service for creating in-app notifications.
//
// Parameters:
// 1. organizationId - Organization ID.
// 2. senderId       - User who performed the action.
// 3. recipientIds   - Users who should receive notifications.
// 4. type           - Notification event type.
// 5. title          - Notification heading.
// 6. message        - Notification description.
// 7. referenceType  - Related PROJECT or TICKET.
// 8. referenceId    - Related project or ticket ID.
// -------------------------------------------------------------

const createNotifications = async ({
    organizationId,
    senderId,
    recipientIds,
    type,
    title,
    message,
    referenceType,
    referenceId
}) => {
    try {

        // STEP 1: Remove duplicate recipients and exclude the sender.
        const uniqueRecipientIds = [
            ...new Set(recipientIds)
        ].filter((id) => id && id !== senderId);

        // No notification is required if there are no recipients.
        if (uniqueRecipientIds.length === 0) {
            return {
                success: true,
                count: 0
            };
        }

        // STEP 2: Verify that recipients belong to this organization
        // and have active accounts.
        const {
            data: recipients,
            error: recipientError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("organization_id", organizationId)
            .eq("account_status", "ACTIVE")
            .in("user_id", uniqueRecipientIds);

        if (recipientError) {
            throw recipientError;
        }

        // Keep only verified active organization members.
        const validRecipientIds = recipients.map(
            (user) => user.user_id
        );

        // Stop if no eligible recipients remain.
        if (validRecipientIds.length === 0) {
            return {
                success: true,
                count: 0
            };
        }

        // STEP 3: Prepare notification records.
        const notificationRecords = validRecipientIds.map(
            (recipientId) => ({
                organization_id: organizationId,
                recipient_id: recipientId,
                sender_id: senderId,
                type,
                title,
                message,
                reference_type: referenceType,
                reference_id: referenceId
            })
        );

        // STEP 4: Insert notifications into Supabase.
        const {
            data: notifications,
            error: notificationError
        } = await supabaseAdmin
            .from("notifications")
            .insert(notificationRecords)
            .select();

        if (notificationError) {
            throw notificationError;
        }

        // STEP 5: Return the created notifications.
        return {
            success: true,
            count: notifications.length,
            data: notifications
        };

    } catch (error) {

        // Log notification errors without crashing the application.
        console.error(
            "Create notifications error:",
            error.message
        );

        return {
            success: false,
            count: 0,
            error: error.message
        };
    }
};


// Export the notification service.
module.exports = {
    createNotifications
};
