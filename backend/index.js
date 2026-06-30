const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

function initFirebaseAdmin() {
  if (admin.apps.length) return admin.app();

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.initializeApp();
  }

  const localServiceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(localServiceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(localServiceAccountPath, 'utf-8'));
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }

  throw new Error('Missing Firebase admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_JSON, provide backend/serviceAccountKey.json, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
  },
});

// Function to convert file to base64 data URL
function fileToBase64DataUrl(file) {
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
}

// Function to upload file to ImgBB
async function uploadFileToImgBB(file) {
  try {
    const imgbbApiKey = process.env.IMGBB_API_KEY;
    if (!imgbbApiKey) {
      throw new Error('IMGBB_API_KEY not configured');
    }

    const base64Image = file.buffer.toString('base64');
    const params = new URLSearchParams();
    params.append('key', imgbbApiKey);
    params.append('image', base64Image);
    params.append('expiration', 15552000); // 180 days in seconds

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error?.message || 'ImgBB upload failed');
    }

    return data.data.url;
  } catch (err) {
    console.error('ImgBB upload error:', err);
    throw new Error('Failed to upload image to ImgBB');
  }
}

const validateInquiry = (body) => {
  const required = ['fullName', 'email', 'phone', 'company', 'country', 'jobTitle', 'jobDetails'];
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const field of required) {
    if (!body[field] || !body[field].trim()) {
      return `${field} is required.`;
    }
  }
  if (!emailRx.test(body.email.trim())) return 'Email is invalid.';
  return null;
};

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;

const createTransporter = () => {
  const smtpUser = String(process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || process.env.GMAIL_PASS || '').trim().replace(/\s+/g, '');
  const smtpHost = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const isGmailHost = smtpHost.toLowerCase().includes('gmail.com');
  let smtpPort = Number(process.env.SMTP_PORT || 587);
  let smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || smtpPort === 465;

  if (isGmailHost && !process.env.SMTP_PORT && !process.env.SMTP_SECURE) {
    smtpPort = 465;
    smtpSecure = true;
  }

  if (!smtpUser || !smtpPass) {
    console.error('❌ Missing SMTP credentials:', {
      hasSMTPUser: !!smtpUser,
      hasSMTPPass: !!smtpPass
    });
    throw new Error('Missing SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_PASS in environment variables.');
  }

  // Log connection attempt (hide password)
  console.log('📧 Creating transporter with:', {
    user: smtpUser.substring(0, 5) + '...' + smtpUser.substring(smtpUser.indexOf('@')),
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    hasPassword: !!smtpPass
  });

  const transporterConfig = {
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
    debug: process.env.NODE_ENV !== 'production',
    logger: process.env.NODE_ENV !== 'production',
  };

  if (isGmailHost && !process.env.SMTP_HOST && !process.env.SMTP_PORT) {
    transporterConfig.service = 'gmail';
  } else {
    transporterConfig.host = smtpHost;
    transporterConfig.port = smtpPort;
    transporterConfig.secure = smtpSecure;
  }

  return nodemailer.createTransport(transporterConfig);
};


