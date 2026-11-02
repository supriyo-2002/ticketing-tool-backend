// Import the Supabase admin client.
const { supabaseAdmin } = require("../config/supabase");


// GET MY PROFILE
// Retrieves the profile of the currently authenticated user.
const getMyProfile = async (req, res) => {
    try {
        // STEP 1: Get the authenticated user's details from the middleware.
        const { user_id, organization_id } = req.user;

        // STEP 2: Validate that authentication middleware supplied the IDs.
        if (!user_id || !organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user information is missing.",
            });
        }

        // STEP 3: Fetch the logged-in user's profile.
        // Restrict the query to the user's own organization as an additional
        // tenant-isolation safeguard.
        const { data: user, error: userError } = await supabaseAdmin
            .from("users")
            .select(
                "user_id, organization_id, name, email, role, created_at"
            )
            .eq("user_id", user_id)
            .eq("organization_id", organization_id)
            .maybeSingle();

        // STEP 4: Handle database errors.
        if (userError) {
            console.error("Get profile database error:", userError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve profile.",
            });
        }

        // STEP 5: Handle a user whose application profile does not exist.
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User profile not found.",
            });
        }

        // STEP 6: Fetch the organization name.
        const { data: organization, error: organizationError } =
            await supabaseAdmin
                .from("organizations")
                .select("organization_id, name")
                .eq("organization_id", user.organization_id)
                .maybeSingle();

        // STEP 7: Handle organization lookup errors.
        if (organizationError) {
            console.error(
                "Get organization database error:",
                organizationError.message
            );

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve organization information.",
            });
        }

        // STEP 8: Return the profile and organization information.
        return res.status(200).json({
            success: true,
            message: "Profile retrieved successfully.",
            data: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization_id: user.organization_id,
                organization_name: organization?.name || null,
                created_at: user.created_at,
            },
        });
    } catch (error) {
        // Handle unexpected server errors.
        console.error("Get profile error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving profile.",
        });
    }
};


// UPDATE MY PROFILE
// Allows the authenticated user to update their own name.
const updateMyProfile = async (req, res) => {
    try {
        // STEP 1: Get the authenticated user's IDs from the middleware.
        const { user_id, organization_id } = req.user;

        // STEP 2: Validate the authenticated user's information.
        if (!user_id || !organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user information is missing.",
            });
        }

        // STEP 3: Accept only the name field.
        // This prevents users from changing their role, email, organization,
        // or user ID through this endpoint.
        const allowedFields = ["name"];
        const requestFields = Object.keys(req.body || {});

        const invalidFields = requestFields.filter(
            (field) => !allowedFields.includes(field)
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Only the name field can be updated.",
                invalidFields,
            });
        }

        // STEP 4: Validate the name.
        const { name } = req.body || {};

        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Name is required and must be a non-empty string.",
            });
        }

        const updatedName = name.trim();

        if (updatedName.length > 120) {
            return res.status(400).json({
                success: false,
                message: "Name cannot exceed 120 characters.",
            });
        }

        // STEP 5: Update only the authenticated user's profile.
        // Both IDs are included to maintain organization isolation.
        const { data: updatedUser, error: updateError } =
            await supabaseAdmin
                .from("users")
                .update({
                    name: updatedName,
                })
                .eq("user_id", user_id)
                .eq("organization_id", organization_id)
                .select(
                    "user_id, organization_id, name, email, role, created_at"
                )
                .maybeSingle();

        // STEP 6: Handle database errors.
        if (updateError) {
            console.error("Update profile database error:", updateError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to update profile.",
            });
        }

        // STEP 7: Handle a missing profile or a row that was not updated.
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User profile not found or no profile was updated.",
            });
        }

        // STEP 8: Return the updated profile.
        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            data: {
                user_id: updatedUser.user_id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                organization_id: updatedUser.organization_id,
                created_at: updatedUser.created_at,
            },
        });
    } catch (error) {
        // Handle unexpected server errors.
        console.error("Update profile error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while updating profile.",
        });
    }
};


// Export both controllers for use in profileRoutes.js.
module.exports = {
    getMyProfile,
    updateMyProfile,
};