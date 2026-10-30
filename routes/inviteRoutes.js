const express = require("express");
const router = express.Router();
const inviteControllers = require("../controllers/inviteControllers");
const authMiddleware = require("../middleware/authMiddleware");
/**
 * @swagger
 * tags:
 *   name: Invite
 *   description: Invite employee APIs
 */

/**
 * @swagger
 * /api/auth/invite:
 *   post:
 *     summary: Invite an employee
 *     description: Allows an ADMIN to invite a new user to their organization.
 *     tags: [Invite]
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
 *         description: Employee invitation sent successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required or invalid token
 *       403:
 *         description: Only ADMIN users can invite employees
 *       409:
 *         description: User or pending invitation already exists
 *       500:
 *         description: Server error
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
 *     summary: Accept an employee invitation
 *     description: Completes the invitation process and creates the user's organization profile.
 *     tags: [Invite]
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: Invitation accepted successfully
 *       401:
 *         description: Invalid or missing access token
 *       404:
 *         description: No pending invitation found
 *       409:
 *         description: User profile already exists
 *       410:
 *         description: Invitation has expired
 */
router.post(
    "/accept-invite",
    inviteControllers.acceptInvite
);


/**
 * @swagger
 * /api/auth/resend-invite/{inviteId}:
 *   post:
 *     summary: Resend an employee invitation
 *     tags: [Invite]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the invitation to resend
 *     responses:
 *       200:
 *         description: Invitation email resend request succeeded
 *       400:
 *         description: Supabase rejected the invitation request
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Invitation not found
 *       409:
 *         description: Invitation cannot be resent
 *       429:
 *         description: Resend cooldown has not elapsed
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
 *     summary: Get invitation history and summary
 *     description: >
 *       Retrieves invitations belonging to the logged-in ADMIN's organization,
 *       including email, role, status, invitation time, expiry time,
 *       acceptance time, and resend information.
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACCEPTED, EXPIRED, CANCELLED]
 *         description: Filter invitations by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search invitation email addresses
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of invitations per page
 *     responses:
 *       200:
 *         description: Invitation history retrieved successfully
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
 *                   example: Invitations retrieved successfully.
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalInvitations:
 *                       type: integer
 *                       example: 25
 *                     pendingInvitations:
 *                       type: integer
 *                       example: 8
 *                     acceptedInvitations:
 *                       type: integer
 *                       example: 12
 *                     expiredInvitations:
 *                       type: integer
 *                       example: 3
 *                     cancelledInvitations:
 *                       type: integer
 *                       example: 2
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalRecords:
 *                       type: integer
 *                       example: 25
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       invite_id:
 *                         type: string
 *                         format: uuid
 *                       organization_id:
 *                         type: string
 *                         format: uuid
 *                       email:
 *                         type: string
 *                         format: email
 *                       role:
 *                         type: string
 *                         enum: [ADMIN, EMPLOYEE]
 *                       invited_by:
 *                         type: string
 *                         format: uuid
 *                       status:
 *                         type: string
 *                         enum: [PENDING, ACCEPTED, EXPIRED, CANCELLED]
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       last_sent_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       resend_count:
 *                         type: integer
 *                       expires_at:
 *                         type: string
 *                         format: date-time
 *                       accepted_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only ADMIN users can view invitation history
 *       500:
 *         description: Internal server error
 */
router.get(
    "/invitations",
    authMiddleware,
    inviteControllers.getInvitations
);


module.exports = router;