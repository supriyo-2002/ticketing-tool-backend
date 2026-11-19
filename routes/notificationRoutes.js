
const express = require("express");
const router = express.Router();

const {
    getNotifications,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
} = require("../controllers/notificationController");

const authMiddleware = require("../middleware/authMiddleware");

// --------------------------------------------------
// GET UNREAD NOTIFICATION COUNT
// --------------------------------------------------

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     description: Retrieves the unread notification count for the authenticated user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 unread_count:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: Unauthorized - access token missing or invalid.
 *       500:
 *         description: Failed to retrieve unread notification count.
 */
router.get("/unread-count", authMiddleware, getUnreadNotificationCount);


// --------------------------------------------------
// GET ALL NOTIFICATIONS
// --------------------------------------------------

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     description: Retrieves notifications belonging to the authenticated user, with pagination.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of notifications per page.
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Notifications retrieved successfully.
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 3
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *       401:
 *         description: Unauthorized - access token missing or invalid.
 *       500:
 *         description: Failed to retrieve notifications.
 */
router.get("/", authMiddleware, getNotifications);


// --------------------------------------------------
// MARK ALL NOTIFICATIONS AS READ
// --------------------------------------------------

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     description: Marks all unread notifications belonging to the authenticated user as read.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: All notifications marked as read.
 *                 updated_count:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Failed to mark all notifications as read.
 */
router.patch("/read-all", authMiddleware, markAllNotificationsAsRead);


// --------------------------------------------------
// MARK ONE NOTIFICATION AS READ
// --------------------------------------------------

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark one notification as read
 *     description: Marks a specific notification belonging to the authenticated user as read.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Notification UUID.
 *     responses:
 *       200:
 *         description: Notification marked as read.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Notification not found.
 *       500:
 *         description: Failed to mark notification as read.
 */
router.patch("/:notificationId/read", authMiddleware, markNotificationAsRead);


// --------------------------------------------------
// DELETE ONE NOTIFICATION
// --------------------------------------------------

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     summary: Delete one notification
 *     description: Deletes a notification belonging to the authenticated user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Notification UUID.
 *     responses:
 *       200:
 *         description: Notification deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Notification not found.
 *       500:
 *         description: Failed to delete notification.
 */
router.delete("/:notificationId", authMiddleware, deleteNotification);


module.exports = router;
