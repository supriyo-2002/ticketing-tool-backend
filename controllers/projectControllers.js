
const { supabaseAdmin } = require("../config/supabase");

// Create a new project for the authenticated user's organization.
const createProject = async (req, res) => {
    try {
        // Read project details and selected members from the request.
        const {
            name,
            description,
            member_ids = []
        } = req.body;

        // Get the authenticated user's trusted profile.
        const {
            user_id,
            organization_id,
            role
        } = req.user || {};

        // Validate the authenticated user's profile.
        if (!user_id || !organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user profile is missing."
            });
        }

        // Both ADMIN and EMPLOYEE can create projects.
        if (!["ADMIN", "EMPLOYEE"].includes(role)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to create projects."
            });
        }

        // Validate the project name.
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

        // Validate the selected member IDs.
        if (
            !Array.isArray(member_ids) ||
            !member_ids.every(
                (id) =>
                    typeof id === "string" &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Member IDs must be an array of valid UUIDs."
            });
        }

        // Include the creator automatically and remove duplicates.
        const projectMemberIds = [
            ...new Set([...member_ids, user_id])
        ];

        // Verify that every selected user belongs to the same organization.
        const {
            data: organizationUsers,
            error: memberValidationError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("organization_id", organization_id)
            .in("user_id", projectMemberIds);

        if (memberValidationError) {
            console.error(
                "Project member validation error:",
                memberValidationError.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to validate project members."
            });
        }

        // Reject users who do not belong to this organization.
        const validMemberIds = new Set(
            (organizationUsers || []).map((user) => user.user_id)
        );

        const invalidMemberIds = projectMemberIds.filter(
            (id) => !validMemberIds.has(id)
        );

        if (invalidMemberIds.length > 0) {
            return res.status(400).json({
                success: false,
                message:
                    "One or more selected members do not belong to your organization.",
                invalid_member_ids: invalidMemberIds
            });
        }

        // Prepare the new project using trusted profile values.
        const projectData = {
            name: name.trim(),
            description:
                typeof description === "string" && description.trim()
                    ? description.trim()
                    : null,
            organization_id,
            created_by: user_id
        };

        // Create the project.
        const {
            data: project,
            error: projectError
        } = await supabaseAdmin
            .from("projects")
            .insert(projectData)
            .select()
            .single();

        if (projectError) {
            console.error(
                "Create project error:",
                projectError.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to create the project."
            });
        }

        // Prepare the project membership records.
        const membershipRecords = projectMemberIds.map((memberId) => ({
            project_id: project.project_id,
            user_id: memberId
        }));

        // Add the creator and selected employees to the project.
        const {
            data: memberships,
            error: membershipError
        } = await supabaseAdmin
            .from("project_members")
            .insert(membershipRecords)
            .select();

        if (membershipError) {
            console.error(
                "Project membership creation error:",
                membershipError.message
            );

            // Best-effort cleanup: deleting the project also deletes
            // its membership records through ON DELETE CASCADE.
            const { error: cleanupError } = await supabaseAdmin
                .from("projects")
                .delete()
                .eq("project_id", project.project_id)
                .eq("organization_id", organization_id);

            if (cleanupError) {
                console.error(
                    "Project cleanup error:",
                    cleanupError.message
                );
            }

            return res.status(500).json({
                success: false,
                message: "Failed to assign members to the project."
            });
        }

        // Return the project and its membership records.
        return res.status(201).json({
            success: true,
            message: "Project created successfully.",
            data: {
                project,
                members: memberships
            }
        });

    } catch (error) {
        console.error(
            "Unexpected create project error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while creating the project."
        });
    }
};

// Attach employee details to a list of projects.
const attachProjectMembers = async (projects, organizationId) => {
    // Return immediately when there are no projects.
    if (!projects.length) {
        return { data: [], error: null };
    }

    // Get all project IDs.
    const projectIds = projects.map((project) => project.project_id);

    // Retrieve membership records for these projects.
    const {
        data: memberships,
        error: membershipError
    } = await supabaseAdmin
        .from("project_members")
        .select("project_id, user_id, added_at")
        .in("project_id", projectIds);

    if (membershipError) {
        return { data: null, error: membershipError };
    }

    // Return projects with empty member lists when no memberships exist.
    if (!memberships.length) {
        return {
            data: projects.map((project) => ({
                ...project,
                members: []
            })),
            error: null
        };
    }

    // Get unique employee IDs from the membership records.
    const memberIds = [
        ...new Set(memberships.map((member) => member.user_id))
    ];

    // Retrieve employee details from the same organization only.
    const {
        data: employees,
        error: employeeError
    } = await supabaseAdmin
        .from("users")
        .select("user_id, name, email, role")
        .eq("organization_id", organizationId)
        .in("user_id", memberIds);

    if (employeeError) {
        return { data: null, error: employeeError };
    }

    // Create a lookup map for employee details.
    const employeeMap = new Map(
        employees.map((employee) => [employee.user_id, employee])
    );

    // Group employee membership details by project ID.
    const membersByProject = new Map();

    for (const membership of memberships) {
        const employee = employeeMap.get(membership.user_id);

        // Do not include users outside the authenticated organization.
        if (!employee) {
            continue;
        }

        if (!membersByProject.has(membership.project_id)) {
            membersByProject.set(membership.project_id, []);
        }

        membersByProject.get(membership.project_id).push({
            ...employee,
            added_at: membership.added_at
        });
    }

    // Return every project with its associated employee details.
    const projectsWithMembers = projects.map((project) => ({
        ...project,
        members: membersByProject.get(project.project_id) || []
    }));

    return {
        data: projectsWithMembers,
        error: null
    };
};

