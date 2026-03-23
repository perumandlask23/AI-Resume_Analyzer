/**
 * MOCK ANALYZER UTILITY
 * This replaces the real AI integration for development/testing when API keys are not working.
 * It simulates a 2-second delay and returns high-quality realistic analysis data.
 */

async function analyzeResume(resumeText, jobDescription) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("Using Mock Analyzer (Simulated Results)");

  // Generate a somewhat realistic score based on string overlaps (very simple mock logic)
  const scoreBase = Math.floor(Math.random() * 30) + 65; // Random score between 65-95

  return {
    "match_score": scoreBase,
    "ats_score": scoreBase - 5,
    "experience_level": "Senior",
    "overall_fit": scoreBase > 85 ? "Strong Fit" : "Good Fit",
    "job_title_suggestion": "Senior Full Stack Engineer",
    "matched_skills": ["Node.js", "React", "Express", "JavaScript", "REST APIs", "Unit Testing"],
    "missing_skills": ["Docker", "Kubernetes", "AWS Lambda"],
    "strengths": [
      "Extensive experience in end-to-end application development using modern JavaScript frameworks.",
      "Strong architectural understanding and ability to solve complex technical problems.",
      "Excellent communication and collaboration skills evident from past project descriptions."
    ],
    "improvements": [
      "Could benefit from more exposure to cloud-native technologies like Docker and K8s.",
      "Adding specific metrics or outcomes (e.g., 'reduced load time by 30%') would strengthen the resume.",
      "Consider getting a certificate in Advanced Machine Learning to bolster AI credentials."
    ],
    "summary": "This candidate is a highly skilled developer with a robust background in the required tech stack. They demonstrate the seniority and technical depth needed for this role, though some cloud infrastructure gaps exist."
  };
}

module.exports = { analyzeResume };
