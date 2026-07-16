import React, {useState} from "react";
import { useNavigate } from "react-router-dom";
import { verifySurveyToken } from "../../api/feedback.api";

export const SurveyAccessPage = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");


const [error,setError] = useState("");



const verify = async()=>{

    try{

        const result = await verifySurveyToken({
            email,
            token
        });


        console.log(
            "VERIFY RESPONSE",
            result
        );


        if(result.success || result.valid){

            navigate(
                `/survey/${token}?email=${encodeURIComponent(email)}`
            );

        }
        else{

            setError(
                "Invalid email or token"
            );

        }


    }
    catch(error){

        setError(
            "Invalid email or token"
        );

    }

};



return (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <div className="mb-6 flex items-center justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      </div>

      <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">
        Customer Authentication
      </h2>
      <p className="mb-6 text-center text-sm text-slate-500">
        Enter the email address and survey token shared with you.
      </p>

      <label className="mb-2 block text-sm font-medium text-slate-700">
        Email
      </label>
      <input
        className="mb-4 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
        value={email}
        placeholder="Enter email"
        onChange={e => setEmail(e.target.value)}
      />

      <label className="mb-2 block text-sm font-medium text-slate-700">
        Token
      </label>
      <input
        className="mb-5 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
        value={token}
        placeholder="Enter token"
        onChange={e => setToken(e.target.value)}
      />

      <button
        className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-800"
        onClick={verify}
      >
        Submit
      </button>

      {error && (
        <p className="mt-4 text-center text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  </div>
);

};