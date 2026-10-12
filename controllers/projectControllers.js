
const { supabaseAdmin } = require("../config/supabase");

// Create a new project for the authenticated user's organization.
const createProject = async (req, res) => {
    try {
        // Read project details from the request body.
        const { name, description } = req.body;

        // Get the authenticated user's profile from the auth middleware.
        const { user_id, organization_id } = req.user || {};

        // Ensure the authentication middleware supplied the required profile.
        if (!user_id || !organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user profile is missing."
            });
        }

        // Validate the required project name.
        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Project name is required."
            });
        }

        // Validate the optional description.
        if (
            description !== undefined &&
            description !== null &&
            typeof description !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Project description must be a string."
            });
        }

        // Prepare the project record using trusted user profile values.
        const projectData = {
            name: name.trim(),
            description:
                typeof description === "string" && description.trim()
                    ? description.trim()
                    : null,
            organization_id,
            created_by: user_id
        };

        // Insert the project into Supabase and return the created record.
        const { data: project, error } = await supabaseAdmin
            .from("projects")
            .insert(projectData)
            .select()
            .single();

        // Handle database errors.
        if (error) {
            console.error("Create project error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to create project."
            });
        }

        // Return the successfully created project.
        return res.status(201).json({
            success: true,
            message: "Project created successfully.",
            data: project
        });
    } catch (error) {
        // Handle unexpected server errors.
        console.error("Unexpected create project error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while creating the project."
        });
    }
};

// Get all projects for the authenticated user's organization.
const getProjects = async (req, res) => {
    try {
        // Get the organization ID from the authenticated user's profile.
        const { organization_id } = req.user || {};

        // Ensure the authenticated user belongs to an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Fetch project details for the user's organization.
        const { data: projects, error } = await supabaseAdmin
            .from("projects")
            .select("project_id, name, description, created_by, created_at")
            .eq("organization_id", organization_id)
            .order("created_at", { ascending: false });

        // Handle database errors.
        if (error) {
            console.error("Get projects error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve projects."
            });
        }

        // Return project details, including their names.
        return res.status(200).json({
            success: true,
            message: "Projects retrieved successfully.",
            count: projects.length,
            data: projects
        });
    } catch (error) {
        // Handle unexpected server errors.
        console.error("Unexpected get projects error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving projects."
        });
    }
};



const getProjectById = async (req, res) => {
    try {
        // Get the project ID from the URL parameter.
        const { projectId } = req.params;

        // Get the authenticated user's organization.
        const { organization_id } = req.user || {};

        // Ensure the authenticated user has an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Validate the project ID format before querying the database.
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid project ID format."
            });
        }

        // Retrieve the project only within the user's organization.
        const { data: project, error } = await supabaseAdmin
            .from("projects")
            .select("project_id, name, description, created_by, created_at")
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .maybeSingle();

        // Handle database errors.
        if (error) {
            console.error("Get project by ID error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve project."
            });
        }

        // Return 404 if the project does not exist in this organization.
        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        // Return the requested project.
        return res.status(200).json({
            success: true,
            message: "Project retrieved successfully.",
            data: project
        });
    } catch (error) {
        // Handle unexpected server errors.
        console.error("Unexpected get project by ID error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving the project."
        });
    }
};

// Update an existing project for the authenticated user's organization.
const updateProject = async (req, res) => {
    try {
        // Get the project ID from the URL.
        const { projectId } = req.params;

        // Get the authenticated user's organization.
        const { organization_id } = req.user || {};

        // Read the fields provided for updating.
        const { name, description } = req.body;

        // Ensure the authenticated user belongs to an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Validate the project ID format.
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid project ID format."
            });
        }

        // Require at least one field to update.
        if (name === undefined && description === undefined) {
            return res.status(400).json({
                success: false,
                message: "Provide a project name or description to update."
            });
        }

        // Prepare only the fields supplied in the request.
        const updateData = {};

        if (name !== undefined) {
            // A supplied project name must be a non-empty string.
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Project name must be a non-empty string."
                });
            }

            updateData.name = name.trim();
        }

        if (description !== undefined) {
            // Allow a string or null to clear the description.
            if (
                description !== null &&
                typeof description !== "string"
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Project description must be a string or null."
                });
            }

            updateData.description =
                typeof description === "string"
                    ? description.trim() || null
                    : null;
        }

        // Update only a project belonging to the user's organization.
        const { data: project, error } = await supabaseAdmin
            .from("projects")
            .update(updateData)
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .select("project_id, name, description, created_by, created_at")
            .maybeSingle();

        // Handle database errors.
        if (error) {
            console.error("Update project error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to update project."
            });
        }

        // Return 404 if no matching project was updated.
        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        // Return the updated project.
        return res.status(200).json({
            success: true,
            message: "Project updated successfully.",
            data: project
        });
    } catch (error) {
        // Handle unexpected server errors.
        console.error("Unexpected update project error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while updating the project."
        });
    }
};


/**
 * Delete a project from the authenticated user's organization.
 * Projects containing tickets cannot be deleted.
 */
const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { organization_id } = req.user || {};

        // Ensure the authenticated user belongs to an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Validate the project ID before querying the database.
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid project ID format."
            });
        }

        // Check whether the project exists in the user's organization.
        const { data: project, error: projectError } = await supabaseAdmin
            .from("projects")
            .select("project_id, name")
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .maybeSingle();

        if (projectError) {
            console.error("Find project error:", projectError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve the project."
            });
        }

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        // Check for tickets before deleting to avoid cascading deletion.
        const { data: tickets, error: ticketsError } = await supabaseAdmin
            .from("tickets")
            .select("ticket_id")
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .limit(1);

        if (ticketsError) {
            console.error("Check project tickets error:", ticketsError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to check whether the project has tickets."
            });
        }

        // Do not delete projects that contain tickets.
        if (tickets && tickets.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Cannot delete this project because it has tickets."
            });
        }

        // Delete only the project belonging to the authenticated organization.
        const { data: deletedProject, error: deleteError } = await supabaseAdmin
            .from("projects")
            .delete()
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .select("project_id, name")
            .maybeSingle();

        if (deleteError) {
            console.error("Delete project error:", deleteError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to delete the project."
            });
        }

        if (!deletedProject) {
            return res.status(404).json({
                success: false,
                message: "Project not found or already deleted."
            });
        }

        // Return confirmation after successful deletion.
        return res.status(200).json({
            success: true,
            message: "Project deleted successfully.",
            data: deletedProject
        });

    } catch (error) {
        console.error("Unexpected delete project error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while deleting the project."
        });
    }
};


module.exports = {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
};