const generateTempPassword = (length = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const getDefaultSender = () => {
  const fromName = process.env.FROM_NAME || 'AI Solutions';
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER || process.env.GMAIL_USER;
  return `${fromName} <${fromEmail}>`;
};

const sendEmail = async ({ to, subject, text, html }) => {
  console.log('📧 SEND EMAIL START:', { to, subject: subject.substring(0, 30) + '...' });
  
  const startTime = Date.now();
  
  try {
    const from = getDefaultSender();
    console.log('📧 From:', from);
    
    const transporter = createTransporter();
    console.log('📧 Transporter created, verifying connection...');
    
    // Verify connection first (this will timeout if blocked)
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('❌ SMTP verification failed:', {
        message: verifyError.message,
        code: verifyError.code,
        command: verifyError.command
      });
      throw verifyError;
    }
    
    console.log('📧 Sending mail...');
    const result = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    
    const duration = Date.now() - startTime;
    console.log('✅ Email sent successfully in', duration, 'ms');
    console.log('📧 Result:', {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response?.substring(0, 100)
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ EMAIL SENDING FAILED after', duration, 'ms');
    console.error('❌ Full error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
      recipient: to,
      smtpUser: process.env.SMTP_USER || 'NOT SET',
      fromEmail: process.env.FROM_EMAIL || 'NOT SET',
      nodeEnv: process.env.NODE_ENV,
      isRender: !!process.env.RENDER
    });
    throw error;
  }
};

const sendAdminPasswordEmail = async ({ email, password, name }) => {
  const loginUrl = process.env.ADMIN_LOGIN_URL || 'http://localhost:3000/admin/login.html';
  return sendEmail({
    to: email,
    subject: 'Your AI Solutions temporary admin password',
    text: `Hi ${name || 'Admin'},\n\nA temporary password has been created for your AI Solutions admin login. Use the password below to sign in, then update your password after login if needed.\n\nTemporary password: ${password}\n\nLogin page: ${loginUrl}\n\nIf you did not request this password, please contact support.\n`,
    html: `
      <p>Hi ${name || 'Admin'},</p>
      <p>A temporary password has been created for your <strong>AI Solutions</strong> admin login.</p>
      <p><strong>Temporary password:</strong> <code>${password}</code></p>
      <p>Sign in here: <a href="${loginUrl}">Admin login</a></p>
      <p>If you did not request this password, please contact support.</p>
    `,
  });
};

const sendAdminWelcomeEmail = async ({ email, name, loginUrl }) => {
  const safeName = name || 'Admin';
  return sendEmail({
    to: email,
    subject: 'Welcome to your AI Solutions admin account',
    text: `Hi ${safeName},\n\nYour AI Solutions admin account has been created successfully. Use the email address and password you chose to sign in.\n\nLogin page: ${loginUrl}\n\nIf you did not create this account, please contact support immediately.\n`,
    html: `
      <p>Hi ${safeName},</p>
      <p>Your <strong>AI Solutions</strong> admin account has been created successfully.</p>
      <p>Use the email address and password you chose to sign in.</p>
      <p>Sign in here: <a href="${loginUrl}">Admin login</a></p>
      <p>If you did not create this account, please contact support immediately.</p>
    `,
  });
};

const sendAdminLoginEmail = async ({ email, name, loginUrl }) => {
  const safeName = name || 'Admin';
  return sendEmail({
    to: email,
    subject: 'Your AI Solutions admin login was successful',
    text: `Hi ${safeName},\n\nA successful admin sign-in was recorded for your AI Solutions account.\n\nLogin page: ${loginUrl}\n\nIf this was not you, please reset your password immediately.\n`,
    html: `
      <p>Hi ${safeName},</p>
      <p>A successful <strong>AI Solutions</strong> admin sign-in was recorded for your account.</p>
      <p>Sign in here: <a href="${loginUrl}">Admin login</a></p>
      <p>If this was not you, please reset your password immediately.</p>
    `,
  });
};

const sendConfirmationEmail = async (payload) => {
  console.log('=== SENDING CONFIRMATION EMAIL ===');
  console.log('Payload:', {
    email: payload.email,
    fullName: payload.fullName,
    company: payload.company,
    interest: payload.interest
  });
  
  try {
    console.log('Attempting to send email to:', payload.email);
    console.log('Using SMTP user:', process.env.SMTP_USER || process.env.GMAIL_USER || 'NOT SET');
    console.log('Using FROM_EMAIL:', process.env.FROM_EMAIL || 'NOT SET');
    
    const emailContent = {
      to: payload.email,
      subject: 'Thank you for contacting AI Solutions',
      text: `Hi ${payload.fullName},\n\nThank you for reaching out to AI Solutions. We have received your message and will respond within one business day.\n\nSummary:\n- Company: ${payload.company}\n- Primary interest: ${payload.interest || 'Not specified'}\n- Message: ${payload.jobDetails}\n\nBest regards,\nAI Solutions Team`,
      html: `
        <p>Hi ${payload.fullName},</p>
        <p>Thank you for reaching out to <strong>AI Solutions</strong>. We have received your message and will respond within one business day.</p>
        <p><strong>Summary</strong></p>
        <ul>
          <li><strong>Company:</strong> ${payload.company}</li>
          <li><strong>Primary interest:</strong> ${payload.interest || 'Not specified'}</li>
          <li><strong>Message:</strong> ${payload.jobDetails}</li>
        </ul>
        <p>Best regards,<br />AI Solutions Team</p>
      `
    };
    
    console.log('Email content prepared, calling sendEmail...');
    const result = await sendEmail(emailContent);
    
    console.log('Confirmation email sent successfully to:', payload.email);
    console.log('=== CONFIRMATION EMAIL SENT ===');
    return result;
  } catch (error) {
    console.error('=== CONFIRMATION EMAIL FAILED ===');
    console.error('Detailed email error:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
      recipient: payload.email
    });
    throw error;
  }
};

