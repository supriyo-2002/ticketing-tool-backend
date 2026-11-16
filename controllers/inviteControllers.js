const { supabaseAdmin, supabaseAuth } = require("../config/supabase");

// ============================================================
// CONFIGURATION
// ============================================================

// Application invitation expiry. Keep this compatible with the
// Supabase Auth email-link expiry configured in your dashboard.
const INVITE_EXPIRY_HOURS = Number(process.env.INVITE_EXPIRY_HOURS || 24);

if (
    !Number.isFinite(INVITE_EXPIRY_HOURS) ||
    INVITE_EXPIRY_HOURS <= 0 ||
    INVITE_EXPIRY_HOURS > 24
) {
    throw new Error("INVITE_EXPIRY_HOURS must be greater than 0 and at most 24.");
}

const INVITE_EXPIRY_MS = INVITE_EXPIRY_HOURS * 60 * 60 * 1000;

const ALLOWED_ROLES = ["ADMIN", "EMPLOYEE"];
const ALLOWED_STATUSES = ["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Never expose the Supabase Auth user ID through the invitation API.
const INVITE_COLUMNS = [
    "invite_id",
    "organization_id",
    "email",
    "role",
    "invited_by",
    "status",
    "expires_at",
    "accepted_at",
    "cancelled_at",
    "last_sent_at",
    "resend_count",
    "created_at"
].join(", ");

// ============================================================
// COMMON HELPERS
// ============================================================

const sendError = (res, status, message) => {
    return res.status(status).json({
        success: false,
        message
    });
};

const isExpired = (invitation) => {
    return new Date(invitation.expires_at).getTime() <= Date.now();
};

const normalizeEmail = (email) => {
    return email.trim().toLowerCase();
};

// ============================================================
// HELPER: VALIDATE ADMIN
// ============================================================

const getAdminContext = (req) => {
    const user = req.user;

    if (!user) {
        return {
            error: {
                status: 401,
                message: "Authentication required."
            }
        };
    }

    if (user.role !== "ADMIN") {
        return {
            error: {
                status: 403,
                message: "Only administrators can perform this action."
            }
        };
    }

    if (user.account_status !== "ACTIVE") {
        return {
            error: {
                status: 403,
                message: "Your account is not active."
            }
        };
    }

    if (!user.user_id || !user.organization_id) {
        return {
            error: {
                status: 400,
                message: "Administrator profile is invalid."
            }
        };
    }

    return {
        userId: user.user_id,
        email: user.email ? normalizeEmail(user.email) : null,
        organizationId: user.organization_id
    };
};

// ============================================================
// HELPER: VALIDATE FRONTEND REDIRECT URL
// ============================================================

const getRedirectUrl = () => {
    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
        return {
            error: {
                status: 500,
                message: "FRONTEND_URL is not configured."
            }
        };
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(frontendUrl);
    } catch {
        return {
            error: {
                status: 500,
                message: "FRONTEND_URL is invalid."
            }
        };
    }

    if (
        process.env.NODE_ENV === "production" &&
        parsedUrl.protocol !== "https:"
    ) {
        return {
            error: {
                status: 500,
                message: "Production frontend URL must use HTTPS."
            }
        };
    }

    return {
        redirectTo: `${frontendUrl.replace(/\/+$/, "")}/accept-invite`
    };
};

// ============================================================
// HELPER: RELEASE AN UNACCEPTED AUTH USER
// ============================================================

