import { createClient } from '@supabase/supabase-js'
import { config } from '../config'

// Only the public anon key is used in the browser. All privileged logic runs inside
// Postgres functions; the service-role key is never needed or present in this app.
export const supabase = createClient(config.supabaseUrl ?? 'http://localhost', config.supabaseAnonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bred.admin.auth' },
})
