/**
 * AI RESUME ANALYZER UTILITY
 * Uses Google Gemini AI to analyze resumes against a specific job description.
 * Returns structured analysis data including match score, skills, and recommendations.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

async function analyzeResume(resumeText, jobDescription) {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    // Set safety settings to minimize false positives for professional documents
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  });

  if (!resumeText || resumeText.trim().length < 10) {
    throw new Error('Resume text is too short or empty. Please ensure the PDF is readable.');
  }

  const prompt = `
You are an expert HR recruiter and resume analyst. Analyze the following resume against the given job description and provide a detailed, accurate assessment.

JOB DESCRIPTION:
${jobDescription}

RESUME TEXT:
${resumeText}

Analyze the resume STRICTLY based on the job description above. Do not assume any role or industry — evaluate only against the specific job requirements provided.

Return your response as a valid JSON object with EXACTLY this structure (no extra text, no markdown, just raw JSON):
{
  "match_score": <integer 0-100>,
  "ats_score": <integer 0-100>,
  "experience_level": "<Junior | Mid-level | Senior | Expert>",
  "overall_fit": "<Poor Fit | Needs Improvement | Good Fit | Strong Fit | Excellent Fit>",
  "job_title_suggestion": "<suggested job title>",
  "matched_skills": [<list of matching skills>],
  "missing_skills": [<list of missing skills>],
  "strengths": [<3 specific strengths>],
  "improvements": [<3 specific actionable improvements>],
  "summary": "<2-3 sentence executive summary>"
}
`;

  let lastError = null;
  const maxRetries = 3;
  
  console.log(`[ANALYZER] Starting analysis for resume (${resumeText.length} chars)`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Robust JSON extraction: look for the first '{' and last '}'
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        console.warn(`[ANALYZER] Attempt ${attempt} failed: No JSON in AI response. Raw text: ${text.substring(0, 100)}...`);
        throw new Error('AI response did not contain a valid JSON object');
      }
      
      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      const analysis = JSON.parse(jsonStr);

      console.log(`[ANALYZER] Successfully parsed AI response on attempt ${attempt}`);

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
      lastError = error;
      console.error(`[ANALYZER] Attempt ${attempt} error:`, error.message);
      
      // Check for specific error types (like safety blocks)
      if (error.message.includes('SAFETY')) {
        console.error('[ANALYZER] Analysis blocked by safety filters. Model considers the content sensitive.');
      }

      // Wait before retrying (exponential backoff: 1s, 2s)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`AI Analysis failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
}

module.exports = { analyzeResume };