app.post('/api/upload-image', async (req, res) => {
  if (!process.env.IMGBB_API_KEY) {
    return res.status(500).json({ message: 'Missing IMGBB_API_KEY configuration.' });
  }

  const { image, name } = req.body;
  if (!image) return res.status(400).json({ message: 'Missing image data.' });

  try {
    const rawImage = String(image).trim();
    const base64 = rawImage
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
      .replace(/\s+/g, '');

    if (!base64) {
      return res.status(400).json({ message: 'Invalid image data.' });
    }

    const params = new URLSearchParams();
    params.append('key', process.env.IMGBB_API_KEY);
    params.append('image', base64);
    if (name) params.append('name', String(name));

    const uploadRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const body = await uploadRes.json();
    if (!uploadRes.ok || !body.success) {
      console.error('ImgBB upload failed', body);
      return res.status(500).json({ message: 'Unable to upload image to Imgbb.' });
    }
    return res.json({ url: body.data.url, thumb: body.data.thumb ? body.data.thumb.url : null });
  } catch (err) {
    console.error('Upload image error:', err);
    return res.status(500).json({ message: 'Image upload failed.' });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const { question } = req.body;
  if (!question || !String(question).trim()) {
    return res.status(400).json({ message: 'Question is required.' });
  }

  const text = String(question).trim();
  const normalized = text.toLowerCase();
  let answer = 'I can help with AI assistant workflows, admin onboarding, and content questions. Ask anything specific.';

  if (/\b(hello|hi|hey|hlo)\b/.test(normalized)) {
    answer = 'Hello! I am your mock AI assistant. Ask me about workflows, approvals, or admin features.';
  } else if (/\b(demo|trial|show me a demo|demo workflow)\b/.test(normalized)) {
    answer = 'A demo usually shows our AI assistant answering employee questions, automating tasks, and handing off approvals to the right team. It helps illustrate the full workflow from request to action.';
  } else if (/\b(deploy|deployment|launch|timeline|time|go live|production)\b/.test(normalized)) {
    answer = 'Deployment is typically completed in weeks, not months. We deliver a working AI assistant quickly with discovery, integration, training, and production support.';
  } else if (/\b(assistant|chatbot|virtual)\b/.test(normalized)) {
    answer = 'Our AI assistant handles knowledge requests, automates approvals, and integrates with HR, IT, and operations systems to free up teams and speed decision making.';
  } else if (/\b(password|login|admin)\b/.test(normalized)) {
    answer = 'Use the admin login panel to request a temporary password and then sign in with your emailed password. After approval, you can change your password from the dashboard.';
  } else if (/\b(latest|newest|recent)\b.*\b(article|post|content)\b/.test(normalized)) {
    answer = 'I can help describe the latest content themes, but I do not have live access to the article list here. Check the Articles page for the newest posts.';
  } else if (/\b(how many|count|number of)\b.*\b(article|articles|posts)\b/.test(normalized)) {
    answer = 'I do not have live article counts available in this chat. Please visit the Articles page or admin dashboard to see the current total.';
  } else if (/\b(article|event|inquiry|blog|content)\b/.test(normalized)) {
    answer = 'The dashboard shows inquiries, articles, and events. You can manage them from the admin panel and use the chat for quick guidance.';
  } else if (/\b(help|what can you do|support|question)\b/.test(normalized)) {
    answer = 'This mock AI chat can answer basic admin and product questions. Use it to understand the dashboard, login flow, and AI service options.';
  }

  return res.json({ answer });
});

const signInFirebaseUser = async ({ email, password }) => {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error('Missing FIREBASE_WEB_API_KEY configuration.');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Fetch is not available in this Node environment.');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(email).trim(),
      password: String(password),
      returnSecureToken: true,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Invalid email or password.');
    error.statusCode = response.status;
    error.code = result.error?.code;
    throw error;
  }

  return result;
};

app.post('/api/admin/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !String(email).trim()) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  if (!password || !String(password).trim()) {
    return res.status(400).json({ message: 'Password is required.' });
  }
  if (String(password).trim().length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const safeName = String(name || '').trim();

  try {
    const firebaseAdmin = initFirebaseAdmin();
    const existingUser = await firebaseAdmin.auth().getUserByEmail(normalizedEmail).catch((err) => {
      if (err.code === 'auth/user-not-found') return null;
      throw err;
    });

    if (existingUser) {
      return res.status(409).json({ message: 'An admin account with this email already exists.' });
    }

    const userRecord = await firebaseAdmin.auth().createUser({
      email: normalizedEmail,
      password: String(password).trim(),
      displayName: safeName,
      emailVerified: false,
      disabled: false,
    });

    const db = firebaseAdmin.firestore();
    await db.collection('admins').doc(userRecord.uid).set({
      email: normalizedEmail,
      name: safeName,
      approveStatus: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const loginResult = await signInFirebaseUser({ email: normalizedEmail, password: String(password).trim() });

    await sendAdminWelcomeEmail({
      email: normalizedEmail,
      name: safeName,
      loginUrl: process.env.ADMIN_LOGIN_URL || 'http://localhost:3000/admin/login.html',
    }).catch((emailError) => {
      console.error('Admin signup welcome email failed:', emailError);
    });

    return res.status(201).json({
      message: 'Admin account created successfully.',
      idToken: loginResult.idToken,
      refreshToken: loginResult.refreshToken,
      expiresIn: loginResult.expiresIn,
      localId: loginResult.localId,
    });
  } catch (err) {
    console.error('Admin signup error:', err);
    return res.status(500).json({ message: err.message || 'Unable to create admin account.' });
  }
});

app.post('/api/admin/send-temp-password', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !String(email).trim()) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const firebaseAdmin = initFirebaseAdmin();
  let userRecord = null;

  try {
    userRecord = await firebaseAdmin.auth().getUserByEmail(normalizedEmail);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      return res.status(500).json({ message: err.message || 'Unable to verify admin email.' });
    }
  }

  const tempPassword = generateTempPassword(12);
  const db = firebaseAdmin.firestore();

  try {
    if (userRecord) {
      const hasPasswordProvider = Array.isArray(userRecord.providerData)
        && userRecord.providerData.some((provider) => provider.providerId === 'password');

      if (hasPasswordProvider) {
        return res.json({
          message: 'Password already exists for this admin. Please log in using the password form.',
          alreadyHasPassword: true,
        });
      }

      await firebaseAdmin.auth().updateUser(userRecord.uid, {
        password: tempPassword,
        disabled: false,
      });
    } else {
      userRecord = await firebaseAdmin.auth().createUser({
        email: normalizedEmail,
        password: tempPassword,
        emailVerified: false,
        disabled: false,
      });
    }

    await db.collection('admins').doc(userRecord.uid).set({
      email: normalizedEmail,
      name: name ? String(name).trim() : '',
      approveStatus: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await sendAdminPasswordEmail({ email: normalizedEmail, password: tempPassword, name });

    return res.json({
      message: 'Temporary admin password sent successfully.',
      passwordSent: true,
    });
  } catch (err) {
    console.error('Send temp password error:', err);
    return res.status(500).json({ message: err.message || 'Unable to send temporary password.' });
  }
});

