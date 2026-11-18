const express = require("express");
const router = express.Router();

const inviteControllers = require("../controllers/inviteControllers");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Invitations
 *     description: Employee invitation management APIs
 */

/**
 * @swagger
 * /api/auth/invite:
 *   post:
 *     summary: Invite an employee
 *     description: Allows an ADMIN to invite a new user to their organization.
 *     tags: [Invitations]
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
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: employee@example.com
 *               role:
 *                 type: string
 *                 enum:
 *                   - ADMIN
 *                   - EMPLOYEE
 *                 example: EMPLOYEE
 *     responses:
 *       201:
 *         description: Invitation sent successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: ADMIN access required
 *       409:
 *         description: User or invitation already exists
 *       500:
 *         description: Internal server error
 */
router.post(
    "/invite",
    authMiddleware,
    inviteControllers.inviteEmployee
);
/**
 * @swagger
 * /api/auth/accept-invite:
 *   post:
 *     summary: Accept invitation
 *     description: >
 *       Completes the employee onboarding process.
 *       The invited user must be authenticated through the
 *       Supabase invitation link and provide their name and password.
 *     tags: [Invitations]
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
 *                 maxLength: 120
 *                 example: John Doe
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
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
 *                   example: Invitation accepted successfully.
 *       400:
 *         description: Invalid name or password
 *       401:
 *         description: Invalid or expired invitation token
 *       404:
 *         description: No pending invitation found
 *       409:
 *         description: User profile already exists or invitation conflict detected
 *       410:
 *         description: Invitation has expired
 *       500:
 *         description: Internal server error
 */
router.post(
    "/accept-invite",
    inviteControllers.acceptInvite
);

/**
 * @swagger
 * /api/auth/resend-invite/{inviteId}:
 *   post:
 *     summary: Resend an invitation
 *     description: Resends a pending invitation email.
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       200:
 *         description: Invitation resent successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: ADMIN access required
 *       404:
 *         description: Invitation not found
 *       409:
 *         description: Invitation cannot be resent
 *       429:
 *         description: Cooldown period active
 *       500:
 *         description: Internal server error
 */
router.post(
    "/resend-invite/:inviteId",
    authMiddleware,
    inviteControllers.resendInvite
);

/**
 * @swagger
 * /api/auth/invitations:
 *   get:
 *     summary: Get invitation history
 *     description: Returns all invitations for the authenticated ADMIN's organization. Supports optional status filtering and email search. Frontend handles pagination.
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum:
 *             - PENDING
 *             - ACCEPTED
 *             - EXPIRED
 *             - CANCELLED
 *         description: Filter invitations by status. Leave empty to retrieve all statuses.
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional search by email address. Leave empty to retrieve all invitations.
 *     responses:
 *       200:
 *         description: Invitation history retrieved successfully.
 *       400:
 *         description: Invalid status filter.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: ADMIN access required.
 *       500:
 *         description: Internal server error.
 */
router.get(
    "/invitations",
    authMiddleware,
    inviteControllers.getInvitations
);

/**
 * @swagger
 * /api/auth/invite/{inviteId}:
 *   delete:
 *     summary: Delete invitation
 *     description: Deletes an unaccepted invitation. Accepted invitations cannot be deleted.
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       200:
 *         description: Invitation deleted successfully
 *       400:
 *         description: Invalid invitation id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: ADMIN access required
 *       404:
 *         description: Invitation not found
 *       409:
 *         description: Accepted invitation cannot be deleted
 *       500:
 *         description: Internal server error
 */
router.delete(
    "/invite/:inviteId",
    authMiddleware,
    inviteControllers.deleteInvite
);

module.exports = router;