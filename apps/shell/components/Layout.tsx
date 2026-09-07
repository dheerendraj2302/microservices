import Link from "next/link";
import { useRouter } from "next/router";
import type { PropsWithChildren } from "react";
import styles from "./Layout.module.css";

export default function Layout({ children }: PropsWithChildren) {
  const router = useRouter();
  return (
    <>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">Local Customer Portal</Link>
        <nav aria-label="Primary navigation">
          <Link className={router.pathname === "/" ? styles.active : ""} href="/">Dashboard</Link>
          {/* Cross-zone anchors intentionally trigger a document navigation.
              This prevents Next from prefetching code owned by another app. */}
          <a className={router.asPath.startsWith("/catalog") ? styles.active : ""} href="/catalog">Catalog</a>
          <a className={router.asPath.startsWith("/orders") ? styles.active : ""} href="/orders">Orders</a>
        </nav>
      </header>
      <div className={styles.content}>{children}</div>
    </>
  );
}
