import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import styles from "./OrdersApp.module.css";

type Order = {
  id: number;
  status: string;
  created_at?: string;
  total?: number;
  items?: Array<{ productName: string; quantity: number }>;
};

type OrderList = { items: Order[] };

const API_BASE = process.env.NEXT_PUBLIC_ORDER_API_URL ?? "http://localhost:4002";

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function OrdersContent({ initialCustomerId = "" }: { initialCustomerId?: string }) {
  const [input, setInput] = useState(initialCustomerId);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [selectedId, setSelectedId] = useState<number>();
  const orders = useQuery({
    queryKey: ["orders", customerId],
    queryFn: ({ signal }) => getJson<OrderList>(`/orders/${encodeURIComponent(customerId)}`, signal),
    enabled: Boolean(customerId),
    staleTime: 30_000
  });
  const detail = useQuery({
    queryKey: ["order", customerId, selectedId],
    queryFn: ({ signal }) => getJson<Order>(`/orders/${encodeURIComponent(customerId)}/${selectedId}`, signal),
    enabled: Boolean(customerId && selectedId),
    staleTime: 60_000
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSelectedId(undefined);
    setCustomerId(input.trim());
  }

  return (
    <main className={styles.container}>
      <header><h1>Orders</h1><p>Enter a customer ID to review order history.</p></header>
      <form className={styles.lookup} onSubmit={submit}>
        <label><span>Customer ID</span><input required value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. CUST-1001" /></label>
        <button type="submit">Find orders</button>
      </form>
      {!customerId && <section className={styles.notice}>Enter a customer ID to get started.</section>}
      {orders.isPending && customerId && <div aria-label="Loading orders">{[1, 2, 3].map((n) => <div className={styles.skeleton} key={n} />)}</div>}
      {orders.isError && <section className={styles.notice} role="alert">Could not load orders. <button onClick={() => orders.refetch()}>Try again</button></section>}
      {orders.data?.items.length === 0 && <section className={styles.notice}>No orders were found for this customer.</section>}
      {orders.data && orders.data.items.length > 0 && (
        <div className={styles.layout}>
          <ul className={styles.list}>
            {orders.data.items.map((order) => <li key={order.id}><button onClick={() => setSelectedId(order.id)}><strong>Order {order.id}</strong><span>{order.status}</span><span>{order.created_at ? new Date(order.created_at).toLocaleDateString() : ""}</span></button></li>)}
          </ul>
          <section className={styles.detail} aria-label="Order details">
            {!selectedId && <p>Select an order to see details.</p>}
            {detail.isPending && selectedId && <div className={styles.skeleton} />}
            {detail.isError && <p role="alert">Could not load order details.</p>}
            {detail.data && <><h2>Order {detail.data.id}</h2><p>Status: {detail.data.status}</p>{typeof detail.data.total === "number" && <p>Total: ${detail.data.total.toFixed(2)}</p>}<ul>{detail.data.items?.map((item, index) => <li key={`${item.productName}-${index}`}>{item.quantity} × {item.productName}</li>)}</ul></>}
          </section>
        </div>
      )}
    </main>
  );
}

export default function OrdersApp(props: { initialCustomerId?: string }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={client}><OrdersContent {...props} /></QueryClientProvider>;
}
