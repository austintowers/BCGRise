/* Transcript_analyzer.jsx
   No imports/exports (UMD + Babel in-browser).
   Assumes index.html loads:
   - React & ReactDOM UMD
   - Firebase compat UMD (optional)
   - Babel standalone
   And defines (optional) globals:
   - __firebase_config (JSON string), __initial_auth_token, __app_id
   - __GEMINI_API_KEY  (string)
   - initializeApp, getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged (shims)
*/

// Sample you can load via the button
const mockTranscript = `
Commentary for Q1 2024:
Gross Margin Rate decreased by 2% compared to budget due to two main factors. First, Volume of Hours was 15% below forecast, driven by a delay in the new client onboarding process. Second, Other Operational Expenses were 8% above budget, primarily from higher-than-expected software licensing costs.
Indirect Costs (SG&A) were 5% over budget, mainly due to a 10% increase in wages as a result of recent market adjustments. Headcount remained flat.
EBITDA was negatively impacted by both the lower Gross Margin and the higher Indirect Costs.
Piece Pricing & Efficiency (PPR, PPE) met the internal benchmark, showing strong operational execution despite the volume challenges.
The Outlook for the next three months is positive, with a forecast of revenue increasing by 10% as the new client comes online. Gross Margin % is expected to recover to budget levels.
`;

