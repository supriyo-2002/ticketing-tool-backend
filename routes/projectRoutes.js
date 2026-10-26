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
 *     description: >
 *       Creates a project in the authenticated user's organization.
 *       The project creator is automatically added as a project member.
 *       Additional employees can be selected using member_ids.
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
 *                 description: Name of the project.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Redesign the company website
 *                 description: Optional description of the project.
 *               member_ids:
 *                 type: array
 *                 description: >
 *                   UUIDs of employees to add to the project.
 *                   All selected employees must belong to the authenticated
 *                   user's organization. The creator is added automatically.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example:
 *                   - 11111111-1111-4111-8111-111111111111
 *                   - 22222222-2222-4222-8222-222222222222
 *     responses:
 *       201:
 *         description: Project created successfully with project members.
 *       400:
 *         description: Invalid project name, description, or member IDs.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Server or database error.
 */
router.post("/", authMiddleware, createProject);



/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: >
 *       Retrieves all projects belonging to the authenticated user's
 *       organization, including the details of their project members.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Projects and their members retrieved successfully.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Failed to retrieve projects or project members.
 */
router.get("/", authMiddleware, getProjects);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get a project by ID
 *     description: >
 *       Retrieves a project belonging to the authenticated user's
 *       organization, including its associated project members.
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
 *           format: uuid
 *         description: UUID of the project.
 *     responses:
 *       200:
 *         description: Project and its members retrieved successfully.
 *       400:
 *         description: Invalid project ID format.
 *       401:
 *         description: Missing or invalid authentication.
 *       404:
 *         description: Project not found.
 *       500:
 *         description: Failed to retrieve project or its members.
 */
router.get("/:projectId", authMiddleware, getProjectById);


/**
 * @swagger
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update a project
 *     description: >
 *       Updates a project's name or description and optionally synchronizes
 *       its project members. When member_ids is supplied, it becomes the
 *       desired membership list. The original project creator is retained
 *       automatically. If member_ids is omitted, existing memberships remain
 *       unchanged.
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
 *           format: uuid
 *         description: UUID of the project.
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
 *                 description: New project name.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Redesign the company website
 *                 description: New description, or null to clear it.
 *               member_ids:
 *                 type: array
 *                 description: >
 *                   Desired list of project member user IDs.
 *                   The original project creator is retained automatically.
 *                   Sending an empty array removes all other members.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example:
 *                   - 11111111-1111-4111-8111-111111111111
 *                   - 22222222-2222-4222-8222-222222222222
 *     responses:
 *       200:
 *         description: Project updated successfully, including its members.
 *       400:
 *         description: Invalid project ID, project details, or member IDs.
 *       401:
 *         description: Missing or invalid authentication.
 *       404:
 *         description: Project not found.
 *       500:
 *         description: Failed to update the project or its members.
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