// This helper only deletes an Auth user if no application profile
// exists. It must never delete an employee who has already joined.
const releaseAuthUser = async (authUserId) => {
    if (!authUserId) {
        return;
    }

    try {
        const {
            data: profile,
            error: profileError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("user_id", authUserId)
            .maybeSingle();

        // If the profile check fails, do not risk deleting the account.
        if (profileError) {
            console.error("Auth cleanup profile check failed:", profileError);
            return;
        }

        // Existing profile means this Auth user must be preserved.
        if (profile) {
            return;
        }

        const { error: deleteError } =
            await supabaseAdmin.auth.admin.deleteUser(authUserId);

        if (deleteError && deleteError.status !== 404) {
            console.error("Auth user cleanup failed:", deleteError);
        }
    } catch (error) {
        console.error("Auth user cleanup error:", error);
    }
};

// ============================================================
// HELPER: EXPIRE ONE INVITATION
// ============================================================

const expireInvite = async (invitation) => {
    const {
        data,
        error
    } = await supabaseAdmin
        .from("invites")
        .update({
            status: "EXPIRED"
        })
        .eq("invite_id", invitation.invite_id)
        .eq("status", "PENDING")
        .select("invite_id");

    if (error) {
        throw error;
    }

    // Delete the unaccepted Auth identity only after the invite
    // has successfully changed to EXPIRED.
    if (data && data.length > 0) {
        await releaseAuthUser(invitation.auth_user_id);
    }
};

// ============================================================
// HELPER: EXPIRE ALL STALE INVITATIONS IN AN ORGANIZATION
// ============================================================

const expireStaleInvites = async (organizationId, email = null) => {
    let query = supabaseAdmin
        .from("invites")
        .update({
            status: "EXPIRED"
        })
        .eq("organization_id", organizationId)
        .eq("status", "PENDING")
        .lte("expires_at", new Date().toISOString());

    if (email) {
        query = query.ilike("email", email);
    }

    const {
        data,
        error
    } = await query.select("invite_id, auth_user_id");

    if (error) {
        throw error;
    }

    // Release only Auth users belonging to invitations that were
    // actually changed from PENDING to EXPIRED.
    await Promise.all(
        (data || []).map((invite) => releaseAuthUser(invite.auth_user_id))
    );
};

// ============================================================
// HELPER: CREATE AND SEND INVITATION
// ============================================================

const dispatchInvite = async ({
    organizationId,
    invitedBy,
    email,
    role,
    redirectTo,
    resendCount = 0
}) => {
    let createdInviteId = null;
    let createdAuthUserId = null;

    try {
        // STEP 1: Update expired invitation statuses.
        await expireStaleInvites(organizationId, email);

        // STEP 2: Check whether this email already has a profile.
        const {
            data: existingUser,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .ilike("email", email)
            .maybeSingle();

        if (userError) {
            throw userError;
        }

        if (existingUser) {
            return {
                error: {
                    status: 409,
                    message: "This user already exists."
                }
            };
        }

        // STEP 3: Check for another active invitation.
        const {
            data: pendingInvite,
            error: pendingError
        } = await supabaseAdmin
            .from("invites")
            .select("invite_id")
            .eq("organization_id", organizationId)
            .ilike("email", email)
            .eq("status", "PENDING")
            .limit(1)
            .maybeSingle();

        if (pendingError) {
            throw pendingError;
        }

        if (pendingInvite) {
            return {
                error: {
                    status: 409,
                    message: "A pending invitation already exists for this email."
                }
            };
        }

        // STEP 4: Clean up Auth identities from old unaccepted invites.
        const {
            data: oldInvites,
            error: oldInviteError
        } = await supabaseAdmin
            .from("invites")
            .select("auth_user_id")
            .eq("organization_id", organizationId)
            .ilike("email", email)
            .in("status", ["EXPIRED", "CANCELLED"])
            .not("auth_user_id", "is", null);

        if (oldInviteError) {
            throw oldInviteError;
        }

        const oldAuthUserIds = [
            ...new Set(
                (oldInvites || [])
                    .map((invite) => invite.auth_user_id)
                    .filter(Boolean)
            )
        ];

        for (const authUserId of oldAuthUserIds) {
            await releaseAuthUser(authUserId);
        }

        // STEP 5: Create the invitation database record.
        const expiresAt = new Date(
            Date.now() + INVITE_EXPIRY_MS
        ).toISOString();

        const {
            data: newInvite,
            error: createInviteError
        } = await supabaseAdmin
            .from("invites")
            .insert({
                organization_id: organizationId,
                email,
                role,
                invited_by: invitedBy,
                status: "PENDING",
                expires_at: expiresAt,
                resend_count: resendCount
            })
            .select("invite_id")
            .single();

        if (createInviteError) {
            if (createInviteError.code === "23505") {
                return {
                    error: {
                        status: 409,
                        message: "A pending invitation already exists for this email."
                    }
                };
            }

            throw createInviteError;
        }

        createdInviteId = newInvite.invite_id;

        // STEP 6: Ask Supabase Auth to create the invited Auth user
        // and send its invitation email.
        const {
            data: authData,
            error: authError
        } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            {
                redirectTo,
                data: {
                    invite_id: createdInviteId,
                    organization_id: organizationId,
                    invited_role: role
                }
            }
        );

        if (authError || !authData?.user?.id) {
            console.error("Supabase invitation error:", authError);

            await cancelInviteRow(createdInviteId);

            const errorMessage = String(
                authError?.message || ""
            ).toLowerCase();

            if (
                authError?.code === "email_exists" ||
                errorMessage.includes("already")
            ) {
                return {
                    error: {
                        status: 409,
                        message: "An account with this email already exists."
                    }
                };
            }

            return {
                error: {
                    status: 502,
                    message: "Supabase could not send the invitation email."
                }
            };
        }

        createdAuthUserId = authData.user.id;

        // STEP 7: Link the Supabase Auth identity to the invitation.
        const {
            data: linkedInvite,
            error: linkError
        } = await supabaseAdmin
            .from("invites")
            .update({
                auth_user_id: createdAuthUserId,
                last_sent_at: new Date().toISOString()
            })
            .eq("invite_id", createdInviteId)
            .eq("status", "PENDING")
            .select(INVITE_COLUMNS)
            .maybeSingle();

        if (linkError || !linkedInvite) {
            throw linkError || new Error("Could not link Auth user to invitation.");
        }

        return {
            invitation: linkedInvite
        };
    } catch (error) {
        console.error("Dispatch invitation error:", error);

        // Roll back only the records and Auth user created by this call.
        if (createdInviteId) {
            await cancelInviteRow(createdInviteId);
        }

        if (createdAuthUserId) {
            await releaseAuthUser(createdAuthUserId);
        }

        throw error;
    }
};

// ============================================================
// HELPER: CANCEL INVITATION ROW
// ============================================================

const cancelInviteRow = async (inviteId) => {
    if (!inviteId) {
        return;
    }

    const { error } = await supabaseAdmin
        .from("invites")
        .update({
            status: "CANCELLED",
            cancelled_at: new Date().toISOString()
        })
        .eq("invite_id", inviteId)
        .eq("status", "PENDING");

    if (error) {
        console.error("Invitation rollback error:", error);
    }
};

// ============================================================
// 1. INVITE EMPLOYEE
// POST /api/auth/invite
// ============================================================

const inviteEmployee = async (req, res) => {
    try {
        // STEP 1: Validate the logged-in administrator.
        const admin = getAdminContext(req);

        if (admin.error) {
            return sendError(res, admin.error.status, admin.error.message);
        }

        // STEP 2: Read and validate request body.
        const { email: inputEmail, role: inputRole } = req.body || {};

        if (typeof inputEmail !== "string" || !inputEmail.trim()) {
            return sendError(res, 400, "Employee email is required.");
        }

        if (inputRole !== undefined && typeof inputRole !== "string") {
            return sendError(res, 400, "Role must be ADMIN or EMPLOYEE.");
        }

        const email = normalizeEmail(inputEmail);
        const role = inputRole?.trim()
            ? inputRole.trim().toUpperCase()
            : "EMPLOYEE";

        if (email.length > 254 || !EMAIL_REGEX.test(email)) {
            return sendError(res, 400, "Please provide a valid email address.");
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return sendError(res, 400, "Role must be ADMIN or EMPLOYEE.");
        }

        if (admin.email === email) {
            return sendError(res, 400, "You cannot invite yourself.");
        }

        // STEP 3: Validate the frontend redirect URL.
        const redirect = getRedirectUrl();

        if (redirect.error) {
            return sendError(res, redirect.error.status, redirect.error.message);
        }

        // STEP 4: Create the invitation and send the email.
        const result = await dispatchInvite({
            organizationId: admin.organizationId,
            invitedBy: admin.userId,
            email,
            role,
            redirectTo: redirect.redirectTo,
            resendCount: 0
        });

        if (result.error) {
            return sendError(res, result.error.status, result.error.message);
        }

        return res.status(201).json({
            success: true,
            message: "Invitation sent successfully.",
            invitation: result.invitation
        });
    } catch (error) {
        console.error("Invite employee controller error:", error);

        return sendError(res, 500, "Failed to send invitation.");
    }
};

// ============================================================
// 2. ACCEPT INVITATION
// POST /api/auth/accept-invite
//
// This route is intentionally public at the Express middleware
// level. The invited user's Supabase bearer token is verified here.
// ============================================================

const acceptInvite = async (req, res) => {
    try {
        // STEP 1: Read the bearer token from the request header.
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return sendError(res, 401, "Authorization token is required.");
        }

        const accessToken = authHeader.slice(7).trim();

        if (!accessToken) {
            return sendError(res, 401, "Authorization token is required.");
        }

        // STEP 2: Verify the token with Supabase Auth.
        const {
            data: authData,
            error: authError
        } = await supabaseAuth.auth.getUser(accessToken);

        if (authError || !authData?.user) {
            return sendError(res, 401, "Invalid or expired token.");
        }

        const authUser = authData.user;
        const email = authUser.email
            ? normalizeEmail(authUser.email)
            : null;

        if (!email) {
            return sendError(res, 400, "Authenticated account has no email.");
        }

        // Supabase invitation links should confirm the invited email.
        if (!authUser.email_confirmed_at) {
            return sendError(
                res,
                403,
                "Please verify your invitation email before accepting."
            );
        }

        // STEP 3: Validate name and password.
        const { name, password } = req.body || {};

        if (
            typeof name !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !password
        ) {
            return sendError(res, 400, "Name and password are required.");
        }

        const cleanName = name.trim();

        if (cleanName.length > 100) {
            return sendError(res, 400, "Name must be 100 characters or fewer.");
        }

        if (password.length < 8) {
            return sendError(res, 400, "Password must contain at least 8 characters.");
        }

        if (Buffer.byteLength(password, "utf8") > 72) {
            return sendError(res, 400, "Password must not exceed 72 bytes.");
        }

        // STEP 4: Find the invitation associated with this Auth user.
        // Fetch all statuses so a retry after a successful acceptance
        // can return the existing profile instead of incorrectly returning 404.
        const {
            data: invitation,
            error: inviteError
        } = await supabaseAdmin
            .from("invites")
            .select("*")
            .eq("auth_user_id", authUser.id)
            .maybeSingle();

        if (inviteError) {
            throw inviteError;
        }

        if (!invitation) {
            return sendError(res, 404, "Invitation not found for this account.");
        }

        if (normalizeEmail(invitation.email) !== email) {
            return sendError(
                res,
                403,
                "This invitation does not belong to this email account."
            );
        }

        // STEP 5: Handle already accepted invitation retries.
        if (invitation.status === "ACCEPTED") {
            const {
                data: acceptedProfile,
                error: acceptedProfileError
            } = await supabaseAdmin
                .from("users")
                .select("*")
                .eq("user_id", authUser.id)
                .maybeSingle();

            if (acceptedProfileError) {
                throw acceptedProfileError;
            }

            if (!acceptedProfile) {
                return sendError(
                    res,
                    409,
                    "Invitation is accepted but the user profile is missing. Contact an administrator."
                );
            }

            return res.status(200).json({
                success: true,
                message: "Invitation has already been accepted.",
                user: acceptedProfile
            });
        }

        if (invitation.status === "CANCELLED") {
            return sendError(res, 409, "This invitation has been cancelled.");
        }

        if (invitation.status === "EXPIRED") {
            return sendError(res, 410, "This invitation has expired.");
        }

        if (invitation.status !== "PENDING") {
            return sendError(res, 409, "Invitation cannot be accepted.");
        }

        // STEP 6: Check the invitation expiry.
        if (isExpired(invitation)) {
            await expireInvite(invitation);
            return sendError(res, 410, "This invitation has expired.");
        }

        // STEP 7: Check whether a profile already exists.
        const {
            data: existingProfile,
            error: profileError
        } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("user_id", authUser.id)
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        if (
            existingProfile &&
            existingProfile.organization_id !== invitation.organization_id
        ) {
            return sendError(
                res,
                409,
                "This account already belongs to another organization."
            );
        }

        // STEP 8: Set the password and name in Supabase Auth.
        const {
            error: passwordError
        } = await supabaseAdmin.auth.admin.updateUserById(
            authUser.id,
            {
                password,
                user_metadata: {
                    ...(authUser.user_metadata || {}),
                    full_name: cleanName
                }
            }
        );

        if (passwordError) {
            if (
                passwordError.status === 422 ||
                passwordError.code === "weak_password"
            ) {
                return sendError(
                    res,
                    400,
                    "Password does not meet the security requirements."
                );
            }

            throw passwordError;
        }

        // STEP 9: Create the application profile if it does not exist.
        let profile = existingProfile;

        if (!profile) {
            const {
                data: newProfile,
                error: createProfileError
            } = await supabaseAdmin
                .from("users")
                .insert({
                    user_id: authUser.id,
                    organization_id: invitation.organization_id,
                    name: cleanName,
                    email,
                    role: invitation.role,
                    account_status: "ACTIVE"
                })
                .select("*")
                .single();

            if (createProfileError) {
                // Handle a concurrent request that inserted the same profile.
                if (createProfileError.code === "23505") {
                    const {
                        data: racedProfile,
                        error: racedProfileError
                    } = await supabaseAdmin
                        .from("users")
                        .select("*")
                        .eq("user_id", authUser.id)
                        .maybeSingle();

                    if (racedProfileError) {
                        throw racedProfileError;
                    }

                    if (!racedProfile) {
                        throw createProfileError;
                    }

                    if (
                        racedProfile.organization_id !== invitation.organization_id
                    ) {
                        return sendError(
                            res,
                            409,
                            "This account already belongs to another organization."
                        );
                    }

                    profile = racedProfile;
                } else {
                    throw createProfileError;
                }
            } else {
                profile = newProfile;
            }
        }

        // STEP 10: Mark the invitation as accepted.
        // The status condition prevents a cancelled/expired invite from
        // being accepted after another request has changed its status.
        const {
            data: acceptedInvite,
            error: acceptUpdateError
        } = await supabaseAdmin
            .from("invites")
            .update({
                status: "ACCEPTED",
                accepted_at: new Date().toISOString()
            })
            .eq("invite_id", invitation.invite_id)
            .eq("status", "PENDING")
            .select("invite_id")
            .maybeSingle();

        if (acceptUpdateError) {
            throw acceptUpdateError;
        }

        if (!acceptedInvite) {
            // The profile may already have been created. Do not delete it:
            // a concurrent acceptance/cancellation may have changed the invite.
            return sendError(
                res,
                409,
                "Invitation status changed. Please contact your administrator."
            );
        }

        return res.status(200).json({
            success: true,
            message: "Invitation accepted successfully. You can now log in.",
            user: profile
        });
    } catch (error) {
        console.error("Accept invitation controller error:", error);

        return sendError(res, 500, "Failed to accept invitation.");
    }
};

