import { useState } from "react";

function App() {
  const [rawInput, setRawInput] = useState("");
  const [generatedNote, setGeneratedNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleGenerate = async () => {
    if (!rawInput.trim()) return;

    setLoading(true);
    setErrorMsg("");
    setGeneratedNote("");

    try {
      const response = await fetch("http://localhost:5000/api/generate-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawInput }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate note");
      }

      const data = await response.json();
      setGeneratedNote(data.note);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1.5rem", fontFamily: "sans-serif" }}>
      <h1>NDIS AI Progress Notes Assistant</h1>
      <p>Enter a rough description of the shift, and we&apos;ll turn it into a professional note.</p>

      <label style={{ display: "block", margin: "1rem 0 0.5rem" }}>
        Shift summary (what happened?):
      </label>
      <textarea
        rows={8}
        style={{ width: "100%", padding: "0.5rem", fontFamily: "inherit" }}
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
        placeholder="E.g. Supported Ali to go to the shops, he chose items, we practised money handling..."
      />

      <button
        onClick={handleGenerate}
        disabled={loading || !rawInput.trim()}
        style={{
          marginTop: "1rem",
          padding: "0.6rem 1.2rem",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Generating..." : "Generate Note"}
      </button>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "1rem" }}>{errorMsg}</p>
      )}

      {generatedNote && (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem",
            border: "1px solid #ccc",
            borderRadius: "8px",
            whiteSpace: "pre-wrap",
            background: "#f9f9f9",
          }}
        >
          <h2>Generated Note</h2>
          <p>{generatedNote}</p>
        </div>
      )}
    </div>
  );
}

export default App;
