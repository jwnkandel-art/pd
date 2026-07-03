# NexaAI Backend

## Overview

This backend is an Express.js API for the NexaAI website. It supports:
- contact form submissions
- Firebase admin authentication and admin onboarding
- inquiry listing and reply
- article, event, and gallery CRUD operations
- image upload via ImgBB
- email notifications via SMTP

## Requirements

- Node.js 18+ or compatible
- npm
- Firebase service account credentials for `firebase-admin`
- SMTP credentials for email delivery
- Optional ImgBB API key for image upload endpoints

## Installation

```bash
cd backend
npm install
```

## Running

```bash
npm start
# or
npm run dev
```

The server listens on `process.env.PORT` or `4000` by default.

## Environment Variables

The backend supports several credential options. Use one of the Firebase credential methods below:

### Firebase Admin

Option 1: local service account JSON file
- `backend/serviceAccountKey.json`

Option 2: JSON string in environment
- `FIREBASE_SERVICE_ACCOUNT_JSON`

Option 3: Application default credentials
- `GOOGLE_APPLICATION_CREDENTIALS`

Option 4: individual Firebase credentials
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### Firebase Web Auth

- `FIREBASE_WEB_API_KEY` or `FIREBASE_API_KEY`

### SMTP / Email

- `SMTP_USER` or `GMAIL_USER`
- `SMTP_PASS` or `GMAIL_PASS`
- `SMTP_HOST` (default: `smtp.gmail.com`)
- `SMTP_PORT` (default: `587`)
- `SMTP_SECURE` (`true` or `false`)
- `FROM_NAME`
- `FROM_EMAIL`

### ImgBB Uploads

- `IMGBB_API_KEY`

### Optional

- `ADMIN_LOGIN_URL` — used in admin email links
- `NODE_ENV`
- `RENDER` / `RENDER_INSTANCE_TYPE` for cloud runtime debug logging

## Key Endpoints

- `GET /` — health check
- `POST /api/contact` — submit site contact form
- `GET /api/inquiries` — list inquiries
- `PATCH /api/inquiries/:id` — update inquiry status
- `POST /api/inquiries/:id/reply` — send email reply to inquiry
- `POST /api/upload-image` — upload base64 image to ImgBB
- `POST /api/ai/chat` — mock AI assistant response

### Admin auth
- `POST /api/admin/signup`
- `POST /api/admin/send-temp-password`
- `POST /api/admin/me`
- `POST /api/admin/verify-password`
- `POST /api/admin/change-password`

### Content management
- `GET /api/articles`
- `GET /api/articles/:id`
- `POST /api/articles`
- `PATCH /api/articles/:id`
- `DELETE /api/articles/:id`
- `GET /api/events`
- `GET /api/events/:id`
- `POST /api/events`
- `PATCH /api/events/:id`
- `DELETE /api/events/:id`
- `GET /api/gallery`
- `GET /api/gallery/:id`
- `POST /api/gallery`
- `PATCH /api/gallery/:id`
- `DELETE /api/gallery/:id`
- `GET /api/users`

## Notes

- The backend uses `multer` for file upload handling.
- Image upload endpoints require `IMGBB_API_KEY`.
- The contact API saves inquiries to Firestore and sends confirmation emails.
- Admin authentication uses Firebase Auth plus Firestore `admins` collection for approval status.

## License

This repository does not include a license file.