// ============================================================
// 3. GET INVITATIONS
// GET /api/auth/invitations
//
// Query parameters:
// page=1
// limit=10
// status=PENDING
// search=employee@example.com
// ============================================================

const getInvitations = async (req, res) => {
    try {
        // STEP 1: Only an administrator can view organization invitations.
        const admin = getAdminContext(req);

        if (admin.error) {
            return sendError(res, admin.error.status, admin.error.message);
        }

        // STEP 2: Validate optional filters.
        const status =
            typeof req.query.status === "string" && req.query.status.trim()
                ? req.query.status.trim().toUpperCase()
                : null;

        if (status && !ALLOWED_STATUSES.includes(status)) {
            return sendError(
                res,
                400,
                `Status must be one of: ${ALLOWED_STATUSES.join(", ")}.`
            );
        }

        const search =
            typeof req.query.search === "string"
                ? req.query.search.trim().slice(0, 100)
                : "";

        const parsedPage = Number.parseInt(req.query.page, 10);
        const parsedLimit = Number.parseInt(req.query.limit, 10);

        const page = Number.isInteger(parsedPage) && parsedPage > 0
            ? parsedPage
            : 1;

        const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 10;

        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // STEP 3: Update stale PENDING invitations to EXPIRED.
        await expireStaleInvites(admin.organizationId);

        // STEP 4: Build a query scoped to this administrator's organization.
        let query = supabaseAdmin
            .from("invites")
            .select(INVITE_COLUMNS, { count: "exact" })
            .eq("organization_id", admin.organizationId)
            .order("created_at", { ascending: false })
            .range(from, to);

        if (status) {
            query = query.eq("status", status);
        }

        if (search) {
            // Escape wildcard characters so they are treated literally.
            const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
            query = query.ilike("email", `%${escapedSearch}%`);
        }

        const {
            data,
            error,
            count
        } = await query;

        if (error) {
            throw error;
        }

        const total = count || 0;

        return res.status(200).json({
            success: true,
            invitations: data || [],
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Get invitations controller error:", error);

        return sendError(res, 500, "Failed to retrieve invitations.");
    }
};

// ============================================================
// 4. CANCEL INVITATION
// PATCH /api/auth/:inviteId/cancel
// ============================================================

const cancelInvite = async (req, res) => {
    try {
        // STEP 1: Validate administrator.
        const admin = getAdminContext(req);

        if (admin.error) {
            return sendError(res, admin.error.status, admin.error.message);
        }

        // STEP 2: Validate invitation ID.
        const { inviteId } = req.params;

        if (!inviteId || !UUID_REGEX.test(inviteId)) {
            return sendError(res, 400, "A valid invitation ID is required.");
        }

        // STEP 3: Find invitation inside the administrator's organization.
        const {
            data: invitation,
            error: findError
        } = await supabaseAdmin
            .from("invites")
            .select("*")
            .eq("invite_id", inviteId)
            .eq("organization_id", admin.organizationId)
            .maybeSingle();

        if (findError) {
            throw findError;
        }

        if (!invitation) {
            return sendError(res, 404, "Invitation not found.");
        }

        if (invitation.status === "ACCEPTED") {
            return sendError(
                res,
                409,
                "Accepted invitations cannot be cancelled."
            );
        }

        if (invitation.status === "CANCELLED") {
            return sendError(res, 409, "Invitation is already cancelled.");
        }

        if (invitation.status === "EXPIRED") {
            return sendError(
                res,
                409,
                "Invitation has already expired. You can create a new invitation."
            );
        }

        if (isExpired(invitation)) {
            await expireInvite(invitation);

            return sendError(
                res,
                409,
                "Invitation has expired. You can create a new invitation."
            );
        }

        // STEP 4: Update only if the invitation is still PENDING.
        const {
            data: cancelledInvite,
            error: cancelError
        } = await supabaseAdmin
            .from("invites")
            .update({
                status: "CANCELLED",
                cancelled_at: new Date().toISOString()
            })
            .eq("invite_id", inviteId)
            .eq("organization_id", admin.organizationId)
            .eq("status", "PENDING")
            .select(INVITE_COLUMNS)
            .maybeSingle();

        if (cancelError) {
            throw cancelError;
        }

        if (!cancelledInvite) {
            return sendError(
                res,
                409,
                "Invitation status changed. Please refresh and try again."
            );
        }

        // STEP 5: Remove the unaccepted Auth identity, if safe.
        await releaseAuthUser(invitation.auth_user_id);

        return res.status(200).json({
            success: true,
            message: "Invitation cancelled successfully.",
            invitation: cancelledInvite
        });
    } catch (error) {
        console.error("Cancel invitation controller error:", error);

        return sendError(res, 500, "Failed to cancel invitation.");
    }
};

// ============================================================
// 5. RESEND INVITATION
// POST /api/auth/resend-invite/:inviteId
//
// This implementation allows resend only after expiry.
// The old invitation remains as EXPIRED for history.
// A new invitation and new Auth identity are created.
// ============================================================

const resendInvite = async (req, res) => {
    try {
        // STEP 1: Validate administrator.
        const admin = getAdminContext(req);

        if (admin.error) {
            return sendError(res, admin.error.status, admin.error.message);
        }

        // STEP 2: Validate invitation ID.
        const { inviteId } = req.params;

        if (!inviteId || !UUID_REGEX.test(inviteId)) {
            return sendError(res, 400, "A valid invitation ID is required.");
        }

        // STEP 3: Validate redirect URL.
        const redirect = getRedirectUrl();

        if (redirect.error) {
            return sendError(res, redirect.error.status, redirect.error.message);
        }

        // STEP 4: Find invitation within this organization.
        const {
            data: invitation,
            error: inviteError
        } = await supabaseAdmin
            .from("invites")
            .select("*")
            .eq("invite_id", inviteId)
            .eq("organization_id", admin.organizationId)
            .maybeSingle();

        if (inviteError) {
            throw inviteError;
        }

        if (!invitation) {
            return sendError(res, 404, "Invitation not found.");
        }

        if (invitation.status === "ACCEPTED") {
            return sendError(res, 409, "Accepted invitations cannot be resent.");
        }

        if (invitation.status === "CANCELLED") {
            return sendError(res, 409, "Cancelled invitations cannot be resent.");
        }

        // STEP 5: An active PENDING invitation cannot be resent.
        if (invitation.status === "PENDING" && !isExpired(invitation)) {
            return sendError(res, 409, "This invitation is still active.");
        }

        // If its time has passed but its status is still PENDING,
        // update it to EXPIRED before creating the replacement.
        if (invitation.status === "PENDING" && isExpired(invitation)) {
            await expireInvite(invitation);
        } else if (invitation.status !== "EXPIRED") {
            return sendError(res, 409, "Only expired invitations can be resent.");
        }

        // STEP 6: Create a new invitation and send a new email.
        const result = await dispatchInvite({
            organizationId: admin.organizationId,
            invitedBy: admin.userId,
            email: normalizeEmail(invitation.email),
            role: invitation.role,
            redirectTo: redirect.redirectTo,
            resendCount: (invitation.resend_count || 0) + 1
        });

        if (result.error) {
            return sendError(res, result.error.status, result.error.message);
        }

        return res.status(201).json({
            success: true,
            message: "A new invitation has been sent successfully.",
            invitation: result.invitation
        });
    } catch (error) {
        console.error("Resend invitation controller error:", error);

        return sendError(res, 500, "Failed to resend invitation.");
    }
};

// ============================================================
// EXPORT ALL INVITATION CONTROLLERS
// ============================================================

module.exports = {
    inviteEmployee,
    acceptInvite,
    resendInvite,
    getInvitations,
    cancelInvite
};