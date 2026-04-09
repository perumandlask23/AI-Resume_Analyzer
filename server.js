const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const { hashPassword, verifyPassword, createToken, decodeToken } = require('./utils/auth');
const { extractTextFromPdf } = require('./utils/parser');
const { analyzeResume } = require('./utils/analyzer');

// Models
const User = require('./models/User');
const Job = require('./models/Job');
const Applicant = require('./models/Applicant');

const app = express();
const PORT = process.env.PORT || 10000;

// --- DATABASE CONNECTION ---
mongoose.set('strictQuery', false); // Added to fix common Mongoose deprecation warning
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- MULTER CONFIG ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  }
});

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/static', express.static(path.join(__dirname, 'static')));

// --- TEMPLATE RENDERER ---
function renderTemplate(name, vars = {}) {
  let html = fs.readFileSync(path.join(__dirname, 'templates', name), 'utf8');
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, val);
  }
  return html;
}

// --- AUTH HELPERS ---
async function getCurrentUser(req) {
  const token = req.cookies?.access_token;
  if (!token) return null;
  const email = decodeToken(token);
  if (!email) return null;
  return await User.findOne({ email });
}

async function requireAuth(req, res, next) {
  const user = await getCurrentUser(req);
  if (!user) {
    if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/hr/login');
  }
  req.user = user;
  next();
}

