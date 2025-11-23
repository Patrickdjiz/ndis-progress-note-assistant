# NDIS AI Progress Notes Assistant

An AI-powered tool that helps NDIS support workers create clean, compliant progress notes from simple, plain-language shift descriptions.

## 📚 About

Support workers often struggle with:
- Writing detailed notes
- Using correct NDIS-compliant language
- Linking activities to participant goals
- Maintaining consistency across staff

This app turns short shift summaries into professional notes using AI.

## 🧱 Tech Stack

### Frontend
- React (Vite)
- JavaScript
- Fetch API for backend communication

### Backend (coming soon)
- Node.js + Express
- Local LLM integration (Ollama / other free models)
- PostgreSQL (Supabase/Railway)

## 📁 Folder Structure
ndis-progress-note-assistant/
frontend/ → React web app
backend/ → Node/Express API server (coming soon)
docs/ → Planning, documentation, feature specs
README.md → This file

## 🚀 Running the Project

### Frontend
cd frontend
npm install
npm run dev

### Backend (coming soon)
Instructions will be added after backend setup.

## 📌 Features (V1)

- Support worker login
- Select participant and shift date
- Enter raw shift description
- AI-generated NDIS-style progress note
- Admin dashboard to view/export notes

## 🧠 Local LLM Use

This project uses (or will use) local models to avoid API cost:
- Example engines: Ollama / llama.cpp / Mistral models
- Processing done on-device or on a local server

## 📝 Status

Currently building core UI and backend skeleton.
