
const express = require("express");
const router = express.Router();

const inviteControllers = require("../controllers/inviteControllers");

const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Invitations
 *   description: Invitation management APIs
 */

/**
 * @swagger
 * /api/auth/invite:
 *   post:
 *     summary: Send employee invitation
 *     description: Admin sends an invitation to an employee.
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: employee@example.com
 *               role:
 *                 type: string
 *                 enum: [ADMIN, EMPLOYEE]
 *                 example: EMPLOYEE
 *     responses:
 *       201:
 *         description: Invitation sent successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Pending invitation already exists
 *       500:
 *         description: Internal server error
 */
router.post("/invite", authMiddleware, inviteControllers.inviteEmployee);

/**
 * @swagger
 * /api/auth/accept-invite:
 *   post:
 *     summary: Accept invitation
 *     description: Verify the Supabase token, set the password, and create the employee profile.
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               password:
 *                 type: string
 *                 example: Password123!
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired Supabase token
 *       404:
 *         description: Invitation not found
 *       410:
 *         description: Invitation expired
 *       500:
 *         description: Internal server error
 */
router.post("/accept-invite", inviteControllers.acceptInvite);

/**
 * @swagger
 * /api/auth/resend-invite/{inviteId}:
 *   post:
 *     summary: Resend invitation
 *     description: Send a new invitation for an expired invitation.
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: New invitation sent successfully
 *       400:
 *         description: Invalid invitation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Invitation not found
 *       409:
 *         description: Invitation cannot be resent
 *       500:
 *         description: Internal server error
 */
router.post("/resend-invite/:inviteId", authMiddleware, inviteControllers.resendInvite);

/**
 * @swagger
 * /api/auth/invitations:
 *   get:
 *     summary: Get organization invitations
 *     description: Retrieve invitations belonging to the admin's organization.
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACCEPTED, EXPIRED, CANCELLED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: employee@example.com
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Internal server error
 */
router.get("/invitations", authMiddleware, inviteControllers.getInvitations);

/**
 * @swagger
 * /api/auth/{inviteId}/cancel:
 *   patch:
 *     summary: Cancel invitation
 *     description: Cancel a pending invitation without deleting an existing employee.
 *     tags:
 *       - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invitation cancelled successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Invitation not found
 *       409:
 *         description: Invitation cannot be cancelled
 *       500:
 *         description: Internal server error
 */
router.patch("/:inviteId/cancel", authMiddleware, inviteControllers.cancelInvite);

module.exports = router;
