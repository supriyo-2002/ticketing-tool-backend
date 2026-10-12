// Import both Supabase clients.
// supabaseAuth:
// Used for creating the authentication account.
// supabaseAdmin:
// Used for trusted backend database operations.
const {
    supabaseAuth,
    supabaseAdmin
} = require("../config/supabase");

// login 
const login = async (req, res) => {

    try {

        // Get login information from request body.
        const {
            email,
            password
        } = req.body;


        // Validate required fields.
        if (!email || !password) {

            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }
        // Authenticate user using Supabase Auth.
   
        const {
            data,
            error
        } = await supabaseAuth.auth.signInWithPassword({
            email,
            password
        });


        // Invalid credentials.
        if (error) {

            return res.status(401).json({
                success: false,
                message: error.message
            });
        }


        // Make sure Supabase returned a user.
        if (!data.user) {

            return res.status(401).json({
                success: false,
                message: "Unable to authenticate user."
            });
        }


        // -------------------------------------------------------------
        // Get application user information.
        // -------------------------------------------------------------
        // This gives us:
        // - organization
        // - role
        // - name
        //
        // We use the ADMIN client here because RLS is enabled.

        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("user_id", data.user.id)
            .single();


        if (userError) {

            console.error(
                "User profile fetch error:",
                userError
            );

            return res.status(500).json({
                success: false,
                message: "Authentication successful, but user profile could not be found.",
                error: userError.message
            });
        }


        
        // Return login response.
       

        return res.status(200).json({
            success: true,
            message: "Login successful.",

            data: {
                user,
                session: data.session
            }
        });


    } catch (error) {

        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};

// register

const registerOrganization = async (req, res) => {

    try {

        // Get signup information from request body.
        const {
            name,
            email,
            password,
            organizationName
        } = req.body;
       
        // STEP 1: Validate required fields
        if (!name || !email || !password || !organizationName) {

            return res.status(400).json({
                success: false,
                message: "Name, email, password and organization name are required."
            });
        }
        // STEP 2: Create Supabase Auth account      

        const {
            data,
            error
        } = await supabaseAuth.auth.signUp({
            email,
            password
        });


        // If Supabase Auth returns an error.
        if (error) {

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }


        // Get the newly created Auth user.
        const authUser = data.user;


        // Make sure Auth returned a user.
        if (!authUser) {

            return res.status(400).json({
                success: false,
                message: "User account could not be created."
            });
        }


       
        // STEP 3: Create organization
        
        const {
            data: organization,
            error: organizationError
        } = await supabaseAdmin
            .from("organizations")
            .insert({
                name: organizationName
            })
            .select()
            .single();


        // If organization creation fails.
        if (organizationError) {

            console.error(
                "Organization creation error:",
                organizationError
            );

            return res.status(500).json({
                success: false,
                message: "User created, but organization creation failed.",
                error: organizationError.message
            });
        }

        // STEP 4: Create application user
        // The organization creator becomes ADMIN.

        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .insert({
                user_id: authUser.id,
                organization_id: organization.organization_id,
                name: name,
                email: email,
                role: "ADMIN"
            })
            .select()
            .single();


        // If public.users creation fails.
        if (userError) {

            console.error(
                "User profile creation error:",
                userError
            );

            return res.status(500).json({
                success: false,
                message: "Authentication account created, but user profile creation failed.",
                error: userError.message
            });
        }

        // STEP 5: Return successful response
        

        return res.status(201).json({
            success: true,
            message: "Organization and admin account created successfully.",

            data: {
                user: user,
                organization: organization,

                // Session may be null if email confirmation
                // is enabled in Supabase.
                session: data.session
            }
        });


    } catch (error) {

        // Log unexpected backend errors.
        console.error("Signup error:", error);


        // Return generic server error.
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};


// Export controller.
module.exports = {
    registerOrganization,
    login
};