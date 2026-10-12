const express = require("express");
const router = express.Router();
const authController = require("../controllers/authControllers");


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
 *     description: Creates a Supabase Auth user, organization, and ADMIN user record.
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
 *                 example: Test@12345
 *               organizationName:
 *                 type: string
 *                 example: Zenydata
 *     responses:
 *       201:
 *         description: Organization and admin account created successfully
 *       400:
 *         description: Invalid request or authentication error
 *       500:
 *         description: Server error
 */
router.post(
    "/register-organization",
    authController.registerOrganization
);


/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates an existing user using email and password.
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
 *         description: Login successful
 *       400:
 *         description: Email and password are required
 *       401:
 *         description: Invalid email or password
 *       500:
 *         description: Server error
 */
router.post(
    "/login",
    authController.login
);


module.exports = router;