import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/** Create Supabase client on first use so build (no env) does not throw. */
function getClient(): SupabaseClient {
    if (_client) return _client;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseKey = supabaseServiceKey || supabaseAnonKey;

    if (process.env.NODE_ENV !== 'production') {
        console.log('[supabase] Environment check:');
        console.log(`  NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
        console.log(`  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);
        console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✅ Set' : '⚠️  Missing (will use anon key)'}`);
        if (supabaseUrl) console.log(`  Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
    }

    if (!supabaseUrl || !supabaseKey) {
        const missing = [];
        if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
        if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
        if (!supabaseServiceKey && !supabaseAnonKey) missing.push('SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)');
        console.error('[supabase] ❌ Missing environment variables:', missing.join(', '));
        throw new Error(`Missing Supabase environment variables: ${missing.join(', ')}`);
    }

    if (!supabaseServiceKey && process.env.NODE_ENV !== 'production') {
        console.warn('[supabase] ⚠️  SUPABASE_SERVICE_ROLE_KEY not set. Using anon key. Queries may fail if RLS is enabled.');
        console.warn('[supabase] 💡 To fix: Add SUPABASE_SERVICE_ROLE_KEY to your .env.local file');
    }

    _client = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'public' },
        global: { headers: { 'x-client-info': 'dietcombo-app' } },
    });
    return _client;
}

/** Lazy proxy so existing `import { supabase }` works and build does not require env. */
export const supabase = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        return (getClient() as any)[prop];
    },
});

// Helper function to check for DNS/connection errors
export function isConnectionError(error: any): boolean {
    if (!error) return false;
    const message = error.message || '';
    const details = error.details || '';
    const combined = `${message} ${details}`.toLowerCase();
    
    return (
        combined.includes('enotfound') ||
        combined.includes('getaddrinfo') ||
        combined.includes('dns') ||
        combined.includes('network') ||
        combined.includes('fetch failed')
    );
}

// Helper function to provide helpful error messages
export function getConnectionErrorHelp(error: any): string {
    if (!isConnectionError(error)) return '';
    
    const hostnameMatch = error.message?.match(/([a-z0-9]+\.supabase\.co)/);
    const hostname = hostnameMatch ? hostnameMatch[1] : 'your-project';
    
    return `
🔴 DNS/Connection Error Detected!

The hostname "${hostname}" cannot be resolved. This usually means:

1. 🛡️  Cloudflare WARP is blocking (if you have WARP enabled)
   → Configure WARP Split Tunneling to exclude *.supabase.co
   → Or pause WARP temporarily for development
   → See CLOUDFLARE_WARP_FIX.md for details

2. ⏸️  Supabase project is PAUSED
   → Go to https://app.supabase.com and restore your project

3. ❌ Project was DELETED
   → Check if project still exists in Supabase dashboard

4. 🔗 Incorrect project URL
   → Verify NEXT_PUBLIC_SUPABASE_URL in .env.local matches your project

5. 🌐 Network/DNS issue
   → Check your internet connection

Quick fix: If using WARP, exclude Supabase from WARP or pause it temporarily.
`;
}
