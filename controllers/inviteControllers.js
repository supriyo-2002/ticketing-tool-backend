
const {
    supabaseAuth,
    supabaseAdmin
} = require("../config/supabase");


// INVITE EMPLOYEE
const inviteEmployee = async (req, res) => {

    try {
        const currentUser = req.user;

        // Make sure authenticated user exists.
        if (!currentUser) {

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }
       
        // STEP 2: Check ADMIN role

        if (currentUser.role !== "ADMIN") {

            return res.status(403).json({
                success: false,
                message: "Only ADMIN users can invite employees."
            });
        }

        // STEP 3: Get invitation details
        const {
            email,
            role
        } = req.body;


        // Validate email and role.
        if (!email || !role) {

            return res.status(400).json({
                success: false,
                message: "Email and role are required."
            });
        }
        // STEP 4: Validate role
      

        const allowedRoles = ["ADMIN", "EMPLOYEE"];

        if (!allowedRoles.includes(role)) {

            return res.status(400).json({
                success: false,
                message: "Invalid role. Role must be ADMIN or EMPLOYEE."
            });
        }

        // STEP 5: Check whether user already exists

        const {
            data: existingUser,
            error: existingUserError
        } = await supabaseAdmin
            .from("users")
            .select("user_id, email")
            .eq("email", email)
            .maybeSingle();


        if (existingUserError) {

            console.error(
                "Existing user check error:",
                existingUserError
            );

            return res.status(500).json({
                success: false,
                message: "Could not check existing user."
            });
        }


        // Don't invite an existing user.
        if (existingUser) {

            return res.status(409).json({
                success: false,
                message: "A user with this email already exists."
            });
        }

        // STEP 6: Check for an existing pending invitation
  

        const {
            data: existingInvite,
            error: existingInviteError
        } = await supabaseAdmin
            .from("invites")
            .select("invite_id, email, status")
            .eq("organization_id", currentUser.organization_id)
            .eq("email", email)
            .eq("status", "PENDING")
            .maybeSingle();


        if (existingInviteError) {

            console.error(
                "Existing invitation check error:",
                existingInviteError
            );

            return res.status(500).json({
                success: false,
                message: "Could not check existing invitation."
            });
        }


        // Don't send duplicate invitation.
        if (existingInvite) {

            return res.status(409).json({
                success: false,
                message: "A pending invitation already exists for this email."
            });
        }


      
        // STEP 7: Send Supabase invitation email
        
        const {
            data: invitedUser,
            error: inviteError
        } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email
        );


        if (inviteError) {

            console.error(
                "Supabase invitation error:",
                inviteError
            );

            return res.status(400).json({
                success: false,
                message: inviteError.message
            });
        }

        // STEP 8: Create invitation record
        

        const expiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
        );


        const {
            data: invitation,
            error: invitationError
        } = await supabaseAdmin
            .from("invites")
            .insert({
                organization_id: currentUser.organization_id,
                email: email,
                role: role,
                invited_by: currentUser.user_id,
                status: "PENDING",
                expires_at: expiresAt.toISOString()
            })
            .select()
            .single();


        if (invitationError) {

            console.error(
                "Invitation record creation error:",
                invitationError
            );

            return res.status(500).json({
                success: false,
                message: "Invitation email sent, but invitation record could not be created.",
                error: invitationError.message
            });
        }


      
        // STEP 9: Return successful response

        return res.status(201).json({
            success: true,
            message: "Employee invitation sent successfully.",

            data: {
                invitation,
                invitedUser: invitedUser.user
            }
        });


    } catch (error) {

        console.error("Invite employee error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};

// ACCEPT INVITATION
const acceptInvite = async (req, res) => {
    try {

       
        // 1. Get Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization token is required."
            });
        }

        // Make sure the header uses Bearer token format.
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format. Use Bearer token."
            });
        }

        // Extract the actual access token.
        const accessToken = authHeader.split(" ")[1];

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Access token is missing."
            });
        }
        // 2. Verify the access token with Supabase Auth
   
        const {
            data: authData,
            error: authError
        } = await supabaseAuth.auth.getUser(accessToken);

        if (authError || !authData.user) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired access token."
            });
        }

        // Authenticated Supabase user.
        const authUser = authData.user;

        // Supabase Auth email.
        const email = authUser.email;


       
        // 3. Get employee name from request body
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Name is required."
            });
        }


       
        // 4. Find pending invitation
        
        const {
            data: invitation,
            error: invitationError
        } = await supabaseAdmin
            .from("invites")
            .select("*")
            .eq("email", email)
            .eq("status", "PENDING")
            .maybeSingle();

        if (invitationError) {
            console.error(
                "Invitation lookup error:",
                invitationError
            );

            return res.status(500).json({
                success: false,
                message: "Could not find invitation."
            });
        }

        // No pending invitation found.
        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: "No pending invitation found for this email."
            });
        }


       
        // 5. Check invitation expiration
        const currentTime = new Date();
        const expirationTime = new Date(invitation.expires_at);

        if (currentTime > expirationTime) {

            // Update invitation status to EXPIRED.
            await supabaseAdmin
                .from("invites")
                .update({
                    status: "EXPIRED"
                })
                .eq("invite_id", invitation.invite_id);

            return res.status(410).json({
                success: false,
                message: "This invitation has expired."
            });
        }
       
        // 6. Check whether user profile already exists
  
        const {
            data: existingUser,
            error: existingUserError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("user_id", authUser.id)
            .maybeSingle();

        if (existingUserError) {
            console.error(
                "Existing user lookup error:",
                existingUserError
            );

            return res.status(500).json({
                success: false,
                message: "Could not check existing user."
            });
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "User profile already exists."
            });
        }
        // 7. Create application user
        const {
            data: newUser,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .insert({
                user_id: authUser.id,
                organization_id: invitation.organization_id,
                name: name,
                email: email,
                role: invitation.role
            })
            .select()
            .single();

        if (userError) {
            console.error(
                "User profile creation error:",
                userError
            );

            return res.status(500).json({
                success: false,
                message: "Could not create user profile.",
                error: userError.message
            });
        }

        // 8. Mark invitation as accepted

        const {
            data: updatedInvitation,
            error: updateInviteError
        } = await supabaseAdmin
            .from("invites")
            .update({
                status: "ACCEPTED",
                accepted_at: new Date().toISOString()
            })
            .eq("invite_id", invitation.invite_id)
            .select()
            .single();

        if (updateInviteError) {
            console.error(
                "Invitation update error:",
                updateInviteError
            );

            return res.status(500).json({
                success: false,
                message: "User created, but invitation status could not be updated.",
                error: updateInviteError.message
            });
        }

        // 9. Return successful response

        return res.status(201).json({
            success: true,
            message: "Invitation accepted successfully.",
            data: {
                user: newUser,
                invitation: updatedInvitation
            }
        });

    } catch (error) {

        console.error(
            "Accept invitation error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};



/**
 * RESEND INVITATION
 * Allows an organization ADMIN to resend an eligible invitation.
 */
const resendInvite = async (req, res) => {
    try {
        const currentUser = req.user;

        // STEP 1: Confirm that the requester is authenticated.
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        // STEP 2: Only organization admins can resend invitations.
        if (currentUser.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only ADMIN users can resend invitations."
            });
        }

        // STEP 3: Read the invitation ID from the URL.
        const { inviteId } = req.params;

        if (!inviteId) {
            return res.status(400).json({
                success: false,
                message: "Invitation ID is required."
            });
        }

        // STEP 4: Find the invitation within the admin's organization.
        const {
            data: invitation,
            error: lookupError
        } = await supabaseAdmin
            .from("invites")
            .select("*")
            .eq("invite_id", inviteId)
            .eq("organization_id", currentUser.organization_id)
            .maybeSingle();

        if (lookupError) {
            console.error("Invitation lookup error:", lookupError);

            return res.status(500).json({
                success: false,
                message: "Could not retrieve invitation."
            });
        }

        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found."
            });
        }

        // STEP 5: Do not resend accepted or cancelled invitations.
        if (!["PENDING", "EXPIRED"].includes(invitation.status)) {
            return res.status(409).json({
                success: false,
                message: `Cannot resend an invitation with status ${invitation.status}.`
            });
        }

        // STEP 6: Prevent repeated requests within 60 seconds.
        if (invitation.last_sent_at) {
            const secondsSinceLastSend =
                (Date.now() - new Date(invitation.last_sent_at).getTime()) / 1000;

            if (secondsSinceLastSend < 60) {
                return res.status(429).json({
                    success: false,
                    message: "Please wait 60 seconds before resending this invitation."
                });
            }
        }

        // STEP 7: Check whether the employee already has an application profile.
        const {
            data: existingUser,
            error: userLookupError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("organization_id", currentUser.organization_id)
            .ilike("email", invitation.email)
            .maybeSingle();

        if (userLookupError) {
            console.error("Existing user lookup error:", userLookupError);

            return res.status(500).json({
                success: false,
                message: "Could not check whether the employee has joined."
            });
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This employee already has a profile in your organization."
            });
        }

        // STEP 8: Ask Supabase Auth to send the invitation email.
        // Supabase handles email delivery using your Auth email configuration.
        const {
            error: inviteError
        } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            invitation.email,
            {
                redirectTo: `${process.env.FRONTEND_URL || "http://localhost:3000"}/accept-invite`
            }
        );

        // Do not report success if Supabase rejects the request.
        if (inviteError) {
            console.error("Supabase invitation error:", inviteError);

            return res.status(400).json({
                success: false,
                message: "Supabase could not resend the invitation.",
                error: inviteError.message
            });
        }

        // STEP 9: Set a new seven-day expiry after the email request succeeds.
        const now = new Date();
        const newExpiresAt = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        // STEP 10: Update resend metadata and keep the invitation pending.
        const {
            data: updatedInvitation,
            error: updateError
        } = await supabaseAdmin
            .from("invites")
            .update({
                status: "PENDING",
                expires_at: newExpiresAt,
                last_sent_at: now.toISOString(),
                resend_count: (invitation.resend_count || 0) + 1
            })
            .eq("invite_id", invitation.invite_id)
            .eq("organization_id", currentUser.organization_id)
            .select()
            .single();

        if (updateError) {
            console.error("Invitation update error:", updateError);

            return res.status(500).json({
                success: false,
                message: "Supabase accepted the email request, but the invitation record could not be updated."
            });
        }

        // STEP 11: Return the updated invitation.
        return res.status(200).json({
            success: true,
            message: "Invitation resend request completed successfully.",
            data: {
                invitation: updatedInvitation
            }
        });

    } catch (error) {
        console.error("Resend invitation error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};


module.exports = {
    inviteEmployee,
    acceptInvite,
    resendInvite
};



