# IR System Project

A full Information Retrieval system with:

- FastAPI backend for parsing, indexing, searching, snippets, and evaluation metrics
- Next.js frontend with split view for Vector Space Model and Extended Boolean Model
- Upload and document management endpoints

## Project Structure

- backend: FastAPI app, retrieval models, parsing and preprocessing pipeline
- frontend: Next.js app router UI and reusable components

## Backend Setup

1. Open terminal in `backend`.
2. Create virtual environment:
   - Windows PowerShell: `python -m venv .venv; .\.venv\Scripts\Activate.ps1`
3. Install dependencies:
   - `pip install -r requirements.txt`
4. Run server:
   - `uvicorn main:app --reload --port 8000`

## Frontend Setup

1. Open terminal in `frontend`.
2. Install dependencies:
   - `npm install`
3. (Optional) Configure backend URL:
   - Create `.env.local` and set `NEXT_PUBLIC_API_BASE=http://localhost:8000`
4. Run development server:
   - `npm run dev`

## API Endpoints

- `GET /health`
- `POST /documents/upload`
- `GET /documents`
- `DELETE /documents/{doc_id}`
- `POST /search/vsm`
- `POST /search/boolean`
- `POST /feedback`
- `GET /metrics`

## Notes

- Uploaded files are saved in `backend/uploads`.
- Supported file types: `.pdf`, `.docx`, `.xlsx`, `.csv`, `.txt`.
- The backend keeps index and model state in memory.
