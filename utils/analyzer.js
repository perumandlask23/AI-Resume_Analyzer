/**
 * AI RESUME ANALYZER UTILITY
 * Uses Google Gemini AI to analyze resumes against a specific job description.
 * Returns structured analysis data including match score, skills, and recommendations.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

async function analyzeResume(resumeText, jobDescription) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are an expert HR recruiter and resume analyst. Analyze the following resume against the given job description and provide a detailed, accurate assessment.

JOB DESCRIPTION:
${jobDescription}

RESUME TEXT:
${resumeText}

Analyze the resume STRICTLY based on the job description above. Do not assume any role or industry — evaluate only against the specific job requirements provided.

Return your response as a valid JSON object with EXACTLY this structure (no extra text, no markdown, just raw JSON):
{
  "match_score": <integer 0-100, how well the resume matches THIS specific job>,
  "ats_score": <integer 0-100, ATS keyword match score for this job>,
  "experience_level": "<Junior | Mid-level | Senior | Expert>",
  "overall_fit": "<Poor Fit | Needs Improvement | Good Fit | Strong Fit | Excellent Fit>",
  "job_title_suggestion": "<suggested job title based on the candidate's actual background>",
  "matched_skills": [<list of skills/keywords from the resume that match the job requirements>],
  "missing_skills": [<list of skills/requirements from the job description that are missing from the resume>],
  "strengths": [<3 specific strengths relevant to THIS job role>],
  "improvements": [<3 specific actionable improvements to better match THIS job>],
  "summary": "<2-3 sentence executive summary evaluating the candidate specifically for this role>"
}

Be accurate and role-specific. A video editor resume should be evaluated on video editing skills. A developer resume should be evaluated on coding skills. Match against the provided job description only.
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    const analysis = JSON.parse(jsonStr);

    // Validate required fields and clamp scores
    return {
      match_score: Math.min(100, Math.max(0, parseInt(analysis.match_score) || 50)),
      ats_score: Math.min(100, Math.max(0, parseInt(analysis.ats_score) || 50)),
      experience_level: analysis.experience_level || 'Mid-level',
      overall_fit: analysis.overall_fit || 'Good Fit',
      job_title_suggestion: analysis.job_title_suggestion || 'Candidate',
      matched_skills: Array.isArray(analysis.matched_skills) ? analysis.matched_skills : [],
      missing_skills: Array.isArray(analysis.missing_skills) ? analysis.missing_skills : [],
      strengths: Array.isArray(analysis.strengths) ? analysis.strengths : [],
      improvements: Array.isArray(analysis.improvements) ? analysis.improvements : [],
      summary: analysis.summary || 'Analysis completed.'
    };
  } catch (error) {
    console.error('Gemini analysis error:', error.message);
    throw new Error('Failed to analyze resume with AI: ' + error.message);
  }
}

module.exports = { analyzeResume };