app.post('/api/admin/me', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken || !String(idToken).trim()) {
    return res.status(401).json({ message: 'Session token is required.' });
  }

  try {
    const firebaseAdmin = initFirebaseAdmin();
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(String(idToken).trim());
    const db = firebaseAdmin.firestore();
    const adminDoc = await db.collection('admins').doc(decodedToken.uid).get().catch(() => null);
    const adminData = adminDoc && adminDoc.exists ? adminDoc.data() : null;

    if (adminData?.approveStatus !== true) {
      return res.status(403).json({
        message: 'Your account is on hold. Please contact the administrator for approval.',
        accountPending: true,
      });
    }

    return res.json({
      message: 'Session is valid.',
      uid: decodedToken.uid,
      email: adminData?.email || decodedToken.email || '',
      name: adminData?.name || adminData?.fullName || '',
      approveStatus: true,
    });
  } catch (err) {
    console.error('Admin session check error:', err);
    return res.status(401).json({ message: 'Your session is invalid or expired.' });
  }
});

app.post('/api/admin/verify-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !String(email).trim() || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const result = await signInFirebaseUser({ email: normalizedEmail, password: String(password) });
    const firebaseAdmin = initFirebaseAdmin();
    const db = firebaseAdmin.firestore();
    const adminDoc = await db.collection('admins').doc(result.localId).get().catch(() => null);
    const adminData = adminDoc && adminDoc.exists ? adminDoc.data() : null;

    const isApproved = adminData?.approveStatus === true;

    if (!isApproved) {
      return res.status(403).json({
        message: 'Your account is on hold. Please contact the administrator for approval.',
        accountPending: true,
      });
    }

    await db.collection('admins').doc(result.localId).set({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      email: normalizedEmail,
      name: adminData?.name || adminData?.fullName || '',
    }, { merge: true });

    await sendAdminLoginEmail({
      email: normalizedEmail,
      name: adminData?.name || adminData?.fullName || '',
      loginUrl: process.env.ADMIN_LOGIN_URL || 'http://localhost:3000/admin/login.html',
    }).catch((emailError) => {
      console.error('Admin login email failed:', emailError);
    });

    return res.json({
      message: 'Password verified successfully.',
      idToken: result.idToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      localId: result.localId,
    });
  } catch (err) {
    console.error('Verify password error:', err);
    const statusCode = err.statusCode === 401 ? 401 : 500;
    return res.status(statusCode).json({ message: err.message || 'Unable to verify password.' });
  }
});

app.post('/api/admin/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  if (!email || !String(email).trim() || !currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Email, current password, and new password are required.' });
  }
  if (!FIREBASE_WEB_API_KEY) {
    return res.status(500).json({ message: 'Missing FIREBASE_WEB_API_KEY configuration.' });
  }
  if (typeof fetch !== 'function') {
    return res.status(500).json({ message: 'Fetch is not available in this Node environment.' });
  }

  try {
    const signInResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(email).trim(),
        password: String(currentPassword),
        returnSecureToken: true,
      }),
    });

    const signInData = await signInResponse.json();
    if (!signInResponse.ok) {
      const message = signInData.error?.message || 'Unable to verify current password.';
      return res.status(401).json({ message });
    }

    const uid = signInData.localId;
    const firebaseAdmin = initFirebaseAdmin();
    await firebaseAdmin.auth().updateUser(uid, { password: String(newPassword) });

    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ message: err.message || 'Unable to change password.' });
  }
});

