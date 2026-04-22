import { useEffect, useMemo, useState } from "react";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";

export default function App() {
  const [api, setApi] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loadingEscrows, setLoadingEscrows] = useState(false);
  const [escrows, setEscrows] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [accounts, setAccounts] = useState({});
  const [accountsReady, setAccountsReady] = useState(false);

  const [createForm, setCreateForm] = useState({
    client: "Joan",
    freelancer: "Jean",
    amount: "",
    deadline: "",
    workHash: "",
  });

  const [submitForm, setSubmitForm] = useState({
    signer: "Jean",
    escrowId: "",
    workHash: "",
  });

  const [approveForm, setApproveForm] = useState({
    signer: "Joan",
    escrowId: "",
  });

  const [cancelForm, setCancelForm] = useState({
    signer: "Joan",
    escrowId: "",
  });

  useEffect(() => {
    setup();
  }, []);

  const accountOptions = useMemo(
    () => ["Joan", "Jean", "Janet", "Richard"],
    []
  );

  async function setup() {
    try {
      await cryptoWaitReady();

      const provider = new WsProvider("ws://127.0.0.1:9944");
      const chainApi = await ApiPromise.create({ provider });

      const keyring = new Keyring({ type: "sr25519" });

      const localAccounts = {
        Joan: keyring.addFromUri("//Alice"),
        Jean: keyring.addFromUri("//Bob"),
        Janet: keyring.addFromUri("//Charlie"),
        Richard: keyring.addFromUri("//Dave"),
      };

      setApi(chainApi);
      setAccounts(localAccounts);
      setAccountsReady(true);
      setConnected(true);
      setError("");

      await fetchEscrows(chainApi);
    } catch (err) {
      console.error(err);
      setConnected(false);
      setError("Could not connect to local node.");
    }
  }

  function clearMessages() {
    setMessage("");
    setError("");
  }

  function formatStatus(status) {
    if (!status) return "Unknown";
    if (typeof status === "string") return status;
    if (typeof status === "object") {
      const keys = Object.keys(status);
      if (keys.length > 0) return keys[0];
    }
    return String(status);
  }

  function shortenAddress(address) {
    if (!address) return "";
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }

  function getInitial(name) {
    return name?.charAt(0)?.toUpperCase() || "?";
  }

  function getAccountAccent(name) {
    const map = {
      Joan: { bg: "#ede9fe", color: "#6d28d9" },
      Jean: { bg: "#dcfce7", color: "#15803d" },
      Janet: { bg: "#dbeafe", color: "#1d4ed8" },
      Richard: { bg: "#ffedd5", color: "#ea580c" },
    };
    return map[name] || { bg: "#e2e8f0", color: "#334155" };
  }

  async function fetchEscrows(apiInstance = api) {
    if (!apiInstance) return;

    setLoadingEscrows(true);

    try {
      const entries = await apiInstance.query.escrow.escrows.entries();

      const items = entries.map(([storageKey, storageValue]) => {
        const id = storageKey.args[0].toString();
        const raw = storageValue.toHuman() || {};

        return {
          id,
          client: raw.client || "-",
          freelancer: raw.freelancer || "-",
          amount: raw.amount || "-",
          deadline: raw.deadline || "-",
          workHash: raw.workHash || "-",
          status: formatStatus(raw.status),
        };
      });

      setEscrows(items);
    } catch (err) {
      console.error(err);
      setError("Could not load escrow records.");
    } finally {
      setLoadingEscrows(false);
    }
  }

  async function sendTx(tx, signerPair, successText) {
    if (!api) {
      setError("Node not connected.");
      return;
    }

    if (!signerPair) {
      setError("Signer account not ready.");
      return;
    }

    try {
      clearMessages();

      await tx.signAndSend(signerPair, ({ status, dispatchError }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { section, name, docs } = decoded;
            setError(`${section}.${name}: ${docs.join(" ")}`);
          } else {
            setError(dispatchError.toString());
          }
          return;
        }

        if (status.isInBlock) {
          setMessage(`${successText} Included in block.`);
          fetchEscrows();
        }

        if (status.isFinalized) {
          setMessage(`${successText} Finalized.`);
          fetchEscrows();
        }
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Transaction failed.");
    }
  }

  function handleCreateChange(e) {
    const { name, value } = e.target;
    setCreateForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmitChange(e) {
    const { name, value } = e.target;
    setSubmitForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleApproveChange(e) {
    const { name, value } = e.target;
    setApproveForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleCancelChange(e) {
    const { name, value } = e.target;
    setCancelForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleCreateEscrow() {
    if (!accountsReady) {
      setError("Accounts are not ready yet.");
      return;
    }

    const { client, freelancer, amount, deadline, workHash } = createForm;

    if (!client || !freelancer || !amount || !deadline || !workHash) {
      setError("Please complete all create escrow fields.");
      return;
    }

    const clientPair = accounts[client];
    const freelancerPair = accounts[freelancer];

    if (!clientPair || !freelancerPair) {
      setError("Selected accounts are invalid.");
      return;
    }

    const tx = api.tx.escrow.createEscrow(
      freelancerPair.address,
      Number(amount),
      Number(deadline),
      workHash
    );

    await sendTx(tx, clientPair, `Escrow created by ${client}.`);
  }

  async function handleSubmitWork() {
    if (!accountsReady) {
      setError("Accounts are not ready yet.");
      return;
    }

    const { signer, escrowId, workHash } = submitForm;

    if (!signer || escrowId === "" || !workHash) {
      setError("Please complete all submit work fields.");
      return;
    }

    const signerPair = accounts[signer];
    const tx = api.tx.escrow.submitWork(Number(escrowId), workHash);

    await sendTx(tx, signerPair, `Work submitted by ${signer}.`);
  }

  async function handleApproveWork() {
    if (!accountsReady) {
      setError("Accounts are not ready yet.");
      return;
    }

    const { signer, escrowId } = approveForm;

    if (!signer || escrowId === "") {
      setError("Please complete all approve work fields.");
      return;
    }

    const signerPair = accounts[signer];
    const tx = api.tx.escrow.approveWork(Number(escrowId));

    await sendTx(tx, signerPair, `Escrow approved by ${signer}.`);
  }

  async function handleCancelEscrow() {
    if (!accountsReady) {
      setError("Accounts are not ready yet.");
      return;
    }

    const { signer, escrowId } = cancelForm;

    if (!signer || escrowId === "") {
      setError("Please complete all cancel escrow fields.");
      return;
    }

    const signerPair = accounts[signer];
    const tx = api.tx.escrow.cancelEscrow(Number(escrowId));

    await sendTx(tx, signerPair, `Escrow cancelled by ${signer}.`);
  }

  return (
    <div style={styles.page}>
      <div style={styles.glowOne} />
      <div style={styles.glowTwo} />

      <div style={styles.container}>
        <header style={styles.topbar}>
          <div style={styles.brandWrap}>
            <div style={styles.logo}>◆</div>
            <div>
              <div style={styles.brandTitle}>Freelance Escrow</div>
              <div style={styles.brandSub}>Secure blockchain payments</div>
            </div>
          </div>

          <div
            style={{
              ...styles.connectionBadge,
              background: connected
                ? "rgba(34,197,94,0.14)"
                : "rgba(239,68,68,0.14)",
              color: connected ? "#166534" : "#991b1b",
              borderColor: connected
                ? "rgba(34,197,94,0.24)"
                : "rgba(239,68,68,0.24)",
            }}
          >
            <span
              style={{
                ...styles.connectionDot,
                background: connected ? "#22c55e" : "#ef4444",
              }}
            />
            {connected ? "Connected to node" : "Not connected"}
          </div>
        </header>

        <section style={styles.hero}>
          <div style={styles.heroContent}>
            <div style={styles.heroPill}>Decentralized freelance payments</div>
            <h1 style={styles.heroTitle}>
              Manage escrow payments with a cleaner, safer workflow
            </h1>
            <p style={styles.heroText}>
              Create escrows, submit deliverables, approve work, and monitor all
              transactions from one dashboard.
            </p>
          </div>

          <div style={styles.heroVisual}>
            <div style={styles.visualCardMain}>Escrow</div>
            <div style={styles.visualCardSmallTop}>Secure</div>
            <div style={styles.visualCardSmallBottom}>On-chain</div>
          </div>
        </section>

        {message ? <div style={styles.successBox}>{message}</div> : null}
        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <section style={styles.sectionBlock}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Accounts</h2>
              <p style={styles.sectionSub}>Available local identities</p>
            </div>
          </div>

          <div style={styles.accountGrid}>
            {accountOptions.map((name) => {
              const accent = getAccountAccent(name);
              return (
                <div key={name} style={styles.accountCard}>
                  <div
                    style={{
                      ...styles.accountAvatar,
                      background: accent.bg,
                      color: accent.color,
                    }}
                  >
                    {getInitial(name)}
                  </div>

                  <div style={styles.accountInfo}>
                    <div style={styles.accountName}>{name}</div>
                    <div style={styles.accountAddress}>
                      {shortenAddress(accounts[name]?.address || "")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={styles.actionsGrid}>
          <div style={styles.actionCard}>
            <div style={styles.actionHeader}>
              <div style={{ ...styles.actionIcon, background: "#ede9fe", color: "#6d28d9" }}>
                +
              </div>
              <div>
                <h3 style={styles.actionTitle}>Create Escrow</h3>
                <p style={styles.actionText}>Open a new payment agreement</p>
              </div>
            </div>

            <select
              style={styles.select}
              name="client"
              value={createForm.client}
              onChange={handleCreateChange}
            >
              {accountOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              style={styles.select}
              name="freelancer"
              value={createForm.freelancer}
              onChange={handleCreateChange}
            >
              {accountOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <input
              style={styles.input}
              name="amount"
              placeholder="Amount"
              value={createForm.amount}
              onChange={handleCreateChange}
            />

            <input
              style={styles.input}
              name="deadline"
              placeholder="Deadline block"
              value={createForm.deadline}
              onChange={handleCreateChange}
            />

            <input
              style={styles.input}
              name="workHash"
              placeholder="Work hash / description"
              value={createForm.workHash}
              onChange={handleCreateChange}
            />

            <button style={styles.primaryButton} onClick={handleCreateEscrow}>
              Create Escrow
            </button>
          </div>

          <div style={styles.actionCard}>
            <div style={styles.actionHeader}>
              <div style={{ ...styles.actionIcon, background: "#fef3c7", color: "#b45309" }}>
                ↑
              </div>
              <div>
                <h3 style={styles.actionTitle}>Submit Work</h3>
                <p style={styles.actionText}>Send an updated work reference</p>
              </div>
            </div>

            <select
              style={styles.select}
              name="signer"
              value={submitForm.signer}
              onChange={handleSubmitChange}
            >
              {accountOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <input
              style={styles.input}
              name="escrowId"
              placeholder="Escrow ID"
              value={submitForm.escrowId}
              onChange={handleSubmitChange}
            />

            <input
              style={styles.input}
              name="workHash"
              placeholder="Updated work hash"
              value={submitForm.workHash}
              onChange={handleSubmitChange}
            />

            <button style={styles.warningButton} onClick={handleSubmitWork}>
              Submit Work
            </button>
          </div>

          <div style={styles.actionCard}>
            <div style={styles.actionHeader}>
              <div style={{ ...styles.actionIcon, background: "#dcfce7", color: "#15803d" }}>
                ✓
              </div>
              <div>
                <h3 style={styles.actionTitle}>Approve Work</h3>
                <p style={styles.actionText}>Release funds for completed work</p>
              </div>
            </div>

            <select
              style={styles.select}
              name="signer"
              value={approveForm.signer}
              onChange={handleApproveChange}
            >
              {accountOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <input
              style={styles.input}
              name="escrowId"
              placeholder="Escrow ID"
              value={approveForm.escrowId}
              onChange={handleApproveChange}
            />

            <button style={styles.successButton} onClick={handleApproveWork}>
              Approve Work
            </button>
          </div>

          <div style={styles.actionCard}>
            <div style={styles.actionHeader}>
              <div style={{ ...styles.actionIcon, background: "#fee2e2", color: "#b91c1c" }}>
                ×
              </div>
              <div>
                <h3 style={styles.actionTitle}>Cancel Escrow</h3>
                <p style={styles.actionText}>Close an escrow before completion</p>
              </div>
            </div>

            <select
              style={styles.select}
              name="signer"
              value={cancelForm.signer}
              onChange={handleCancelChange}
            >
              {accountOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <input
              style={styles.input}
              name="escrowId"
              placeholder="Escrow ID"
              value={cancelForm.escrowId}
              onChange={handleCancelChange}
            />

            <button style={styles.dangerButton} onClick={handleCancelEscrow}>
              Cancel Escrow
            </button>
          </div>
        </section>

        <section style={styles.recordsCard}>
          <div style={styles.recordsHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Escrow Records</h2>
              <p style={styles.sectionSub}>Live on-chain activity</p>
            </div>

            <button style={styles.refreshButton} onClick={() => fetchEscrows()}>
              Refresh
            </button>
          </div>

          {loadingEscrows && (
            <div style={styles.emptyState}>Loading escrows...</div>
          )}

          {!loadingEscrows && escrows.length === 0 && (
            <div style={styles.emptyState}>No escrow records yet.</div>
          )}

          {!loadingEscrows &&
            escrows.map((item) => (
              <div key={item.id} style={styles.escrowItem}>
                <div style={styles.escrowTop}>
                  <div>
                    <div style={styles.escrowId}>Escrow #{item.id}</div>
                    <div style={styles.escrowMeta}>
                      {item.client} → {item.freelancer}
                    </div>
                  </div>
                  <div style={getStatusStyle(item.status)}>{item.status}</div>
                </div>

                <div style={styles.escrowGrid}>
                  <div style={styles.dataTile}>
                    <div style={styles.label}>Amount</div>
                    <div style={styles.value}>{item.amount}</div>
                  </div>

                  <div style={styles.dataTile}>
                    <div style={styles.label}>Deadline</div>
                    <div style={styles.value}>{item.deadline}</div>
                  </div>

                  <div style={{ ...styles.dataTile, gridColumn: "span 2" }}>
                    <div style={styles.label}>Work Hash</div>
                    <div style={styles.hashText}>{item.workHash}</div>
                  </div>
                </div>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}

function getStatusStyle(status) {
  const s = String(status).toLowerCase();

  if (s.includes("created")) return badgeStyle("#dbeafe", "#1d4ed8");
  if (s.includes("submitted")) return badgeStyle("#fef3c7", "#92400e");
  if (s.includes("completed")) return badgeStyle("#dcfce7", "#166534");
  if (s.includes("cancel")) return badgeStyle("#fee2e2", "#991b1b");

  return badgeStyle("#e5e7eb", "#374151");
}

function badgeStyle(background, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background,
    color,
    padding: "8px 14px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "12px",
    letterSpacing: "0.02em",
  };
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(99,102,241,0.15), transparent 28%), radial-gradient(circle at bottom right, rgba(168,85,247,0.14), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
    padding: "24px 16px 48px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    position: "relative",
    overflow: "hidden",
  },
  glowOne: {
    position: "absolute",
    top: "-120px",
    left: "-120px",
    width: "280px",
    height: "280px",
    borderRadius: "999px",
    background: "rgba(99,102,241,0.12)",
    filter: "blur(40px)",
  },
  glowTwo: {
    position: "absolute",
    right: "-120px",
    bottom: "-120px",
    width: "300px",
    height: "300px",
    borderRadius: "999px",
    background: "rgba(168,85,247,0.12)",
    filter: "blur(40px)",
  },
  container: {
    maxWidth: "1280px",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "24px",
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  logo: {
    width: "48px",
    height: "48px",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    color: "#ffffff",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    boxShadow: "0 12px 30px rgba(79,70,229,0.28)",
  },
  brandTitle: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.1,
  },
  brandSub: {
    fontSize: "14px",
    color: "#64748b",
    marginTop: "4px",
  },
  connectionBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 18px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "14px",
    fontWeight: 700,
    backdropFilter: "blur(8px)",
  },
  connectionDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.3fr 0.9fr",
    gap: "24px",
    alignItems: "center",
    padding: "34px",
    borderRadius: "30px",
    background:
      "linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #4c1d95 100%)",
    color: "#ffffff",
    boxShadow: "0 30px 70px rgba(15,23,42,0.22)",
    marginBottom: "24px",
  },
  heroContent: {
    maxWidth: "640px",
  },
  heroPill: {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    background: "rgba(255,255,255,0.12)",
    color: "#e9d5ff",
    marginBottom: "18px",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(34px, 5vw, 54px)",
    lineHeight: 1.02,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  heroText: {
    margin: "18px 0 0",
    fontSize: "18px",
    lineHeight: 1.65,
    color: "rgba(255,255,255,0.78)",
    maxWidth: "560px",
  },
  heroVisual: {
    minHeight: "250px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  visualCardMain: {
    width: "220px",
    height: "220px",
    borderRadius: "30px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.16)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "28px",
    fontWeight: 800,
    color: "#ffffff",
    boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
  },
  visualCardSmallTop: {
    position: "absolute",
    top: "18px",
    right: "30px",
    padding: "12px 16px",
    borderRadius: "18px",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700,
    color: "#ddd6fe",
  },
  visualCardSmallBottom: {
    position: "absolute",
    bottom: "24px",
    left: "24px",
    padding: "12px 16px",
    borderRadius: "18px",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700,
    color: "#c4b5fd",
  },
  sectionBlock: {
    marginBottom: "24px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "26px",
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.02em",
  },
  sectionSub: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: "14px",
  },
  accountGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "16px",
  },
  accountCard: {
    background: "rgba(255,255,255,0.78)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.8)",
    borderRadius: "22px",
    padding: "18px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    boxShadow: "0 14px 38px rgba(15,23,42,0.08)",
  },
  accountAvatar: {
    width: "50px",
    height: "50px",
    borderRadius: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "18px",
    flexShrink: 0,
  },
  accountInfo: {
    minWidth: 0,
  },
  accountName: {
    fontWeight: 800,
    fontSize: "17px",
    color: "#0f172a",
    marginBottom: "4px",
  },
  accountAddress: {
    color: "#64748b",
    fontSize: "14px",
    wordBreak: "break-all",
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    marginBottom: "24px",
  },
  actionCard: {
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.82)",
    borderRadius: "26px",
    padding: "24px",
    boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
  },
  actionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "18px",
  },
  actionIcon: {
    width: "50px",
    height: "50px",
    borderRadius: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    fontWeight: 800,
    flexShrink: 0,
  },
  actionTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#0f172a",
    fontWeight: 800,
    letterSpacing: "-0.02em",
  },
  actionText: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "14px",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    marginBottom: "12px",
    borderRadius: "14px",
    border: "1px solid #dbe3f0",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "14px 16px",
    marginBottom: "12px",
    borderRadius: "14px",
    border: "1px solid #dbe3f0",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  },
  primaryButton: {
    width: "100%",
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(79,70,229,0.22)",
    marginTop: "4px",
  },
  warningButton: {
    width: "100%",
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #f59e0b, #f97316)",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(245,158,11,0.22)",
    marginTop: "4px",
  },
  successButton: {
    width: "100%",
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(34,197,94,0.2)",
    marginTop: "4px",
  },
  dangerButton: {
    width: "100%",
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #dc2626, #ef4444)",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(239,68,68,0.2)",
    marginTop: "4px",
  },
  recordsCard: {
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.82)",
    borderRadius: "28px",
    padding: "24px",
    boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
  },
  recordsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "18px",
  },
  refreshButton: {
    padding: "12px 16px",
    borderRadius: "14px",
    border: "none",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  emptyState: {
    padding: "28px 18px",
    borderRadius: "18px",
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    color: "#64748b",
    textAlign: "center",
  },
  escrowItem: {
    background:
      "linear-gradient(180deg, rgba(248,250,252,0.92), rgba(255,255,255,0.95))",
    border: "1px solid #e2e8f0",
    borderRadius: "22px",
    padding: "18px",
    marginBottom: "16px",
    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
  },
  escrowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "16px",
  },
  escrowId: {
    fontWeight: 900,
    fontSize: "20px",
    color: "#0f172a",
    letterSpacing: "-0.02em",
  },
  escrowMeta: {
    color: "#64748b",
    marginTop: "6px",
    fontSize: "14px",
  },
  escrowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  },
  dataTile: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "14px",
    minWidth: 0,
  },
  label: {
    fontSize: "12px",
    color: "#64748b",
    fontWeight: 800,
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  value: {
    color: "#0f172a",
    fontWeight: 700,
    fontSize: "15px",
  },
  hashText: {
    color: "#0f172a",
    wordBreak: "break-word",
    lineHeight: 1.5,
    fontSize: "14px",
  },
  successBox: {
    background: "rgba(34,197,94,0.12)",
    color: "#166534",
    padding: "14px 16px",
    borderRadius: "16px",
    marginBottom: "18px",
    border: "1px solid rgba(34,197,94,0.18)",
    fontWeight: 600,
  },
  errorBox: {
    background: "rgba(239,68,68,0.12)",
    color: "#991b1b",
    padding: "14px 16px",
    borderRadius: "16px",
    marginBottom: "18px",
    border: "1px solid rgba(239,68,68,0.18)",
    fontWeight: 600,
  },
};