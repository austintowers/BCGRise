/* Transcript_analyzer.jsx — paste-only, Firebase-free, no imports/exports.
   index.html must define:  window.__GEMINI_API_KEY = "YOUR_KEY";
   And load: React UMD, ReactDOM UMD, Babel (type="text/babel")
*/

function getApiKey() {
  return (typeof __GEMINI_API_KEY !== "undefined" && __GEMINI_API_KEY) ? __GEMINI_API_KEY : "";
}
function geminiUrl(model) {
  const key = getApiKey();
  if (!key) throw new Error("Missing Gemini API key");
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

const App = () => {
  const [transcript, setTranscript] = React.useState('');   // starts EMPTY
  const [commentary, setCommentary] = React.useState(null); // parsed JSON array from Gemini
  const [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState('');
  const [error, setError] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isQuerying, setIsQuerying] = React.useState(false);

  async function handleProcess() {
    setError('');
    setResult('');
    setCommentary(null);

    const text = (transcript || '').trim();
    if (!text) { setError('Please paste a transcript first.'); return; }

    let url;
    try { url = geminiUrl('gemini-2.5-flash-preview-05-20'); }
    catch (e) { setError(e.message); return; }

    const prompt = `
Analyze the following business commentary and extract key variance analysis points into a structured JSON array.
Each item must have: "kpi" (string), "drivers" (string[]), "comparison" (string), "impact" (string).
Only output JSON.

Commentary:
${text}
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
            propertyOrdering: ["kpi","drivers","comparison","impact"]
          }
        }
      }
    };

    setIsProcessing(true);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        let msg = 'Unknown error';
        try { msg = (await resp.json())?.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      const jsonString = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) throw new Error('Model returned non-array JSON.');
      setCommentary(parsed);
    } catch (e) {
      console.error('Process error:', e);
      setError('Failed to process the transcript: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleQuery() {
    setError('');
    setResult('');

    if (!commentary) { setResult('Please process a transcript first.'); return; }
    if (!query.trim()) { setResult('Please enter a question.'); return; }

    let url;
    try { url = geminiUrl('gemini-2.5-flash-preview-05-20'); }
    catch (e) { setError(e.message); return; }

    const structured = JSON.stringify(commentary, null, 2);
    const prompt = `
You are a business analyst. Using ONLY this structured variance commentary, answer the user's question briefly and directly.
If the info is not present, say it's not available.

Structured Commentary:
${structured}

User Query: "${query}"
`.trim();

    setIsQuerying(true);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (!resp.ok) {
        let msg = 'Unknown error';
        try { msg = (await resp.json())?.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      setResult(text || 'No answer returned.');
    } catch (e) {
      console.error('Query error:', e);
      setError('Failed to get a response: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsQuerying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 md:p-10 space-y-8">
        <header className="text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">Variance Analysis Q&A</h1>
          <p className="text-gray-500 text-sm md:text-base">Paste a transcript → Process → Ask questions.</p>
        </header>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
            <p>{error}</p>
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
              disabled={isProcessing}
              className={`px-6 py-3 rounded-lg font-bold text-white transition-colors
                ${isProcessing ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isProcessing ? 'Processing…' : 'Process Transcript'}
            </button>
            <button
              type="button"
              onClick={() => { setTranscript(''); setCommentary(null); setResult(''); setError(''); }}
              className="px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300"
            >
              Clear
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
              disabled={isQuerying || isProcessing}
              className={`px-8 py-4 rounded-lg font-bold text-white transition-colors
                ${(isQuerying || isProcessing) ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isQuerying ? 'Thinking…' : 'Query'}
            </button>
          </div>
        </section>

        {/* Results */}
        <section>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Analysis Result</h2>
          <div className="min-h-[150px] p-6 border border-gray-300 rounded-lg bg-gray-50 text-gray-800">
            {isProcessing && <p className="text-center text-gray-500">Processing transcript…</p>}
            {!isProcessing && !result && !error && !commentary && (
              <p className="text-center text-gray-500">Paste a transcript and click “Process Transcript”.</p>
            )}
            {!isProcessing && commentary && !result && !error && (
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
