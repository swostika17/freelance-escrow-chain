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
      setError("Could not connect to local node or initialize demo accounts.");
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
      setError("Could not load escrow records from chain.");
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
      setError("Please fill all Create Escrow fields.");
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
      setError("Please fill all Submit Work fields.");
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
      setError("Please fill all Approve Work fields.");
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
      setError("Please fill all Cancel Escrow fields.");
      return;
    }

    const signerPair = accounts[signer];
    const tx = api.tx.escrow.cancelEscrow(Number(escrowId));

    await sendTx(tx, signerPair, `Escrow cancelled by ${signer}.`);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Freelance Escrow DApp</h1>
            <p style={styles.subtitle}>
              Secure milestone payment between client and freelancer
            </p>
          </div>

          <div
            style={{
              ...styles.badge,
              background: connected ? "#dcfce7" : "#fee2e2",
              color: connected ? "#166534" : "#991b1b",
            }}
          >
            {connected ? "Connected to node" : "Not connected"}
          </div>
        </header>

        <section style={styles.infoCard}>
          <h2 style={styles.cardTitle}>Demo Accounts</h2>
          <p style={styles.cardText}>
            These are local Substrate demo accounts for your coursework.
          </p>

          {accountOptions.map((name) => (
            <p key={name} style={styles.smallText}>
              <strong>{name}</strong>: {shortenAddress(accounts[name]?.address || "")}
            </p>
          ))}
        </section>

        {message ? <div style={styles.successBox}>{message}</div> : null}
        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <section style={styles.grid}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Create Escrow</h2>
            <p style={styles.cardText}>
              Choose a client and freelancer, then create a new escrow.
            </p>

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
              placeholder="Deadline block number"
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

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Submit Work</h2>
            <p style={styles.cardText}>
              Choose the freelancer account, then submit work for an existing escrow.
            </p>

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

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Approve Work</h2>
            <p style={styles.cardText}>
              Choose the client account and approve a submitted escrow.
            </p>

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

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Cancel Escrow</h2>
            <p style={styles.cardText}>
              Choose the client account and cancel an escrow still in Created state.
            </p>

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

        <section style={styles.listCard}>
          <div style={styles.listHeader}>
            <h2 style={styles.cardTitle}>Escrow Records</h2>
            <button style={styles.refreshButton} onClick={() => fetchEscrows()}>
              Refresh
            </button>
          </div>

          {loadingEscrows && <p style={styles.cardText}>Loading escrows...</p>}

          {!loadingEscrows && escrows.length === 0 && (
            <p style={styles.cardText}>No escrows found yet.</p>
          )}

          {!loadingEscrows &&
            escrows.map((item) => (
              <div key={item.id} style={styles.escrowItem}>
                <div style={styles.escrowTop}>
                  <div style={styles.escrowId}>Escrow #{item.id}</div>
                  <div style={getStatusStyle(item.status)}>{item.status}</div>
                </div>

                <div style={styles.escrowGrid}>
                  <div>
                    <div style={styles.label}>Client</div>
                    <div>{item.client}</div>
                  </div>
                  <div>
                    <div style={styles.label}>Freelancer</div>
                    <div>{item.freelancer}</div>
                  </div>
                  <div>
                    <div style={styles.label}>Amount</div>
                    <div>{item.amount}</div>
                  </div>
                  <div>
                    <div style={styles.label}>Deadline</div>
                    <div>{item.deadline}</div>
                  </div>
                  <div>
                    <div style={styles.label}>Work Hash</div>
                    <div style={styles.hashText}>{item.workHash}</div>
                  </div>
                </div>
              </div>
            ))}
        </section>

        <section style={styles.helpCard}>
          <h2 style={styles.cardTitle}>Correct Testing Order</h2>
          <ol style={styles.list}>
            <li>Create escrow first. The first ID will usually be 0.</li>
            <li>Then submit work using that same escrow ID.</li>
            <li>Then approve work using that same escrow ID.</li>
            <li>Cancel only works for an escrow that is still in Created state.</li>
          </ol>
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
    background,
    color,
    padding: "6px 12px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "13px",
  };
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: "32px 16px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "24px",
  },
  title: {
    margin: 0,
    fontSize: "36px",
    fontWeight: 800,
    color: "#0f172a",
  },
  subtitle: {
    margin: "8px 0 0",
    fontSize: "18px",
    color: "#475569",
  },
  badge: {
    padding: "12px 16px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "14px",
  },
  infoCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    marginBottom: "20px",
  },
  helpCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    marginTop: "20px",
  },
  successBox: {
    background: "#dcfce7",
    color: "#166534",
    padding: "12px 16px",
    borderRadius: "12px",
    marginBottom: "16px",
  },
  errorBox: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "12px 16px",
    borderRadius: "12px",
    marginBottom: "16px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "20px",
  },
  card: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
  },
  listCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "24px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    marginTop: "20px",
  },
  cardTitle: {
    margin: "0 0 10px",
    fontSize: "24px",
    color: "#0f172a",
  },
  cardText: {
    margin: "0 0 16px",
    color: "#475569",
    lineHeight: 1.5,
  },
  smallText: {
    margin: "6px 0",
    color: "#334155",
    fontSize: "14px",
    wordBreak: "break-word",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    marginBottom: "12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    marginBottom: "12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "15px",
    boxSizing: "border-box",
    background: "#fff",
  },
  primaryButton: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "15px",
  },
  warningButton: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#f59e0b",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "15px",
  },
  successButton: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#16a34a",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "15px",
  },
  dangerButton: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#dc2626",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "15px",
  },
  refreshButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "none",
    background: "#0f172a",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "12px",
  },
  escrowItem: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "16px",
    marginBottom: "14px",
  },
  escrowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "12px",
  },
  escrowId: {
    fontWeight: 800,
    fontSize: "18px",
    color: "#0f172a",
  },
  escrowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  },
  label: {
    fontSize: "13px",
    color: "#64748b",
    fontWeight: 700,
    marginBottom: "4px",
  },
  hashText: {
    wordBreak: "break-word",
  },
  list: {
    margin: 0,
    paddingLeft: "20px",
    color: "#334155",
    lineHeight: 1.8,
  },
};