import React, {useState} from "react";
import {useSearchParams,useNavigate} from "react-router-dom";
import { verifySurveyToken } from "../../api/feedback.api";


export const SurveyAccessPage = () => {


const [params] = useSearchParams();

const navigate = useNavigate();


const [email,setEmail] = useState(
    params.get("email") || ""
);


const [token,setToken] = useState(
    params.get("surveyToken") || ""
);


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
                `/survey/${token}`
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

<div className="min-h-screen flex items-center justify-center bg-gray-100">


<div className="bg-white p-8 rounded-xl shadow-lg w-96">


<h2 className="text-2xl font-bold text-center mb-6">
Customer Authentication
</h2>


<label className="block mb-2">
Email
</label>

<input
className="w-full border rounded-lg p-3 mb-4"
value={email}
placeholder="Enter email"
onChange={
e=>setEmail(e.target.value)
}
/>



<label className="block mb-2">
Token
</label>


<input

className="w-full border rounded-lg p-3 mb-5"

value={token}

placeholder="Enter token"

onChange={
e=>setToken(e.target.value)
}

/>



<button

className="w-full bg-blue-600 text-white p-3 rounded-lg"

onClick={verify}

>

Submit

</button>


{
error &&

<p className="text-red-500 mt-4 text-center">

{error}

</p>

}


</div>


</div>

);


};