app.post('/api/contact', async (req, res) => {
  console.log('========================================');
  console.log('📝 CONTACT FORM SUBMISSION');
  console.log('========================================');
  console.log('📝 Request body:', {
    email: req.body.email,
    fullName: req.body.fullName,
    company: req.body.company,
    interest: req.body.interest
  });
  console.log('========================================');

  // Validate
  const error = validateInquiry(req.body);
  if (error) {
    console.log('❌ Validation error:', error);
    return res.status(400).json({ message: error });
  }

  // Prepare records
  const firestoreRecord = {
    fullName: req.body.fullName.trim(),
    email: req.body.email.trim(),
    phone: req.body.phone.trim(),
    company: req.body.company.trim(),
    country: req.body.country.trim(),
    jobTitle: req.body.jobTitle.trim(),
    interest: req.body.interest?.trim() || 'Not specified',
    jobDetails: req.body.jobDetails.trim(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const emailRecord = {
    ...firestoreRecord,
    createdAt: new Date().toISOString(),
  };

  // Save to Firestore
  console.log('💾 Saving to Firestore...');
  const db = initFirebaseAdmin().firestore();
  let docRef;
  
  try {
    docRef = await db.collection('inquiries').add(firestoreRecord);
    console.log('✅ Inquiry saved to Firestore with ID:', docRef.id);
  } catch (err) {
    console.error('❌ Firestore save error:', {
      message: err.message,
      code: err.code,
      stack: err.stack
    });
    const response = { 
      message: 'Unable to save inquiry.',
      error: err.message,
      code: err.code || 'unknown'
    };
    if (process.env.NODE_ENV !== 'production') response.stack = err.stack;
    return res.status(500).json(response);
  }

  // Try to send email
  console.log('📧 Attempting to send confirmation email to:', emailRecord.email);
  console.log('📧 Environment check:', {
    SMTP_USER: process.env.SMTP_USER ? '✅ SET' : '❌ NOT SET',
    SMTP_PASS: process.env.SMTP_PASS ? '✅ SET' : '❌ NOT SET',
    FROM_EMAIL: process.env.FROM_EMAIL || '❌ NOT SET (using SMTP_USER)',
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com (default)',
    SMTP_PORT: process.env.SMTP_PORT || '587 (default)',
    RENDER: process.env.RENDER ? '✅ Yes' : 'No',
    NODE_ENV: process.env.NODE_ENV || 'development'
  });
  
  try {
    await sendConfirmationEmail(emailRecord);
    console.log('✅ Confirmation email sent successfully to:', emailRecord.email);
    
    return res.status(201).json({ 
      message: 'Inquiry submitted successfully. Confirmation email sent.',
      id: docRef.id 
    });
  } catch (err) {
    // Log EVERYTHING about the error
    console.error('========================================');
    console.error('❌❌❌ EMAIL SENDING FAILED ❌❌❌');
    console.error('========================================');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    console.error('Error Code:', err.code);
    console.error('Command:', err.command);
    console.error('Response:', err.response);
    console.error('Response Code:', err.responseCode);
    console.error('Stack Trace:', err.stack);
    console.error('Recipient:', emailRecord.email);
    console.error('SMTP User:', process.env.SMTP_USER || 'NOT SET');
    console.error('FROM Email:', process.env.FROM_EMAIL || 'NOT SET');
    console.error('Is Render:', !!process.env.RENDER);
    console.error('========================================');
    
    // Build response with all error details
    const response = {
      message: 'Inquiry submitted successfully, but confirmation email could not be sent. We will follow up shortly.',
      id: docRef.id,
      emailError: err.message,
      emailCode: err.code || 'unknown',
    };
    
    // In development, include full details
    if (process.env.NODE_ENV !== 'production') {
      response.debug = {
        errorName: err.name,
        errorMessage: err.message,
        errorCode: err.code,
        command: err.command,
        response: err.response,
        responseCode: err.responseCode,
        stack: err.stack,
        recipient: emailRecord.email,
        smtpUser: process.env.SMTP_USER || 'NOT SET',
        fromEmail: process.env.FROM_EMAIL || 'NOT SET',
        smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: process.env.SMTP_PORT || '587',
        isRender: !!process.env.RENDER,
        renderPlan: process.env.RENDER_INSTANCE_TYPE || 'unknown'
      };
    }
    
    return res.status(201).json(response);
  }
});

app.get('/api/inquiries', async (req, res) => {
  try {
    const db = initFirebaseAdmin().firestore();
    const snapshot = await db.collection('inquiries')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);
      return {
        id: doc.id,
        ...data,
        createdAt,
      };
    });

    return res.json(records);
  } catch (err) {
    console.error('Read inquiries error:', err);
    return res.status(500).json({ message: 'Unable to read inquiries.' });
  }
});

const validateArticle = (body) => {
  const required = ['title', 'body'];
  for (const field of required) {
    if (!body[field] || !String(body[field]).trim()) {
      return `${field} is required.`;
    }
  }
  if (!body.images || !Array.isArray(body.images)) {
    return 'At least one image URL is required.';
  }
  if (body.images.length === 0) {
    return 'At least one image URL is required.';
  }
  if (body.images.length > 2) {
    return 'A maximum of 2 images are allowed.';
  }
  if (!body.images.every(img => {
    return typeof img === 'string'
      ? Boolean(img.trim())
      : img && typeof img.url === 'string' && Boolean(img.url.trim());
  })) {
    return 'Each image must be a valid URL string.';
  }
  return null;
};

