const { supabaseAuth, supabaseAdmin } = require("../config/supabase");

// INVITE EMPLOYEE
const inviteEmployee = async (req, res) => {
    try {
        // STEP 1: Get the currently logged-in user.
        const currentUser = req.user;

        // Ensure the user is authenticated.
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        // STEP 2: Check ADMIN role.
        if (currentUser.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only ADMIN users can invite employees."
            });
        }

        // STEP 3: Extract invitation details.
        const { email, role } = req.body;

        // Normalize email to lowercase.
        const normalizedEmail =
            typeof email === "string"
                ? email.trim().toLowerCase()
                : "";

        // Define allowed roles.
        const allowedRoles = ["ADMIN", "EMPLOYEE"];

        // Validate required fields.
        if (!normalizedEmail || !role) {
            return res.status(400).json({
                success: false,
                message: "Email and role are required."
            });
        }

        // Validate email format.
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address."
            });
        }

        // Validate employee role.
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role. Role must be ADMIN or EMPLOYEE."
            });
        }

        // STEP 4: Check whether employee already exists.
        const { data: existingUser, error: existingUserError } =
            await supabaseAdmin
                .from("users")
                .select("user_id, email")
                .eq("email", normalizedEmail)
                .maybeSingle();

        if (existingUserError) {
            console.error("Existing user check error:", existingUserError);

            return res.status(500).json({
                success: false,
                message: "Could not check existing user."
            });
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists."
            });
        }

        // STEP 5: Check for an existing pending invitation.
        const { data: existingInvite, error: existingInviteError } =
            await supabaseAdmin
                .from("invites")
                .select("invite_id, email, status")
                .eq("organization_id", currentUser.organization_id)
                .eq("email", normalizedEmail)
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

        if (existingInvite) {
            return res.status(409).json({
                success: false,
                message: "A pending invitation already exists for this email."
            });
        }

        // STEP 6: Calculate invitation expiry (7 days).
        const expiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        // STEP 7: Create invitation record before sending email.
        const { data: invitation, error: invitationError } =
            await supabaseAdmin
                .from("invites")
                .insert({
                    organization_id: currentUser.organization_id,
                    email: normalizedEmail,
                    role: role,
                    invited_by: currentUser.user_id,
                    status: "PENDING",
                    expires_at: expiresAt
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
                message: "Could not create invitation record."
            });
        }

        // STEP 8: Get deployed frontend URL.
        const frontendUrl = process.env.FRONTEND_URL;

        if (!frontendUrl) {
            console.error("FRONTEND_URL is missing.");

            // Cancel the invitation because email cannot be configured.
            await supabaseAdmin
                .from("invites")
                .update({ status: "CANCELLED" })
                .eq("invite_id", invitation.invite_id);

            return res.status(500).json({
                success: false,
                message: "Frontend URL is not configured."
            });
        }

        // Construct the Accept Invite page URL.
        const redirectUrl =
            `${frontendUrl.replace(/\/+$/, "")}/accept-invite`;

        // STEP 9: Send invitation email through Supabase Auth.
        const { data: invitedUser, error: inviteError } =
            await supabaseAdmin.auth.admin.inviteUserByEmail(
                normalizedEmail,
                {
                    redirectTo: redirectUrl
                }
            );

        // STEP 10: Handle invitation email failure.
        if (inviteError) {
            console.error("Supabase invitation error:", inviteError);

            // Mark the invitation as cancelled.
            const { error: cancelError } = await supabaseAdmin
                .from("invites")
                .update({
                    status: "CANCELLED"
                })
                .eq("invite_id", invitation.invite_id)
                .eq("status", "PENDING");

            if (cancelError) {
                console.error(
                    "Invitation cancellation error:",
                    cancelError
                );
            }

            return res.status(400).json({
                success: false,
                message: inviteError.message
            });
        }

        // STEP 11: Return successful response.
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
// -------------------------------------------------------------
// ACCEPT INVITATION
// -------------------------------------------------------------
// 1. Verify the Supabase invitation access token.
// 2. Validate the employee's name and password.
// 3. Find and validate the pending invitation.
// 4. Set the employee's password through Supabase Admin.
// 5. Create the employee's application profile.
// 6. Mark the invitation as ACCEPTED.
// -------------------------------------------------------------