const App = () => {
  // --- UI state ---
  const [transcript, setTranscript] = React.useState(''); // start EMPTY
  const [commentary, setCommentary] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [procError, setProcError] = React.useState('');
  const [isProcessingTranscript, setIsProcessingTranscript] = React.useState(false);

  // --- Env/config (from index.html if provided) ---
  let firebaseConfig = {};
  let initialAuthToken = null;
  let appId = 'default-app-id';
  try {
    firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  } catch (_) {}
  if (typeof __initial_auth_token !== 'undefined') initialAuthToken = __initial_auth_token;
  if (typeof __app_id !== 'undefined') appId = __app_id;

  const [authReady, setAuthReady] = React.useState(false);
  const [userId, setUserId] = React.useState(null);

  // --- Firebase init (optional; guarded so demo works without it) ---
  React.useEffect(() => {
    (async () => {
      try {
        if (typeof initializeApp === 'function' && typeof getAuth === 'function') {
          const app = initializeApp(firebaseConfig || {});
          const auth = getAuth(app);

          let unsub = null;
          if (typeof onAuthStateChanged === 'function') {
            unsub = onAuthStateChanged(auth, (user) => {
              if (user && user.uid) setUserId(user.uid);
              else setUserId((crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()));
              setAuthReady(true);
            });
          } else {
            // compat-less environment; still proceed
            setUserId((crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()));
            setAuthReady(true);
          }

          // anonymous or custom token
          if (initialAuthToken && typeof signInWithCustomToken === 'function') {
            await signInWithCustomToken(auth, initialAuthToken);
          } else if (typeof signInAnonymously === 'function') {
            await signInAnonymously(auth);
          } else {
            // no auth methods; proceed anyway
            setAuthReady(true);
          }

          // clean up
          return () => { if (unsub) try { unsub(); } catch(_){} };
        } else {
          // no firebase — continue
          setUserId((crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()));
          setAuthReady(true);
        }
      } catch (e) {
        console.error('Firebase init error:', e);
        setProcError('Failed to initialize auth. You can still try processing.');
        setAuthReady(true);
      }
    })();
  }, []);

  // --- Gemini helper: build URL with key ---
  function geminiUrl(model) {
    const key = (typeof __GEMINI_API_KEY !== 'undefined' && __GEMINI_API_KEY) ? __GEMINI_API_KEY : '';
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  }

  // --- Create structured commentary (manual trigger only) ---
  async function handleProcess() {
    setResult('');
    setProcError('');
    setCommentary(null);

    if (!transcript.trim()) {
      setProcError('Please paste a transcript first.');
      return;
    }
    if (!authReady) {
      setProcError('Please wait… initializing.');
      return;
    }
    if (!(typeof __GEMINI_API_KEY !== 'undefined' && __GEMINI_API_KEY)) {
      setProcError('Missing Gemini API key. Define __GEMINI_API_KEY in index.html.');
      return;
    }

    setIsProcessingTranscript(true);
    try {
      const prompt = `
Analyze the following business commentary and extract key variance analysis points into a structured JSON array.
Each item must have: "kpi" (string), "drivers" (string[]), "comparison" (string), "impact" (string).
Only output JSON.

Commentary:
${transcript}
      `.trim();

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                kpi: { type: "STRING" },
                drivers: { type: "ARRAY", items: { type: "STRING" } },
                comparison: { type: "STRING" },
                impact: { type: "STRING" }
              },
              propertyOrdering: ["kpi", "drivers", "comparison", "impact"]
            }
          }
        }
      };

      const resp = await fetch(geminiUrl('gemini-2.5-flash-preview-05-20'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        let msg = 'Unknown error';
        try { msg = (await resp.json())?.error?.message || msg; } catch(_) {}
        throw new Error(msg);
      }

      const data = await resp.json();
      const jsonString = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const parsed = JSON.parse(jsonString);
      setCommentary(parsed);
    } catch (e) {
      console.error('Error processing transcript:', e);
      setProcError('Failed to process the transcript: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsProcessingTranscript(false);
    }
  }

  // --- Query over the structured commentary ---
  async function handleQuery() {
    setProcError('');
    setResult('');

    if (!query.trim()) {
      setResult('Please enter a query.');
      return;
    }
    if (!commentary) {
      setResult('Please process a transcript first.');
      return;
    }
    if (!(typeof __GEMINI_API_KEY !== 'undefined' && __GEMINI_API_KEY)) {
      setProcError('Missing Gemini API key. Define __GEMINI_API_KEY in index.html.');
      return;
    }

    setIsLoading(true);
    try {
      const structured = JSON.stringify(commentary, null, 2);
      const prompt = `
You are a business analyst. Using this structured variance commentary, answer the user's question briefly and directly.
If the info is not present, say it's not available.

Structured Commentary:
${structured}

User Query: "${query}"
      `.trim();

      const resp = await fetch(geminiUrl('gemini-2.5-flash-preview-05-20'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!resp.ok) {
        let msg = 'Unknown error';
        try { msg = (await resp.json())?.error?.message || msg; } catch(_) {}
        throw new Error(msg);
      }

      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      setResult(text || 'No answer returned.');
    } catch (e) {
      console.error('Error processing query:', e);
      setProcError('Failed to get a response: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 md:p-10 space-y-8">
        <header className="text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">
            Variance Analysis Q&A
          </h1>
          <p className="text-gray-500 text-sm md:text-base">
            Paste a transcript, process it, then ask questions.
          </p>
        </header>

        {procError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
            <p>{procError}</p>
          </div>
        )}

        {/* Transcript Input */}
        <section>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Commentary Transcript</h2>
          <textarea
            className="w-full p-4 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="10"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste your commentary transcript here…"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={handleProcess}
              disabled={isProcessingTranscript}
              className={`px-6 py-3 rounded-lg font-bold text-white transition-colors
                ${isProcessingTranscript ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isProcessingTranscript ? 'Processing…' : 'Process Transcript'}
            </button>
            <button
              type="button"
              onClick={() => setTranscript(mockTranscript)}
              className="px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300"
            >
              Load Sample Transcript
            </button>
          </div>
        </section>

        {/* Query */}
        <section>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Ask a Question</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              className="flex-1 p-4 border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Why was Gross Margin down?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuery(); }}
            />
            <button
              onClick={handleQuery}
              disabled={isLoading || isProcessingTranscript}
              className={`px-8 py-4 rounded-lg font-bold text-white transition-colors
                ${(isLoading || isProcessingTranscript) ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isLoading ? 'Thinking…' : 'Query'}
            </button>
          </div>
        </section>

        {/* Results */}
        <section>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Analysis Result</h2>
          <div className="min-h-[150px] p-6 border border-gray-300 rounded-lg bg-gray-50 text-gray-800">
            {isProcessingTranscript && <p className="text-center text-gray-500">Processing transcript…</p>}
            {!isProcessingTranscript && !result && !procError && !commentary && (
              <p className="text-center text-gray-500">Paste a transcript and click “Process Transcript”.</p>
            )}
            {!isProcessingTranscript && commentary && !result && !procError && (
              <p className="text-center text-gray-500">Transcript processed. Enter a question above.</p>
            )}
            {result && <pre className="whitespace-pre-wrap">{result}</pre>}
          </div>
        </section>
      </div>
    </div>
  );
};

// No export (index.html mounts <App />)
