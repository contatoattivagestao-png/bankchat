import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "comprovantes_app_v2";

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { clients: [], records: [] };
  } catch { return { clients: [], records: [] }; }
}
function saveStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function exportCSV(records, clientName) {
  const filtered = clientName === "Todos" ? records : records.filter(r => r.clientName === clientName);
  const header = ["Cliente", "Data", "Valor (R$)", "Banco Origem", "Banco Destino", "Favorecido", "Tipo", "Observação", "Processado em"];
  const rows = filtered.map(r => [
    r.clientName,
    r.data?.data || "",
    r.data?.valor || "",
    r.data?.bancoOrigem || "",
    r.data?.bancoDestino || "",
    r.data?.favorecido || "",
    r.data?.tipo || "",
    r.data?.observacao || "",
    new Date(r.timestamp).toLocaleString("pt-BR")
  ]);
  const csv = [header, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")
  ).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comprovantes_${clientName.replace(/\s+/g, "_")}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function analyzeImage(base64, mediaType, mensagem) {
  const contextoPart = mensagem?.trim()
    ? `\n\nO cliente enviou esta mensagem junto com o comprovante: "${mensagem.trim()}"\nUse essa mensagem para preencher o campo "observacao" com o contexto/finalidade do pagamento, resumindo em até 2 frases o que foi dito.`
    : `\n\nNenhuma mensagem foi enviada junto. Deixe "observacao" como string vazia.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: `Analise este comprovante bancário e extraia os dados. Responda SOMENTE em JSON válido, sem markdown, sem explicações, apenas o JSON puro:
{
  "valor": "valor em reais com centavos ex: 1250.00",
  "data": "data no formato DD/MM/AAAA",
  "bancoOrigem": "nome do banco de origem",
  "bancoDestino": "nome do banco destino",
  "favorecido": "nome do favorecido/destinatário",
  "tipo": "PIX ou TED ou DOC ou Boleto ou Transferência",
  "observacao": "resumo do contexto/finalidade com base na mensagem do cliente",
  "valido": true
}
Se não for um comprovante bancário, retorne: {"valido": false, "erro": "motivo"}${contextoPart}`
          }
        ]
      }]
    })
  });
  const data = await response.json();
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return { valido: false, erro: "Não foi possível ler os dados" }; }
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ─── Sidebar ──────────────────────────────────────────────────────────────
function ClientSidebar({ clients, selectedClient, onSelect, onAdd, onDelete, records }) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setNewName("");
    setAdding(false);
  }

  return (
    <aside style={{
      width: 240, minWidth: 240, background: "#0f1923",
      borderRight: "1px solid #1e3040", display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #1e3040" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#4a7fa5", textTransform: "uppercase", marginBottom: 4 }}>Comprovantes</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#e8f4f8" }}>BankChat</div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px 8px 4px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#4a7fa5", textTransform: "uppercase", padding: "0 8px 8px" }}>Clientes</div>

        <button onClick={() => onSelect({ id: "all", name: "Todos" })} style={{
          width: "100%", padding: "8px 12px", borderRadius: 8, border: "none",
          background: selectedClient?.id === "all" ? "#1a3a52" : "transparent",
          color: selectedClient?.id === "all" ? "#7ec8e3" : "#8aabb8",
          fontSize: 13, fontWeight: 600, textAlign: "left", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, marginBottom: 2
        }}>
          <span style={{ fontSize: 15 }}>📋</span>
          <span style={{ flex: 1 }}>Todos</span>
          <span style={{ fontSize: 10, background: "#1e3a50", color: "#4a7fa5", borderRadius: 10, padding: "1px 6px" }}>{records.length}</span>
        </button>

        {clients.map(c => {
          const count = records.filter(r => r.clientId === c.id).length;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
              <button onClick={() => onSelect(c)} style={{
                flex: 1, padding: "8px 10px", borderRadius: 8, border: "none",
                background: selectedClient?.id === c.id ? "#1a3a52" : "transparent",
                color: selectedClient?.id === c.id ? "#7ec8e3" : "#8aabb8",
                fontSize: 13, fontWeight: 500, textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8, overflow: "hidden", minWidth: 0
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%", background: "#1e3a50",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#7ec8e3", flexShrink: 0
                }}>{c.name.slice(0, 2).toUpperCase()}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{c.name}</span>
                {count > 0 && <span style={{ fontSize: 10, background: "#1e3a50", color: "#4a7fa5", borderRadius: 10, padding: "1px 6px", flexShrink: 0 }}>{count}</span>}
              </button>
              <button onClick={() => onDelete(c.id)} style={{
                background: "transparent", border: "none", color: "#2a4a60",
                cursor: "pointer", fontSize: 13, padding: "4px 6px", borderRadius: 4, flexShrink: 0
              }} title="Remover">✕</button>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "10px 12px", borderTop: "1px solid #1e3040" }}>
        {adding ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
              placeholder="Nome do cliente"
              style={{ background: "#1a2f40", border: "1px solid #2a4a60", borderRadius: 8, color: "#e8f4f8", padding: "8px 10px", fontSize: 13, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={handleAdd} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#1a5a8a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Salvar</button>
              <button onClick={() => setAdding(false)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#1e3040", color: "#8aabb8", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{
            width: "100%", padding: "9px", borderRadius: 8, border: "1px dashed #2a4a60",
            background: "transparent", color: "#4a7fa5", fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
          }}>+ Novo cliente</button>
        )}
      </div>
    </aside>
  );
}

// ─── Bolha ────────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  if (msg.type === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <div style={{ maxWidth: "72%", background: "#1a4a70", borderRadius: "18px 4px 18px 18px", padding: "10px 14px" }}>
          {msg.mensagem && (
            <div style={{ fontSize: 13, color: "#e8f4f8", marginBottom: 8, lineHeight: 1.4 }}>
              {msg.mensagem}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {msg.files?.map((f, i) => (
              <div key={i} style={{ background: "#0f2a40", borderRadius: 7, padding: "5px 9px", fontSize: 11, color: "#7ec8e3", display: "flex", alignItems: "center", gap: 4 }}>
                📄 {f.name}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#4a7fa5", marginTop: 6, textAlign: "right" }}>
            {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === "loading") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
        <div style={{ background: "#0f2233", border: "1px solid #1e3040", borderRadius: "4px 18px 18px 18px", padding: "13px 18px", color: "#7ec8e3", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
          Analisando comprovante{msg.count > 1 ? "s" : ""}...
        </div>
      </div>
    );
  }

  if (msg.type === "error") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
        <div style={{ background: "#1a0a0a", border: "1px solid #4a1a1a", borderRadius: "4px 18px 18px 18px", padding: "12px 16px", color: "#e87a7a", fontSize: 13 }}>
          ⚠️ {msg.text}
        </div>
      </div>
    );
  }

  // bot
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14, gap: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#0f2a40", border: "1px solid #1e4a65", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, marginTop: 2 }}>🤖</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "76%" }}>
        {msg.results?.map((r, i) => (
          <div key={i} style={{ background: "#0f2233", border: r.valido ? "1px solid #1e4a65" : "1px solid #4a1a1a", borderRadius: "4px 18px 18px 18px", padding: "12px 16px" }}>
            {r.valido ? (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#4a9fc8", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  ✅ Comprovante {msg.results.length > 1 ? `#${i + 1} ` : ""}— {r.tipo || "Transferência"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
                  {[
                    ["💰 Valor", r.valor ? `R$ ${r.valor}` : "—"],
                    ["📅 Data", r.data || "—"],
                    ["🏦 Banco Origem", r.bancoOrigem || "—"],
                    ["🏦 Banco Destino", r.bancoDestino || "—"],
                    ["👤 Favorecido", r.favorecido || "—"],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#4a7fa5", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, color: "#c8e8f5", fontWeight: 500 }}>{val}</div>
                    </div>
                  ))}
                </div>
                {r.observacao && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e3a50" }}>
                    <div style={{ fontSize: 10, color: "#4a7fa5", marginBottom: 3 }}>📝 Observação</div>
                    <div style={{ fontSize: 12, color: "#a8d8f0", lineHeight: 1.5, fontStyle: "italic" }}>{r.observacao}</div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#e87a7a", fontSize: 13 }}>
                ❌ {msg.results.length > 1 ? `Arquivo #${i + 1}: ` : ""}{r.erro || "Não é um comprovante válido"}
              </div>
            )}
          </div>
        ))}
        <div style={{ fontSize: 10, color: "#2a5a70", paddingLeft: 4 }}>
          {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────
function ChatInput({ onSend, disabled, selectedClient }) {
  const [files, setFiles] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const fileRef = useRef();
  const textRef = useRef();

  function handleFiles(fileList) {
    const valid = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    setFiles(prev => [...prev, ...valid]);
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function handleSend() {
    if (!files.length || disabled) return;
    onSend(files, mensagem);
    setFiles([]);
    setMensagem("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const noClient = !selectedClient || selectedClient.id === "all";

  return (
    <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #1e3040", background: "#0a1520" }}>
      {noClient && (
        <div style={{ textAlign: "center", color: "#4a7fa5", fontSize: 12, marginBottom: 8, padding: "6px", background: "#0f1f2e", borderRadius: 8 }}>
          ⬅ Selecione um cliente para enviar comprovantes
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ background: "#1a2f40", border: "1px solid #2a4a60", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#7ec8e3", display: "flex", alignItems: "center", gap: 5 }}>
              📄 {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "#4a7fa5", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
        style={{ background: "#0f2233", border: "1px solid #1e3a50", borderRadius: 16, overflow: "hidden" }}>

        {/* Linha do texto */}
        <div style={{ display: "flex", alignItems: "flex-end", padding: "8px 8px 4px 14px", gap: 6 }}>
          <textarea
            ref={textRef}
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={noClient || disabled}
            placeholder={noClient ? "Selecione um cliente..." : "Digite a mensagem do cliente (ex: 'esse é do almoço com o fornecedor')"}
            rows={2}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#e8f4f8", fontSize: 13, resize: "none", lineHeight: 1.5,
              fontFamily: "'DM Sans', sans-serif", opacity: noClient ? 0.4 : 1,
              paddingTop: 4
            }}
          />
        </div>

        {/* Linha dos botões */}
        <div style={{ display: "flex", alignItems: "center", padding: "4px 8px 8px", gap: 6, borderTop: "1px solid #132030" }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={noClient || disabled}
            style={{ background: "#1a3a50", border: "none", borderRadius: 10, color: "#7ec8e3", padding: "7px 12px", cursor: noClient ? "not-allowed" : "pointer", fontSize: 16, opacity: noClient ? 0.4 : 1, display: "flex", alignItems: "center", gap: 5 }}>
            📎 <span style={{ fontSize: 11, fontWeight: 600 }}>Anexar</span>
          </button>
          <div style={{ flex: 1, fontSize: 11, color: "#1e3a50" }}>
            {files.length > 0 ? `${files.length} arquivo${files.length > 1 ? "s" : ""} • Enter para enviar` : "Arraste imagens aqui"}
          </div>
          <button onClick={handleSend} disabled={!files.length || noClient || disabled}
            style={{
              background: files.length && !noClient && !disabled ? "#1a5a8a" : "#0f2233",
              border: "none", borderRadius: 12,
              color: files.length && !noClient && !disabled ? "#fff" : "#2a5a70",
              padding: "8px 20px", cursor: files.length && !noClient && !disabled ? "pointer" : "not-allowed",
              fontWeight: 700, fontSize: 13, transition: "all 0.2s"
            }}>Enviar ↑</button>
        </div>
      </div>
    </div>
  );
}

// ─── Vista Todos ──────────────────────────────────────────────────────────
function AllRecordsView({ records }) {
  if (records.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
      <div style={{ fontSize: 36 }}>📋</div>
      <div style={{ fontSize: 13, color: "#2a4a60" }}>Nenhum comprovante registrado ainda.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#4a7fa5", marginBottom: 14, letterSpacing: 1, textTransform: "uppercase" }}>
        {records.length} registro{records.length !== 1 ? "s" : ""}
      </div>
      {records.map(r => (
        <div key={r.id} style={{ background: "#0f2233", border: "1px solid #1e3a50", borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "#7ec8e3", fontSize: 13 }}>{r.clientName}</span>
            <span style={{ fontSize: 10, color: "#2a5a70" }}>{new Date(r.timestamp).toLocaleDateString("pt-BR")}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px 12px", fontSize: 12, marginBottom: r.data?.observacao ? 8 : 0 }}>
            <div><span style={{ color: "#4a7fa5" }}>Valor: </span><span style={{ color: "#c8e8f5" }}>R$ {r.data?.valor || "—"}</span></div>
            <div><span style={{ color: "#4a7fa5" }}>Data: </span><span style={{ color: "#c8e8f5" }}>{r.data?.data || "—"}</span></div>
            <div><span style={{ color: "#4a7fa5" }}>Tipo: </span><span style={{ color: "#c8e8f5" }}>{r.data?.tipo || "—"}</span></div>
            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#4a7fa5" }}>Favorecido: </span><span style={{ color: "#c8e8f5" }}>{r.data?.favorecido || "—"}</span></div>
          </div>
          {r.data?.observacao && (
            <div style={{ paddingTop: 7, borderTop: "1px solid #1a3040", fontSize: 11, color: "#8ab8d0", fontStyle: "italic" }}>
              📝 {r.data.observacao}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [storage, setStorage] = useState(loadStorage);
  const [selectedClient, setSelectedClient] = useState(null);
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(false);
  const chatRef = useRef();

  useEffect(() => { saveStorage(storage); }, [storage]);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, selectedClient]);

  function addClient(name) {
    const client = { id: generateId(), name };
    setStorage(s => ({ ...s, clients: [...s.clients, client] }));
    setSelectedClient(client);
  }

  function deleteClient(id) {
    setStorage(s => ({ ...s, clients: s.clients.filter(c => c.id !== id), records: s.records.filter(r => r.clientId !== id) }));
    setMessages(m => { const n = { ...m }; delete n[id]; return n; });
    if (selectedClient?.id === id) setSelectedClient(null);
  }

  async function handleSend(files, mensagem) {
    if (!selectedClient || loading) return;
    const clientId = selectedClient.id;

    const userMsg = { id: generateId(), type: "user", timestamp: Date.now(), files: files.map(f => ({ name: f.name })), mensagem };
    const loadingMsg = { id: generateId(), type: "loading", count: files.length };

    setMessages(m => ({ ...m, [clientId]: [...(m[clientId] || []), userMsg, loadingMsg] }));
    setLoading(true);

    try {
      const results = await Promise.all(files.map(async file => {
        const base64 = await fileToBase64(file);
        return analyzeImage(base64, file.type, mensagem);
      }));

      const botMsg = { id: generateId(), type: "bot", timestamp: Date.now(), results };
      const newRecords = results.filter(r => r.valido !== false).map(r => ({
        id: generateId(), clientId, clientName: selectedClient.name, timestamp: Date.now(), data: r
      }));

      setStorage(s => ({ ...s, records: [...s.records, ...newRecords] }));
      setMessages(m => ({ ...m, [clientId]: [...(m[clientId] || []).filter(x => x.type !== "loading"), botMsg] }));
    } catch {
      const errMsg = { id: generateId(), type: "error", text: "Erro ao processar. Tente novamente." };
      setMessages(m => ({ ...m, [clientId]: [...(m[clientId] || []).filter(x => x.type !== "loading"), errMsg] }));
    } finally {
      setLoading(false);
    }
  }

  const currentMessages = selectedClient ? (messages[selectedClient.id] || []) : [];
  const clientRecords = selectedClient
    ? storage.records.filter(r => selectedClient.id === "all" ? true : r.clientId === selectedClient.id)
    : [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07111a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e3040; border-radius: 4px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        textarea::placeholder { color: #2a5070; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: "#07111a", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
        <ClientSidebar
          clients={storage.clients} selectedClient={selectedClient}
          onSelect={setSelectedClient} onAdd={addClient} onDelete={deleteClient}
          records={storage.records}
        />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "13px 20px", background: "#0a1520", borderBottom: "1px solid #1e3040", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              {selectedClient ? (
                <>
                  <div style={{ fontWeight: 700, color: "#e8f4f8", fontSize: 15 }}>{selectedClient.name}</div>
                  <div style={{ fontSize: 11, color: "#4a7fa5" }}>
                    {clientRecords.length} comprovante{clientRecords.length !== 1 ? "s" : ""} registrado{clientRecords.length !== 1 ? "s" : ""}
                  </div>
                </>
              ) : (
                <div style={{ color: "#4a7fa5", fontSize: 14 }}>Selecione um cliente</div>
              )}
            </div>
            {selectedClient && clientRecords.length > 0 && (
              <button onClick={() => exportCSV(storage.records, selectedClient.id === "all" ? "Todos" : selectedClient.name)}
                style={{ background: "#1a3a50", border: "1px solid #2a5a70", borderRadius: 10, color: "#7ec8e3", padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                📥 Exportar Excel
              </button>
            )}
          </div>

          {/* Chat / Lista */}
          <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "20px 20px 8px", background: "linear-gradient(180deg, #07111a 0%, #091520 100%)" }}>
            {!selectedClient ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                <div style={{ fontSize: 48 }}>💳</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#2a5a75" }}>BankChat</div>
                <div style={{ fontSize: 13, color: "#1e3040", textAlign: "center" }}>Cadastre um cliente na barra lateral<br />e comece a enviar comprovantes</div>
              </div>
            ) : selectedClient.id === "all" ? (
              <AllRecordsView records={clientRecords} />
            ) : currentMessages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
                <div style={{ fontSize: 40 }}>📤</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#2a5a75" }}>Envie comprovantes de {selectedClient.name}</div>
                <div style={{ fontSize: 12, color: "#1e3050", textAlign: "center", lineHeight: 1.6 }}>
                  Anexe a imagem do comprovante<br />e digite a mensagem do cliente para adicionar observação
                </div>
              </div>
            ) : (
              currentMessages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
          </div>

          <ChatInput onSend={handleSend} disabled={loading} selectedClient={selectedClient?.id !== "all" ? selectedClient : null} />
        </div>
      </div>
    </>
  );
}