const acceptInvite = async (req, res) => {
    try {
        // STEP 1: Read the Supabase access token from the Authorization header.
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "A valid Bearer access token is required."
            });
        }

        const accessToken = authHeader.slice(7).trim();

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Access token is missing."
            });
        }

        // STEP 2: Verify the token with Supabase Auth.
        // Never trust the email or user ID sent by the frontend.
        const { data: authData, error: authError } =
            await supabaseAuth.auth.getUser(accessToken);

        if (authError || !authData.user) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired invitation token."
            });
        }

        const authUser = authData.user;
        const email = authUser.email?.trim().toLowerCase();

        if (!email) {
            return res.status(401).json({
                success: false,
                message: "The authenticated account has no email address."
            });
        }

        // STEP 3: Validate the employee's name and password.
        const name =
            typeof req.body?.name === "string"
                ? req.body.name.trim()
                : "";

        const password =
            typeof req.body?.password === "string"
                ? req.body.password
                : "";

        if (!name || name.length > 120) {
            return res.status(400).json({
                success: false,
                message: "Name is required and must not exceed 120 characters."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        // STEP 4: Find pending invitations for the authenticated email.
        // Retrieve up to two records to detect ambiguous invitations.
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
                message: "Could not retrieve the invitation."
            });
        }

        // STEP 5: Handle retries if the invitation was already accepted.
        // This prevents a completed invitation from being processed again.
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
                    message: "Could not check the existing user profile."
                });
            }

            if (existingUser && existingUser.email?.toLowerCase() === email) {
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
                        message: "Could not verify the accepted invitation."
                    });
                }

                if (acceptedInvitation) {
                    return res.status(200).json({
                        success: true,
                        message: "Invitation has already been accepted.",
                        data: {
                            user: existingUser,
                            invitation: acceptedInvitation
                        }
                    });
                }
            }

            return res.status(404).json({
                success: false,
                message: "No pending invitation was found for this account."
            });
        }

        // Do not guess which organization the employee should join.
        if (pendingInvitations.length > 1) {
            return res.status(409).json({
                success: false,
                message:
                    "Multiple pending invitations exist for this email. Please contact an administrator."
            });
        }

        const invitation = pendingInvitations[0];

        // STEP 6: Check whether the invitation has expired.
        if (
            !invitation.expires_at ||
            new Date(invitation.expires_at).getTime() <= Date.now()
        ) {
            const { error: expiryUpdateError } = await supabaseAdmin
                .from("invites")
                .update({ status: "EXPIRED" })
                .eq("invite_id", invitation.invite_id)
                .eq("status", "PENDING");

            if (expiryUpdateError) {
                console.error(
                    "Invitation expiry update error:",
                    expiryUpdateError
                );

                return res.status(500).json({
                    success: false,
                    message: "Could not update the expired invitation."
                });
            }

            return res.status(410).json({
                success: false,
                message:
                    "This invitation has expired. Ask an administrator to resend it."
            });
        }

        // STEP 7: Set the employee's password in Supabase Auth.
        // The user ID comes from the verified access token.
        // The service-role client is used only on the backend.
        const { data: passwordData, error: passwordError } =
            await supabaseAdmin.auth.admin.updateUserById(
                authUser.id,
                { password }
            );

        if (passwordError || !passwordData.user) {
            console.error("Password update error:", passwordError);

            return res.status(400).json({
                success: false,
                message:
                    passwordError?.message ||
                    "Could not set the account password."
            });
        }

        // STEP 8: Check whether an application profile already exists.
        // This supports retrying if an earlier request partially completed.
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
                message: "Could not check the existing user profile."
            });
        }

        let applicationUser = existingUser;

        if (existingUser) {
            // Never attach an existing profile to a different organization.
            if (
                existingUser.organization_id !== invitation.organization_id ||
                existingUser.email?.toLowerCase() !== email
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "The existing user profile does not match this invitation."
                });
            }

            // Keep the existing profile and role unchanged on a retry.
        } else {
            // STEP 9: Create the application profile.
            // Organization and role are taken from the trusted invitation.
            const { data: newUser, error: userError } =
                await supabaseAdmin
                    .from("users")
                    .insert({
                        user_id: authUser.id,
                        organization_id: invitation.organization_id,
                        name,
                        email,
                        role: invitation.role
                    })
                    .select(
                        "user_id, organization_id, name, email, role, created_at"
                    )
                    .single();

            if (userError) {
                console.error("User profile creation error:", userError);

                // Another request may have created the profile concurrently.
                const { data: concurrentUser, error: retryLookupError } =
                    await supabaseAdmin
                        .from("users")
                        .select("user_id, organization_id, name, email, role")
                        .eq("user_id", authUser.id)
                        .maybeSingle();

                if (retryLookupError) {
                    console.error(
                        "Profile retry lookup error:",
                        retryLookupError
                    );
                }

                if (
                    !concurrentUser ||
                    concurrentUser.organization_id !== invitation.organization_id ||
                    concurrentUser.email?.toLowerCase() !== email
                ) {
                    return res.status(500).json({
                        success: false,
                        message:
                            "Could not create the user profile. Please retry."
                    });
                }

                applicationUser = concurrentUser;
            } else {
                applicationUser = newUser;
            }
        }

        // STEP 10: Mark the invitation as accepted only after
        // the application profile has been confirmed.
        const acceptedAt = new Date().toISOString();

        const { data: updatedInvitation, error: updateInviteError } =
            await supabaseAdmin
                .from("invites")
                .update({
                    status: "ACCEPTED",
                    accepted_at: acceptedAt
                })
                .eq("invite_id", invitation.invite_id)
                .eq("status", "PENDING")
                .select("*")
                .maybeSingle();

        if (updateInviteError) {
            console.error(
                "Invitation status update error:",
                updateInviteError
            );

            return res.status(500).json({
                success: false,
                message:
                    "The user profile exists, but invitation completion failed. Please retry."
            });
        }

        // Handle another request accepting the same invitation concurrently.
        let finalInvitation = updatedInvitation;

        if (!finalInvitation) {
            const { data: currentInvitation, error: currentInviteError } =
                await supabaseAdmin
                    .from("invites")
                    .select("*")
                    .eq("invite_id", invitation.invite_id)
                    .maybeSingle();

            if (currentInviteError) {
                console.error(
                    "Final invitation lookup error:",
                    currentInviteError
                );

                return res.status(500).json({
                    success: false,
                    message: "Could not confirm the invitation status."
                });
            }

            if (
                !currentInvitation ||
                currentInvitation.status !== "ACCEPTED"
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "The invitation changed while it was being accepted. Please retry or contact an administrator."
                });
            }

            finalInvitation = currentInvitation;
        }

        // STEP 11: Return successful invitation acceptance.
        return res.status(200).json({
            success: true,
            message: "Invitation accepted successfully.",
            data: {
                user: applicationUser,
                invitation: finalInvitation
            }
        });

    } catch (error) {
        console.error("Accept invitation error:", error);

        return res.status(500).json({
            success: false,
            message:
                "An unexpected error occurred while accepting the invitation."
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
// GET ALL INVITATIONS
// Allows an ADMIN to view invitation history for their organization.
const getInvitations = async (req, res) => {
  try {
    // STEP 1: Get the authenticated user from the authentication middleware.
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // STEP 2: Only ADMIN users can view organization invitation history.
    if (currentUser.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only ADMIN users can view invitations.",
      });
    }

    // STEP 3: Read optional search, status, and pagination parameters.
    const search = (req.query.search || "").trim();
    const requestedStatus = (req.query.status || "").toUpperCase();

    const allowedStatuses = [
      "PENDING",
      "ACCEPTED",
      "EXPIRED",
      "CANCELLED",
    ];

    if (requestedStatus && !allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status filter.",
        allowedStatuses,
      });
    }

    // Default to 10 invitations per page; limit the maximum to 100.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Use one timestamp consistently for expiry checks in this request.
    const now = new Date().toISOString();

    // STEP 4: Prepare the invitation list query.
    // Always restrict the results to the authenticated ADMIN's organization.
    let invitationQuery = supabaseAdmin
      .from("invites")
      .select(
        `
          invite_id,
          organization_id,
          email,
          role,
          invited_by,
          status,
          created_at,
          last_sent_at,
          resend_count,
          expires_at,
          accepted_at
        `,
        { count: "exact" }
      )
      .eq("organization_id", currentUser.organization_id);

    // STEP 5: Apply the optional email search.
    if (search) {
      invitationQuery = invitationQuery.ilike("email", `%${search}%`);
    }

    // STEP 6: Apply the optional status filter.
    // A pending invitation whose expiry time has passed is treated as EXPIRED.
    if (requestedStatus === "EXPIRED") {
      invitationQuery = invitationQuery.or(
        `status.eq.EXPIRED,and(status.eq.PENDING,expires_at.lte.${now})`
      );
    } else if (requestedStatus === "PENDING") {
      invitationQuery = invitationQuery
        .eq("status", "PENDING")
        .gt("expires_at", now);
    } else if (requestedStatus) {
      invitationQuery = invitationQuery.eq("status", requestedStatus);
    }

    // STEP 7: Fetch the requested page, newest invitations first.
    const {
      data: invitations,
      error: invitationsError,
      count: filteredCount,
    } = await invitationQuery
      .order("created_at", { ascending: false })
      .range(from, to);

    if (invitationsError) {
      console.error("Get invitations error:", invitationsError);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve invitations.",
      });
    }

    // STEP 8: Normalize expired invitations in the response.
    // This does not update the database status.
    const normalizedInvitations = (invitations || []).map((invitation) => {
      const isExpired =
        invitation.status === "EXPIRED" ||
        (invitation.status === "PENDING" &&
          new Date(invitation.expires_at).getTime() <= Date.now());

      return {
        ...invitation,
        status: isExpired ? "EXPIRED" : invitation.status,
      };
    });

    // STEP 9: Count all invitations belonging to this organization.
    // These counts cover the whole organization, not just the current page.
    const countQuery = () =>
      supabaseAdmin
        .from("invites")
        .select("invite_id", { count: "exact", head: true })
        .eq("organization_id", currentUser.organization_id);

    const [
      totalResult,
      pendingResult,
      acceptedResult,
      expiredResult,
      cancelledResult,
    ] = await Promise.all([
      // Total invitations in every status.
      countQuery(),

      // Pending invitations that have not expired.
      countQuery()
        .eq("status", "PENDING")
        .gt("expires_at", now),

      // Invitations accepted by employees.
      countQuery().eq("status", "ACCEPTED"),

      // Explicitly expired invitations plus pending invitations past expiry.
      countQuery().or(
        `status.eq.EXPIRED,and(status.eq.PENDING,expires_at.lte.${now})`
      ),

      // Invitations cancelled by the application.
      countQuery().eq("status", "CANCELLED"),
    ]);

    // STEP 10: Check for summary-query errors.
    const summaryResults = [
      totalResult,
      pendingResult,
      acceptedResult,
      expiredResult,
      cancelledResult,
    ];

    const summaryError = summaryResults.find((result) => result.error);

    if (summaryError) {
      console.error("Invitation summary error:", summaryError.error);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve invitation summary.",
      });
    }

    // STEP 11: Return the invitation list, summary, and pagination metadata.
    return res.status(200).json({
      success: true,
      message: "Invitations retrieved successfully.",

      summary: {
        totalInvitations: totalResult.count || 0,
        pendingInvitations: pendingResult.count || 0,
        acceptedInvitations: acceptedResult.count || 0,
        expiredInvitations: expiredResult.count || 0,
        cancelledInvitations: cancelledResult.count || 0,
      },

      pagination: {
        page,
        limit,
        totalRecords: filteredCount || 0,
        totalPages: Math.ceil((filteredCount || 0) / limit),
      },

      data: normalizedInvitations,
    });
  } catch (error) {
    // Log unexpected errors without exposing internal details to the client.
    console.error("Get invitations controller error:", error);

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
  getInvitations,
}