// --- REFERENCE NUMBER GENERATOR ---
function generateRefNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'APP-';
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// --- PAGE ROUTES ---
app.get('/', (req, res) => {
  // Render health check expects 200 OK on '/', but we want to send users to /hr/dashboard
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0; url=/hr/dashboard" />
        <title>Loading ResumeAI...</title>
      </head>
      <body style="background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;">
        <script>window.location.replace('/hr/dashboard');</script>
        <p>Server is running 🚀. Redirecting to application... <a href="/hr/dashboard" style="color: #6366F1;">Click here if not redirected</a>.</p>
      </body>
    </html>
  `);
});
app.get('/health', (req, res) => res.status(200).send("Server is running 🚀"));

app.get('/hr/login', async (req, res) => {
  // Redirect already-logged-in users to prevent credential reuse from autofill
  const user = await getCurrentUser(req);
  if (user) return res.redirect('/hr/dashboard');
  res.send(renderTemplate('hr-login.html'));
});
app.get('/hr/register', async (req, res) => {
  const user = await getCurrentUser(req);
  if (user) return res.redirect('/hr/dashboard');
  res.send(renderTemplate('hr-register.html'));
});

app.get('/hr/dashboard', requireAuth, async (req, res) => {
  try {
    const jobs = await Job.find({ createdBy: req.user.email });
    const jobIds = jobs.map(j => j._id);

    const totalJobs = jobs.length;
    const totalApplicants = await Applicant.countDocuments({ jobId: { $in: jobIds } });
    const analyzedCount = await Applicant.countDocuments({ jobId: { $in: jobIds }, analysis: { $ne: null } });
    const shortlistedCount = await Applicant.countDocuments({ jobId: { $in: jobIds }, status: 'shortlisted' });

    res.send(renderTemplate('hr-dashboard.html', {
      user_name: req.user.name,
      user_email: req.user.email,
      totalJobs,
      totalApplicants,
      analyzedCount,
      shortlistedCount
    }));
  } catch (error) {
    console.error('Error loading HR dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

app.get('/hr/candidates', requireAuth, (req, res) => {
  res.send(renderTemplate('hr-candidates.html', {
    user_name: req.user.name,
    user_email: req.user.email
  }));
});

app.get('/hr/analytics', requireAuth, (req, res) => {
  res.send(renderTemplate('hr-analytics.html', {
    user_name: req.user.name,
    user_email: req.user.email
  }));
});

app.get('/hr/jobs/:jobId', requireAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job || job.createdBy !== req.user.email) return res.redirect('/hr/dashboard');
    
    const applicantCount = await Applicant.countDocuments({ jobId: job._id });
    const analyzedCount = await Applicant.countDocuments({ jobId: job._id, analysis: { $ne: null } });

    res.send(renderTemplate('hr-job-detail.html', {
      jobId: job._id,
      jobTitle: job.title,
      jobDescription: job.description,
      user_name: req.user.name,
      user_email: req.user.email,
      applicantCount,
      analyzedCount
    }));
  } catch (err) {
    console.error('Job Detail Error:', err);
    res.redirect('/hr/dashboard');
  }
});

app.get('/apply/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return res.send('Job not found or no longer accepting applications.');
    res.send(renderTemplate('apply.html', { 
      jobId: job._id, 
      jobTitle: job.title, 
      jobDescription: job.description 
    }));
  } catch (err) {
    res.status(404).send('Job not found');
  }
});

app.get('/apply-success', (req, res) => {
  res.send(renderTemplate('apply-success.html', { refNumber: req.query.ref || 'Pending' }));
});

// --- AUTH API ROUTES ---
app.post('/api/hr/register', async (req, res, next) => {
  try {
    const { name, email, password, confirm_password } = req.body;
    if (password !== confirm_password) return res.status(400).json({ error: 'Passwords do not match' });
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const newUser = new User({ 
      name, 
      email, 
      hashedPassword: hashPassword(password) 
    });
    await newUser.save();

    const token = createToken(email);
    res.cookie('access_token', token, { maxAge: 30 * 24 * 3600000, httpOnly: true, sameSite: 'lax' });
    res.json({ success: true, redirect: '/hr/dashboard' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hr/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !verifyPassword(password, user.hashedPassword)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = createToken(email);
    res.cookie('access_token', token, { maxAge: 30 * 24 * 3600000, httpOnly: true, sameSite: 'lax' });
    res.json({ success: true, redirect: '/hr/dashboard' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hr/logout', (req, res) => {
  res.clearCookie('access_token');
  res.redirect('/hr/login');
});

app.get('/api/hr/me', requireAuth, (req, res) => {
  res.json({ name: req.user.name, email: req.user.email });
});

// --- JOB POSTING API ROUTES ---
app.post('/api/jobs', requireAuth, async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
    
    const newJob = new Job({ 
      title, 
      description, 
      createdBy: req.user.email 
    });
    await newJob.save();
    
    res.json({ success: true, jobId: newJob._id, applyUrl: '/apply/' + newJob._id });
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs', requireAuth, async (req, res, next) => {
  try {
    const jobs = await Job.find({ createdBy: req.user.email }).sort({ createdAt: -1 });
    const jobsWithCount = await Promise.all(jobs.map(async (j) => {
      const count = await Applicant.countDocuments({ jobId: j._id });
      return { ...j.toObject(), applicantCount: count, id: j._id };
    }));
    res.json(jobsWithCount);
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs/:jobId', requireAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job || job.createdBy !== req.user.email) return res.status(404).json({ error: 'Job not found' });
    const count = await Applicant.countDocuments({ jobId: job._id });
    res.json({ ...job.toObject(), applicantCount: count, id: job._id });
  } catch (err) {
    res.status(404).json({ error: 'Job not found' });
  }
});

app.patch('/api/jobs/:jobId', requireAuth, async (req, res, next) => {
  try {
    const { title, description } = req.body;
    const job = await Job.findOneAndUpdate(
      { _id: req.params.jobId, createdBy: req.user.email },
      { title, description },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ success: true, job });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/jobs/:jobId', requireAuth, async (req, res, next) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.jobId, createdBy: req.user.email });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await Applicant.deleteMany({ jobId: req.params.jobId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- APPLICATION API ROUTES (PUBLIC) ---
app.post('/api/apply/:jobId', upload.single('resume'), async (req, res) => {
  try {
    const { jobId } = req.params;
    const { name, email, phone, linkedin } = req.body;
    if (!name || !email || !phone || !req.file) {
      return res.status(400).json({ error: 'All fields and resume file are required' });
    }
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const refNumber = generateRefNumber();
    const newApplicant = new Applicant({
      jobId,
      name,
      email,
      phone,
      linkedin: linkedin || '',
      resumeBuffer: req.file.buffer,
      resumeFilename: req.file.originalname,
      refNumber
    });
    await newApplicant.save();

    res.redirect('/apply-success?ref=' + refNumber);
  } catch (err) {
    console.error('Apply error:', err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// --- CANDIDATE API ROUTES (HR AUTH REQUIRED) ---
app.get('/api/jobs/:jobId/applicants', requireAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job || job.createdBy !== req.user.email) return res.status(404).json({ error: 'Job not found' });
    
    const applicants = await Applicant.find({ jobId: req.params.jobId }).select('-resumeBuffer').sort({ submittedAt: -1 });
    res.json(applicants);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applicants' });
  }
});

app.post('/api/jobs/:jobId/applicants/:appId/analyze', requireAuth, async (req, res) => {
  const { jobId, appId } = req.params;
  const job = await Job.findById(jobId);
  if (!job || job.createdBy !== req.user.email) return res.status(404).json({ error: 'Job not found' });

  const applicant = await Applicant.findById(appId);
  if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

  try {
    const resumeText = await extractTextFromPdf(applicant.resumeBuffer);
    const analysis = await analyzeResume(resumeText, job.description);
    applicant.analysis = analysis;
    applicant.markModified('analysis');
    // Auto-shortlist: >= 80% → shortlisted, else → rejected
    applicant.status = (analysis.match_score >= 80) ? 'shortlisted' : 'rejected';
    await applicant.save();
    res.json({ appId, analysis, status: applicant.status });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze resume' });
  }
});

app.post('/api/jobs/:jobId/analyze-all', requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const job = await Job.findById(jobId);
  if (!job || job.createdBy !== req.user.email) return res.status(404).json({ error: 'Job not found' });

  // Process ALL applicants so existing ones get re-evaluated with the 80% rule
  const applicants = await Applicant.find({ jobId });
  
  const results = [];
  for (const applicant of applicants) {
    try {
      const resumeText = await extractTextFromPdf(applicant.resumeBuffer);
      const analysis = await analyzeResume(resumeText, job.description);
      applicant.analysis = analysis;
      applicant.markModified('analysis');
      // Auto-shortlist: >= 80% → shortlisted, else → rejected
      applicant.status = (analysis.match_score >= 80) ? 'shortlisted' : 'rejected';
      await applicant.save();
      results.push({ appId: applicant._id, analysis, status: applicant.status });
    } catch (error) {
      console.error(`Analysis failed for applicant ${applicant._id}:`, error);
    }
  }

  const allApplicants = await Applicant.find({ jobId }).select('-resumeBuffer');
  res.json(allApplicants.map(a => ({ appId: a._id, analysis: a.analysis })));
});

app.patch('/api/jobs/:jobId/applicants/:appId/status', requireAuth, async (req, res) => {
  const { jobId, appId } = req.params;
  const { status } = req.body;
  const validStatus = ['pending', 'under_review', 'shortlisted', 'rejected'];
  if (!validStatus.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const job = await Job.findById(jobId);
  if (!job || job.createdBy !== req.user.email) return res.status(404).json({ error: 'Job not found' });

  const applicant = await Applicant.findOneAndUpdate(
    { _id: appId, jobId },
    { status },
    { new: true }
  );
  if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

  res.json({ success: true });
});

// --- ERROR HANDLING ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// --- SERVER START ---
process.on("uncaughtException", err => console.error("Uncaught Exception:", err));
process.on("unhandledRejection", err => console.error("Unhandled Rejection:", err));

console.log(`🚀 Server starting on port ${PORT}...`);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ ResumeAI Screener running at http://0.0.0.0:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`   Run this to fix it: kill -9 $(lsof -ti :${PORT})`);
    console.error(`   Then restart the server.`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
