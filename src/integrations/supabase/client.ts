import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://liztkyobbwfhbrwuuges.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpenRreW9iYndmaGJyd3V1Z2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzMzQ0ODgsImV4cCI6MjA2OTkxMDQ4OH0.CI54WjlcRJkhnAXURdrvgsK3gGFmkc6Bsurr-AKmGgA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);