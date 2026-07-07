/**
* Customer Survey Page
*
* Accessible via public route /survey/:token (no auth required)
* Completely redesigned based on the provided mockup.
*/
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type Step = 'loading' | 'form' | 'submitted' | 'expired' | 'already_submitted' | 'error';

interface SurveyMeta {
  valid:               boolean;
  projectId:           number;
  email:               string;
  customerName:        string;
  projectName:         string;
  projectCode:         string;
  periodOfPerformance: string | null;
  pmAchievements:      string | null;
  pmName:              string;
}

const CORE_QUESTIONS = [
  { id: 'q1', text: 'Timely delivery of product/service' },
  { id: 'q2', text: 'Meeting of your requirements' },
  { id: 'q3', text: 'Quality of product/service delivered' },
  { id: 'q4', text: 'Cost of product/service delivered' },
  { id: 'q5', text: 'Clarity of documentation delivered' },
  { id: 'q6', text: 'Communication skills of the teams you have been interacting with' },
  { id: 'q7', text: 'Professionalism of Mindteck' },
  { id: 'q8', text: 'Responsiveness of Mindteck to your needs and suggestions' },
];

const OVERALL_ASSESSMENT_OPTIONS = [
  { value: 'Poor', desc: 'Does not meet the expectations' },
  { value: 'Average', desc: 'Needs improvement, lacks in many areas' },
  { value: 'Good', desc: 'Meets most of the expectations' },
  { value: 'Very Good', desc: 'Meets all the expectations' },
  { value: 'Excellent', desc: 'Exceeds expectations' }
];

// --- Icons ---
const PersonIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ChatIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
);

const PenIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

const ImproveIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const ComplimentIcon = () => (
  <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

export const CustomerSurveyPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [step, setStep] = useState<Step>('loading');
  const [meta, setMeta] = useState<SurveyMeta | null>(null);
  
  // We no longer need these in state if they are readonly from meta, 
  // but we can initialize them when meta loads.
  const [customerName, setCustomerName] = useState('');
  const [projectNameDisplay, setProjectNameDisplay] = useState('');
  
  const [clientManagerComments, setClientManagerComments] = useState('');
  
  const [ratings, setRatings] = useState<Record<string, number | 'N/A'>>({});
  const [ratingComments, setRatingComments] = useState<Record<string, string>>({});
  
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [overallAssessment, setOverallAssessment] = useState<string>('');
  
  const [areasToImprove, setAreasToImprove] = useState('');
  const [areasToCompliment, setAreasToCompliment] = useState('');
  
  const [respondentName, setRespondentName] = useState('');
  const [signature, setSignature] = useState(''); // Text representation of signature

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Validate token on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStep('error');
      return;
    }

    fetch(`${API_BASE}/api/feedback/public/${token}`)
      .then(async res => {
        if (res.status === 404) { setStep('error'); return; }
        if (res.status === 409) { setStep('already_submitted'); return; }
        if (res.status === 410) { setStep('expired'); return; }
        if (!res.ok)            { setStep('error'); return; }
        const data = await res.json();
        setMeta(data);
        setStep('form');
        
        // Auto-set the read-only fields
        setCustomerName(data.customerName || '');
        const pCode = data.projectCode || `PRJ-${data.projectId}`;
        setProjectNameDisplay(`${data.projectName || `Project #${data.projectId}`} / ${pCode}`);
      })
      .catch(() => setStep('error'));
  }, [token]);

  // ── Auto-calculate Overall Rating ──────────────────────────────────────
  useEffect(() => {
    const numericRatings = Object.values(ratings).filter(r => typeof r === 'number') as number[];
    if (numericRatings.length > 0) {
      const avg = numericRatings.reduce((sum, val) => sum + val, 0) / numericRatings.length;
      setOverallRating(Math.round(avg));
    } else {
      setOverallRating(null);
    }
    
    setErrors(e => {
      const ne = { ...e };
      delete ne.overallRating;
      return ne;
    });
  }, [ratings]);

  // ── Handlers & Validation ──────────────────────────────────────────────
  const handleRatingChange = (id: string, value: number | 'N/A') => {
    setRatings(prev => ({ ...prev, [id]: value }));
    const newErrors = { ...errors };
    delete newErrors[`rating_${id}`];
    if (value === 'N/A' || value >= 8) {
      setRatingComments(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete newErrors[`comment_${id}`];
    }
    setErrors(newErrors);
  };

  const handleRatingCommentChange = (id: string, text: string) => {
    setRatingComments(prev => ({ ...prev, [id]: text }));
    if (text.trim().length > 0) {
      const newErrors = { ...errors };
      delete newErrors[`comment_${id}`];
      setErrors(newErrors);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    // customerName is now read-only, so we don't strictly validate user input for it, 
    // but we can ensure it's not empty just in case.
    if (!customerName.trim()) newErrors['customerName'] = 'Required';
    
    CORE_QUESTIONS.forEach(q => {
      const val = ratings[q.id];
      if (val === undefined) {
        newErrors[`rating_${q.id}`] = 'Required';
      } else if (val !== 'N/A' && val < 8) {
        if (!ratingComments[q.id]?.trim()) {
          newErrors[`comment_${q.id}`] = 'Required';
        }
      }
    });

    if (overallRating === null) newErrors['overallRating'] = 'Required';
    if (!overallAssessment) newErrors['overallAssessment'] = 'Required';
    if (!respondentName.trim()) newErrors['respondentName'] = 'Required';
    if (!signature.trim()) newErrors['signature'] = 'Required';

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      alert("Please fill all required fields, including mandatory comments for any ratings below 8.");
      return false;
    }
    
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setSubmitting(true);
    try {
      const payloadData = {
        customerName,
        projectName: projectNameDisplay,
        date: new Date().toISOString(),
        periodOfPerformance: meta?.periodOfPerformance,
        clientManagerComments,
        ratings,
        ratingComments,
        overallRating,
        overallAssessment,
        areasToImprove,
        areasToCompliment,
        respondentName,
        designation: '', // Combined in respondentName in this new design
        signature
      };

      const res = await fetch(`${API_BASE}/api/feedback/public/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payloadData }),
      });
      if (res.status === 409) { setStep('already_submitted'); return; }
      if (res.status === 410) { setStep('expired'); return; }
      if (!res.ok) { setStep('error'); return; }
      setStep('submitted');
    } catch {
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'loading') return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading your survey…</p></div>;
  if (step === 'submitted') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="w-14 h-14 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-3">Thank you!</h2>
        <p className="text-gray-600">Your feedback has been successfully submitted.</p>
      </div>
    </div>
  );
  if (step === 'already_submitted' || step === 'expired' || step === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl p-10 max-w-md w-full text-center shadow-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-3">{step === 'expired' ? 'Link Expired' : step === 'already_submitted' ? 'Already Submitted' : 'Error'}</h2>
        <p className="text-gray-600">{step === 'expired' ? 'This link is no longer active.' : step === 'already_submitted' ? 'We already received feedback for this link.' : 'We could not load your survey.'}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      {/* HEADER SECTION */}
      <div className="bg-[#0b5c36] w-full pt-8 pb-24 px-4 relative">
        {/* Background texture simulation using a subtle CSS radial gradient if we wanted, but solid is fine for now */}
        <div className="max-w-[1100px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            {/* Top Left: Logo */}
            <div className="flex items-center mb-6 md:mb-0">
              <img
                src="https://www.mindteck.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo-white.478f1e2d.png&w=640&q=75"
                alt="Mindteck"
                className="h-12 w-auto object-contain"
              />
            </div>

            {/* Top Center: Titles */}
            <div className="text-center md:absolute md:left-1/2 md:-translate-x-1/2">
              <h1 className="text-white text-3xl font-bold mb-2">Customer Satisfaction Survey</h1>
              <p className="text-green-100 text-sm font-medium">Your feedback helps us improve and deliver excellence.</p>
            </div>


          </div>
        </div>
      </div>

      {/* MAIN FORM CONTENT */}
      <div className="max-w-[1100px] mx-auto px-4 -mt-14 relative z-10">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 md:p-8 space-y-8">
          
          {/* SECTION 1: Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 border-b border-gray-100 pb-8">
            <div className="space-y-4">
              <div className="flex flex-col">
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Customer Name *</label>
                <input 
                  type="text" 
                  value={customerName} 
                  readOnly
                  className="w-full bg-[#F3F4F6] border border-gray-200 rounded p-2 text-sm text-gray-500 cursor-not-allowed"
                  placeholder="Customer Name"
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center space-x-2 text-gray-800 font-semibold text-sm mb-1.5">
                  <BriefcaseIcon />
                  <span>Project Name / Code</span>
                </div>
                <input 
                  type="text" 
                  value={projectNameDisplay} 
                  readOnly
                  className="w-full bg-[#F3F4F6] border border-gray-200 rounded p-2 text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
              <div className="flex items-center">
                <div className="w-48 flex items-center space-x-2 text-gray-800 font-semibold text-sm">
                  <CalendarIcon />
                  <span>Date</span>
                </div>
                <input 
                  type="text" 
                  value={new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 
                  disabled
                  className="flex-1 bg-[#F9FAFB] border border-gray-200 rounded p-2 text-sm text-gray-500"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="w-48 flex items-center space-x-2 text-gray-800 font-semibold text-sm mt-2">
                  <CalendarIcon />
                  <span>Period of Performance</span>
                </div>
                <input 
                  type="text" 
                  value={meta?.periodOfPerformance || 'N/A'} 
                  disabled
                  className="flex-1 bg-[#F9FAFB] border border-gray-200 rounded p-2 text-sm text-gray-600"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Overviews */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border-2 border-green-300 rounded-lg overflow-hidden bg-[#fcfdfc]">
              <div className="bg-green-50 px-4 py-2.5 flex items-center justify-between border-b border-green-200">
                <div className="flex items-center space-x-2 text-gray-800 font-semibold text-sm">
                  <DocumentIcon />
                  <span>Overview on Project Performance</span>
                </div>
                <div className="flex items-center space-x-1 bg-white border border-green-300 rounded-full px-2.5 py-1">
                  <span className="text-[10px] font-bold text-green-700 uppercase tracking-wide whitespace-nowrap">Filled by {meta?.pmName || 'Project Manager'}</span>
                </div>
              </div>
              <div className="bg-[#F9FDFB] p-4 min-h-[100px] text-sm cursor-not-allowed">
                {meta?.pmAchievements ? (
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap m-0">{meta.pmAchievements}</p>
                ) : (
                  <p className="text-gray-400 italic m-0">The Project Manager's team achievements for this CSAT period will appear here.</p>
                )}
              </div>
            </div>
            
            <div className="border border-green-200 rounded-lg p-1 bg-[#fcfdfc]">
              <div className="flex items-center space-x-2 p-3 pb-2 text-gray-800 font-semibold text-sm">
                <ChatIcon />
                <span>Client Manager Comments <span className="text-green-600 text-xs font-normal">(Optional)</span></span>
              </div>
              <textarea 
                value={clientManagerComments}
                onChange={e => setClientManagerComments(e.target.value)}
                className="w-[calc(100%-8px)] border border-gray-200 bg-white rounded p-4 m-1 min-h-[100px] text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500 block resize-y"
                placeholder="<Provision for Client Manager to provide his comments>"
              />
            </div>
          </div>

          {/* SECTION 3: Rating Matrix */}
          <div>
            <div className="bg-green-50 border border-green-200 rounded-t-lg p-4 flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#0b5c36] text-white flex items-center justify-center font-bold font-serif italic text-lg shrink-0">
                i
              </div>
              <div className="text-[#0b5c36] font-bold">
                Please rate the following topics on a scale of 1–10
                <div className="text-sm font-normal mt-0.5 text-gray-600">(1 - lowest, 10 – highest and N/A where Not Applicable)</div>
              </div>
            </div>
            
            <div className="border-x border-b border-gray-200 rounded-b-lg overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-[#0b5c36] text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold w-12 text-center border-r border-green-700">#</th>
                    <th className="px-4 py-3 font-semibold border-r border-green-700">Topics</th>
                    <th className="px-4 py-3 font-semibold text-center border-r border-green-700">Rating (1 - Lowest, 10 - Highest, N/A)</th>
                    <th className="px-4 py-3 font-semibold w-64 text-center">Comments (Mandatory if rating &lt; 8)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {CORE_QUESTIONS.map((q, idx) => {
                    const rating = ratings[q.id];
                    const needsComment = rating !== undefined && rating !== 'N/A' && rating < 8;
                    const rowError = errors[`rating_${q.id}`];
                    return (
                      <tr key={q.id} className="hover:bg-gray-50 bg-white">
                        <td className="px-4 py-4 text-center border-r border-gray-100">
                          <div className="w-6 h-6 rounded-full bg-[#0b5c36] text-white flex items-center justify-center text-xs mx-auto">
                            {idx + 1}
                          </div>
                        </td>
                        <td className="px-4 py-4 font-medium text-gray-800 border-r border-gray-100">
                          {q.text}
                        </td>
                        <td className="px-4 py-4 border-r border-gray-100">
                          <div className={`flex justify-between items-center px-4 w-full max-w-[500px] mx-auto ${rowError ? 'bg-red-50 p-2 rounded' : ''}`}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                              <label key={val} className="flex flex-col items-center justify-center cursor-pointer space-y-1 w-6">
                                <input 
                                  type="radio" 
                                  name={`rating_${q.id}`} 
                                  value={val}
                                  checked={rating === val}
                                  onChange={() => handleRatingChange(q.id, val)}
                                  className="w-4 h-4 text-[#0b5c36] focus:ring-[#0b5c36] border-gray-300"
                                />
                                <span className="text-[11px] text-gray-500 font-medium">{val}</span>
                              </label>
                            ))}
                            <label className="flex flex-col items-center justify-center cursor-pointer space-y-1 ml-4 border-l pl-4 border-gray-200 w-10">
                              <input 
                                type="radio" 
                                name={`rating_${q.id}`} 
                                value="N/A"
                                checked={rating === 'N/A'}
                                onChange={() => handleRatingChange(q.id, 'N/A')}
                                className="w-4 h-4 text-gray-600 focus:ring-gray-500 border-gray-300"
                              />
                              <span className="text-[11px] text-gray-700 font-bold">N/A</span>
                            </label>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="text"
                            value={ratingComments[q.id] || ''}
                            onChange={(e) => handleRatingCommentChange(q.id, e.target.value)}
                            disabled={!needsComment && !ratingComments[q.id]}
                            placeholder={needsComment ? 'Please provide your comments...' : ''}
                            className={`w-full p-2 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-green-500 ${
                              errors[`comment_${q.id}`] ? 'border-red-400 bg-red-50' : 
                              (needsComment || ratingComments[q.id] ? 'bg-white border-gray-300' : 'bg-gray-50 border-gray-200 opacity-60')
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 4: Overall Rating & Assessment */}
          <div className="space-y-4">
            <div className={`border rounded-lg p-2 flex items-center justify-between bg-green-50/50 ${errors.overallRating ? 'border-red-400' : 'border-green-200'}`}>
              <div className="flex items-center space-x-2 pl-2">
                <div className="w-8 h-8 rounded bg-[#0b5c36] text-white flex items-center justify-center">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                </div>
                <div>
                  <h3 className="font-bold text-[#0b5c36] text-base">Overall Rating on a scale of 1–10</h3>
                </div>
              </div>
              <div className="flex space-x-6 pr-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                  <label key={val} className="flex items-center cursor-not-allowed space-x-2">
                    <input 
                      type="radio" 
                      name="overall_rating" 
                      value={val}
                      checked={overallRating === val}
                      readOnly
                      onChange={() => {}}
                      onClick={(e) => e.preventDefault()}
                      className="w-4 h-4 text-[#0b5c36] focus:ring-[#0b5c36] border-gray-300 cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-700 font-medium">{val}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={`border rounded-lg p-6 ${errors.overallAssessment ? 'border-red-400 bg-red-50/20' : 'border-gray-200'}`}>
              <h3 className="font-bold text-[#0b5c36] mb-4">Overall Assessment: <span className="font-normal text-sm opacity-80">(Please select one)</span></h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {OVERALL_ASSESSMENT_OPTIONS.map(opt => (
                  <label 
                    key={opt.value} 
                    className={`cursor-pointer border rounded-lg p-4 text-center transition-colors ${
                      overallAssessment === opt.value ? 'border-[#0b5c36] bg-green-50 shadow-sm' : 'border-gray-200 hover:border-green-300 bg-white'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="overall_assessment" 
                      value={opt.value}
                      checked={overallAssessment === opt.value}
                      onChange={() => { setOverallAssessment(opt.value); setErrors(e => { const ne={...e}; delete ne.overallAssessment; return ne; }) }}
                      className="w-4 h-4 text-[#0b5c36] focus:ring-[#0b5c36] border-gray-300 mx-auto block mb-3"
                    />
                    <div className={`font-bold mb-1 text-[#0b5c36]`}>{opt.value}</div>
                    <div className="text-[11px] text-gray-500 leading-tight">{opt.desc}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 5: Text Areas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-green-200 rounded-lg p-1 bg-[#fcfdfc]">
              <div className="flex items-center space-x-2 p-3 pb-2 text-gray-800 font-semibold text-sm">
                <ImproveIcon />
                <span>Areas you would like us to improve on or/and<br/>any other suggestions: <span className="text-gray-500 text-xs font-normal">(Optional)</span></span>
              </div>
              <div className="relative">
                <textarea 
                  value={areasToImprove}
                  onChange={e => setAreasToImprove(e.target.value)}
                  className="w-[calc(100%-8px)] border border-gray-200 bg-white rounded p-4 m-1 min-h-[100px] text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500 block resize-y"
                  placeholder="Type your suggestions here..."
                />
                <div className="absolute bottom-4 right-4 text-gray-300"><PenIcon /></div>
              </div>
            </div>

            <div className="border border-green-200 rounded-lg p-1 bg-[#fcfdfc]">
              <div className="flex items-center space-x-2 p-3 pb-2 text-gray-800 font-semibold text-sm">
                <ComplimentIcon />
                <span>Areas on which you would like to compliment us: <span className="text-gray-500 text-xs font-normal">(Optional)</span></span>
              </div>
              <div className="relative">
                <textarea 
                  value={areasToCompliment}
                  onChange={e => setAreasToCompliment(e.target.value)}
                  className="w-[calc(100%-8px)] border border-gray-200 bg-white rounded p-4 m-1 min-h-[100px] text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500 block resize-y"
                  placeholder="Type your compliments here..."
                />
                <div className="absolute bottom-4 right-4 text-gray-300"><PenIcon /></div>
              </div>
            </div>
          </div>

          {/* SECTION 6: Sign-off */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div>
              <div className="flex items-center space-x-2 text-gray-800 font-semibold text-sm mb-3">
                <PersonIcon />
                <span>Name & Designation of the Respondent</span>
              </div>
              <input 
                type="text" 
                value={respondentName} 
                onChange={e => { setRespondentName(e.target.value); setErrors(err => {const n={...err}; delete n.respondentName; return n;})}} 
                className={`w-full bg-white border ${errors.respondentName ? 'border-red-400' : 'border-gray-200'} rounded-lg p-3 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500`}
                placeholder="Enter name and designation"
              />
            </div>
            
            <div>
              <div className="flex items-center space-x-2 text-gray-800 font-semibold text-sm mb-3">
                <PenIcon />
                <span>Signature of the Respondent</span>
              </div>
              <div className="relative">
                <input 
                  type="text" 
                  value={signature} 
                  onChange={e => { setSignature(e.target.value); setErrors(err => {const n={...err}; delete n.signature; return n;})}} 
                  className={`w-full bg-white border ${errors.signature ? 'border-red-400' : 'border-gray-200'} rounded-lg p-3 text-lg text-center text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-500 font-serif italic`}
                  placeholder="Click to sign"
                />
              </div>
            </div>
          </div>
          
        </div>

        {/* SUBMIT BUTTON & FOOTER */}
        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex items-center justify-center space-x-2 px-12 py-3.5 rounded bg-[#0b5c36] text-white font-bold text-sm tracking-wide transition-all ${submitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-green-800 shadow-md hover:shadow-lg'}`}
          >
            <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span>{submitting ? 'SUBMITTING...' : 'SUBMIT FEEDBACK'}</span>
          </button>
          
          <div className="mt-4 flex items-center text-xs text-gray-500">
            <LockIcon />
            <span>Your responses are secure and confidential.</span>
          </div>
        </div>
      </div>
    </div>
  );
};