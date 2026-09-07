import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import styles from "./CatalogApp.module.css";

export type Product = {
  id: number;
  name: string;
  description?: string;
  category?: string;
  price?: number;
};

type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

const API_BASE = process.env.NEXT_PUBLIC_CATALOG_API_URL ?? "http://localhost:4001";
const PAGE_SIZE = 12;

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function CatalogContent() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number>();
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => setPage(1), [debouncedSearch, category]);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE)
  });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (category) params.set("category", category);

  const products = useQuery({
    queryKey: ["products", debouncedSearch, category, page],
    queryFn: ({ signal }) => getJson<ProductPage>(`/products?${params}`, signal),
    staleTime: 30_000
  });
  const detail = useQuery({
    queryKey: ["product", selectedId],
    queryFn: ({ signal }) => getJson<Product>(`/products/${selectedId}`, signal),
    enabled: Boolean(selectedId),
    staleTime: 60_000
  });

  const categories = useMemo(
    () => Array.from(new Set(products.data?.items.map((item) => item.category).filter(Boolean))) as string[],
    [products.data]
  );
  const totalPages = Math.max(1, Math.ceil((products.data?.total ?? 0) / PAGE_SIZE));

  return (
    <main className={styles.container}>
      <header>
        <h1>Product catalog</h1>
        <p>Find products available to local customers.</p>
      </header>
      <div className={styles.filters}>
        <label>
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>

      {products.isPending && <div className={styles.grid} aria-label="Loading products">{[1, 2, 3, 4].map((n) => <div className={styles.skeleton} key={n} />)}</div>}
      {products.isError && <section className={styles.notice} role="alert">Could not load products. <button onClick={() => products.refetch()}>Try again</button></section>}
      {products.data?.items.length === 0 && <section className={styles.notice}>No products match your filters.</section>}
      {products.data && products.data.items.length > 0 && (
        <>
          <div className={styles.grid}>
            {products.data.items.map((product) => (
              <button className={styles.card} key={product.id} onClick={() => setSelectedId(product.id)}>
                <strong>{product.name}</strong>
                <span>{product.category ?? "Uncategorized"}</span>
                {typeof product.price === "number" && <b>${product.price.toFixed(2)}</b>}
              </button>
            ))}
          </div>
          <nav className={styles.pagination} aria-label="Catalog pagination">
            <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>
        </>
      )}

      {selectedId && (
        <aside className={styles.detail} aria-label="Product details">
          <button className={styles.close} onClick={() => setSelectedId(undefined)} aria-label="Close details">×</button>
          {detail.isPending && <div className={styles.skeleton} />}
          {detail.isError && <p role="alert">Could not load product details.</p>}
          {detail.data && <><h2>{detail.data.name}</h2><p>{detail.data.description ?? "No description available."}</p><p>{detail.data.category}</p></>}
        </aside>
      )}
    </main>
  );
}

export default function CatalogApp() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } }
  }));
  return <QueryClientProvider client={client}><CatalogContent /></QueryClientProvider>;
}
