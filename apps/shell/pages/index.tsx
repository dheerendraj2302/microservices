import Head from "next/head";
import { FormEvent, useEffect, useState } from "react";
import styles from "../styles/Dashboard.module.css";

type Summary = {
  customer: { id: number; first_name: string; last_name: string; email: string };
  orders: Array<{ id: number; status: string; total: number }>;
  orderSummary: { available: boolean; count: number; totalSpent: number | null };
};

const CUSTOMER_API = process.env.NEXT_PUBLIC_CUSTOMER_API_URL ?? "http://localhost:4003";

export default function DashboardPage() {
  const [input, setInput] = useState("1");
  const [customerId, setCustomerId] = useState("1");
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${CUSTOMER_API}/customers/${customerId}/summary`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Customer request failed (${response.status})`);
        setSummary(await response.json() as Summary);
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [customerId]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setCustomerId(input.trim());
  }

  return (
    <>
      <Head><title>Dashboard | Local Customer Portal</title></Head>
      <main className={styles.dashboard}>
        <p className={styles.eyebrow}>Customer dashboard</p>
        <h1>Welcome to your local portal</h1>
        <form className={styles.lookup} onSubmit={submit}>
          <label>Customer ID <input required pattern="[1-9][0-9]*" value={input} onChange={(event) => setInput(event.target.value)} /></label>
          <button type="submit">Load summary</button>
        </form>
        {loading && <div className={styles.skeleton} aria-label="Loading customer summary" />}
        {error && <p role="alert">{error}</p>}
        {summary && !loading && (
          <section className={styles.summary}>
            <h2>{summary.customer.first_name} {summary.customer.last_name}</h2>
            <p>{summary.customer.email}</p>
            <p>{summary.orderSummary.available
              ? `${summary.orderSummary.count} recent order(s), total ${summary.orderSummary.totalSpent?.toFixed(2)}`
              : "Order history is temporarily unavailable; customer data is still available."}</p>
          </section>
        )}
        <div className={styles.cards}>
          <a href="/catalog"><strong>Browse catalog</strong><span>Search products and explore categories.</span></a>
          <a href="/orders"><strong>View orders</strong><span>Find order status and line-item details.</span></a>
        </div>
      </main>
    </>
  );
}
