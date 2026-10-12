const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject
} = require("../controllers/projectControllers");

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a project
 *     description: Creates a project in the authenticated user's organization.
 *     tags:
 *       - Projects
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
 *                 example: Website Redesign
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Redesign the company website
 *     responses:
 *       201:
 *         description: Project created successfully
 *       400:
 *         description: Invalid project name or description
 *       401:
 *         description: Missing or invalid authentication
 *       500:
 *         description: Server or database error
 */
router.post("/", authMiddleware, createProject);

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Retrieves all projects for the authenticated user's organization.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *       401:
 *         description: Missing or invalid authentication
 *       500:
 *         description: Server or database error
 */
router.get("/", authMiddleware, getProjects);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get a project by ID
 *     description: Retrieves a project by its ID for the authenticated user's organization.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *       400:
 *         description: Invalid project ID format
 *       401:
 *         description: Missing or invalid authentication
 *       404:
 *         description: Project not found
 *       500:
 *         description: Failed to retrieve project
 */
router.get("/:projectId", authMiddleware, getProjectById);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update a project
 *     description: Updates a project by its ID for the authenticated user's organization.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Website Redesign
 *               description:
 *                 type: string
 *                 example: Redesign the company website
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       400:
 *         description: Invalid project ID format or update data
 *       401:
 *         description: Missing or invalid authentication
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server or database error
 */
router.put("/:projectId", authMiddleware, updateProject);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete a project
 *     description: Deletes a project by its ID for the authenticated user's organization.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *       400:
 *         description: Invalid project ID format
 *       401:
 *         description: Missing or invalid authentication
 *       404:
 *         description: Project not found
 *       409:
 *         description: Project has associated tickets
 *       500:
 *         description: Server or database error
 */
router.delete("/:projectId", authMiddleware, deleteProject);

module.exports = router;