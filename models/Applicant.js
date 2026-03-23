const mongoose = require('mongoose');

const ApplicantSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  linkedin: { type: String, default: '' },
  resumeBuffer: { type: Buffer, required: true },
  resumeFilename: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'shortlisted', 'rejected'], 
    default: 'pending' 
  },
  refNumber: { type: String, required: true, unique: true },
  analysis: {
    match_score: Number,
    ats_score: Number,
    experience_level: String,
    overall_fit: String,
    job_title_suggestion: String,
    matched_skills: [String],
    missing_skills: [String],
    strengths: [String],
    improvements: [String],
    summary: String
  }
});

module.exports = mongoose.model('Applicant', ApplicantSchema);
