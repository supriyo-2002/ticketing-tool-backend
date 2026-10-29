const { supabaseAuth, supabaseAdmin } = require("../config/supabase");

// INVITE EMPLOYEE
const inviteEmployee = async (req, res) => {
  try {
    const currentUser = req.user;

    // Make sure authenticated user exists.
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // STEP 2: Check ADMIN role

    if (currentUser.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only ADMIN users can invite employees.",
      });
    }

    // STEP 3: Get invitation details
    const { email, role } = req.body;

    // Validate email and role.
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: "Email and role are required.",
      });
    }
    // STEP 4: Validate role

    const allowedRoles = ["ADMIN", "EMPLOYEE"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Role must be ADMIN or EMPLOYEE.",
      });
    }

    // STEP 5: Check whether user already exists

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from("users")
      .select("user_id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingUserError) {
      console.error("Existing user check error:", existingUserError);

      return res.status(500).json({
        success: false,
        message: "Could not check existing user.",
      });
    }

    // Don't invite an existing user.
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    // STEP 6: Check for an existing pending invitation

    const { data: existingInvite, error: existingInviteError } =
      await supabaseAdmin
        .from("invites")
        .select("invite_id, email, status")
        .eq("organization_id", currentUser.organization_id)
        .eq("email", email)
        .eq("status", "PENDING")
        .maybeSingle();

    if (existingInviteError) {
      console.error("Existing invitation check error:", existingInviteError);

      return res.status(500).json({
        success: false,
        message: "Could not check existing invitation.",
      });
    }

    // Don't send duplicate invitation.
    if (existingInvite) {
      return res.status(409).json({
        success: false,
        message: "A pending invitation already exists for this email.",
      });
    }

    // STEP 7: Send Supabase invitation email
    const { data: invitedUser, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL || "http://localhost:5173"}/accept-invite`,
      });

    if (inviteError) {
      console.error("Supabase invitation error:", inviteError);

      return res.status(400).json({
        success: false,
        message: inviteError.message,
      });
    }

    // STEP 8: Create invitation record

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("invites")
      .insert({
        organization_id: currentUser.organization_id,
        email: email,
        role: role,
        invited_by: currentUser.user_id,
        status: "PENDING",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (invitationError) {
      console.error("Invitation record creation error:", invitationError);

      return res.status(500).json({
        success: false,
        message:
          "Invitation email sent, but invitation record could not be created.",
        error: invitationError.message,
      });
    }

    // STEP 9: Return successful response

    return res.status(201).json({
      success: true,
      message: "Employee invitation sent successfully.",

      data: {
        invitation,
        invitedUser: invitedUser.user,
      },
    });
  } catch (error) {
    console.error("Invite employee error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};


// ACCEPT INVITATION
const acceptInvite = async (req, res) => {
  try {
    // STEP 1: Extract and validate the Supabase access token.
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "A valid Bearer access token is required.",
      });
    }

    const accessToken = authHeader.slice(7).trim();

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Access token is missing.",
      });
    }

    // STEP 2: Verify the token with Supabase Auth.
    // Never trust a user ID or email supplied in the request body.
    const { data: authData, error: authError } =
      await supabaseAuth.auth.getUser(accessToken);

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token.",
      });
    }

    // Use the identity returned by Supabase, not frontend-supplied values.
    const authUser = authData.user;
    const email = authUser.email?.trim().toLowerCase();

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "The authenticated account has no email address.",
      });
    }

    // STEP 3: Validate the employee's name.
    // The password is handled separately by Supabase Auth on the frontend.
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";

    if (!name || name.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Name is required and must not exceed 120 characters.",
      });
    }

    // STEP 4: Find pending invitations for the authenticated email.
    // Retrieve up to two so we can detect ambiguous invitations.
    const { data: pendingInvitations, error: invitationLookupError } =
      await supabaseAdmin
        .from("invites")
        .select("*")
        .ilike("email", email)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(2);

    if (invitationLookupError) {
      console.error("Invitation lookup error:", invitationLookupError);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve the invitation.",
      });
    }

    // STEP 5: Handle retries when no pending invitation remains.
    // If a previous request completed registration, return success safely.
    if (!pendingInvitations || pendingInvitations.length === 0) {
      const { data: existingUser, error: existingUserError } =
        await supabaseAdmin
          .from("users")
          .select("user_id, organization_id, name, email, role")
          .eq("user_id", authUser.id)
          .maybeSingle();

      if (existingUserError) {
        console.error("Existing user lookup error:", existingUserError);

        return res.status(500).json({
          success: false,
          message: "Could not check the existing user profile.",
        });
      }

      // Confirm that this profile was created through an accepted invitation.
      if (existingUser) {
        const { data: acceptedInvitation, error: acceptedLookupError } =
          await supabaseAdmin
            .from("invites")
            .select("invite_id, status, organization_id")
            .ilike("email", email)
            .eq("organization_id", existingUser.organization_id)
            .eq("status", "ACCEPTED")
            .order("accepted_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (acceptedLookupError) {
          console.error(
            "Accepted invitation lookup error:",
            acceptedLookupError
          );

          return res.status(500).json({
            success: false,
            message: "Could not verify the accepted invitation.",
          });
        }

        if (
          acceptedInvitation &&
          existingUser.email?.toLowerCase() === email
        ) {
          return res.status(200).json({
            success: true,
            message: "Invitation has already been accepted.",
            data: {
              user: existingUser,
              invitation: acceptedInvitation,
            },
          });
        }
      }

      return res.status(404).json({
        success: false,
        message: "No pending invitation was found for this account.",
      });
    }

    // Do not guess which organization the employee should join.
    if (pendingInvitations.length > 1) {
      return res.status(409).json({
        success: false,
        message:
          "Multiple pending invitations exist for this email. Please contact an administrator.",
      });
    }

    const invitation = pendingInvitations[0];

    // STEP 6: Check whether the invitation has expired.
    const now = new Date();

    if (new Date(invitation.expires_at).getTime() <= now.getTime()) {
      const { error: expiryUpdateError } = await supabaseAdmin
        .from("invites")
        .update({ status: "EXPIRED" })
        .eq("invite_id", invitation.invite_id)
        .eq("status", "PENDING");

      if (expiryUpdateError) {
        console.error("Invitation expiry update error:", expiryUpdateError);

        return res.status(500).json({
          success: false,
          message: "Could not update the expired invitation.",
        });
      }

      return res.status(410).json({
        success: false,
        message: "This invitation has expired. Ask an administrator to resend it.",
      });
    }

    // STEP 7: Check whether a profile already exists for this Auth user.
    // This handles retries if profile creation succeeded previously.
    const { data: existingUser, error: existingUserError } =
      await supabaseAdmin
        .from("users")
        .select("user_id, organization_id, name, email, role")
        .eq("user_id", authUser.id)
        .maybeSingle();

    if (existingUserError) {
      console.error("Existing user lookup error:", existingUserError);

      return res.status(500).json({
        success: false,
        message: "Could not check the existing user profile.",
      });
    }

    let applicationUser = existingUser;

    if (existingUser) {
      // Never attach an existing profile to another organization.
      if (
        existingUser.organization_id !== invitation.organization_id ||
        existingUser.email?.toLowerCase() !== email
      ) {
        return res.status(409).json({
          success: false,
          message:
            "The existing user profile does not match this invitation.",
        });
      }

      // Keep the existing profile unchanged on a retry.
      // In particular, do not overwrite a role that an administrator may
      // have legitimately changed after the profile was first created.
    } else {
      // STEP 8: Create the application profile.
      // The organization and role come from the trusted invitation record.
      const { data: newUser, error: userError } = await supabaseAdmin
        .from("users")
        .insert({
          user_id: authUser.id,
          organization_id: invitation.organization_id,
          name: name,
          email: email,
          role: invitation.role,
        })
        .select("user_id, organization_id, name, email, role, created_at")
        .single();

      if (userError) {
        console.error("User profile creation error:", userError);

        // A concurrent request might have created the profile first.
        // Recheck before reporting a permanent failure.
        const { data: concurrentUser, error: retryLookupError } =
          await supabaseAdmin
            .from("users")
            .select("user_id, organization_id, name, email, role")
            .eq("user_id", authUser.id)
            .maybeSingle();

        if (retryLookupError) {
          console.error("Profile retry lookup error:", retryLookupError);
        }

        if (
          !concurrentUser ||
          concurrentUser.organization_id !== invitation.organization_id ||
          concurrentUser.email?.toLowerCase() !== email
        ) {
          return res.status(500).json({
            success: false,
            message:
              "Could not create the user profile. Please retry the request.",
          });
        }

        applicationUser = concurrentUser;
      } else {
        applicationUser = newUser;
      }
    }

    // STEP 9: Mark the invitation as accepted only after the profile
    // has been confirmed to exist and match the invitation.
    const acceptedAt = new Date().toISOString();

    const { data: updatedInvitation, error: updateInviteError } =
      await supabaseAdmin
        .from("invites")
        .update({
          status: "ACCEPTED",
          accepted_at: acceptedAt,
        })
        .eq("invite_id", invitation.invite_id)
        .eq("status", "PENDING")
        .select("*")
        .maybeSingle();

    if (updateInviteError) {
      console.error("Invitation status update error:", updateInviteError);

      // The profile may already exist. A retry can finish this step.
      return res.status(500).json({
        success: false,
        message:
          "The user profile exists, but invitation completion failed. Please retry.",
      });
    }

    // Another concurrent request may have accepted the same invitation.
    // Confirm its final state instead of incorrectly reporting failure.
    let finalInvitation = updatedInvitation;

    if (!finalInvitation) {
      const { data: currentInvitation, error: currentInviteError } =
        await supabaseAdmin
          .from("invites")
          .select("*")
          .eq("invite_id", invitation.invite_id)
          .maybeSingle();

      if (currentInviteError) {
        console.error("Final invitation lookup error:", currentInviteError);

        return res.status(500).json({
          success: false,
          message: "Could not confirm the invitation status.",
        });
      }

      if (!currentInvitation || currentInvitation.status !== "ACCEPTED") {
        return res.status(409).json({
          success: false,
          message:
            "The invitation changed while it was being accepted. Please retry or contact an administrator.",
        });
      }

      finalInvitation = currentInvitation;
    }

    // STEP 10: Return successful registration.
    return res.status(200).json({
      success: true,
      message: "Invitation accepted successfully.",
      data: {
        user: applicationUser,
        invitation: finalInvitation,
      },
    });
  } catch (error) {
    // Log unexpected server errors without exposing sensitive details.
    console.error("Accept invitation error:", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while accepting the invitation.",
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
        message: "Authentication required.",
      });
    }

    // STEP 2: Only organization admins can resend invitations.
    if (currentUser.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only ADMIN users can resend invitations.",
      });
    }

    // STEP 3: Read the invitation ID from the URL.
    const { inviteId } = req.params;

    if (!inviteId) {
      return res.status(400).json({
        success: false,
        message: "Invitation ID is required.",
      });
    }

    // STEP 4: Find the invitation within the admin's organization.
    const { data: invitation, error: lookupError } = await supabaseAdmin
      .from("invites")
      .select("*")
      .eq("invite_id", inviteId)
      .eq("organization_id", currentUser.organization_id)
      .maybeSingle();

    if (lookupError) {
      console.error("Invitation lookup error:", lookupError);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve invitation.",
      });
    }

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found.",
      });
    }

    // STEP 5: Do not resend accepted or cancelled invitations.
    if (!["PENDING", "EXPIRED"].includes(invitation.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot resend an invitation with status ${invitation.status}.`,
      });
    }

    // STEP 6: Prevent repeated requests within 60 seconds.
    if (invitation.last_sent_at) {
      const secondsSinceLastSend =
        (Date.now() - new Date(invitation.last_sent_at).getTime()) / 1000;

      if (secondsSinceLastSend < 60) {
        return res.status(429).json({
          success: false,
          message: "Please wait 60 seconds before resending this invitation.",
        });
      }
    }

    // STEP 7: Check whether the employee already has an application profile.
    const { data: existingUser, error: userLookupError } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("organization_id", currentUser.organization_id)
      .ilike("email", invitation.email)
      .maybeSingle();

    if (userLookupError) {
      console.error("Existing user lookup error:", userLookupError);

      return res.status(500).json({
        success: false,
        message: "Could not check whether the employee has joined.",
      });
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This employee already has a profile in your organization.",
      });
    }

    // STEP 8: Ask Supabase Auth to send the invitation email.
    // Supabase handles email delivery using your Auth email configuration.
    const { error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(invitation.email, {
        redirectTo: `${process.env.FRONTEND_URL || "http://localhost:5173"}/accept-invite`,
      });

    // Do not report success if Supabase rejects the request.
    if (inviteError) {
      console.error("Supabase invitation error:", inviteError);

      return res.status(400).json({
        success: false,
        message: "Supabase could not resend the invitation.",
        error: inviteError.message,
      });
    }

    // STEP 9: Set a new seven-day expiry after the email request succeeds.
    const now = new Date();
    const newExpiresAt = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // STEP 10: Update resend metadata and keep the invitation pending.
    const { data: updatedInvitation, error: updateError } = await supabaseAdmin
      .from("invites")
      .update({
        status: "PENDING",
        expires_at: newExpiresAt,
        last_sent_at: now.toISOString(),
        resend_count: (invitation.resend_count || 0) + 1,
      })
      .eq("invite_id", invitation.invite_id)
      .eq("organization_id", currentUser.organization_id)
      .select()
      .single();

    if (updateError) {
      console.error("Invitation update error:", updateError);

      return res.status(500).json({
        success: false,
        message:
          "Supabase accepted the email request, but the invitation record could not be updated.",
      });
    }

    // STEP 11: Return the updated invitation.
    return res.status(200).json({
      success: true,
      message: "Invitation resend request completed successfully.",
      data: {
        invitation: updatedInvitation,
      },
    });
  } catch (error) {
    console.error("Resend invitation error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};


module.exports = {
  inviteEmployee,
  acceptInvite,
  resendInvite,
};
