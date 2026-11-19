const express = require("express");
const router = express.Router();

const {
    getEmployees,
    updateEmployeeStatus
} = require("../controllers/employeeControllers");

const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Employees
 *   description: Employee management APIs
 */

/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: Get all employees
 *     description: Retrieves all users belonging to the authenticated user's organization.
 *     tags:
 *       - Employees
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employees retrieved successfully
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
 *                   example: Employees retrieved successfully.
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       organization_id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                         format: email
 *                       role:
 *                         type: string
 *                         enum:
 *                           - ADMIN
 *                           - EMPLOYEE
 *                       account_status:
 *                         type: string
 *                         enum:
 *                           - ACTIVE
 *                           - INACTIVE
 *                       deactivated_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       deactivated_by:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication failed or organization context missing
 *       500:
 *         description: Internal server error
 */
router.get("/", authMiddleware, getEmployees);

/**
 * @swagger
 * /api/employees/{userId}/status:
 *   patch:
 *     summary: Activate or deactivate an employee
 *     description: >
 *       Allows ADMIN users to change the account status of employees
 *       within their organization. ADMIN accounts cannot be modified
 *       using this endpoint, and an ADMIN cannot deactivate their own account.
 *     tags:
 *       - Employees
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: Employee User ID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - account_status
 *             properties:
 *               account_status:
 *                 type: string
 *                 enum:
 *                   - ACTIVE
 *                   - INACTIVE
 *                 example: INACTIVE
 *     responses:
 *       200:
 *         description: Employee account status updated successfully
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
 *                   example: Employee account deactivated successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     role:
 *                       type: string
 *                       enum:
 *                         - ADMIN
 *                         - EMPLOYEE
 *                     account_status:
 *                       type: string
 *                       enum:
 *                         - ACTIVE
 *                         - INACTIVE
 *                     deactivated_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     deactivated_by:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *       400:
 *         description: Invalid request body, employee ID, or self-deactivation attempt
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden. Only ADMIN can perform this action or target account is not an EMPLOYEE
 *       404:
 *         description: Employee not found in the organization
 *       500:
 *         description: Internal server error
 */
router.patch(
    "/:userId/status",
    authMiddleware,
    updateEmployeeStatus
);

module.exports = router;