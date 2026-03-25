# Task Distribution App — MVP

## Setup

### 1. Supabase
1. Create a new project at supabase.com
2. Run `backend/schema.sql` in the Supabase SQL editor
3. Copy your Project URL and anon/service-role key

### 2. Backend (local dev)
```bash
cd backend
cp .env.example .env      # fill in SUPABASE_URL and SUPABASE_KEY
pip install -r requirements.txt
python seed.py            # seed April data (edit seed.py to match actual Excel hours)
uvicorn main:app --reload
```
API runs at http://localhost:8000. Docs at http://localhost:8000/docs

### 3. Frontend (local dev)
```bash
cd frontend
npm install
# For local dev with the Vite proxy (no VITE_API_URL needed — proxies /api → localhost:8000):
npm run dev
```
App runs at http://localhost:5173

### 4. Deploy

**Backend → Render**
- Create a new Web Service from the `backend/` directory
- Set env vars: `SUPABASE_URL`, `SUPABASE_KEY`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Frontend → Netlify**
- Deploy the `frontend/` directory
- Set env var: `VITE_API_URL=https://your-render-url.onrender.com`
- Build command: `npm run build`
- Publish directory: `dist`

## Screens
| Route | Screen |
|-------|--------|
| `/impact` | Impact view (default) |
| `/absences` | Record sick leave / vacation |
| `/matrix` | Task matrix — cards & grid view |
| `/team` | Team members management |

## Updating seed data
Edit `backend/seed.py` → `DISTRIBUTIONS_RAW` list to match the actual April Excel hours, then re-run `python seed.py`.
