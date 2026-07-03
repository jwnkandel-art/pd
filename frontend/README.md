# NexaAI Frontend

## Overview

This is the static frontend for the NexaAI website. It is built with HTML, CSS, and vanilla JavaScript. The frontend includes:
- public website pages: Home, Articles, Events, Gallery, Contact, Case Studies, Solutions
- admin portal pages: login, dashboard, articles, events, gallery management
- contact form integration with the backend API

## Structure

- `index.html` — landing page
- `articles.html` — article listing
- `article-detail.html` — article details
- `events.html` — event listing
- `gallery.html` — gallery listing
- `contact.html` — contact form page
- `casestudies.html` — case studies page
- `solutions.html` — solutions page
- `feedback.html` — feedback page
- `admin/` — admin pages for login and dashboard
- `css/style.css` — main stylesheet
- `js/main.js` — frontend logic
- `public/robots.txt` — public metadata

## Installation

No build step is required. To run locally, serve the `frontend` folder using any static file server.

### Example using Python

```bash
cd frontend
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Backend Integration

The frontend expects a backend API endpoint defined by:
- `window.NEXAAI_BACKEND_URL`

If not configured, it defaults to `https://pd-three-chi.vercel.app`.

The frontend uses these APIs:
- `POST /api/contact`
- `GET /api/inquiries`
- `GET /api/articles`
- `GET /api/gallery`
- `GET /api/events`
- `POST /api/admin/signup`
- `POST /api/admin/verify-password`
- `POST /api/admin/me`
- `PATCH /api/inquiries/:id`
- `POST /api/inquiries/:id/reply`

## Admin Portal

Admin pages are under `frontend/admin/` and include:
- `admin/login.html`
- `admin/dashboard.html`

The admin UI uses session storage to persist the Firebase ID token.

## Notes

- Contact form validation runs in `js/main.js`.
- Admin pages fetch inquiry, article, gallery, and event data from the backend.
- The site includes mobile menu, reveal animations, and toast notifications.

## License

This repository does not include a license file.
