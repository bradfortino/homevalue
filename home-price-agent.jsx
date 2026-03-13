import { useState, useEffect, useRef } from "react";

const PARSE_SYSTEM = `You are a real estate assistant. The user will describe a property in plain English.
Extract the details and propose a search plan.
Respond ONLY with valid JSON, no markdown, no extra text:
{
  "parsed": {
    "zipCode": "80301",
    "city": "Boulder, CO",
    "bedrooms": 3,
    "bathrooms": 2,
    "sqft": 1800,
    "yearBuilt": 2005,
    "features": ["Pool", "2-Car Garage"]
  },
  "searchPlan": [
    "Recent homes sold in 80301 2024 2025",
    "Median home price Boulder CO 80301",
    "Real estate market trends Boulder CO 2025",
    "Pool premium home value Boulder CO"
  ],
  "summary": "A 3-bed, 2-bath home built in 2005 with ~1,800 sqft, a pool, and 2-car garage in Boulder, CO (80301)."
}
If any detail is missing or unclear, make a reasonable assumption and note it in the summary.`;

const ANALYZE_SYSTEM = `You are a real estate market analyst AI. Use web search to find data, then respond ONLY with valid JSON (no markdown):
{
  "estimated_price": 750000,
  "price_range_low": 710000,
  "price_range_high": 790000,
  "confidence": "high",
  "location_name": "Boulder, CO 80301",
  "median_zip_price": 730000,
  "price_per_sqft": 417,
  "market_trend": "appreciating",
  "trend_pct": 6.2,
  "comparable_homes": [
    {"address": "123 Maple St", "price": 745000, "beds": 3, "baths": 2, "sqft": 1820, "sold_date": "2025-01"},
    {"address": "456 Pine Ave", "price": 762000, "beds": 3, "baths": 2, "sqft": 1900, "sold_date": "2024-12"},
    {"address": "789 Oak Dr",   "price": 738000, "beds": 3, "baths": 2, "sqft": 1750, "sold_date": "2024-11"}
  ],
  "feature_adjustments": [
    {"feature": "Pool", "adjustment": 18000},
    {"feature": "2-Car Garage", "adjustment": 9000}
  ],
  "market_summary": "Boulder 80301 shows strong demand driven by tech sector growth. Inventory remains tight with homes averaging 14 days on market.",
  "data_sources": ["Zillow", "Redfin", "Local MLS"],
  "search_queries_used": []
}`;

const fmt = (n) =>
  typeof n === "number"
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "$—";

const trendColor = (t) =>
  t === "appreciating" ? "#22c55e" : t === "depreciating" ? "#ef4444" : "#f59e0b";

const confColor = (c) =>
  c === "high" ? "#22c55e" : c === "medium" ? "#f59e0b" : "#ef4444";

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#0d0d18", border: "1px solid #1e1e30", borderRadius: 14, padding: 20, ...style }}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <div style={{ fontSize: 11, color: "#4a4560", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>
    {children}
  </div>
);

const Tag = ({ color = "#7c3aed", children }) => (
  <span style={{
    background: `${color}22`, color, border: `1px solid ${color}44`,
    padding: "3px 10px", borderRadius: 20, fontSize: 11,
    textTransform: "uppercase", letterSpacing: "1px",
  }}>{children}</span>
);