app.post('/api/articles', upload.array('images', 2), async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.title || !String(req.body.title).trim()) {
      return res.status(400).json({ message: 'Title is required.' });
    }
    if (!req.body.body || !String(req.body.body).trim()) {
      return res.status(400).json({ message: 'Body is required.' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image is required.' });
    }
    if (req.files.length > 2) {
      return res.status(400).json({ message: 'A maximum of 2 images are allowed.' });
    }

    const db = initFirebaseAdmin().firestore();

    // Upload images to ImgBB and get URLs
    const imageUrls = [];
    for (let i = 0; i < req.files.length; i++) {
      try {
        const url = await uploadFileToImgBB(req.files[i]);
        imageUrls.push(url);
      } catch (err) {
        console.error('Error uploading image:', err);
        return res.status(500).json({ message: 'Failed to upload one or more images.' });
      }
    }

    const record = {
      title: String(req.body.title).trim(),
      summary: String(req.body.summary || '').trim(),
      body: String(req.body.body).trim(),
      status: String(req.body.status || 'Draft').trim(),
      publishedAt: req.body.publishedAt ? admin.firestore.Timestamp.fromDate(new Date(req.body.publishedAt)) : null,
      images: imageUrls,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('articles').add(record);
    return res.status(201).json({ id: docRef.id, message: 'Article created successfully.' });
  } catch (err) {
    console.error('Create article error:', err);
    return res.status(500).json({ message: 'Unable to save article.' });
  }
});

app.get('/api/articles', async (req, res) => {
  try {
    const db = initFirebaseAdmin().firestore();
    const snapshot = await db.collection('articles')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      const publishedAt = data.publishedAt && data.publishedAt.toDate ? data.publishedAt.toDate().toISOString() : null;
      const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);
      return {
        id: doc.id,
        ...data,
        publishedAt,
        createdAt,
      };
    });

    return res.json(records);
  } catch (err) {
    console.error('Read articles error:', err);
    return res.status(500).json({ message: 'Unable to read articles.' });
  }
});

app.get('/api/articles/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Article ID is required.' });

  try {
    const db = initFirebaseAdmin().firestore();
    const doc = await db.collection('articles').doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Article not found.' });

    const data = doc.data();
    const publishedAt = data.publishedAt && data.publishedAt.toDate ? data.publishedAt.toDate().toISOString() : null;
    const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);

    return res.json({ id: doc.id, ...data, publishedAt, createdAt });
  } catch (err) {
    console.error('Read article error:', err);
    return res.status(500).json({ message: 'Unable to read article.' });
  }
});

app.post('/api/events', async (req, res) => {
  const {
    title,
    location,
    eventDate,
    startTime,
    endTime,
    mode,
    featured,
    description,
    status,
  } = req.body;

  if (!title || !eventDate) {
    return res.status(400).json({ message: 'Event title and date are required.' });
  }

  const db = initFirebaseAdmin().firestore();
  const record = {
    title: String(title).trim(),
    location: String(location || '').trim(),
    eventDate: String(eventDate).trim(),
    startTime: String(startTime || '').trim(),
    endTime: String(endTime || '').trim(),
    mode: String(mode || 'In Person').trim(),
    featured: Boolean(featured),
    description: String(description || '').trim(),
    status: String(status || 'Scheduled').trim(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const docRef = await db.collection('events').add(record);
    return res.status(201).json({ id: docRef.id, message: 'Event created successfully.' });
  } catch (err) {
    console.error('Create event error:', err);
    return res.status(500).json({ message: 'Unable to save event.' });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const db = initFirebaseAdmin().firestore();
    const snapshot = await db.collection('events')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);
      return {
        id: doc.id,
        ...data,
        createdAt,
      };
    });

    return res.json(records);
  } catch (err) {
    console.error('Read events error:', err);
    return res.status(500).json({ message: 'Unable to read events.' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Event ID is required.' });

  try {
    const db = initFirebaseAdmin().firestore();
    const doc = await db.collection('events').doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Event not found.' });

    const data = doc.data();
    const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);

    return res.json({ id: doc.id, ...data, createdAt });
  } catch (err) {
    console.error('Read event error:', err);
    return res.status(500).json({ message: 'Unable to read event.' });
  }
});

const validateGallery = (body, isUpdate = false) => {
  if (!body || typeof body !== 'object') {
    return 'Invalid gallery data.';
  }
  if (!body.title || !String(body.title).trim()) {
    return 'Title is required.';
  }
  return null;
};

