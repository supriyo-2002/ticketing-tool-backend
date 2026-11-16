
// Import Express.
const express = require("express");
const router = express.Router();

// Import authentication controllers.
const authController = require("../controllers/authControllers");

// Import authentication middleware for protected routes.
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Authentication and organization registration APIs
 */

/**
 * @swagger
 * /api/auth/register-organization:
 *   post:
 *     summary: Register a new organization
 *     description: Creates a Supabase Auth account and sends an email confirmation link. The organization and ADMIN profile are created only after successful email confirmation.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - confirmPassword
 *               - organizationName
 *             properties:
 *               name:
 *                 type: string
 *                 example: Supriyo Maity
 *               email:
 *                 type: string
 *                 format: email
 *                 example: supriyo@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: Must contain uppercase, lowercase, and numeric characters.
 *                 example: Test@12345
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: Test@12345
 *               organizationName:
 *                 type: string
 *                 example: Zenydata
 *     responses:
 *       201:
 *         description: Registration submitted successfully. Confirmation email sent.
 *       400:
 *         description: Missing fields, invalid email, weak password, password mismatch, or signup error.
 *       401:
 *         description: Invalid authorization header or expired session.
 *       409:
 *         description: Email already registered or user already authenticated.
 *       500:
 *         description: Internal server error.
 */
router.post(
    "/register-organization",
    authController.registerOrganization
);

/**
 * @swagger
 * /api/auth/complete-registration:
 *   post:
 *     summary: Complete organization registration
 *     description: Verifies the confirmed Supabase user session and creates the organization and ADMIN profile. Repeated requests return the existing registration.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Organization and ADMIN profile created successfully.
 *       200:
 *         description: Registration was already completed.
 *       400:
 *         description: Registration details are missing.
 *       401:
 *         description: Missing, invalid, or expired access token.
 *       403:
 *         description: Email confirmation is pending.
 *       409:
 *         description: Email or organization name already exists.
 *       500:
 *         description: Server error.
 */
router.post(
    "/complete-registration",
    authController.completeOrganizationRegistration
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates a user using email and password. Checks the application account status and role before returning the session.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: supriyo@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Test@12345
 *     responses:
 *       200:
 *         description: Login successful. Returns user profile and authentication session.
 *       400:
 *         description: Email and password are required.
 *       401:
 *         description: Invalid email or password.
 *       403:
 *         description: Application profile missing, account inactive, or invalid role.
 *       500:
 *         description: Server error.
 */
router.post(
    "/login",
    authController.login
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Revokes the current Supabase authentication session. Requires a valid Bearer access token.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful.
 *       401:
 *         description: Missing, invalid, or expired access token.
 *       500:
 *         description: Unable to complete logout.
 */
router.post(
    "/logout",
    authMiddleware,
    authController.logout
);
// -------------------------------------------------------------
// FORGOT PASSWORD API
// -------------------------------------------------------------

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     description: Sends a Supabase password recovery email to the supplied address. Returns a generic response to avoid revealing whether an account exists.
 *     tags:
 *       - Authentication
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
 *     responses:
 *       200:
 *         description: Password recovery request processed.
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
 *                   example: If an account exists for this email, a password reset link will be sent.
 *       400:
 *         description: Missing or invalid email address.
 *       500:
 *         description: Unable to process the password recovery request.
 */
router.post("/forgot-password", authController.forgotPassword);


// -------------------------------------------------------------
// RESET PASSWORD API
// -------------------------------------------------------------

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset an employee's password
 *     description: Verifies the Supabase recovery token and updates the employee's password.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token_hash
 *               - password
 *               - confirmPassword
 *             properties:
 *               token_hash:
 *                 type: string
 *                 description: Recovery token hash received from the Supabase password reset email.
 *                 example: example-recovery-token-hash
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewPassword123
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password updated successfully.
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
 *                   example: Password updated successfully. Please log in using your new password.
 *       400:
 *         description: Invalid or expired recovery token, missing fields, or password validation error.
 *       500:
 *         description: Internal server error.
 */
router.post("/reset-password", authController.resetPassword);

// Export authentication router.
module.exports = router;