// Get all projects in the authenticated user's organization, including members.
const getProjects = async (req, res) => {
    try {
        // Get the authenticated user's organization.
        const { organization_id } = req.user || {};

        // Ensure the user belongs to an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Retrieve projects belonging to this organization.
        const {
            data: projects,
            error: projectError
        } = await supabaseAdmin
            .from("projects")
            .select(
                "project_id, name, description, created_by, created_at"
            )
            .eq("organization_id", organization_id)
            .order("created_at", { ascending: false });

        // Handle project retrieval errors.
        if (projectError) {
            console.error("Get projects error:", projectError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve projects."
            });
        }

        // Attach employee details to each project.
        const {
            data: projectsWithMembers,
            error: memberError
        } = await attachProjectMembers(projects, organization_id);

        // Handle membership retrieval errors.
        if (memberError) {
            console.error(
                "Get project members error:",
                memberError.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve project members."
            });
        }

        // Return projects and their members.
        return res.status(200).json({
            success: true,
            message: "Projects retrieved successfully.",
            count: projectsWithMembers.length,
            data: projectsWithMembers
        });

    } catch (error) {
        console.error("Unexpected get projects error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving projects."
        });
    }
};



// Get a single project, including its members
const getProjectById = async (req, res) => {
    try {
        // Read the project ID from the URL.
        const { projectId } = req.params;

        // Get the authenticated user's organization.
        const { organization_id } = req.user || {};

        // Ensure the user belongs to an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Validate the project ID.
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid project ID format."
            });
        }

        // Retrieve the project within the authenticated organization.
        const {
            data: project,
            error: projectError
        } = await supabaseAdmin
            .from("projects")
            .select(
                "project_id, name, description, created_by, created_at"
            )
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .maybeSingle();

        // Handle database errors.
        if (projectError) {
            console.error(
                "Get project by ID error:",
                projectError.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve project."
            });
        }

        // Return 404 when the project does not exist in this organization.
        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        // Retrieve the project together with its member details.
        const {
            data: projectsWithMembers,
            error: memberError
        } = await attachProjectMembers([project], organization_id);

        // Handle membership retrieval errors.
        if (memberError) {
            console.error(
                "Get project members error:",
                memberError.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve project members."
            });
        }

        // Return the project and its members.
        return res.status(200).json({
            success: true,
            message: "Project retrieved successfully.",
            data: projectsWithMembers[0]
        });

    } catch (error) {
        console.error(
            "Unexpected get project by ID error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving the project."
        });
    }
};