app.post('/api/gallery', upload.single('image'), async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.title || !String(req.body.title).trim()) {
      return res.status(400).json({ message: 'Title is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required.' });
    }

    const db = initFirebaseAdmin().firestore();

    // Upload image to ImgBB and get URL
    let imageUrl = '';
    try {
      imageUrl = await uploadFileToImgBB(req.file);
    } catch (err) {
      console.error('Error uploading image to ImgBB:', err);
      return res.status(500).json({ message: 'Failed to upload image.' });
    }

    const record = {
      title: String(req.body.title).trim(),
      category: String(req.body.category || 'Portfolio').trim(),
      image: imageUrl,
      description: String(req.body.description || '').trim(),
      status: String(req.body.status || 'Draft').trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('gallery').add(record);
    return res.status(201).json({ id: docRef.id, message: 'Gallery item created successfully.' });
  } catch (err) {
    console.error('Create gallery item error:', err);
    return res.status(500).json({ message: 'Unable to save gallery item.' });
  }
});

app.get('/api/gallery', async (req, res) => {
  try {
    const db = initFirebaseAdmin().firestore();
    const snapshot = await db.collection('gallery')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);
      return {
        id: doc.id,
        ...data,
        createdAt,
      };
    });

    return res.json(records);
  } catch (err) {
    console.error('Read gallery items error:', err);
    return res.status(500).json({ message: 'Unable to read gallery items.' });
  }
});

app.get('/api/gallery/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Gallery item ID is required.' });

  try {
    const db = initFirebaseAdmin().firestore();
    const doc = await db.collection('gallery').doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Gallery item not found.' });

    const data = doc.data();
    const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (doc.createTime ? doc.createTime.toDate().toISOString() : null);

    return res.json({ id: doc.id, ...data, createdAt });
  } catch (err) {
    console.error('Read gallery item error:', err);
    return res.status(500).json({ message: 'Unable to read gallery item.' });
  }
});

app.patch('/api/gallery/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Gallery item ID is required.' });

  try {
    if (req.body.title !== undefined && !String(req.body.title).trim()) {
      return res.status(400).json({ message: 'Title cannot be empty.' });
    }

    const updates = {};
    if (req.body.title !== undefined) updates.title = String(req.body.title).trim();
    if (req.body.category !== undefined) updates.category = String(req.body.category || 'Portfolio').trim();
    if (req.body.description !== undefined) updates.description = String(req.body.description || '').trim();
    if (req.body.status !== undefined) updates.status = String(req.body.status || 'Draft').trim();

    // Handle image upload if new file is provided
    if (req.file) {
      try {
        const imageUrl = await uploadFileToImgBB(req.file);
        updates.image = imageUrl;
      } catch (err) {
        console.error('Error uploading image to ImgBB:', err);
        return res.status(500).json({ message: 'Failed to upload image.' });
      }
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    const db = initFirebaseAdmin().firestore();
    await db.collection('gallery').doc(id).update(updates);
    return res.json({ id, message: 'Gallery item updated successfully.' });
  } catch (err) {
    console.error('Update gallery item error:', err);
    return res.status(500).json({ message: 'Unable to update gallery item.' });
  }
});

// Delete gallery item
app.delete('/api/gallery/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Gallery item ID is required.' });

  try {
    const db = initFirebaseAdmin().firestore();
    await db.collection('gallery').doc(id).delete();
    return res.json({ id, message: 'Gallery item deleted successfully.' });
  } catch (err) {
    console.error('Delete gallery item error:', err);
    return res.status(500).json({ message: 'Unable to delete gallery item.' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const db = initFirebaseAdmin().firestore();
    const profiles = {};
    try {
      const snapshot = await db.collection('users').limit(500).get();
      snapshot.forEach(doc => {
        profiles[doc.id] = doc.data();
      });
    } catch (profileErr) {
      console.warn('No Firestore user profiles found or failed to load', profileErr && profileErr.message);
    }

    const users = [];
    let pageToken;
    do {
      const list = await admin.auth().listUsers(1000, pageToken);
      list.users.forEach(userRecord => {
        const profile = profiles[userRecord.uid] || {};
        const providerId = Array.isArray(userRecord.providerData) && userRecord.providerData[0] ? userRecord.providerData[0].providerId : 'firebase';
        users.push({
          uid: userRecord.uid,
          name: userRecord.displayName || profile.name || '',
          email: userRecord.email || profile.email || '',
          providerData: userRecord.providerData || [],
          provider: providerId,
          disabled: userRecord.disabled,
          metadata: userRecord.metadata || {},
          createdAt: profile.createdAt || null,
          lastSignInTime: userRecord.metadata ? userRecord.metadata.lastSignInTime : null,
        });
      });
      pageToken = list.pageToken;
    } while (pageToken);

    return res.json(users);
  } catch (err) {
    console.error('Read users error:', err);
    return res.status(500).json({ message: 'Unable to read users.' });
  }
});

