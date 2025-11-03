Leaderboard Setup (Supabase)
=============================

The game uses Supabase for the leaderboard (much more reliable than Firebase Realtime Database).

Setup Steps:
------------

1. Create a Supabase project at https://app.supabase.com (or use an existing one)

2. Create the `scores` table:
   - Go to SQL Editor
   - Run this SQL:
   ```sql
   CREATE TABLE scores (
     id BIGSERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     score INTEGER NOT NULL,
     wave INTEGER NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Enable Row Level Security (recommended)
   ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
   
   -- Allow anyone to read scores
   CREATE POLICY "Anyone can read scores" ON scores
     FOR SELECT USING (true);
   
   -- Allow anyone to insert scores
   CREATE POLICY "Anyone can insert scores" ON scores
     FOR INSERT WITH CHECK (true);
   ```

3. Get your Supabase credentials:
   - Go to Settings → API
   - Copy your "Project URL" (e.g., `https://xxxxx.supabase.co`)
   - Copy your "anon/public" key

4. Update `index.html`:
   - Find the `window.supabaseConfig` object (around line 62)
   - Replace `YOUR_SUPABASE_URL` with your project URL
   - Replace `YOUR_SUPABASE_ANON_KEY` with your anon key

That's it! The leaderboard will now work reliably using Supabase's REST API.