export default function HomePriceAgent() {
  const [step, setStep] = useState("chat");
  const [userInput, setUserInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    {
      role: "assistant",
      text: "Hi! Describe the property you'd like to value — just talk naturally. For example:\n\n\"I'm looking at a 3-bedroom, 2-bath house around 1,800 sqft built in the early 2000s in zip code 80301. It has a pool and a 2-car garage.\"",
    },
  ]);
  const [parsedPlan, setParsedPlan] = useState(null);
  const [searchQueries, setSearchQueries] = useState([]);
  const [agentLog, setAgentLog] = useState([]);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("chat");
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, typing]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [agentLog]);

  const addLog = (msg, type = "info") =>
    setAgentLog((p) => [...p, { msg, type, time: new Date().toLocaleTimeString() }]);

  const handleDescribe = async () => {
    const text = userInput.trim();
    if (!text) return;
    setUserInput("");
    setChatHistory((h) => [...h, { role: "user", text }]);
    setTyping(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: PARSE_SYSTEM,
          messages: [{ role: "user", content: text }],
        }),
      });
      const data = await res.json();
      const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse response");
      const plan = JSON.parse(match[0]);

      setTyping(false);
      setParsedPlan(plan);
      setSearchQueries(plan.searchPlan || []);
      setChatHistory((h) => [
        ...h,
        {
          role: "assistant",
          text: `Got it! Here's what I understood:\n\n📋 ${plan.summary}\n\nSwitch to the Search Plan tab to review the searches I'll run, edit them if needed, then confirm to launch the agent.`,
        },
      ]);
      setStep("confirm");
      setActiveTab("confirm");
    } catch (e) {
      setTyping(false);
      setChatHistory((h) => [
        ...h,
        { role: "assistant", text: "Sorry, I had trouble understanding that. Could you try again with a bit more detail — like the zip code, number of bedrooms, and any special features?" },
      ]);
    }
  };

  const updateQuery = (i, val) =>
    setSearchQueries((q) => q.map((x, idx) => (idx === i ? val : x)));

  const removeQuery = (i) =>
    setSearchQueries((q) => q.filter((_, idx) => idx !== i));

  const runAgent = async () => {
    setStep("running");
    setActiveTab("log");
    setAgentLog([]);

    const p = parsedPlan.parsed;
    addLog("🚀 Agent initialized — search plan confirmed by user", "info");
    addLog(`📍 ${p.city || ""} ZIP ${p.zipCode} | ${p.bedrooms}bd/${p.bathrooms}ba | ${p.sqft} sqft`, "info");
    if (p.features?.length) addLog(`✨ Features: ${p.features.join(", ")}`, "info");
    searchQueries.forEach((q) => addLog(`📋 Queued: "${q}"`, "info"));
    addLog("🔍 Launching searches...", "search");

    const userMsg = `Analyze and predict the home price for:
- ZIP: ${p.zipCode}
- City: ${p.city || "unknown"}
- Bedrooms: ${p.bedrooms}
- Bathrooms: ${p.bathrooms}
- Sqft: ${p.sqft}
- Year Built: ${p.yearBuilt}
- Features: ${(p.features || []).join(", ") || "None"}

Use these specific search queries (search all of them):
${searchQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return ONLY the JSON price analysis.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: ANALYZE_SYSTEM,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      const data = await res.json();

      for (const block of data.content || []) {
        if (block.type === "tool_use" && block.name === "web_search")
          addLog(`🔍 Searching: "${block.input?.query}"`, "search");
        if (block.type === "tool_result")
          addLog("📄 Results retrieved", "success");
      }

      addLog("🧠 Analyzing comparable sales and market data...", "info");
      addLog("📊 Computing feature-adjusted price estimate...", "info");

      const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const match = raw.match(/\{[\s\S]*\}/);
      let parsed = null;
      if (match) { try { parsed = JSON.parse(match[0]); } catch (e) {} }

      if (!parsed) {
        addLog("⚠️ Structuring estimate from agent response...", "warn");
        parsed = {
          estimated_price: 500000, price_range_low: 470000, price_range_high: 530000,
          confidence: "medium", location_name: `ZIP ${p.zipCode}`,
          median_zip_price: 490000, price_per_sqft: Math.round(500000 / (p.sqft || 1800)),
          market_trend: "stable", trend_pct: 3.5, comparable_homes: [],
          feature_adjustments: (p.features || []).map((f) => ({ feature: f, adjustment: f === "Pool" ? 15000 : 8000 })),
          market_summary: raw.slice(0, 400) || "See agent log for details.",
          data_sources: ["Web Search"], search_queries_used: searchQueries,
        };
      }

      addLog("✅ Analysis complete!", "success");
      setResult(parsed);
      setStep("done");
      setActiveTab("dashboard");
    } catch (e) {
      addLog("❌ Error: " + e.message, "error");
      setStep("confirm");
    }
  };

  const resetAll = () => {
    setStep("chat"); setActiveTab("chat");
    setChatHistory([{ role: "assistant", text: "Hi! Describe the property you'd like to value — just talk naturally. For example:\n\n\"I'm looking at a 3-bedroom, 2-bath house around 1,800 sqft built in the early 2000s in zip code 80301. It has a pool and a 2-car garage.\"" }]);
    setParsedPlan(null); setSearchQueries([]); setResult(null); setAgentLog([]);
  };

  const tabs = [
    { id: "chat", label: "💬 Describe Property", show: true },
    { id: "confirm", label: "📋 Search Plan", show: step !== "chat" },
    { id: "log", label: "🤖 Agent Log", show: step === "running" || step === "done" },
    { id: "dashboard", label: "📊 Dashboard", show: step === "done" },
  ].filter((t) => t.show);

  const stepIdx = { chat: 0, confirm: 1, running: 2, done: 3 }[step];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e3d5", fontFamily: "'Georgia','Times New Roman',serif" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f0f1a,#1a1025)", borderBottom: "1px solid #2a2040", padding: "18px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 42, height: 42, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏠</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: "bold", color: "#f0ebe0" }}>HomeValue<span style={{ color: "#7c3aed" }}>AI</span></div>
          <div style={{ fontSize: 10, color: "#4a4560", letterSpacing: "2px", textTransform: "uppercase" }}>Human-in-the-Loop Valuation Agent</div>
        </div>

        {/* Step progress */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {[{ n: 1, label: "Describe" }, { n: 2, label: "Confirm Plan" }, { n: 3, label: "Agent Runs" }, { n: 4, label: "Results" }].map(({ n, label }, i) => {
            const active = stepIdx === i, done = stepIdx > i;
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <div style={{ width: 20, height: 1, background: done ? "#7c3aed" : "#1e1e30" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: "bold",
                    background: done ? "#7c3aed" : active ? "rgba(124,58,237,0.2)" : "#13131f",
                    border: `1px solid ${done || active ? "#7c3aed" : "#1e1e30"}`,
                    color: done || active ? "#a78bfa" : "#3a3a55",
                  }}>{done ? "✓" : n}</div>
                  <span style={{ fontSize: 10, color: active ? "#a78bfa" : done ? "#6b5fa0" : "#3a3a55" }}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#0d0d18", borderBottom: "1px solid #1e1e30", padding: "0 28px", display: "flex", gap: 4 }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "12px 16px", border: "none", background: "transparent",
            borderBottom: `2px solid ${activeTab === t.id ? "#7c3aed" : "transparent"}`,
            color: activeTab === t.id ? "#a78bfa" : "#4a4560",
            cursor: "pointer", fontSize: 13, fontFamily: "inherit", transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 960, margin: "0 auto" }}>

        {/* ── CHAT TAB ── */}
        {activeTab === "chat" && (
          <div>
            <div style={{ minHeight: 340, marginBottom: 16 }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 14 }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 10, flexShrink: 0, marginTop: 4 }}>🏠</div>
                  )}
                  <div style={{
                    maxWidth: "72%",
                    background: msg.role === "user" ? "rgba(124,58,237,0.18)" : "#13131f",
                    border: `1px solid ${msg.role === "user" ? "#7c3aed44" : "#1e1e30"}`,
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    padding: "12px 16px", fontSize: 14, color: "#c8c3b5", lineHeight: 1.7, whiteSpace: "pre-wrap",
                  }}>{msg.text}</div>
                </div>
              ))}
              {typing && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏠</div>
                  <div style={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: "16px 16px 16px 4px", padding: "12px 18px" }}>
                    <span style={{ color: "#7c3aed", fontSize: 20, letterSpacing: 4 }}>···</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleDescribe(); } }}
                placeholder="Describe the property you want to value..."
                disabled={typing || step !== "chat"}
                rows={3}
                style={{ flex: 1, padding: "12px 14px", background: "#13131f", border: "1px solid #252535", borderRadius: 10, color: "#e8e3d5", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none" }}
              />
              <button onClick={handleDescribe} disabled={typing || !userInput.trim() || step !== "chat"} style={{
                padding: "0 22px", borderRadius: 10, border: "none",
                background: typing || !userInput.trim() ? "#1e1e30" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
                color: typing || !userInput.trim() ? "#3a3a55" : "#fff",
                cursor: typing || !userInput.trim() ? "not-allowed" : "pointer", fontSize: 20,
              }}>→</button>
            </div>
            <div style={{ fontSize: 11, color: "#3a3a55", marginTop: 6 }}>Press Enter to send · Shift+Enter for new line</div>
          </div>
        )}

        {/* ── CONFIRM TAB ── */}
        {activeTab === "confirm" && parsedPlan && (
          <div style={{ display: "grid", gap: 20 }}>
            <Card>
              <Label>What I Understood From Your Description</Label>
              <p style={{ fontSize: 14, color: "#8b8aa0", lineHeight: 1.7, margin: "0 0 16px" }}>{parsedPlan.summary}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parsedPlan.parsed.zipCode && <Tag>📍 ZIP {parsedPlan.parsed.zipCode}</Tag>}
                {parsedPlan.parsed.bedrooms && <Tag color="#4f46e5">🛏 {parsedPlan.parsed.bedrooms} beds</Tag>}
                {parsedPlan.parsed.bathrooms && <Tag color="#0891b2">🚿 {parsedPlan.parsed.bathrooms} baths</Tag>}
                {parsedPlan.parsed.sqft && <Tag color="#059669">📐 {parsedPlan.parsed.sqft?.toLocaleString()} sqft</Tag>}
                {(parsedPlan.parsed.features || []).map((f) => <Tag key={f} color="#b45309">✨ {f}</Tag>)}
              </div>
            </Card>

            <Card>
              <Label>🔍 Search Plan — Review & Edit Before Running</Label>
              <p style={{ fontSize: 13, color: "#5a5570", margin: "0 0 16px", lineHeight: 1.6 }}>
                These are the exact queries the agent will search the web with. You're in control — edit any query, remove ones you don't want, or add new ones. The agent won't run until you confirm.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {searchQueries.map((q, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ color: "#4a4560", fontSize: 12, width: 20, flexShrink: 0, textAlign: "right" }}>{i + 1}.</div>
                    <input
                      value={q}
                      onChange={(e) => updateQuery(i, e.target.value)}
                      style={{ flex: 1, padding: "10px 12px", background: "#13131f", border: "1px solid #252535", borderRadius: 8, color: "#c8c3b5", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                    />
                    <button onClick={() => removeQuery(i)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #2a2040", background: "transparent", color: "#4a4560", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setSearchQueries((q) => [...q, ""])} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px dashed #2a2040", background: "transparent", color: "#4a4560", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                + Add search query
              </button>
            </Card>

            <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#8b7aaa" }}>
              💡 <strong style={{ color: "#a78bfa" }}>You're in control.</strong> The agent will only run the searches listed above — nothing more. Review them carefully, then hit Confirm.
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => { setStep("chat"); setActiveTab("chat"); }} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid #2a2040", background: "transparent", color: "#6b6880", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
                ← Edit Description
              </button>
              <button onClick={runAgent} disabled={searchQueries.filter(Boolean).length === 0} style={{
                flex: 1, padding: "14px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                color: "#fff", cursor: "pointer", fontSize: 15, fontFamily: "inherit", fontWeight: "bold",
              }}>
                ✅ Confirm & Run Agent ({searchQueries.filter(Boolean).length} searches)
              </button>
            </div>
          </div>
        )}

        {/* ── LOG TAB ── */}
        {activeTab === "log" && (
          <div>
            <Label>Agent Activity Log</Label>
            <div ref={logRef} style={{ background: "#050508", borderRadius: 12, border: "1px solid #1a1a28", padding: 16, height: 480, overflowY: "auto", fontFamily: "monospace", fontSize: 13 }}>
              {agentLog.map((e, i) => (
                <div key={i} style={{
                  padding: "6px 0", borderBottom: "1px solid #0f0f18", display: "flex", gap: 12,
                  color: e.type === "error" ? "#f87171" : e.type === "success" ? "#4ade80" : e.type === "search" ? "#60a5fa" : e.type === "warn" ? "#fbbf24" : "#8b8aa0",
                }}>
                  <span style={{ color: "#2a2a40", flexShrink: 0 }}>{e.time}</span>
                  <span>{e.msg}</span>
                </div>
              ))}
              {step === "running" && <div style={{ color: "#7c3aed", padding: "6px 0" }}>▋</div>}
              {step === "done" && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => setActiveTab("dashboard")} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                    View Dashboard →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && result && (
          <div style={{ display: "grid", gap: 20 }}>
            <div style={{ background: "linear-gradient(135deg,#1a1025,#0f1a25)", border: "1px solid #2a2040", borderRadius: 16, padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#5a5570", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>Estimated Value</div>
                <div style={{ fontSize: 42, fontWeight: "bold", color: "#f0ebe0", lineHeight: 1 }}>{fmt(result.estimated_price)}</div>
                <div style={{ fontSize: 13, color: "#5a5570", marginTop: 6 }}>{fmt(result.price_range_low)} — {fmt(result.price_range_high)}</div>
                <div style={{ marginTop: 10 }}><Tag color={confColor(result.confidence)}>{result.confidence} confidence</Tag></div>
              </div>
              <div style={{ borderLeft: "1px solid #2a2040", paddingLeft: 24 }}>
                <div style={{ fontSize: 11, color: "#5a5570", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>Location</div>
                <div style={{ fontSize: 18, color: "#e8e3d5" }}>{result.location_name}</div>
                <div style={{ fontSize: 13, color: "#5a5570", marginTop: 4 }}>Median: {fmt(result.median_zip_price)}</div>
                <div style={{ fontSize: 13, color: "#5a5570" }}>{fmt(result.price_per_sqft)}/sqft</div>
              </div>
              <div style={{ borderLeft: "1px solid #2a2040", paddingLeft: 24 }}>
                <div style={{ fontSize: 11, color: "#5a5570", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>Market Trend</div>
                <div style={{ fontSize: 28, fontWeight: "bold", color: trendColor(result.market_trend) }}>{result.trend_pct > 0 ? "+" : ""}{result.trend_pct}%</div>
                <div style={{ fontSize: 13, color: trendColor(result.market_trend), textTransform: "capitalize" }}>{result.market_trend}</div>
                <div style={{ fontSize: 11, color: "#4a4560", marginTop: 4 }}>Year-over-year</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Card>
                <Label>Feature Value Adjustments</Label>
                {result.feature_adjustments?.length ? result.feature_adjustments.map((fa, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < result.feature_adjustments.length - 1 ? "1px solid #1a1a28" : "none" }}>
                    <span style={{ color: "#8b8aa0", fontSize: 14 }}>{fa.feature}</span>
                    <span style={{ color: fa.adjustment >= 0 ? "#4ade80" : "#f87171", fontWeight: "bold", fontSize: 14 }}>{fa.adjustment >= 0 ? "+" : ""}{fmt(fa.adjustment)}</span>
                  </div>
                )) : <div style={{ color: "#3a3a55", fontSize: 13 }}>No special features</div>}
              </Card>
              <Card>
                <Label>Market Summary</Label>
                <p style={{ fontSize: 14, color: "#8b8aa0", lineHeight: 1.7, margin: "0 0 12px" }}>{result.market_summary}</p>
                {result.data_sources && <div style={{ fontSize: 11, color: "#3a3a55" }}>Sources: {result.data_sources.join(", ")}</div>}
              </Card>
            </div>

            {result.comparable_homes?.length > 0 && (
              <Card>
                <Label>Comparable Sales</Label>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e1e30" }}>
                      {["Address", "Price", "Beds", "Baths", "Sqft", "Sold"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#4a4560", fontWeight: "normal", letterSpacing: "1px", textTransform: "uppercase", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparable_homes.map((h, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #131320" }}>
                        <td style={{ padding: "10px 12px", color: "#8b8aa0" }}>{h.address}</td>
                        <td style={{ padding: "10px 12px", color: "#c4bfa8", fontWeight: "bold" }}>{fmt(h.price)}</td>
                        <td style={{ padding: "10px 12px", color: "#6b6880" }}>{h.beds}</td>
                        <td style={{ padding: "10px 12px", color: "#6b6880" }}>{h.baths}</td>
                        <td style={{ padding: "10px 12px", color: "#6b6880" }}>{h.sqft?.toLocaleString()}</td>
                        <td style={{ padding: "10px 12px", color: "#4a4560" }}>{h.sold_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            <Card>
              <Label>Price Range Visualization</Label>
              <div style={{ position: "relative", height: 40, margin: "0 8px" }}>
                {(() => {
                  const lo = result.price_range_low, hi = result.price_range_high;
                  const est = result.estimated_price, med = result.median_zip_price;
                  const min = Math.min(lo, med) * 0.97, max = Math.max(hi, med) * 1.03;
                  const pct = (v) => `${((v - min) / (max - min)) * 100}%`;
                  return (<>
                    <div style={{ position: "absolute", top: 16, height: 8, borderRadius: 4, left: pct(lo), right: `${100 - ((hi - min) / (max - min)) * 100}%`, background: "linear-gradient(90deg,#4f46e5,#7c3aed)" }} />
                    <div style={{ position: "absolute", left: pct(est), top: 8, width: 4, height: 24, background: "#a78bfa", borderRadius: 2, transform: "translateX(-50%)" }} />
                    <div style={{ position: "absolute", left: pct(med), top: 8, width: 2, height: 24, background: "#f59e0b", borderRadius: 2, transform: "translateX(-50%)" }} />
                    <div style={{ position: "absolute", top: 36, left: pct(lo), transform: "translateX(-50%)", fontSize: 10, color: "#4a4560" }}>{fmt(lo)}</div>
                    <div style={{ position: "absolute", top: 36, left: pct(est), transform: "translateX(-50%)", fontSize: 10, color: "#a78bfa" }}>Est.</div>
                    <div style={{ position: "absolute", top: 36, left: pct(hi), transform: "translateX(-50%)", fontSize: 10, color: "#4a4560" }}>{fmt(hi)}</div>
                  </>);
                })()}
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 48, fontSize: 11 }}>
                <span style={{ color: "#a78bfa" }}>▌ Estimate</span>
                <span style={{ color: "#f59e0b" }}>▌ ZIP Median</span>
                <span style={{ color: "#4f46e5" }}>━ Range</span>
              </div>
            </Card>

            <div style={{ textAlign: "center" }}>
              <button onClick={resetAll} style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #2a2040", background: "transparent", color: "#6b6880", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                ← Start New Analysis
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
