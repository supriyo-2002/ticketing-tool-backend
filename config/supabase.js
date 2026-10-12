// Import Supabase client creator.
const { createClient } = require("@supabase/supabase-js");

// Load environment variables from .env.
require("dotenv").config();



// This client is used for normal authentication operations such as:
// - Sign up
// - Login
// - Authentication-related operations
const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            // Backend does not need to persist a browser session.
            persistSession: false,

            // Backend does not need automatic token refresh.
            autoRefreshToken: false,

            // This is not a browser environment.
            detectSessionInUrl: false
        }
    }
);



// This client is used for trusted server-side database operations.
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
        auth: {
            // Do not persist sessions on the backend.
            persistSession: false,

            // We manage authentication explicitly.
            autoRefreshToken: false,

            // Backend is not a browser.
            detectSessionInUrl: false
        }
    }
);


// Export both clients so controllers can use them.
module.exports = {
    supabaseAuth,
    supabaseAdmin
};