app.patch('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Event ID is required.' });

  const {
    title,
    location,
    eventDate,
    startTime,
    endTime,
    mode,
    featured,
    description,
    status,
  } = req.body;

  if (!title || !eventDate) {
    return res.status(400).json({ message: 'Event title and date are required.' });
  }

  const updates = {
    title: String(title).trim(),
    location: String(location || '').trim(),
    eventDate: String(eventDate).trim(),
    startTime: String(startTime || '').trim(),
    endTime: String(endTime || '').trim(),
    mode: String(mode || 'In Person').trim(),
    featured: Boolean(featured),
    description: String(description || '').trim(),
    status: String(status || 'Scheduled').trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const db = initFirebaseAdmin().firestore();
    await db.collection('events').doc(id).update(updates);
    return res.json({ id, message: 'Event updated successfully.' });
  } catch (err) {
    console.error('Update event error:', err);
    return res.status(500).json({ message: 'Unable to update event.' });
  }
});

// Delete event
app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Event ID is required.' });

  try {
    const db = initFirebaseAdmin().firestore();
    await db.collection('events').doc(id).delete();
    return res.json({ id, message: 'Event deleted successfully.' });
  } catch (err) {
    console.error('Delete event error:', err);
    return res.status(500).json({ message: 'Unable to delete event.' });
  }
});

app.patch('/api/articles/:id', upload.array('images', 2), async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Article ID is required.' });

  try {
    // Validate required fields if provided
    if (req.body.title !== undefined && !String(req.body.title).trim()) {
      return res.status(400).json({ message: 'Title cannot be empty.' });
    }
    if (req.body.body !== undefined && !String(req.body.body).trim()) {
      return res.status(400).json({ message: 'Body cannot be empty.' });
    }

    const db = initFirebaseAdmin().firestore();
    const updates = {};

    if (req.body.title !== undefined) updates.title = String(req.body.title).trim();
    if (req.body.summary !== undefined) updates.summary = String(req.body.summary || '').trim();
    if (req.body.body !== undefined) updates.body = String(req.body.body).trim();
    if (req.body.status !== undefined) updates.status = String(req.body.status || 'Draft').trim();
    if (req.body.publishedAt !== undefined) {
      updates.publishedAt = req.body.publishedAt ? admin.firestore.Timestamp.fromDate(new Date(req.body.publishedAt)) : null;
    }

    // Handle image uploads if new files are provided
    if (req.files && req.files.length > 0) {
      if (req.files.length > 2) {
        return res.status(400).json({ message: 'A maximum of 2 images are allowed.' });
      }

      const imageUrls = [];
      for (let i = 0; i < req.files.length; i++) {
        try {
          const url = await uploadFileToImgBB(req.files[i]);
          imageUrls.push(url);
        } catch (err) {
          console.error('Error uploading image:', err);
          return res.status(500).json({ message: 'Failed to upload one or more images.' });
        }
      }
      updates.images = imageUrls;
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('articles').doc(id).update(updates);
    return res.json({ id, message: 'Article updated successfully.' });
  } catch (err) {
    console.error('Update article error:', err);
    return res.status(500).json({ message: 'Unable to update article.' });
  }
});

// Delete article
app.delete('/api/articles/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Article ID is required.' });

  try {
    const db = initFirebaseAdmin().firestore();
    await db.collection('articles').doc(id).delete();
    return res.json({ id, message: 'Article deleted successfully.' });
  } catch (err) {
    console.error('Delete article error:', err);
    return res.status(500).json({ message: 'Unable to delete article.' });
  }
});

// Update inquiry (e.g., status)
app.patch('/api/inquiries/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: 'Missing status' });
  try {
    const db = initFirebaseAdmin().firestore();
    const ref = db.collection('inquiries').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Inquiry not found' });
    await ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ message: 'Inquiry updated' });
  } catch (err) {
    console.error('Update inquiry error:', err);
    return res.status(500).json({ message: 'Unable to update inquiry.' });
  }
});

// Reply to an inquiry by sending an email
app.post('/api/inquiries/:id/reply', async (req, res) => {
  const id = req.params.id;
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ message: 'Missing subject or message' });
  try {
    const db = initFirebaseAdmin().firestore();
    const ref = db.collection('inquiries').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Inquiry not found' });
    const data = doc.data();
    if (!data.email) return res.status(400).json({ message: 'Inquiry has no email' });

    // send mail
    const transporter = createTransporter();
    const mailOptions = {
      from: `"${process.env.FROM_NAME || 'AI Solutions'}" <${process.env.FROM_EMAIL || process.env.GMAIL_USER}>`,
      to: data.email,
      subject,
      text: message,
      html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
    };

    await transporter.sendMail(mailOptions);
    await ref.update({ lastReply: { subject, message, sentAt: admin.firestore.FieldValue.serverTimestamp() } });
    return res.json({ message: 'Reply sent' });
  } catch (err) {
    console.error('Reply inquiry error:', err);
    return res.status(500).json({ message: 'Unable to send reply.' });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AI Solutions backend is running. Use /api/contact to submit a contact form and /api/inquiries to list inquiries.',
  });
});

app.listen(port, () => {
  console.log(`Backend API running on http://localhost:${port}`);
});
