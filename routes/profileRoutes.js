// Import Express to create the profile router.
const express = require("express");
const router = express.Router();

// Import the existing authentication middleware.
const authMiddleware = require("../middleware/authMiddleware");

// Import the profile controller functions.
const profileControllers = require("../controllers/profileControllers");

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: APIs for viewing and updating the logged-in user's profile
 */

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get my profile
 *     description: >
 *       Retrieves the profile of the currently authenticated user,
 *       including their name, email, role, organization, and account
 *       creation date.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                   example: Profile retrieved successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                       example: Supriyo Maity
 *                     email:
 *                       type: string
 *                       format: email
 *                     role:
 *                       type: string
 *                       enum: [ADMIN, EMPLOYEE]
 *                     organization_id:
 *                       type: string
 *                       format: uuid
 *                     organization_name:
 *                       type: string
 *                       nullable: true
 *                       example: Zenydata
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User profile not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/",
    authMiddleware,
    profileControllers.getMyProfile
);

/**
 * @swagger
 * /api/profile:
 *   patch:
 *     summary: Update my profile
 *     description: >
 *       Updates the name of the currently authenticated user.
 *       Email, role, user ID, and organization cannot be changed
 *       through this endpoint.
 *     tags: [Profile]
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
 *                 maxLength: 120
 *                 example: Supriyo Maity
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid name or unsupported update fields
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User profile not found
 *       500:
 *         description: Internal server error
 */
router.patch(
    "/",
    authMiddleware,
    profileControllers.updateMyProfile
);

// Export the router for registration in server.js.
module.exports = router;