// Define the mock transcript content for the commentary.
// In a real application, this would be loaded from a file.
const mockTranscript = `
Commentary for Q1 2024:
Paste transcript here
`;

const App = () => {
    const [transcript, setTranscript] = useState(mockTranscript);
    const [commentary, setCommentary] = useState(null);
    const [query, setQuery] = useState('');
    const [result, setResult] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isProcessingTranscript, setIsProcessingTranscript] = useState(true);

    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    const [firebaseApp, setFirebaseApp] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Initialize Firebase and authenticate user
    useEffect(() => {
        const initFirebase = async () => {
            try {
                const app = initializeApp(firebaseConfig);
                const authInstance = getAuth(app);
                setFirebaseApp(app);
                setAuth(authInstance);

                const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        setUserId(crypto.randomUUID());
                    }
                    setIsAuthReady(true);
                });

                if (initialAuthToken) {
                    await signInWithCustomToken(authInstance, initialAuthToken);
                } else {
                    await signInAnonymously(authInstance);
                }
                return unsubscribe;
            } catch (e) {
                console.error("Error initializing Firebase:", e);
                setError("Failed to initialize the application. Please try again.");
            }
        };

        const unsubscribePromise = initFirebase();
        return () => {
            unsubscribePromise.then(unsubscribe => {
                if (unsubscribe) unsubscribe();
            });
        };
    }, []);

    // Function to generate the structured commentary from the transcript
    const createCommentary = async (text) => {
        setIsProcessingTranscript(true);
        setError(null);
        try {
            const prompt = `
            Analyze the following business commentary and extract key variance analysis points into a structured JSON object. The commentary is about KPIs.
            Each key point should be an object in a JSON array with the following properties:
            - "kpi": The name of the key performance indicator (e.g., "Gross Margin Rate", "Indirect Costs").
            - "drivers": An array of strings describing the reasons or drivers for the variance.
            - "comparison": A string indicating what the KPI was compared against (e.g., "budget", "forecast").
            - "impact": A brief summary of the overall impact (e.g., "decreased", "increased", "met benchmark").
            
            Here is the commentary:
            ${text}
            
            Generate only the JSON object, do not add any other text.
            `;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "kpi": { "type": "STRING" },
                                "drivers": {
                                    "type": "ARRAY",
                                    "items": { "type": "STRING" }
                                },
                                "comparison": { "type": "STRING" },
                                "impact": { "type": "STRING" }
                            },
                            "propertyOrdering": ["kpi", "drivers", "comparison", "impact"]
                        }
                    }
                }
            };

            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API error: ${errorData.error.message}`);
            }

            const result = await response.json();
            const jsonString = result.candidates[0].content.parts[0].text;
            const parsedData = JSON.parse(jsonString);
            setCommentary(parsedData);

        } catch (e) {
            console.error("Error processing transcript:", e);
            setError("Failed to process the transcript. Please check the content.");
        } finally {
            setIsProcessingTranscript(false);
        }
    };

    useEffect(() => {
        if (transcript) {
            createCommentary(transcript);
        }
    }, [transcript]);

    const handleQuery = async () => {
        if (!query || !commentary) {
            setResult("Please enter a query and ensure the transcript is processed.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult('');

        try {
            const structuredCommentaryString = JSON.stringify(commentary, null, 2);
            const prompt = `
            You are a business analyst. Based on the following structured variance analysis commentary, answer the user's natural language query.
            The user wants to know about the drivers and impacts of specific KPIs.
            
            Structured Commentary:
            ${structuredCommentaryString}
            
            User Query: "${query}"
            
            Provide a concise, direct, and professional response that summarizes the relevant points from the commentary.
            If the commentary does not contain information on the query, state that the information is not available.
            `;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }]
            };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API error: ${errorData.error.message}`);
            }

            const result = await response.json();
            const textResult = result.candidates[0].content.parts[0].text;
            setResult(textResult);

        } catch (e) {
            console.error("Error processing query:", e);
            setError("Failed to get a response. Please try a different query.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 md:p-10 space-y-8">
                <header className="text-center">
                    <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">
                        Variance Analysis Q&A
                    </h1>
                    <p className="text-gray-500 text-sm md:text-base">
                        Query your business commentary using natural language.
                    </p>
                </header>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <p>{error}</p>
                    </div>
                )}

                {/* Transcript Input Section */}
                <div>
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">Commentary Transcript</h2>
                    <textarea
                        className="w-full p-4 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows="8"
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Paste your commentary transcript here..."
                    ></textarea>
                </div>

                {/* Query Section */}
                <div>
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">Ask a Question</h2>
                    <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                        <input
                            type="text"
                            className="flex-1 p-4 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Why was Gross Margin down?"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleQuery();
                                }
                            }}
                        />
                        <button
                            onClick={handleQuery}
                            disabled={isLoading || isProcessingTranscript}
                            className={`px-8 py-4 rounded-lg font-bold text-white transition-colors duration-200
                                ${isLoading || isProcessingTranscript
                                    ? 'bg-blue-300 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            {isLoading ? 'Thinking...' : 'Query'}
                        </button>
                    </div>
                </div>

                {/* Results Section */}
                <div>
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">Analysis Result</h2>
                    <div className="min-h-[150px] p-6 border border-gray-300 rounded-lg bg-gray-50 text-gray-800">
                        {isProcessingTranscript && (
                            <p className="text-center text-gray-500">
                                Processing transcript...
                            </p>
                        )}
                        {!isProcessingTranscript && !result && !error && (
                            <p className="text-center text-gray-500">
                                Enter a query above to get a response.
                            </p>
                        )}
                        {result && (
                            <p className="whitespace-pre-wrap">{result}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};