// Update project details and optionally synchronize its members.
const updateProject = async (req, res) => {
    try {
        // Get the project ID from the URL.
        const { projectId } = req.params;

        // Get the authenticated user's organization.
        const { organization_id } = req.user || {};

        // Read the fields supplied in the request.
        const { name, description, member_ids } = req.body;

        // Ensure the user belongs to an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Validate the project ID.
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(projectId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid project ID format."
            });
        }

        // Require at least one field to update.
        if (
            name === undefined &&
            description === undefined &&
            member_ids === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide project details or member_ids to update."
            });
        }

        // Validate the optional project name.
        if (
            name !== undefined &&
            (typeof name !== "string" || !name.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Project name must be a non-empty string."
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
                message: "Project description must be a string or null."
            });
        }

        // Validate member_ids when the caller supplies it.
        if (
            member_ids !== undefined &&
            (
                !Array.isArray(member_ids) ||
                !member_ids.every(
                    (id) =>
                        typeof id === "string" &&
                        uuidRegex.test(id)
                )
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Member IDs must be an array of valid UUIDs."
            });
        }

        // Find the project inside the authenticated user's organization.
        const {
            data: existingProject,
            error: findError
        } = await supabaseAdmin
            .from("projects")
            .select(
                "project_id, name, description, created_by, created_at"
            )
            .eq("project_id", projectId)
            .eq("organization_id", organization_id)
            .maybeSingle();

        if (findError) {
            console.error("Find project error:", findError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve project."
            });
        }

        if (!existingProject) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        // Prepare only the project fields supplied for updating.
        const updateData = {};

        if (name !== undefined) {
            updateData.name = name.trim();
        }

        if (description !== undefined) {
            updateData.description =
                typeof description === "string"
                    ? description.trim() || null
                    : null;
        }

        // Update project details only when name or description is supplied.
        let updatedProject = existingProject;

        if (Object.keys(updateData).length > 0) {
            const {
                data: project,
                error: updateError
            } = await supabaseAdmin
                .from("projects")
                .update(updateData)
                .eq("project_id", projectId)
                .eq("organization_id", organization_id)
                .select(
                    "project_id, name, description, created_by, created_at"
                )
                .maybeSingle();

            if (updateError) {
                console.error(
                    "Update project error:",
                    updateError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Failed to update project."
                });
            }

            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: "Project not found."
                });
            }

            updatedProject = project;
        }

        // Synchronize memberships only when member_ids is provided.
        if (member_ids !== undefined) {
            // Always retain the original project creator as a member.
            const desiredMemberIds = [
                ...new Set([
                    ...member_ids,
                    existingProject.created_by
                ])
            ];

            // Validate that all desired members belong to this organization.
            const {
                data: organizationUsers,
                error: validationError
            } = await supabaseAdmin
                .from("users")
                .select("user_id")
                .eq("organization_id", organization_id)
                .in("user_id", desiredMemberIds);

            if (validationError) {
                console.error(
                    "Validate project members error:",
                    validationError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Failed to validate project members."
                });
            }

            const validMemberIds = new Set(
                (organizationUsers || []).map((user) => user.user_id)
            );

            const invalidMemberIds = desiredMemberIds.filter(
                (id) => !validMemberIds.has(id)
            );

            if (invalidMemberIds.length > 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "One or more selected members do not belong to your organization.",
                    invalid_member_ids: invalidMemberIds
                });
            }

            // Retrieve the current project memberships.
            const {
                data: currentMemberships,
                error: currentMembersError
            } = await supabaseAdmin
                .from("project_members")
                .select("user_id")
                .eq("project_id", projectId);

            if (currentMembersError) {
                console.error(
                    "Get current project members error:",
                    currentMembersError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Failed to retrieve current project members."
                });
            }

            const currentMemberIds = new Set(
                (currentMemberships || []).map(
                    (membership) => membership.user_id
                )
            );

            // Identify members who need to be added.
            const membersToAdd = desiredMemberIds.filter(
                (id) => !currentMemberIds.has(id)
            );

            // Identify members who are no longer selected.
            const membersToRemove = [...currentMemberIds].filter(
                (id) => !desiredMemberIds.includes(id)
            );

            // Add new memberships before removing existing memberships.
            if (membersToAdd.length > 0) {
                const membershipRecords = membersToAdd.map((userId) => ({
                    project_id: projectId,
                    user_id: userId
                }));

                const { error: addMembersError } = await supabaseAdmin
                    .from("project_members")
                    .insert(membershipRecords);

                if (addMembersError) {
                    console.error(
                        "Add project members error:",
                        addMembersError.message
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Failed to add project members."
                    });
                }
            }

            // Remove members who are no longer selected.
            if (membersToRemove.length > 0) {
                const { error: removeMembersError } = await supabaseAdmin
                    .from("project_members")
                    .delete()
                    .eq("project_id", projectId)
                    .in("user_id", membersToRemove);

                if (removeMembersError) {
                    console.error(
                        "Remove project members error:",
                        removeMembersError.message
                    );

                    return res.status(500).json({
                        success: false,
                        message: "Failed to remove project members."
                    });
                }
            }
        }

        // Retrieve the updated project with its current member details.
        const {
            data: projectsWithMembers,
            error: memberError
        } = await attachProjectMembers(
            [updatedProject],
            organization_id
        );

        if (memberError) {
            console.error(
                "Retrieve updated project members error:",
                memberError.message
            );

            return res.status(500).json({
                success: false,
                message: "Project updated, but failed to retrieve its members."
            });
        }

        // Return the updated project and members.
        return res.status(200).json({
            success: true,
            message: "Project updated successfully.",
            data: projectsWithMembers[0]
        });

    } catch (error) {
        console.error(
            "Unexpected update project error:",
            error.message
        );

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
