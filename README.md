<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/05541fad-a7e4-4cf6-8d15-e31248802e64

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. (Optional) Enable cloud sync with Supabase in `.env.local`:
   `SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
   `SUPABASE_SECRET_KEY=sb_secret_xxx`
4. Run `supabase/coach_state.sql` in your Supabase SQL editor (one-time setup)
5. Run the app:
   `npm run dev`

## Deploy On Streamlit

1. Build a self-contained Streamlit bundle:
   `npm run build:streamlit-bundle`
2. In Streamlit Cloud, set the app file to:
   `streamlit_app.py`
3. Add a Streamlit secret for Gemini:
   `GEMINI_API_KEY="your_key_here"`
4. Deploy.
